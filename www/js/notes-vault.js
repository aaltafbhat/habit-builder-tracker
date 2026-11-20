/* Habit Builder Tracker v1.5.7 — Rich Text Notes & Encrypted Password Vault */
(() => {
    "use strict";

    const VAULT_FORMAT = "hbt-credential-vault";
    const VAULT_VERSION = 1;
    const VAULT_KDF_ITERATIONS = 310000;
    const VAULT_IDLE_MS = 5 * 60 * 1000;
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    let notesCache = [];
    let vaultEntries = [];
    let vaultEnvelope = null;
    let vaultKey = null;
    let vaultIdleTimer = null;
    let initialized = false;
    let currentEditNoteId = null;
    let currentEditVaultId = null;
    let activeReaderNoteId = null;
    const expandedVaultIds = new Set();

    const $ = id => document.getElementById(id);
    const importance = {
        critical: { label: "Critical", className: "is-critical", rank: 0 },
        high: { label: "High", className: "is-high", rank: 1 },
        normal: { label: "Normal", className: "is-normal", rank: 2 },
        low: { label: "Low", className: "is-low", rank: 3 }
    };

    function makeId(prefix) {
        const id = window.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        return `${prefix}-${id}`;
    }

    async function readProfile() {
        if (typeof window.getProfile !== "function") throw new Error("Workspace storage is unavailable.");
        return (await window.getProfile()) || { id: "current-user", createdAt: new Date().toISOString() };
    }

    async function writeProfilePatch(patch) {
        if (typeof window.saveProfile !== "function") throw new Error("Workspace storage is unavailable.");
        const current = await readProfile();
        const merged = { ...current, ...patch, id: "current-user" };
        await window.saveProfile(merged);
        return merged;
    }

    function safeText(tag, className, value) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        node.textContent = value == null ? "" : String(value);
        return node;
    }

    const NOTE_ALLOWED_TAGS = new Set([
        "P", "DIV", "BR", "H1", "H2", "H3", "H4", "H5", "H6",
        "STRONG", "B", "EM", "I", "U", "S", "DEL", "STRIKE", "SUB", "SUP", "SMALL", "MARK",
        "UL", "OL", "LI", "BLOCKQUOTE", "PRE", "CODE", "KBD", "SAMP", "A",
        "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TH", "TD", "SPAN", "HR", "WBR", "FONT"
    ]);
    const NOTE_DROP_TAGS = new Set([
        "SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH",
        "FORM", "INPUT", "BUTTON", "TEXTAREA", "SELECT", "OPTION",
        "VIDEO", "AUDIO", "SOURCE", "IMG", "PICTURE", "CANVAS", "META", "LINK", "BASE"
    ]);
    const NOTE_BLOCK_TAGS = new Set([
        "P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "BLOCKQUOTE",
        "PRE", "TABLE", "TR", "HR"
    ]);

    function safeNoteStyle(sourceStyle) {
        const source = document.createElement("span");
        source.setAttribute("style", String(sourceStyle || ""));
        const rules = [];
        const style = source.style;
        const allowedColor = value => /^(#[0-9a-f]{3,8}|rgba?\([0-9\s.,%]+\)|hsla?\([0-9\s.,%deg]+\)|[a-z]{3,20}|transparent)$/i.test(String(value || "").trim());
        ["color", "background-color"].forEach(property => {
            const value = style.getPropertyValue(property).trim();
            if (value && allowedColor(value)) rules.push(`${property}:${value}`);
        });
        const align = style.textAlign.trim().toLowerCase();
        if (["left", "right", "center", "justify", "start", "end"].includes(align)) rules.push(`text-align:${align}`);
        const weight = style.fontWeight.trim().toLowerCase();
        if (["normal", "bold", "bolder", "lighter", "100", "200", "300", "400", "500", "600", "700", "800", "900"].includes(weight)) rules.push(`font-weight:${weight}`);
        const fontStyle = style.fontStyle.trim().toLowerCase();
        if (["normal", "italic", "oblique"].includes(fontStyle)) rules.push(`font-style:${fontStyle}`);
        const decoration = style.textDecoration.trim().toLowerCase();
        if (/^(none|underline|line-through|overline|underline line-through)$/.test(decoration)) rules.push(`text-decoration:${decoration}`);
        const fontSize = style.fontSize.trim().toLowerCase();
        if (/^\d{1,2}(?:\.\d+)?(?:px|pt|em|rem|%)$/.test(fontSize)) rules.push(`font-size:${fontSize}`);
        const fontFamily = style.fontFamily.trim();
        if (fontFamily && /^[a-z0-9\s,"'_-]{1,120}$/i.test(fontFamily) && !/(url|expression|javascript|var)\s*\(/i.test(fontFamily)) rules.push(`font-family:${fontFamily}`);
        const lineHeight = style.lineHeight.trim().toLowerCase();
        if (/^(normal|(?:0?\.\d+|[1-9]\d?)(?:px|pt|em|rem|%)?)$/.test(lineHeight)) rules.push(`line-height:${lineHeight}`);
        const letterSpacing = style.letterSpacing.trim().toLowerCase();
        if (/^(?:-?\d{1,3}(?:\.\d+)?)(?:px|pt|em|rem)$/.test(letterSpacing)) rules.push(`letter-spacing:${letterSpacing}`);
        const vertical = style.verticalAlign.trim().toLowerCase();
        if (["baseline", "sub", "super", "top", "middle", "bottom"].includes(vertical)) rules.push(`vertical-align:${vertical}`);
        return rules.join(";");
    }

    function sanitizeRichHtml(dirtyHtml) {
        const input = String(dirtyHtml || "").slice(0, 200000);
        if (!input) return "";
        const parser = new DOMParser();
        const parsed = parser.parseFromString(input, "text/html");
        const output = document.createElement("div");

        function copyNode(source, target) {
            if (source.nodeType === Node.TEXT_NODE) {
                target.appendChild(document.createTextNode(source.nodeValue || ""));
                return;
            }
            if (source.nodeType !== Node.ELEMENT_NODE) return;
            const tag = source.tagName.toUpperCase();
            if (NOTE_DROP_TAGS.has(tag)) return;
            if (!NOTE_ALLOWED_TAGS.has(tag)) {
                Array.from(source.childNodes).forEach(child => copyNode(child, target));
                return;
            }
            const aliases = { B: "strong", I: "em", DEL: "s", STRIKE: "s", FONT: "span" };
            const node = document.createElement(aliases[tag] || tag.toLowerCase());
            const cleanRules = [safeNoteStyle(source.getAttribute("style"))].filter(Boolean);
            if (tag === "FONT") {
                const legacyColor = String(source.getAttribute("color") || "").trim();
                if (/^(#[0-9a-f]{3,8}|rgba?\([0-9\s.,%]+\)|hsla?\([0-9\s.,%deg]+\)|[a-z]{3,20})$/i.test(legacyColor)) cleanRules.push(`color:${legacyColor}`);
                const legacyFace = String(source.getAttribute("face") || "").trim();
                if (legacyFace && /^[a-z0-9\s,"'_-]{1,120}$/i.test(legacyFace)) cleanRules.push(`font-family:${legacyFace}`);
            }
            if (cleanRules.length) node.setAttribute("style", cleanRules.join(";"));
            if (tag === "A") {
                const href = String(source.getAttribute("href") || "").trim();
                try {
                    const url = new URL(href, window.location.href);
                    if (["http:", "https:", "mailto:"].includes(url.protocol)) {
                        node.setAttribute("href", url.href);
                        node.setAttribute("target", "_blank");
                        node.setAttribute("rel", "noopener noreferrer");
                    }
                } catch (_) { /* unsafe or invalid link: keep its text only */ }
            }
            if (tag === "OL") {
                const start = Number(source.getAttribute("start"));
                if (Number.isInteger(start) && start > 0 && start < 100000) node.setAttribute("start", String(start));
            }
            if (tag === "TD" || tag === "TH") {
                ["colspan", "rowspan"].forEach(name => {
                    const value = Number(source.getAttribute(name));
                    if (Number.isInteger(value) && value > 0 && value <= 20) node.setAttribute(name, String(value));
                });
            }
            if (source.hasAttribute("dir") && ["ltr", "rtl", "auto"].includes(source.getAttribute("dir").toLowerCase())) {
                node.setAttribute("dir", source.getAttribute("dir").toLowerCase());
            }
            Array.from(source.childNodes).forEach(child => copyNode(child, node));
            target.appendChild(node);
        }

        Array.from(parsed.body.childNodes).forEach(child => copyNode(child, output));
        return output.innerHTML;
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
    }

    function legacyNoteHtml(text) {
        return escapeHtml(text).replace(/\r\n?|\n/g, "<br>");
    }

    function richHtmlToPlainText(html) {
        const safeHtml = sanitizeRichHtml(html);
        const parsed = new DOMParser().parseFromString(`<div>${safeHtml}</div>`, "text/html");
        const root = parsed.body.firstElementChild;
        let text = "";
        function walk(node) {
            if (node.nodeType === Node.TEXT_NODE) { text += node.nodeValue || ""; return; }
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            const tag = node.tagName.toUpperCase();
            if (tag === "BR") { text += "\n"; return; }
            const block = NOTE_BLOCK_TAGS.has(tag);
            if (block && text && !text.endsWith("\n")) text += "\n";
            Array.from(node.childNodes).forEach(walk);
            if (block && !text.endsWith("\n")) text += "\n";
        }
        if (root) Array.from(root.childNodes).forEach(walk);
        return text.replace(/[\t ]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    }

    function insertSanitizedHtmlAtCaret(editor, html) {
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) return false;
        const range = selection.getRangeAt(0);
        if (!editor.contains(range.commonAncestorContainer)) return false;
        range.deleteContents();
        const template = document.createElement("template");
        template.innerHTML = sanitizeRichHtml(html);
        const fragment = template.content;
        const lastNode = fragment.lastChild;
        range.insertNode(fragment);
        if (lastNode) {
            range.setStartAfter(lastNode);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
        }
        return true;
    }

    async function copyRichNote(note) {
        const bodyHtml = sanitizeRichHtml(note.bodyHtml || legacyNoteHtml(note.body || ""));
        const plainText = String(note.body || richHtmlToPlainText(bodyHtml));
        if (navigator.clipboard?.write && typeof window.ClipboardItem === "function" && window.isSecureContext) {
            try {
                const item = new window.ClipboardItem({
                    "text/html": new Blob([bodyHtml], { type: "text/html" }),
                    "text/plain": new Blob([plainText], { type: "text/plain" })
                });
                await navigator.clipboard.write([item]);
                return;
            } catch (error) {
                console.warn("Rich clipboard write was unavailable; copying plain text instead.", error);
            }
        }
        await copyText(plainText);
    }

    function formatDate(value) {
        try { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
        catch (_) { return "Recently"; }
    }

    function showStatus(id, message, type = "info") {
        const node = $(id);
        if (!node) return;
        node.textContent = message;
        node.dataset.state = type;
    }

    async function confirmAction(message, options = {}) {
        if (typeof window.showAppConfirm === "function") return !!(await window.showAppConfirm(message, options));
        return window.confirm(message);
    }

    async function notify(message, options = {}) {
        if (typeof window.showAppDialog === "function") return window.showAppDialog(message, options);
        window.alert(message);
        return true;
    }

    // ------------------------------
    // NOTES
    // ------------------------------

    async function saveNotes() {
        const profile = await writeProfilePatch({ notes: notesCache });
        notesCache = Array.isArray(profile.notes) ? profile.notes : notesCache;
    }

    function closeDialog(dialog) {
        if (!dialog) return;
        if (typeof dialog.close === "function" && dialog.open) dialog.close();
        else dialog.removeAttribute("open");
    }

    function openDialog(dialog) {
        if (!dialog) return;
        if (typeof dialog.showModal === "function") {
            if (!dialog.open) dialog.showModal();
        } else {
            dialog.setAttribute("open", "");
        }
    }

    function resetNoteForm() {
        const form = $("note-form");
        if (form) form.reset();
        if ($("note-body")) $("note-body").innerHTML = "";
        if ($("note-record-id")) $("note-record-id").value = "";
        if ($("note-importance")) $("note-importance").value = "normal";
        if ($("note-editor-heading")) $("note-editor-heading").textContent = "Create a note";
        if ($("note-save-btn")) $("note-save-btn").textContent = "Save note";
        currentEditNoteId = null;
    }

    function openNoteEditor(note = null) {
        resetNoteForm();
        if (note) {
            currentEditNoteId = note.id;
            $("note-record-id").value = note.id;
            $("note-title").value = note.title || "";
            $("note-body").innerHTML = sanitizeRichHtml(note.bodyHtml || legacyNoteHtml(note.body || ""));
            $("note-importance").value = importance[note.importance] ? note.importance : "normal";
            $("note-pinned").checked = !!note.pinned;
            $("note-editor-heading").textContent = "Edit note";
            $("note-save-btn").textContent = "Update note";
        }
        openDialog($("note-editor-dialog"));
        window.setTimeout(() => $("note-title")?.focus(), 30);
    }

    function openNoteReader(note) {
        if (!note) return;
        activeReaderNoteId = note.id;
        const level = importance[note.importance] ? note.importance : "normal";
        const badge = $("note-reader-importance");
        $("note-reader-title").textContent = note.title || "Untitled note";
        badge.textContent = importance[level].label;
        badge.className = `note-importance-badge ${importance[level].className}`;
        $("note-reader-pinned").hidden = !note.pinned;
        $("note-reader-date").textContent = formatDate(note.updatedAt || note.createdAt);
        $("note-reader-body").innerHTML = sanitizeRichHtml(note.bodyHtml || legacyNoteHtml(note.body || ""));
        openDialog($("note-reader-dialog"));
    }

    function closeNoteEditor() {
        closeDialog($("note-editor-dialog"));
        resetNoteForm();
    }

    function editNoteById(id) {
        const note = notesCache.find(item => item.id === id);
        if (!note) return;
        closeDialog($("note-reader-dialog"));
        openNoteEditor(note);
    }

    function renderNotes() {
        const host = $("notes-list");
        if (!host) return;
        const query = ($("notes-search")?.value || "").trim().toLowerCase();
        const filter = $("notes-filter")?.value || "all";
        const rows = notesCache.filter(note => {
            const level = importance[note.importance] ? note.importance : "normal";
            const haystack = `${note.title || ""} ${note.body || ""}`.toLowerCase();
            return (filter === "all" || filter === level) && (!query || haystack.includes(query));
        }).sort((a, b) => {
            if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
            const rankA = importance[a.importance]?.rank ?? 2;
            const rankB = importance[b.importance]?.rank ?? 2;
            if (rankA !== rankB) return rankA - rankB;
            return String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
        });
        host.replaceChildren();
        if ($("notes-count")) $("notes-count").textContent = `${notesCache.length} ${notesCache.length === 1 ? "note" : "notes"}`;
        if (!rows.length) {
            host.appendChild(safeText("p", "notes-empty", notesCache.length ? "No notes match your search or filter." : "No notes yet. Select Create note to capture your first idea."));
            return;
        }
        rows.forEach(note => {
            const level = importance[note.importance] ? note.importance : "normal";
            const meta = importance[level];
            const card = document.createElement("article");
            card.className = `note-card ${meta.className}`;
            const top = document.createElement("div"); top.className = "note-card-top";
            const titleWrap = document.createElement("div"); titleWrap.className = "note-card-title-wrap";
            titleWrap.appendChild(safeText("h4", "", note.title || "Untitled note"));
            titleWrap.appendChild(safeText("span", `note-importance-badge ${meta.className}`, meta.label));
            if (note.pinned) titleWrap.appendChild(safeText("span", "note-pinned-badge", "Pinned"));
            top.append(titleWrap, safeText("small", "note-date", formatDate(note.updatedAt || note.createdAt)));
            card.appendChild(top);

            const bodyText = String(note.body || "");
            const normalizedPreview = bodyText.replace(/\s+/g, " ").trim();
            const previewLimit = 160;
            const previewText = normalizedPreview.length > previewLimit
                ? `${normalizedPreview.slice(0, previewLimit - 1).trimEnd()}…`
                : normalizedPreview;
            // Keep list cards compact: show only a short preview here.
            // The full note remains available in the dedicated Read Note dialog.
            card.appendChild(safeText("p", "note-body-text note-body-preview is-collapsed", previewText));
            const read = safeText("button", "note-read-toggle", "Read note");
            read.type = "button";
            read.setAttribute("aria-label", `Read note: ${note.title || "Untitled note"}`);
            read.addEventListener("click", () => openNoteReader(note));
            card.appendChild(read);

            const actions = document.createElement("div"); actions.className = "note-card-actions";
            const copy = safeText("button", "secondary-btn", "Copy"); copy.type = "button";
            copy.addEventListener("click", async () => { try { await copyRichNote(note); showStatus("notes-status", "Note copied with formatting where supported.", "success"); } catch (e) { showStatus("notes-status", e.message, "warning"); } });
            const edit = safeText("button", "secondary-btn", "Edit"); edit.type = "button";
            edit.addEventListener("click", () => openNoteEditor(note));
            const remove = safeText("button", "secondary-btn note-delete-btn", "Delete"); remove.type = "button";
            remove.addEventListener("click", async () => {
                if (!await confirmAction(`Delete the note “${note.title || "Untitled note"}”?`, { title: "Delete Note", confirmText: "Delete", danger: true })) return;
                const before = notesCache;
                notesCache = notesCache.filter(item => item.id !== note.id);
                try { await saveNotes(); renderNotes(); showStatus("notes-status", "Note deleted.", "success"); }
                catch (error) { notesCache = before; renderNotes(); await notify(`Could not delete this note: ${error.message}`, { title: "Save failed", danger: true }); }
            });
            actions.append(copy, edit, remove); card.appendChild(actions); host.appendChild(card);
        });
    }

    async function handleNoteSubmit(event) {
        event.preventDefault();
        const title = $("note-title").value.trim();
        const editor = $("note-body");
        const bodyHtml = sanitizeRichHtml(editor?.innerHTML || "");
        const body = richHtmlToPlainText(bodyHtml);
        if (!title || !body) {
            await notify("Enter a title and some note content before saving.", { title: "Note is incomplete" });
            if (!title) $("note-title")?.focus(); else editor?.focus();
            return;
        }
        if (body.length > 10000) {
            await notify("Keep the note under 10,000 characters. Shorten the content and try again.", { title: "Note is too long" });
            return;
        }
        const now = new Date().toISOString();
        const level = importance[$("note-importance").value] ? $("note-importance").value : "normal";
        if (currentEditNoteId) {
            const index = notesCache.findIndex(note => note.id === currentEditNoteId);
            if (index >= 0) notesCache[index] = { ...notesCache[index], title, body, bodyHtml, importance: level, pinned: $("note-pinned").checked, updatedAt: now };
        } else {
            notesCache.unshift({ id: makeId("note"), title, body, bodyHtml, importance: level, pinned: $("note-pinned").checked, createdAt: now, updatedAt: now });
        }
        try { await saveNotes(); closeNoteEditor(); renderNotes(); showStatus("notes-status", "Note saved with its formatting in this workspace.", "success"); }
        catch (error) { await notify(`Could not save this note: ${error.message}`, { title: "Save failed", danger: true }); }
    }

    // ------------------------------
    // ENCRYPTED PASSWORD VAULT
    // ------------------------------

    function cryptoApi() {
        if (!window.crypto?.subtle || !window.crypto?.getRandomValues) throw new Error("Secure encryption is unavailable. Open the app over HTTPS or localhost.");
        return window.crypto;
    }

    function toBase64(bytes) {
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
    }

    function fromBase64(value) {
        const binary = atob(value);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    function randomBytes(length) {
        const bytes = new Uint8Array(length);
        cryptoApi().getRandomValues(bytes);
        return bytes;
    }

    async function deriveVaultKey(passphrase, salt) {
        if (typeof passphrase !== "string" || passphrase.length < 12) throw new Error("Use a vault passphrase of at least 12 characters.");
        const crypto = cryptoApi();
        const material = await crypto.subtle.importKey("raw", encoder.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
        return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: VAULT_KDF_ITERATIONS, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    }

    function vaultAad() { return encoder.encode(`${VAULT_FORMAT}|${VAULT_VERSION}`); }

    async function makeVaultEnvelope(entries, key, salt) {
        const iv = randomBytes(12);
        const plaintext = encoder.encode(JSON.stringify({ entries, updatedAt: new Date().toISOString() }));
        const ciphertext = await cryptoApi().subtle.encrypt({ name: "AES-GCM", iv, additionalData: vaultAad(), tagLength: 128 }, key, plaintext);
        return { format: VAULT_FORMAT, version: VAULT_VERSION, kdf: "PBKDF2-SHA256", iterations: VAULT_KDF_ITERATIONS, salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)), updatedAt: new Date().toISOString() };
    }

    async function decodeVaultEnvelope(envelope, passphrase) {
        if (!envelope || envelope.format !== VAULT_FORMAT || envelope.version !== VAULT_VERSION) throw new Error("This vault format is not supported by this version.");
        const salt = fromBase64(envelope.salt);
        const key = await deriveVaultKey(passphrase, salt);
        const plainBuffer = await cryptoApi().subtle.decrypt({ name: "AES-GCM", iv: fromBase64(envelope.iv), additionalData: vaultAad(), tagLength: 128 }, key, fromBase64(envelope.ciphertext));
        const payload = JSON.parse(decoder.decode(plainBuffer));
        if (!payload || !Array.isArray(payload.entries)) throw new Error("The vault data is invalid.");
        return { key, entries: payload.entries };
    }

    async function persistVault() {
        if (!vaultKey || !vaultEnvelope) throw new Error("Unlock the vault before saving credentials.");
        const envelope = await makeVaultEnvelope(vaultEntries, vaultKey, fromBase64(vaultEnvelope.salt));
        await writeProfilePatch({ credentialVault: envelope });
        vaultEnvelope = envelope;
    }

    function clearIdleTimer() {
        if (vaultIdleTimer) window.clearTimeout(vaultIdleTimer);
        vaultIdleTimer = null;
    }

    function resetIdleTimer() {
        clearIdleTimer();
        if (!vaultKey) return;
        vaultIdleTimer = window.setTimeout(() => lockVault(true), VAULT_IDLE_MS);
    }

    function showLockedVault() {
        if ($("vault-locked-panel")) $("vault-locked-panel").hidden = false;
        if ($("vault-unlocked-panel")) $("vault-unlocked-panel").hidden = true;
        if ($("vault-create-view")) $("vault-create-view").hidden = !!vaultEnvelope;
        if ($("vault-unlock-view")) $("vault-unlock-view").hidden = !vaultEnvelope;
        const unlockError = $("vault-unlock-error"); if (unlockError) unlockError.textContent = "";
        if ($("vault-unlock-password")) $("vault-unlock-password").value = "";
    }

    function lockVault(showMessage = false) {
        clearIdleTimer();
        vaultKey = null;
        vaultEntries = [];
        currentEditVaultId = null;
        resetVaultEntryForm();
        ["vault-create-password", "vault-create-confirm", "vault-unlock-password", "vault-new-passphrase", "vault-new-passphrase-confirm"].forEach(id => { if ($(id)) $(id).value = ""; });
        if ($("vault-entry-list")) $("vault-entry-list").replaceChildren(safeText("p", "notes-empty", "Unlock your vault to view saved logins."));
        showLockedVault();
        if (showMessage) showStatus("vault-global-status", "Vault locked for your protection.", "success");
    }

    async function createVault(event) {
        event.preventDefault();
        const password = $("vault-create-password").value;
        const confirm = $("vault-create-confirm").value;
        if (password.length < 12) { await notify("Use at least 12 characters for your vault passphrase.", { title: "Passphrase too short" }); return; }
        if (password !== confirm) { await notify("The passphrases do not match.", { title: "Check passphrase" }); return; }
        try {
            const salt = randomBytes(16);
            const key = await deriveVaultKey(password, salt);
            const envelope = await makeVaultEnvelope([], key, salt);
            await writeProfilePatch({ credentialVault: envelope });
            vaultEnvelope = envelope;
            vaultKey = key;
            vaultEntries = [];
            $("vault-create-password").value = ""; $("vault-create-confirm").value = "";
            showUnlockedVault(); resetIdleTimer();
            showStatus("vault-global-status", "Encrypted vault created on this device.", "success");
        } catch (error) { await notify(`Could not create the encrypted vault: ${error.message}`, { title: "Vault Setup Failed", danger: true }); }
    }

    async function unlockVault(event) {
        event.preventDefault();
        const password = $("vault-unlock-password").value;
        try {
            const decoded = await decodeVaultEnvelope(vaultEnvelope, password);
            vaultKey = decoded.key; vaultEntries = decoded.entries;
            $("vault-unlock-password").value = "";
            showUnlockedVault(); resetIdleTimer(); renderVaultEntries();
            showStatus("vault-global-status", "Vault unlocked. It will auto-lock after 5 minutes of inactivity.", "success");
        } catch (error) {
            const message = "That passphrase could not unlock this vault. Check it and try again.";
            if ($("vault-unlock-error")) $("vault-unlock-error").textContent = message;
            if ($("vault-unlock-password")) { $("vault-unlock-password").value = ""; $("vault-unlock-password").focus(); }
        }
    }

    function showUnlockedVault() {
        if ($("vault-locked-panel")) $("vault-locked-panel").hidden = true;
        if ($("vault-unlocked-panel")) $("vault-unlocked-panel").hidden = false;
        renderVaultEntries();
    }

    async function changeVaultPassphrase(event) {
        event.preventDefault();
        if (!vaultKey) return;
        const first = $("vault-new-passphrase").value;
        const second = $("vault-new-passphrase-confirm").value;
        if (first.length < 12) { await notify("Use at least 12 characters.", { title: "Passphrase too short" }); return; }
        if (first !== second) { await notify("The new passphrases do not match.", { title: "Check passphrase" }); return; }
        try {
            const newSalt = randomBytes(16);
            const newKey = await deriveVaultKey(first, newSalt);
            const envelope = await makeVaultEnvelope(vaultEntries, newKey, newSalt);
            await writeProfilePatch({ credentialVault: envelope });
            vaultEnvelope = envelope; vaultKey = newKey;
            $("vault-new-passphrase").value = ""; $("vault-new-passphrase-confirm").value = "";
            resetIdleTimer();
            await notify("Your vault has been re-encrypted with the new passphrase. Keep it somewhere safe.", { title: "Passphrase Changed" });
        } catch (error) { await notify(`Could not change the vault passphrase: ${error.message}`, { title: "Passphrase Change Failed", danger: true }); }
    }

    async function copyText(value) {
        const text = String(value ?? "");
        if (!text) throw new Error("There is nothing to copy.");
        if (navigator.clipboard?.writeText && window.isSecureContext) return navigator.clipboard.writeText(text);
        const input = document.createElement("textarea");
        input.value = text; input.setAttribute("readonly", "");
        input.style.position = "fixed"; input.style.opacity = "0";
        document.body.appendChild(input); input.select();
        const success = document.execCommand("copy"); input.remove();
        if (!success) throw new Error("Clipboard access is unavailable in this browser.");
    }

    function resetVaultEntryForm() {
        if ($("vault-entry-form")) $("vault-entry-form").reset();
        if ($("vault-entry-id")) $("vault-entry-id").value = "";
        if ($("vault-editor-heading")) $("vault-editor-heading").textContent = "Add a login";
        if ($("vault-entry-save")) $("vault-entry-save").textContent = "Save encrypted login";
        if ($("vault-entry-cancel")) $("vault-entry-cancel").hidden = true;
        if ($("vault-password")) { $("vault-password").type = "password"; }
        if ($("vault-password-reveal")) { $("vault-password-reveal").textContent = "Show"; $("vault-password-reveal").setAttribute("aria-pressed", "false"); }
        currentEditVaultId = null;
    }

    async function handleVaultEntrySubmit(event) {
        event.preventDefault();
        if (!vaultKey) return;
        const service = $("vault-service").value.trim();
        const username = $("vault-username").value.trim();
        const password = $("vault-password").value;
        if (!service || !username || !password) return;
        const now = new Date().toISOString();
        if (currentEditVaultId) {
            const index = vaultEntries.findIndex(item => item.id === currentEditVaultId);
            if (index >= 0) vaultEntries[index] = { ...vaultEntries[index], service, website: $("vault-website").value.trim(), username, password, notes: $("vault-entry-notes").value.trim(), updatedAt: now };
        } else {
            vaultEntries.unshift({ id: makeId("login"), service, website: $("vault-website").value.trim(), username, password, notes: $("vault-entry-notes").value.trim(), createdAt: now, updatedAt: now });
        }
        try { await persistVault(); resetVaultEntryForm(); renderVaultEntries(); showStatus("vault-global-status", "Login encrypted and saved in this workspace.", "success"); resetIdleTimer(); }
        catch (error) { await notify(`Could not save the login: ${error.message}`, { title: "Vault Save Failed", danger: true }); }
    }

    function renderVaultEntries() {
        const host = $("vault-entry-list");
        if (!host) return;
        host.replaceChildren();
        const query = ($("vault-search")?.value || "").trim().toLowerCase();
        const rows = vaultEntries.filter(item => `${item.service || ""} ${item.website || ""} ${item.username || ""}`.toLowerCase().includes(query));
        if ($("vault-entry-count")) $("vault-entry-count").textContent = `${vaultEntries.length} ${vaultEntries.length === 1 ? "login" : "logins"}`;
        if (!rows.length) { host.appendChild(safeText("p", "notes-empty", vaultEntries.length ? "No saved login matches your search." : "Your encrypted login entries will appear here.")); return; }

        rows.forEach(entry => {
            const card = document.createElement("article");
            card.className = "vault-entry-card";
            const expanded = expandedVaultIds.has(entry.id);

            // Compact service-only row. Details are deliberately hidden until requested.
            const header = document.createElement("button");
            header.type = "button";
            header.className = "vault-entry-summary";
            header.setAttribute("aria-expanded", String(expanded));
            const summaryMain = document.createElement("span"); summaryMain.className = "vault-entry-summary-main";
            const icon = safeText("span", "vault-entry-monogram", (entry.service || "?").trim().charAt(0).toUpperCase());
            const titleBlock = document.createElement("span"); titleBlock.className = "vault-entry-summary-title";
            titleBlock.appendChild(safeText("strong", "", entry.service || "Unnamed service"));
            titleBlock.appendChild(safeText("small", "", "Open login details"));
            summaryMain.append(icon, titleBlock);
            const summaryMeta = document.createElement("span"); summaryMeta.className = "vault-entry-summary-meta";
            summaryMeta.append(safeText("small", "note-date", formatDate(entry.updatedAt || entry.createdAt)), safeText("span", "vault-entry-chevron", expanded ? "−" : "+"));
            header.append(summaryMain, summaryMeta);
            header.addEventListener("click", () => {
                if (expandedVaultIds.has(entry.id)) expandedVaultIds.delete(entry.id);
                else { expandedVaultIds.clear(); expandedVaultIds.add(entry.id); }
                renderVaultEntries();
                resetIdleTimer();
            });
            card.appendChild(header);

            if (expanded) {
                const details = document.createElement("div"); details.className = "vault-entry-details";
                if (entry.website) {
                    try {
                        const parsed = new URL(entry.website);
                        if (["http:", "https:"].includes(parsed.protocol)) {
                            const link = document.createElement("a"); link.className = "vault-entry-site"; link.textContent = entry.website; link.href = parsed.href; link.target = "_blank"; link.rel = "noopener noreferrer"; details.appendChild(link);
                        } else { details.appendChild(safeText("small", "vault-entry-site", entry.website)); }
                    } catch (_) { details.appendChild(safeText("small", "vault-entry-site", entry.website)); }
                }

                const usernameRow = document.createElement("div"); usernameRow.className = "vault-copy-row";
                const usernameLabel = document.createElement("div"); usernameLabel.append(safeText("small", "vault-field-label", "USERNAME"), safeText("p", "vault-field-value", entry.username));
                const copyUser = safeText("button", "secondary-btn", "Copy username"); copyUser.type = "button";
                copyUser.addEventListener("click", async () => { try { await copyText(entry.username); showStatus("vault-global-status", "Username copied.", "success"); resetIdleTimer(); } catch (e) { showStatus("vault-global-status", e.message, "warning"); } });
                usernameRow.append(usernameLabel, copyUser); details.appendChild(usernameRow);

                const passwordRow = document.createElement("div"); passwordRow.className = "vault-copy-row";
                const pwWrap = document.createElement("div"); pwWrap.appendChild(safeText("small", "vault-field-label", "PASSWORD"));
                const pwText = safeText("p", "vault-field-value vault-password-mask", "••••••••••••"); pwWrap.appendChild(pwText);
                const toggle = safeText("button", "secondary-btn", "Show"); toggle.type = "button";
                let revealed = false; toggle.addEventListener("click", () => { revealed = !revealed; pwText.textContent = revealed ? entry.password : "••••••••••••"; toggle.textContent = revealed ? "Hide" : "Show"; resetIdleTimer(); });
                const copyPass = safeText("button", "secondary-btn", "Copy password"); copyPass.type = "button";
                copyPass.addEventListener("click", async () => { try { await copyText(entry.password); showStatus("vault-global-status", "Password copied. Clipboard contents may remain available to other apps.", "success"); resetIdleTimer(); } catch (e) { showStatus("vault-global-status", e.message, "warning"); } });
                passwordRow.append(pwWrap, toggle, copyPass); details.appendChild(passwordRow);
                if (entry.notes) details.appendChild(safeText("p", "vault-entry-notes-text", entry.notes));

                const actions = document.createElement("div"); actions.className = "vault-entry-actions";
                const edit = safeText("button", "secondary-btn", "Edit"); edit.type = "button";
                edit.addEventListener("click", () => { currentEditVaultId = entry.id; $("vault-entry-id").value = entry.id; $("vault-service").value = entry.service || ""; $("vault-website").value = entry.website || ""; $("vault-username").value = entry.username || ""; $("vault-password").value = entry.password || ""; $("vault-entry-notes").value = entry.notes || ""; $("vault-editor-heading").textContent = "Edit saved login"; $("vault-entry-save").textContent = "Update encrypted login"; $("vault-entry-cancel").hidden = false; $("vault-service").focus(); document.querySelector("#password-vault .vault-editor-card")?.scrollIntoView({ behavior: "smooth", block: "start" }); resetIdleTimer(); });
                const remove = safeText("button", "secondary-btn note-delete-btn", "Delete"); remove.type = "button";
                remove.addEventListener("click", async () => { if (!await confirmAction(`Delete the saved login for “${entry.service}”?`, { title: "Delete Login", confirmText: "Delete", danger: true })) return; const before = vaultEntries; vaultEntries = vaultEntries.filter(item => item.id !== entry.id); expandedVaultIds.delete(entry.id); try { await persistVault(); renderVaultEntries(); showStatus("vault-global-status", "Login deleted from the encrypted vault.", "success"); resetIdleTimer(); } catch (error) { vaultEntries = before; await notify(`Could not delete the login: ${error.message}`, { title: "Delete Failed", danger: true }); } });
                actions.append(edit, remove); details.appendChild(actions);
                card.appendChild(details);
            }
            host.appendChild(card);
        });
    }

    function bindEvents() {
        if ($("create-note-btn") && $("create-note-btn").dataset.bound !== "true") { $("create-note-btn").dataset.bound = "true"; $("create-note-btn").addEventListener("click", () => openNoteEditor()); }
        if ($("note-form") && $("note-form").dataset.bound !== "true") { $("note-form").dataset.bound = "true"; $("note-form").addEventListener("submit", handleNoteSubmit); }
        const noteEditor = $("note-body");
        if (noteEditor && noteEditor.dataset.richBound !== "true") {
            noteEditor.dataset.richBound = "true";
            noteEditor.addEventListener("paste", event => {
                const html = event.clipboardData?.getData("text/html");
                if (!html) return; // Preserve the browser's plain-text paste behaviour.
                event.preventDefault();
                if (!insertSanitizedHtmlAtCaret(noteEditor, html)) {
                    const safe = sanitizeRichHtml(html);
                    noteEditor.insertAdjacentHTML("beforeend", safe);
                }
            });
            noteEditor.addEventListener("keydown", event => {
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                    event.preventDefault(); $("note-form")?.requestSubmit();
                }
            });
        }
        const noteToolbar = $("note-format-toolbar");
        if (noteToolbar && noteToolbar.dataset.bound !== "true") {
            noteToolbar.dataset.bound = "true";
            noteToolbar.addEventListener("mousedown", event => {
                if (event.target.closest("button[data-note-command]")) event.preventDefault();
            });
            noteToolbar.addEventListener("click", event => {
                const button = event.target.closest("button[data-note-command]");
                if (!button || !noteEditor) return;
                noteEditor.focus();
                const command = button.dataset.noteCommand;
                const value = button.dataset.noteValue || null;
                if (command === "formatBlock") document.execCommand(command, false, value);
                else document.execCommand(command, false, null);
            });
        }
        if ($("note-cancel-edit") && $("note-cancel-edit").dataset.bound !== "true") { $("note-cancel-edit").dataset.bound = "true"; $("note-cancel-edit").addEventListener("click", closeNoteEditor); }
        if ($("note-editor-close") && $("note-editor-close").dataset.bound !== "true") { $("note-editor-close").dataset.bound = "true"; $("note-editor-close").addEventListener("click", closeNoteEditor); }
        if ($("note-reader-close") && $("note-reader-close").dataset.bound !== "true") { $("note-reader-close").dataset.bound = "true"; $("note-reader-close").addEventListener("click", () => closeDialog($("note-reader-dialog"))); }
        if ($("note-reader-done") && $("note-reader-done").dataset.bound !== "true") { $("note-reader-done").dataset.bound = "true"; $("note-reader-done").addEventListener("click", () => closeDialog($("note-reader-dialog"))); }
        if ($("note-reader-edit") && $("note-reader-edit").dataset.bound !== "true") { $("note-reader-edit").dataset.bound = "true"; $("note-reader-edit").addEventListener("click", () => editNoteById(activeReaderNoteId)); }
        if ($("note-reader-copy") && $("note-reader-copy").dataset.bound !== "true") { $("note-reader-copy").dataset.bound = "true"; $("note-reader-copy").addEventListener("click", async () => { const note = notesCache.find(item => item.id === activeReaderNoteId); if (!note) return; try { await copyRichNote(note); showStatus("notes-status", "Note copied with formatting where supported.", "success"); } catch (error) { showStatus("notes-status", error.message, "warning"); } }); }
        ["notes-search", "notes-filter"].forEach(id => { if ($(id) && $(id).dataset.bound !== "true") { $(id).dataset.bound = "true"; $(id).addEventListener("input", renderNotes); $(id).addEventListener("change", renderNotes); } });
        if ($("vault-create-form") && $("vault-create-form").dataset.bound !== "true") { $("vault-create-form").dataset.bound = "true"; $("vault-create-form").addEventListener("submit", createVault); }
        if ($("vault-unlock-form") && $("vault-unlock-form").dataset.bound !== "true") { $("vault-unlock-form").dataset.bound = "true"; $("vault-unlock-form").addEventListener("submit", unlockVault); }
        if ($("vault-entry-form") && $("vault-entry-form").dataset.bound !== "true") { $("vault-entry-form").dataset.bound = "true"; $("vault-entry-form").addEventListener("submit", handleVaultEntrySubmit); }
        if ($("vault-entry-cancel") && $("vault-entry-cancel").dataset.bound !== "true") { $("vault-entry-cancel").dataset.bound = "true"; $("vault-entry-cancel").addEventListener("click", resetVaultEntryForm); }
        if ($("vault-lock-btn") && $("vault-lock-btn").dataset.bound !== "true") { $("vault-lock-btn").dataset.bound = "true"; $("vault-lock-btn").addEventListener("click", () => lockVault(true)); }
        if ($("vault-change-passphrase-form") && $("vault-change-passphrase-form").dataset.bound !== "true") { $("vault-change-passphrase-form").dataset.bound = "true"; $("vault-change-passphrase-form").addEventListener("submit", changeVaultPassphrase); }
        if ($("vault-password-reveal") && $("vault-password-reveal").dataset.bound !== "true") { $("vault-password-reveal").dataset.bound = "true"; $("vault-password-reveal").addEventListener("click", () => { const input = $("vault-password"); const shown = input.type === "text"; input.type = shown ? "password" : "text"; $("vault-password-reveal").textContent = shown ? "Show" : "Hide"; $("vault-password-reveal").setAttribute("aria-pressed", String(!shown)); }); }
        if ($("vault-search") && $("vault-search").dataset.bound !== "true") { $("vault-search").dataset.bound = "true"; $("vault-search").addEventListener("input", renderVaultEntries); }
        if (!document.documentElement.dataset.vaultIdleBound) {
            document.documentElement.dataset.vaultIdleBound = "true";
            ["pointerdown", "keydown", "touchstart"].forEach(type => document.addEventListener(type, event => { if (vaultKey && event.target.closest?.("#password-vault")) resetIdleTimer(); }, { passive: true }));
            window.addEventListener("hbt:profile-signed-out", () => lockVault(false));
            window.addEventListener("hbt:profile-locked", () => lockVault(false));
            window.addEventListener("pagehide", () => lockVault(false));
        }
    }

    async function refreshNotesVaultForProfile() {
        lockVault(false);
        try {
            const profile = await readProfile();
            notesCache = Array.isArray(profile.notes) ? profile.notes : [];
            activeReaderNoteId = null; closeDialog($("note-reader-dialog")); closeNoteEditor(); expandedVaultIds.clear();
            vaultEnvelope = profile.credentialVault && profile.credentialVault.format === VAULT_FORMAT ? profile.credentialVault : null;
            resetNoteForm();
            renderNotes();
            showLockedVault();
        } catch (error) {
            console.warn("Could not load workspace notes and vault metadata:", error);
            notesCache = []; vaultEnvelope = null; renderNotes(); showLockedVault();
        }
    }

    function clearNotesVaultWorkspaceView() {
        lockVault(false);
        notesCache = [];
        activeReaderNoteId = null; closeDialog($("note-reader-dialog")); closeNoteEditor(); expandedVaultIds.clear();
        vaultEnvelope = null;
        resetNoteForm();
        renderNotes();
        showLockedVault();
    }

    async function initializeNotesVault() {
        bindEvents();
        await refreshNotesVaultForProfile();
        initialized = true;
        console.log("Notes and encrypted credential vault initialized.");
        return true;
    }

    window.initializeNotesVault = initializeNotesVault;
    window.refreshNotesVaultForProfile = refreshNotesVaultForProfile;
    window.clearNotesVaultWorkspaceView = clearNotesVaultWorkspaceView;
})();
