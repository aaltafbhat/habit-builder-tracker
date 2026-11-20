/* ==========================================
   HABIT BUILDER TRACKER
   DATA BACKUP, RESTORE & PWA SUPPORT
   Release 1.0
========================================== */

(() => {
    "use strict";

    const BACKUP_FORMAT = "90-day-command-center-backup";
    const BACKUP_FORMAT_VERSION = 1;
    const EXPECTED_STORES = ["profile", "tasks", "habits", "milestones", "projects"];
    const MAX_BACKUP_BYTES = 80 * 1024 * 1024;
    const ENCRYPTED_BACKUP_FORMAT = "hbt-encrypted-backup";
    const ENCRYPTED_BACKUP_VERSION = 1;
    const BACKUP_KDF_ITERATIONS = 310000;
    const BACKUP_HISTORY_BLOB_LIMIT = 10;
    const BACKUP_HISTORY_CACHE_MAX_BYTES = 100 * 1024 * 1024;
    const BACKUP_MANAGER_DB = "habit-builder-tracker-backup-manager";
    const BACKUP_MANAGER_DB_VERSION = 1;
    const BACKUP_HISTORY_LIMIT = 20;

    let deferredInstallPrompt = null;
    let backupManagerDbPromise = null;
    let autoBackupVisibilityBound = false;

    function notify(message, options = {}) {
        if (typeof window.showAppDialog === "function") {
            return window.showAppDialog(message, options);
        }
        console.info(message);
        return Promise.resolve(true);
    }

    function confirmAction(message, options = {}) {
        if (typeof window.showAppConfirm === "function") {
            return window.showAppConfirm(message, options);
        }
        return Promise.resolve(false);
    }

    function getLocalTimestamp() {
        const date = new Date();
        const pad = value => String(value).padStart(2, "0");
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
    }

    function getWorkspaceIdForBackup() {
        try {
            return typeof getActiveProfileId === "function" ? String(getActiveProfileId()) : "current-user";
        } catch (_) {
            return "current-user";
        }
    }

    async function getWorkspaceNameForBackup() {
        const id = getWorkspaceIdForBackup();
        try {
            const account = typeof getProfileAccount === "function" ? await getProfileAccount(id) : null;
            return account?.workspaceName || account?.name || id;
        } catch (_) {
            return id;
        }
    }

    function openBackupManagerDb() {
        if (backupManagerDbPromise) return backupManagerDbPromise;
        backupManagerDbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(BACKUP_MANAGER_DB, BACKUP_MANAGER_DB_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains("settings")) {
                    db.createObjectStore("settings", { keyPath: "workspaceId" });
                }
                if (!db.objectStoreNames.contains("history")) {
                    const history = db.createObjectStore("history", { keyPath: "id", autoIncrement: true });
                    history.createIndex("workspaceId", "workspaceId", { unique: false });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error("Could not open backup settings storage."));
            request.onblocked = () => reject(new Error("Backup settings storage is busy in another tab. Close other app tabs and retry."));
        }).catch(error => {
            backupManagerDbPromise = null;
            throw error;
        });
        return backupManagerDbPromise;
    }

    function requestValue(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error("A backup storage request failed."));
        });
    }

    async function getAutoBackupSettings() {
        const db = await openBackupManagerDb();
        const workspaceId = getWorkspaceIdForBackup();
        const tx = db.transaction("settings", "readonly");
        const saved = await requestValue(tx.objectStore("settings").get(workspaceId));
        return {
            workspaceId,
            enabled: false,
            frequency: "weekly",
            location: "downloads",
            directoryHandle: null,
            directoryName: "",
            lastRunAt: null,
            lastAttemptAt: null,
            lastStatus: "never",
            lastError: "",
            backupEncryptionEnabled: false,
            backupEncryptionSalt: "",
            backupEncryptionIterations: BACKUP_KDF_ITERATIONS,
            backupCryptoKey: null,
            backupKeyCheckIv: "",
            backupKeyCheckCiphertext: "",
            ...saved
        };
    }

    async function saveAutoBackupSettings(patch) {
        const db = await openBackupManagerDb();
        const current = await getAutoBackupSettings();
        const updated = { ...current, ...patch, workspaceId: current.workspaceId, updatedAt: new Date().toISOString() };
        await new Promise((resolve, reject) => {
            const tx = db.transaction("settings", "readwrite");
            tx.objectStore("settings").put(updated);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error || new Error("Could not save backup settings."));
            tx.onabort = () => reject(tx.error || new Error("Saving backup settings was cancelled."));
        });
        return updated;
    }

    async function getBackupHistoryAll() {
        const db = await openBackupManagerDb();
        const workspaceId = getWorkspaceIdForBackup();
        const tx = db.transaction("history", "readonly");
        const rows = await requestValue(tx.objectStore("history").index("workspaceId").getAll(workspaceId));
        return (rows || []).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    }

    async function getBackupHistory() {
        return (await getBackupHistoryAll()).slice(0, BACKUP_HISTORY_LIMIT);
    }

    async function recordBackupHistory(details) {
        try {
            const db = await openBackupManagerDb();
            const workspaceId = getWorkspaceIdForBackup();
            await new Promise((resolve, reject) => {
                const tx = db.transaction("history", "readwrite");
                tx.objectStore("history").add({
                    workspaceId,
                    createdAt: new Date().toISOString(),
                    filename: details.filename || "backup.json",
                    kind: details.kind || "manual",
                    destination: details.destination || "Browser Downloads",
                    bytes: Number(details.bytes || 0),
                    status: details.status || "success",
                    encrypted: Boolean(details.encrypted),
                    blob: details.blob instanceof Blob ? details.blob : null,
                    message: details.message || ""
                });
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => reject(tx.error || new Error("Could not record backup history."));
                tx.onabort = () => reject(tx.error || new Error("Recording backup history was cancelled."));
            });
            const allRows = await getBackupHistoryAll();
            const oldRows = allRows.slice(BACKUP_HISTORY_LIMIT);
            const keepBlobIds = new Set();
            let cachedCount = 0;
            let cachedBytes = 0;
            allRows.forEach(row => {
                if (!(row.blob instanceof Blob) || cachedCount >= BACKUP_HISTORY_BLOB_LIMIT) return;
                const size = Number(row.blob.size || 0);
                if (cachedBytes + size > BACKUP_HISTORY_CACHE_MAX_BYTES) return;
                keepBlobIds.add(row.id);
                cachedCount += 1;
                cachedBytes += size;
            });
            const cacheTrimRows = allRows.filter(row => row.blob && !keepBlobIds.has(row.id));
            if (oldRows.length || cacheTrimRows.length) {
                await new Promise((resolve, reject) => {
                    const tx = db.transaction("history", "readwrite");
                    const store = tx.objectStore("history");
                    cacheTrimRows.forEach(row => {
                        row.blob = null;
                        store.put(row);
                    });
                    oldRows.forEach(row => store.delete(row.id));
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = () => reject(tx.error || new Error("Could not trim old backup history."));
                });
            }
        } catch (error) {
            // A metadata/history failure must never invalidate a backup that was already written.
            console.warn("Backup file was created, but its history could not be saved:", error);
        }
    }

    function bytesToBase64(bytes) {
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
    }

    function base64ToBytes(value) {
        const binary = atob(String(value || ""));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    function randomBytes(length) {
        if (!window.crypto?.getRandomValues) throw new Error("Secure random generation is unavailable. Open the app over HTTPS or localhost.");
        const bytes = new Uint8Array(length);
        window.crypto.getRandomValues(bytes);
        return bytes;
    }

    async function deriveBackupKey(passphrase, salt, iterations = BACKUP_KDF_ITERATIONS) {
        if (!window.crypto?.subtle) throw new Error("Backup encryption requires a secure HTTPS or localhost connection.");
        if (typeof passphrase !== "string" || passphrase.length < 12) throw new Error("Use a backup recovery passphrase with at least 12 characters.");
        const material = await window.crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
        return window.crypto.subtle.deriveKey(
            { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
            material,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt", "decrypt"]
        );
    }

    async function setBackupEncryptionPassphrase(passphrase) {
        const salt = randomBytes(16);
        const iv = randomBytes(12);
        const iterations = BACKUP_KDF_ITERATIONS;
        const key = await deriveBackupKey(passphrase, salt, iterations);
        const check = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv, additionalData: new TextEncoder().encode("HBT_BACKUP_KEY_CHECK_V1") },
            key,
            new TextEncoder().encode("HABIT_BUILDER_BACKUP_KEY_OK")
        );
        await saveAutoBackupSettings({
            backupEncryptionEnabled: true,
            backupEncryptionSalt: bytesToBase64(salt),
            backupEncryptionIterations: iterations,
            backupCryptoKey: key,
            backupKeyCheckIv: bytesToBase64(iv),
            backupKeyCheckCiphertext: bytesToBase64(new Uint8Array(check))
        });
    }


    function requestBackupPassphrase(message) {
        return new Promise(resolve => {
            const overlay = document.createElement("div");
            overlay.className = "app-dialog-overlay";
            const dialog = document.createElement("section");
            dialog.className = "app-dialog app-dialog-backup-password";
            dialog.setAttribute("role", "dialog");
            dialog.setAttribute("aria-modal", "true");
            const mark = document.createElement("div");
            mark.className = "app-dialog-mark";
            mark.textContent = "🔐";
            const title = document.createElement("h2");
            title.textContent = "Backup Recovery Password";
            const description = document.createElement("p");
            description.textContent = message;
            const label = document.createElement("label");
            label.className = "app-dialog-input-label";
            label.textContent = "Recovery passphrase";
            const input = document.createElement("input");
            input.type = "password";
            input.className = "app-dialog-input";
            input.autocomplete = "current-password";
            input.placeholder = "Enter your 12+ character passphrase";
            const rememberWrap = document.createElement("label");
            rememberWrap.className = "backup-password-remember";
            const remember = document.createElement("input");
            remember.type = "checkbox";
            remember.checked = true;
            const rememberText = document.createElement("span");
            rememberText.textContent = "Remember on this device for one-click recovery";
            rememberWrap.append(remember, rememberText);
            const actions = document.createElement("div");
            actions.className = "app-dialog-actions";
            const cancel = document.createElement("button");
            cancel.type = "button";
            cancel.className = "app-dialog-cancel";
            cancel.textContent = "Cancel";
            const submit = document.createElement("button");
            submit.type = "button";
            submit.className = "app-dialog-confirm";
            submit.textContent = "Unlock Backup";
            submit.disabled = true;
            const finish = value => { overlay.remove(); document.removeEventListener("keydown", onKey); resolve(value); };
            input.addEventListener("input", () => { submit.disabled = input.value.length < 12; });
            submit.addEventListener("click", () => finish({ password: input.value, remember: remember.checked }));
            cancel.addEventListener("click", () => finish(null));
            overlay.addEventListener("click", event => { if (event.target === overlay) finish(null); });
            const onKey = event => {
                if (event.key === "Escape") { event.preventDefault(); finish(null); }
                else if (event.key === "Enter" && !submit.disabled) { event.preventDefault(); submit.click(); }
            };
            actions.append(cancel, submit);
            dialog.append(mark, title, description, label, input, rememberWrap, actions);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            document.addEventListener("keydown", onKey);
            input.focus();
        });
    }

    async function encryptBackupObject(backup, settings) {
        if (!settings.backupEncryptionEnabled || !settings.backupCryptoKey || !settings.backupEncryptionSalt) {
            throw new Error("Encrypted backups are not configured on this device. Set your Backup Recovery Passphrase first.");
        }
        const iv = randomBytes(12);
        const aad = new TextEncoder().encode(`${ENCRYPTED_BACKUP_FORMAT}|${ENCRYPTED_BACKUP_VERSION}`);
        const plaintext = new TextEncoder().encode(JSON.stringify(backup));
        const ciphertext = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, settings.backupCryptoKey, plaintext);
        return {
            format: ENCRYPTED_BACKUP_FORMAT,
            version: ENCRYPTED_BACKUP_VERSION,
            cipher: "AES-256-GCM",
            kdf: "PBKDF2-SHA-256",
            iterations: Number(settings.backupEncryptionIterations || BACKUP_KDF_ITERATIONS),
            salt: settings.backupEncryptionSalt,
            iv: bytesToBase64(iv),
            ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
            encryptedAt: new Date().toISOString()
        };
    }

    async function decodeBackupPayload(parsed) {
        if (parsed?.format !== ENCRYPTED_BACKUP_FORMAT) return validateBackup(parsed);
        if (parsed.version !== ENCRYPTED_BACKUP_VERSION || parsed.cipher !== "AES-256-GCM" || parsed.kdf !== "PBKDF2-SHA-256") {
            throw new Error("This encrypted backup format is not supported by this version.");
        }
        const salt = base64ToBytes(parsed.salt);
        const iv = base64ToBytes(parsed.iv);
        const ciphertext = base64ToBytes(parsed.ciphertext);
        if (salt.length !== 16 || iv.length !== 12 || !ciphertext.length) throw new Error("The encrypted backup is incomplete or damaged.");
        const iterations = Math.max(100000, Math.min(1000000, Number(parsed.iterations) || BACKUP_KDF_ITERATIONS));
        const settings = await getAutoBackupSettings();
        let key = null;
        const localKeyMatches = settings.backupEncryptionEnabled && settings.backupCryptoKey && settings.backupEncryptionSalt === parsed.salt;
        if (localKeyMatches) key = settings.backupCryptoKey;
        let remember = false;
        const decryptWithKey = candidate => window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(`${ENCRYPTED_BACKUP_FORMAT}|${ENCRYPTED_BACKUP_VERSION}`) },
            candidate,
            ciphertext
        );
        let plaintext = null;
        if (key) {
            try { plaintext = await decryptWithKey(key); }
            catch (_) { key = null; }
        }
        if (!key) {
            const prompt = await requestBackupPassphrase("This backup is encrypted. Enter the recovery passphrase that was used when it was created.");
            if (!prompt) throw new Error("Restore cancelled. No recovery passphrase was entered.");
            key = await deriveBackupKey(prompt.password, salt, iterations);
            remember = prompt.remember;
            try { plaintext = await decryptWithKey(key); }
            catch (_) { throw new Error("The backup recovery passphrase is incorrect, or this backup file is damaged."); }
        }
        if (remember && (!settings.backupEncryptionEnabled || !settings.backupCryptoKey)) {
            await saveAutoBackupSettings({
                backupEncryptionEnabled: true,
                backupEncryptionSalt: parsed.salt,
                backupEncryptionIterations: iterations,
                backupCryptoKey: key,
                backupKeyCheckIv: "",
                backupKeyCheckCiphertext: ""
            });
        } else if (remember && settings.backupEncryptionEnabled && settings.backupCryptoKey && settings.backupEncryptionSalt !== parsed.salt) {
            await notify("This backup used a different recovery passphrase. It was opened for this restore only; your current backup encryption key was not changed.", { title: "Older Backup Passphrase" });
        }
        const backup = JSON.parse(new TextDecoder().decode(plaintext));
        return validateBackup(backup);
    }

    function formatBackupBytes(bytes) {
        const value = Number(bytes || 0);
        if (value < 1024) return `${value} B`;
        if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
        return `${(value / (1024 * 1024)).toFixed(2)} MB`;
    }

    function formatBackupDate(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "Unknown date";
        return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
    }

    function setAutoBackupStatus(message, state = "info") {
        const status = document.getElementById("auto-backup-status");
        if (status) {
            status.textContent = message;
            status.dataset.state = state;
        }
    }

    async function renderBackupHistory() {
        const host = document.getElementById("auto-backup-history");
        if (!host) return;
        const rows = await getBackupHistory();
        const currentSettings = await getAutoBackupSettings();
        const folderReadable = currentSettings.location === "folder" && !!currentSettings.directoryHandle;
        host.replaceChildren();
        if (!rows.length) {
            const empty = document.createElement("p");
            empty.className = "auto-backup-empty";
            empty.textContent = "No backup activity recorded yet.";
            host.appendChild(empty);
            return;
        }
        rows.forEach(row => {
            const item = document.createElement("div");
            item.className = "auto-backup-history-row";
            const name = document.createElement("div");
            name.className = "auto-backup-history-name";
            name.textContent = row.filename;
            const meta = document.createElement("div");
            meta.className = "auto-backup-history-meta";
            const kindLabels = { scheduled: "Scheduled backup", manual: "Manual backup", signout: "Sign-out backup", restore: "Safety before restore" };
            meta.textContent = `${kindLabels[row.kind] || "Backup"} · ${formatBackupDate(row.createdAt)}`;
            const destination = document.createElement("div");
            destination.className = "auto-backup-history-meta";
            destination.textContent = `${row.destination} · ${formatBackupBytes(row.bytes)}`;
            const status = document.createElement("span");
            status.className = "auto-backup-history-status" + (row.status === "failed" ? " is-warning" : "");
            status.textContent = row.status === "failed" ? "Failed" : (row.status === "download-started" ? "Download started" : "Saved");
            status.title = row.message || "";
            const actions = document.createElement("div");
            actions.className = "auto-backup-history-actions";
            const restore = document.createElement("button");
            restore.type = "button";
            restore.className = "secondary-btn auto-backup-restore-btn";
            restore.textContent = "Restore";
            const matchingFolderEntry = folderReadable && String(row.destination || "").startsWith("Folder:");
            restore.disabled = row.status === "failed" || (!(row.blob instanceof Blob) && !matchingFolderEntry);
            restore.title = row.blob ? "Restore this saved backup" : "Restore from the selected backup folder when available";
            restore.addEventListener("click", () => restoreBackupHistoryEntry(row));
            const download = document.createElement("button");
            download.type = "button";
            download.className = "secondary-btn auto-backup-download-btn";
            download.textContent = "Download";
            download.disabled = !row.blob;
            download.title = row.blob ? "Download a copy of this backup" : "This history entry no longer has a local recovery copy";
            download.addEventListener("click", () => downloadBlob(row.blob, row.filename));
            actions.append(restore, download);
            const encryption = document.createElement("span");
            encryption.className = "auto-backup-history-encryption";
            encryption.textContent = row.encrypted ? "Encrypted" : "Standard";
            item.append(name, meta, destination, status, encryption, actions);
            host.appendChild(item);
        });
    }

    async function refreshAutoBackupSettingsUI() {
        const settings = await getAutoBackupSettings();
        const enabled = document.getElementById("auto-backup-enabled");
        const frequency = document.getElementById("auto-backup-frequency");
        const location = document.getElementById("auto-backup-location");
        const folderLabel = document.getElementById("auto-backup-folder-label");
        const badge = document.getElementById("auto-backup-state-badge");
        const chooseFolder = document.getElementById("auto-backup-choose-folder");
        const encryptionBadge = document.getElementById("backup-encryption-state");
        const encryptionSetup = document.getElementById("backup-encryption-setup");
        const encryptionActive = document.getElementById("backup-encryption-active");
        const encryptionNote = document.getElementById("backup-encryption-note");
        const folderSupported = typeof window.showDirectoryPicker === "function";
        const encryptionReady = !!(settings.backupEncryptionEnabled && settings.backupCryptoKey && settings.backupEncryptionSalt);
        if (enabled) enabled.checked = !!settings.enabled;
        if (frequency) frequency.value = settings.frequency === "daily" ? "daily" : "weekly";
        if (location) {
            location.value = settings.location === "folder" && settings.directoryHandle ? "folder" : "downloads";
            const folderOption = location.querySelector('option[value="folder"]');
            if (folderOption) folderOption.disabled = !folderSupported;
        }
        if (folderLabel) {
            folderLabel.textContent = settings.location === "folder" && settings.directoryName
                ? `Selected folder: ${settings.directoryName}. The browser may ask you to re-authorize access.`
                : (folderSupported ? "Default location: your browser's Downloads folder. For cloud sync, choose a Google Drive for desktop or OneDrive synced folder." : "This browser does not support folder selection; backups use Downloads.");
        }
        if (chooseFolder) chooseFolder.disabled = !folderSupported || !encryptionReady;
        if (encryptionBadge) {
            encryptionBadge.textContent = encryptionReady ? "AES-256 encrypted" : (settings.backupEncryptionEnabled ? "Unlock on this device" : "Not configured");
            encryptionBadge.classList.toggle("is-on", encryptionReady);
        }
        if (encryptionSetup) encryptionSetup.hidden = encryptionReady;
        if (encryptionActive) encryptionActive.hidden = !encryptionReady;
        const encryptionChange = document.getElementById("backup-encryption-change");
        if (encryptionChange && !encryptionChange.dataset.editing) encryptionChange.hidden = false;
        if (encryptionNote) encryptionNote.textContent = encryptionReady
            ? "Your recovery key is stored locally as a non-exportable browser key. Keep your recovery passphrase separately; you will need it to restore on another device. Changing it does not re-encrypt older backups."
            : "Set a recovery passphrase before using a cloud-synced folder. Backups are encrypted on this device with AES-256-GCM. Keep the passphrase somewhere safe; without it, encrypted backups cannot be recovered.";
        if (badge) {
            badge.textContent = settings.enabled ? "Enabled" : "Off";
            badge.classList.toggle("is-on", !!settings.enabled);
        }
        if (settings.lastStatus === "failed" && settings.lastError) {
            setAutoBackupStatus(`Last backup failed: ${settings.lastError}`, "warning");
        } else if (!settings.enabled) {
            setAutoBackupStatus("Automatic backups are off. Sign-out backups remain enabled.", "info");
        } else if (settings.lastRunAt) {
            setAutoBackupStatus(`Last automatic backup: ${formatBackupDate(settings.lastRunAt)}. Frequency: ${settings.frequency}.`, "success");
        } else {
            setAutoBackupStatus("Automatic backups are enabled. The first scheduled backup will run the next time you open this workspace.", "info");
        }
        await renderBackupHistory();
        return settings;
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        anchor.style.display = "none";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 2000);
        return filename;
    }

    async function saveBackupBlob(blob, filename, settings, allowPermissionRequest = false) {
        if (settings.location === "folder" && settings.directoryHandle) {
            const handle = settings.directoryHandle;
            try {
                let permission = await handle.queryPermission({ mode: "readwrite" });
                if (permission !== "granted" && allowPermissionRequest && typeof handle.requestPermission === "function") {
                    permission = await handle.requestPermission({ mode: "readwrite" });
                }
                if (permission === "granted") {
                    const fileHandle = await handle.getFileHandle(filename, { create: true });
                    const writable = await fileHandle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                    return { filename, destination: `Folder: ${settings.directoryName || handle.name || "Selected folder"}`, status: "success" };
                }
            } catch (error) {
                console.warn("Could not write to the selected backup folder; falling back to Downloads:", error);
            }
            downloadBlob(blob, filename);
            return { filename, destination: "Browser Downloads (folder access unavailable)", status: "download-started", message: "Folder permission was unavailable; the backup was sent to Downloads instead." };
        }
        downloadBlob(blob, filename);
        return { filename, destination: "Browser Downloads", status: "download-started" };
    }

    async function createBackupArtifact(kind, options = {}) {
        const backup = await buildBackup();
        const settings = await getAutoBackupSettings();
        const workspaceName = await getWorkspaceNameForBackup();
        const safeName = String(workspaceName || "workspace").normalize("NFKD").replace(/[^a-zA-Z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "workspace";
        const suffix = options.suffix || `${kind}-${safeName}`;
        backup.workspaceId = getWorkspaceIdForBackup();
        backup.workspaceName = workspaceName;
        const encrypted = !!settings.backupEncryptionEnabled;
        let outputSettings = options.forceDownload ? { ...settings, location: "downloads" } : settings;
        let outputMessage = "";
        if (settings.location === "folder" && !encrypted) {
            if (kind !== "signout") {
                throw new Error("Cloud-folder backups must be encrypted. Set a Backup Recovery Passphrase in Profile & Appearance first.");
            }
            // Preserve the sign-out safety backup for profiles upgraded from older builds.
            outputSettings = { ...settings, location: "downloads" };
            outputMessage = "The selected folder was skipped because cloud-folder backups require encryption. A safety copy was sent to Downloads instead.";
        }
        const filename = encrypted
            ? `habit-builder-tracker-${kind}-encrypted-${getLocalTimestamp()}.hbtbackup`
            : `habit-builder-tracker-${suffix}-${getLocalTimestamp()}.json`;
        let blob;
        if (encrypted) {
            const envelope = await encryptBackupObject(backup, settings);
            blob = new Blob([JSON.stringify(envelope)], { type: "application/vnd.hbt.encrypted-backup+json" });
        } else {
            blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" });
        }
        const output = await saveBackupBlob(blob, filename, outputSettings, !!options.allowPermissionRequest);
        await recordBackupHistory({ filename, kind, destination: output.destination, bytes: blob.size, status: output.status, encrypted, blob, message: outputMessage || output.message || "" });
        const counts = EXPECTED_STORES.map(name => `${name}: ${backup.stores[name].length}`).join(" · ");
        return { backup, filename, counts, bytes: blob.size, destination: output.destination, status: output.status, encrypted };
    }

    async function runScheduledBackupIfDue() {
        let settings;
        try { settings = await getAutoBackupSettings(); }
        catch (error) { console.warn("Scheduled backup settings are unavailable:", error); return; }
        if (!settings.enabled) return;
        const now = Date.now();
        const interval = settings.frequency === "daily" ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
        const lastRun = settings.lastRunAt ? new Date(settings.lastRunAt).getTime() : 0;
        const lastAttempt = settings.lastAttemptAt ? new Date(settings.lastAttemptAt).getTime() : 0;
        if (lastRun && now - lastRun < interval) return;
        // Prevent repeat download attempts on every foreground event when a folder or browser blocks output.
        if (lastAttempt && now - lastAttempt < 12 * 60 * 60 * 1000) return;
        await saveAutoBackupSettings({ lastAttemptAt: new Date(now).toISOString() });
        try {
            const result = await createBackupArtifact("scheduled", { suffix: "auto" });
            await saveAutoBackupSettings({ lastRunAt: new Date().toISOString(), lastStatus: "success", lastError: "" });
            setAutoBackupStatus(`Scheduled backup created: ${result.filename} · ${result.destination}`, "success");
            await renderBackupHistory();
        } catch (error) {
            console.error("Scheduled backup failed:", error);
            await saveAutoBackupSettings({ lastStatus: "failed", lastError: error.message || "Unknown backup error" });
            await recordBackupHistory({ filename: "Scheduled backup", kind: "scheduled", destination: "Not saved", bytes: 0, status: "failed", message: error.message || "Unknown backup error" });
            setAutoBackupStatus(`Scheduled backup failed: ${error.message || "Unknown error"}`, "warning");
            await renderBackupHistory();
        }
    }

    async function chooseBackupFolder() {
        const currentSettings = await getAutoBackupSettings();
        if (!currentSettings.backupEncryptionEnabled || !currentSettings.backupCryptoKey) {
            await notify("Set a Backup Recovery Passphrase before selecting a cloud-synced folder. This ensures files are encrypted before they leave this device.", { title: "Encryption Required" });
            return;
        }
        if (typeof window.showDirectoryPicker !== "function") {
            await notify("Folder selection is not supported in this browser. Choose Browser Downloads as the backup location instead.", { title: "Folder Selection Unavailable" });
            return;
        }
        try {
            const handle = await window.showDirectoryPicker({ mode: "readwrite" });
            const permission = await handle.requestPermission({ mode: "readwrite" });
            if (permission !== "granted") throw new Error("Write permission was not granted for that folder.");
            await saveAutoBackupSettings({ location: "folder", directoryHandle: handle, directoryName: handle.name || "Selected folder" });
            await refreshAutoBackupSettingsUI();
            setAutoBackupStatus(`Backup folder selected: ${handle.name || "Selected folder"}.`, "success");
        } catch (error) {
            if (error?.name === "AbortError") { await refreshAutoBackupSettingsUI(); return; }
            await refreshAutoBackupSettingsUI();
            await notify(`The backup folder could not be saved: ${error.message}`, { title: "Folder Selection Failed", danger: true });
        }
    }

    async function initializeAutoBackupControls() {
        const enabled = document.getElementById("auto-backup-enabled");
        const frequency = document.getElementById("auto-backup-frequency");
        const location = document.getElementById("auto-backup-location");
        const chooseFolder = document.getElementById("auto-backup-choose-folder");
        const backupNow = document.getElementById("auto-backup-now");
        const clearHistory = document.getElementById("auto-backup-clear-history");

        const bind = (element, handler) => {
            if (!element || element.dataset.bound === "true") return;
            element.dataset.bound = "true";
            element.addEventListener("change", handler);
        };
        bind(enabled, async () => {
            const turnOn = !!enabled.checked;
            enabled.disabled = true;
            try {
                await saveAutoBackupSettings({ enabled: turnOn });
                if (!turnOn) {
                    await refreshAutoBackupSettingsUI();
                    return;
                }

                const attemptAt = new Date().toISOString();
                await saveAutoBackupSettings({ lastAttemptAt: attemptAt });
                setAutoBackupStatus("Creating your first automatic backup…", "info");
                try {
                    const result = await createBackupArtifact("scheduled", { suffix: "auto-first", allowPermissionRequest: true });
                    await saveAutoBackupSettings({ lastRunAt: new Date().toISOString(), lastStatus: "success", lastError: "" });
                    await refreshAutoBackupSettingsUI();
                    setAutoBackupStatus(`Automatic backup enabled. First backup created: ${result.filename} · ${result.destination}`, "success");
                } catch (backupError) {
                    await saveAutoBackupSettings({ lastStatus: "failed", lastError: backupError.message || "Unknown backup error" });
                    await recordBackupHistory({ filename: "First automatic backup", kind: "scheduled", destination: "Not saved", bytes: 0, status: "failed", message: backupError.message || "Unknown backup error" });
                    await refreshAutoBackupSettingsUI();
                    setAutoBackupStatus(`Automatic backups are enabled, but the first backup failed: ${backupError.message}`, "warning");
                    await notify(`Automatic backups are enabled, but the first backup could not be created: ${backupError.message}`, { title: "First Backup Failed", danger: true });
                }
            } catch (error) {
                enabled.checked = false;
                await notify(`Could not save this setting: ${error.message}`, { title: "Backup Settings Error", danger: true });
            } finally {
                enabled.disabled = false;
            }
        });
        bind(frequency, async () => {
            try { await saveAutoBackupSettings({ frequency: frequency.value === "daily" ? "daily" : "weekly" }); await refreshAutoBackupSettingsUI(); }
            catch (error) { await notify(`Could not save the backup frequency: ${error.message}`, { title: "Backup Settings Error", danger: true }); }
        });
        bind(location, async () => {
            try {
                const value = location.value;
                const settings = await getAutoBackupSettings();
                if (value === "folder" && (!settings.backupEncryptionEnabled || !settings.backupCryptoKey)) {
                    location.value = "downloads";
                    await notify("Configure a Backup Recovery Passphrase before using a cloud-synced folder.", { title: "Encryption Required" });
                } else if (value === "folder" && !settings.directoryHandle) {
                    await chooseBackupFolder();
                } else {
                    await saveAutoBackupSettings({ location: value });
                    await refreshAutoBackupSettingsUI();
                }
            } catch (error) { await notify(`Could not save the backup location: ${error.message}`, { title: "Backup Settings Error", danger: true }); }
        });
        if (chooseFolder && chooseFolder.dataset.bound !== "true") {
            chooseFolder.dataset.bound = "true";
            chooseFolder.addEventListener("click", chooseBackupFolder);
        }
        if (backupNow && backupNow.dataset.bound !== "true") {
            backupNow.dataset.bound = "true";
            backupNow.addEventListener("click", async () => {
                backupNow.disabled = true;
                try {
                    const result = await createBackupArtifact("manual", { suffix: "manual", allowPermissionRequest: true });
                    setAutoBackupStatus(`Backup created: ${result.filename} · ${result.destination}`, "success");
                    await refreshAutoBackupSettingsUI();
                } catch (error) {
                    console.error("Manual backup failed:", error);
                    setAutoBackupStatus(`Backup failed: ${error.message}`, "warning");
                    await notify(`Could not create a backup: ${error.message}`, { title: "Backup Failed", danger: true });
                } finally { backupNow.disabled = false; }
            });
        }
        const encryptionEnable = document.getElementById("backup-encryption-enable");
        const encryptionChange = document.getElementById("backup-encryption-change");
        const encryptionCancel = document.getElementById("backup-encryption-cancel");
        const passphraseInput = document.getElementById("backup-encryption-passphrase");
        const passphraseConfirm = document.getElementById("backup-encryption-confirm");
        const configureEncryption = async () => {
            const passphrase = passphraseInput?.value || "";
            const confirmation = passphraseConfirm?.value || "";
            if (passphrase.length < 12) {
                await notify("Use at least 12 characters for your backup recovery passphrase.", { title: "Passphrase Too Short" });
                passphraseInput?.focus();
                return;
            }
            if (passphrase !== confirmation) {
                await notify("The recovery passphrases do not match.", { title: "Passphrase Mismatch" });
                passphraseConfirm?.focus();
                return;
            }
            const current = await getAutoBackupSettings();
            if (current.backupEncryptionEnabled) {
                const accepted = await confirmAction("Change the backup recovery passphrase? Existing backup files remain encrypted with the previous passphrase. Keep it to recover older backups.", { title: "Change Backup Passphrase", confirmText: "Change Passphrase", cancelText: "Keep Current Passphrase" });
                if (!accepted) return;
            } else {
                const accepted = await confirmAction("Enable AES-256-GCM encryption for new backups? Keep this recovery passphrase in a password manager. Without it, encrypted backups cannot be recovered on another device.", { title: "Enable Encrypted Backups", confirmText: "Enable Encryption", cancelText: "Cancel" });
                if (!accepted) return;
            }
            if (encryptionEnable) encryptionEnable.disabled = true;
            if (encryptionChange) encryptionChange.disabled = true;
            try {
                await setBackupEncryptionPassphrase(passphrase);
                if (passphraseInput) passphraseInput.value = "";
                if (passphraseConfirm) passphraseConfirm.value = "";
                if (encryptionCancel) encryptionCancel.hidden = true;
                if (encryptionEnable) encryptionEnable.textContent = "Enable AES-256 encryption";
                const result = await createBackupArtifact("manual", { suffix: "encrypted-setup", allowPermissionRequest: true });
                await refreshAutoBackupSettingsUI();
                setAutoBackupStatus(`Encrypted backup created: ${result.filename} · ${result.destination}`, "success");
                await notify("Encrypted backups are enabled. This device can restore recent history entries directly. Use the recovery passphrase when importing on another device.", { title: "Backup Encryption Enabled" });
            } catch (error) {
                console.error("Backup encryption setup failed:", error);
                await notify(`Backup encryption could not be enabled: ${error.message}`, { title: "Encryption Setup Failed", danger: true });
                await refreshAutoBackupSettingsUI();
            } finally {
                if (encryptionEnable) encryptionEnable.disabled = false;
                if (encryptionChange) encryptionChange.disabled = false;
            }
        };
        if (encryptionEnable && encryptionEnable.dataset.bound !== "true") {
            encryptionEnable.dataset.bound = "true";
            encryptionEnable.addEventListener("click", configureEncryption);
        }
        if (encryptionChange && encryptionChange.dataset.bound !== "true") {
            encryptionChange.dataset.bound = "true";
            encryptionChange.addEventListener("click", () => {
                const setup = document.getElementById("backup-encryption-setup");
                if (setup) setup.hidden = false;
                encryptionChange.hidden = true;
                if (encryptionEnable) encryptionEnable.textContent = "Change recovery passphrase";
                if (encryptionCancel) encryptionCancel.hidden = false;
                if (passphraseInput) passphraseInput.focus();
            });
        }
        if (encryptionCancel && encryptionCancel.dataset.bound !== "true") {
            encryptionCancel.dataset.bound = "true";
            encryptionCancel.addEventListener("click", async () => {
                if (passphraseInput) passphraseInput.value = "";
                if (passphraseConfirm) passphraseConfirm.value = "";
                encryptionCancel.hidden = true;
                if (encryptionEnable) encryptionEnable.textContent = "Enable AES-256 encryption";
                await refreshAutoBackupSettingsUI();
            });
        }
        if (clearHistory && clearHistory.dataset.bound !== "true") {
            clearHistory.dataset.bound = "true";
            clearHistory.addEventListener("click", async () => {
                const confirmed = await confirmAction("Clear the backup activity history for this workspace? Existing backup files will not be deleted.", { title: "Clear Backup History", confirmText: "Clear History", danger: true });
                if (!confirmed) return;
                try {
                    const db = await openBackupManagerDb();
                    const workspaceId = getWorkspaceIdForBackup();
                    const rows = await getBackupHistory();
                    await new Promise((resolve, reject) => {
                        const tx = db.transaction("history", "readwrite");
                        const store = tx.objectStore("history");
                        rows.forEach(row => store.delete(row.id));
                        tx.oncomplete = () => resolve(true);
                        tx.onerror = () => reject(tx.error || new Error("Could not clear backup history."));
                    });
                    await renderBackupHistory();
                } catch (error) { await notify(`Could not clear backup history: ${error.message}`, { title: "History Error", danger: true }); }
            });
        }
        await refreshAutoBackupSettingsUI();
    }

    function initializeAutoBackupVisibilityCheck() {
        if (autoBackupVisibilityBound) return;
        autoBackupVisibilityBound = true;
        document.addEventListener("visibilitychange", () => {
            if (!document.hidden) runScheduledBackupIfDue().catch(error => console.warn("Scheduled backup check failed:", error));
        });
        window.addEventListener("online", () => {
            runScheduledBackupIfDue().catch(error => console.warn("Scheduled backup check after reconnect failed:", error));
        });
    }

    function readAllStores() {
        if (typeof database === "undefined" || !database) {
            return Promise.reject(new Error("The local database is not ready."));
        }

        const missingStores = EXPECTED_STORES.filter(name => !database.objectStoreNames.contains(name));
        if (missingStores.length) {
            return Promise.reject(new Error(`Database stores are missing: ${missingStores.join(", ")}`));
        }

        return new Promise((resolve, reject) => {
            const snapshot = {};
            let transaction;

            try {
                transaction = database.transaction(EXPECTED_STORES, "readonly");
                EXPECTED_STORES.forEach(name => {
                    const request = transaction.objectStore(name).getAll();
                    request.onsuccess = () => { snapshot[name] = request.result || []; };
                    request.onerror = () => reject(request.error || new Error(`Could not read ${name}.`));
                });
            } catch (error) {
                reject(error);
                return;
            }

            transaction.oncomplete = () => resolve(snapshot);
            transaction.onerror = () => reject(transaction.error || new Error("Could not read the local database."));
            transaction.onabort = () => reject(transaction.error || new Error("The backup read was cancelled."));
        });
    }

    async function buildBackup() {
        const stores = await readAllStores();
        const workspaceId = getWorkspaceIdForBackup();
        const account = typeof getProfileAccount === "function" ? await getProfileAccount(workspaceId) : null;
        return {
            format: BACKUP_FORMAT,
            formatVersion: BACKUP_FORMAT_VERSION,
            application: "Habit Builder Tracker",
            databaseVersion: typeof DB_VERSION === "number" ? DB_VERSION : null,
            exportedAt: new Date().toISOString(),
            workspaceId,
            workspaceName: account?.workspaceName || account?.name || workspaceId,
            // The key itself is never exported. This is only the password-wrapped
            // metadata needed to reopen encrypted records when the same workspace
            // ID is recreated on another device.
            workspaceEncryption: account?.encryption?.enabled ? account.encryption : null,
            // Focus Mode state is stored in workspace-scoped browser storage,
            // not IndexedDB. Include it so backups also preserve timer history.
            clientState: {
                focusMode: typeof window.exportFocusWorkspaceData === "function"
                    ? window.exportFocusWorkspaceData()
                    : null
            },
            stores
        };
    }

    async function downloadBackup(suffix = "backup") {
        const kind = String(suffix).includes("safety-before-restore") ? "restore" : "manual";
        return createBackupArtifact(kind, { suffix, allowPermissionRequest: true });
    }

    // Always called by Sign Out, even when scheduled backups are disabled.
    // The backup is completed before the workspace database is locked.
    async function createAutomaticWorkspaceBackup(workspaceName = "workspace") {
        const safeName = String(workspaceName || "workspace")
            .normalize("NFKD")
            .replace(/[^a-zA-Z0-9-]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 40) || "workspace";
        const result = await createBackupArtifact("signout", { suffix: `auto-signout-${safeName}`, allowPermissionRequest: true });
        return { filename: result.filename, counts: result.counts, recordCount: EXPECTED_STORES.reduce((sum, name) => sum + result.backup.stores[name].length, 0), destination: result.destination, status: result.status, encrypted: result.encrypted };
    }

    function validateBackup(backup) {
        if (!backup || typeof backup !== "object" || Array.isArray(backup)) {
            throw new Error("The selected file is not a valid backup object.");
        }
        if (backup.format !== BACKUP_FORMAT || backup.formatVersion !== BACKUP_FORMAT_VERSION) {
            throw new Error("This file is not a supported Habit Builder Tracker backup.");
        }
        if (!backup.stores || typeof backup.stores !== "object" || Array.isArray(backup.stores)) {
            throw new Error("The backup does not contain a valid data section.");
        }

        EXPECTED_STORES.forEach(name => {
            const records = backup.stores[name];
            if (!Array.isArray(records)) {
                throw new Error(`The backup is missing the ${name} data list.`);
            }
            records.forEach((record, index) => {
                if (!record || typeof record !== "object" || Array.isArray(record)) {
                    throw new Error(`The ${name} record at position ${index + 1} is invalid.`);
                }
                if (!Object.prototype.hasOwnProperty.call(record, "id")) {
                    throw new Error(`The ${name} record at position ${index + 1} has no ID.`);
                }
            });
        });

        return backup;
    }

    function replaceAllStores(backup) {
        if (typeof database === "undefined" || !database) {
            return Promise.reject(new Error("The local database is not ready."));
        }

        return new Promise((resolve, reject) => {
            let transaction;
            try {
                transaction = database.transaction(EXPECTED_STORES, "readwrite");
                EXPECTED_STORES.forEach(name => {
                    const store = transaction.objectStore(name);
                    store.clear();
                    backup.stores[name].forEach(record => store.put(record));
                });
            } catch (error) {
                if (transaction) {
                    try { transaction.abort(); } catch (_) { /* transaction already closed */ }
                }
                reject(error);
                return;
            }

            transaction.oncomplete = () => resolve(true);
            transaction.onerror = () => reject(transaction.error || new Error("The restore transaction failed."));
            transaction.onabort = () => reject(transaction.error || new Error("Restore was cancelled; existing data was not replaced."));
        });
    }

    // Inspect a backup without changing the current workspace. Encrypted envelopes
    // can be listed without asking for their recovery passphrase; the passphrase is
    // requested only when the user chooses Import.
    async function inspectWorkspaceBackupFile(file) {
        if (!file) throw new Error("Choose a backup file first.");
        if (file.size > MAX_BACKUP_BYTES) throw new Error("This backup is larger than the 80 MB import limit.");
        let parsed;
        try { parsed = JSON.parse(await file.text()); }
        catch (_) { throw new Error("This file is not valid JSON."); }

        if (parsed?.format === ENCRYPTED_BACKUP_FORMAT) {
            if (parsed.version !== ENCRYPTED_BACKUP_VERSION || parsed.cipher !== "AES-256-GCM" || parsed.kdf !== "PBKDF2-SHA-256" || !parsed.salt || !parsed.iv || !parsed.ciphertext) {
                throw new Error("The encrypted backup envelope is incomplete or unsupported.");
            }
            return {
                encryptedBackup: true,
                encryptedWorkspace: null,
                workspaceId: null,
                workspaceName: String(file.name || "Encrypted workspace backup").replace(/\.(hbtbackup|json)$/i, ""),
                exportedAt: parsed.encryptedAt || null,
                recordCount: null,
                counts: null,
                fileName: file.name || "workspace.hbtbackup",
                bytes: file.size
            };
        }

        const backup = validateBackup(parsed);
        const recordCount = EXPECTED_STORES.reduce((sum, name) => sum + backup.stores[name].length, 0);
        return {
            encryptedBackup: false,
            encryptedWorkspace: Boolean(backup.workspaceEncryption?.enabled),
            workspaceId: backup.workspaceId ? String(backup.workspaceId) : null,
            workspaceName: String(backup.workspaceName || backup.workspaceId || "Imported Workspace"),
            exportedAt: backup.exportedAt || null,
            recordCount,
            counts: EXPECTED_STORES.map(name => `${name}: ${backup.stores[name].length}`).join(" · "),
            fileName: file.name || "workspace.json",
            bytes: file.size
        };
    }

    // Import a portable backup as a separate workspace. Existing workspaces are
    // never replaced. Encrypted workspace records are bound to their original ID,
    // so protected backups must retain that ID and are rejected on collision.
    async function importWorkspaceBackupAsProfile(file, requestedId) {
        if (!file) throw new Error("Choose a backup file first.");
        if (file.size > MAX_BACKUP_BYTES) throw new Error("This backup is larger than the 80 MB import limit.");

        let parsed;
        try { parsed = JSON.parse(await file.text()); }
        catch (_) { throw new Error("This file is not valid JSON."); }
        const backup = await decodeBackupPayload(parsed);
        const sourceId = backup.workspaceId ? String(backup.workspaceId) : null;
        const hasEncryptedRecords = EXPECTED_STORES.some(storeName =>
            backup.stores[storeName].some(record => record?.__hbtEncrypted === true)
        );
        const protectedWorkspace = Boolean(backup.workspaceEncryption?.enabled);
        if (hasEncryptedRecords && !protectedWorkspace) {
            throw new Error("This backup contains encrypted workspace records but is missing the workspace security metadata needed to recover them.");
        }
        if (protectedWorkspace && !sourceId) {
            throw new Error("This protected backup has no original workspace ID and cannot be safely imported as a separate workspace.");
        }

        const requiresOriginalId = protectedWorkspace || hasEncryptedRecords;
        const proposedId = String(requestedId || "").trim();
        const targetId = requiresOriginalId ? sourceId : (proposedId || `imported-${Date.now()}`);
        if (!/^[a-zA-Z0-9_-]{1,80}$/.test(targetId)) {
            throw new Error("The workspace ID in this backup is invalid.");
        }
        if (requiresOriginalId && targetId === "current-user") {
            throw new Error("This backup is protected and belongs to the Default Profile ID. Open the Default Profile on this browser and use Backup & Install → Restore from Backup so its encryption identity remains unchanged.");
        }

        const existing = typeof getProfileAccount === "function" ? await getProfileAccount(targetId) : null;
        if (existing) {
            if (requiresOriginalId) {
                throw new Error(`A workspace with the original protected ID "${targetId}" already exists in this browser. Import cannot create a second copy without breaking its encryption. Select that workspace, or use Backup & Install → Restore from Backup if you intend to replace its data.`);
            }
            throw new Error(`A workspace with ID "${targetId}" already exists. Refresh the workspace list and try again.`);
        }
        if (typeof saveProfileAccount !== "function" || typeof switchProfileDatabase !== "function" || typeof replaceAllStores !== "function") {
            throw new Error("Workspace import is unavailable in this build. Update the database and backup modules together.");
        }

        const workspaceName = String(backup.workspaceName || backup.workspaceId || "Imported Workspace").trim() || "Imported Workspace";
        const profileRecord = backup.stores.profile.find(record => record && record.id === "current-user") || backup.stores.profile[0] || {};
        const account = {
            id: targetId,
            name: workspaceName,
            workspaceName,
            createdAt: backup.exportedAt || new Date().toISOString(),
            importedFromWorkspaceId: sourceId || null,
            appearance: profileRecord.appearance || {
                theme: profileRecord.theme || "light",
                accentColor: profileRecord.accentColor || "#2563eb",
                visualStyle: profileRecord.visualStyle || "flat"
            }
        };
        if (protectedWorkspace) account.encryption = backup.workspaceEncryption;

        let accountCreated = false;
        let databaseOpened = false;
        try {
            await saveProfileAccount(account);
            accountCreated = true;
            await switchProfileDatabase(targetId);
            databaseOpened = true;
            await replaceAllStores(backup);
            if (typeof window.restoreFocusWorkspaceData === "function") {
                await window.restoreFocusWorkspaceData(backup.clientState?.focusMode || null);
            }
            if (typeof window.lockProfile === "function") window.lockProfile(targetId);
            return {
                id: targetId,
                sourceWorkspaceId: sourceId,
                workspaceName,
                protectedWorkspace,
                encryptedBackup: parsed?.format === ENCRYPTED_BACKUP_FORMAT,
                exportedAt: backup.exportedAt || null,
                recordCount: EXPECTED_STORES.reduce((sum, name) => sum + backup.stores[name].length, 0),
                counts: EXPECTED_STORES.map(name => `${name}: ${backup.stores[name].length}`).join(" · ")
            };
        } catch (error) {
            // Remove only the newly-created target workspace. Import is offered
            // only from the signed-out manager, so no existing session is closed.
            try { if (databaseOpened && typeof window.lockProfile === "function") window.lockProfile(targetId); } catch (_) {}
            try { localStorage.removeItem("cc-active-profile-id"); } catch (_) {}
            if (accountCreated) {
                try { await deleteProfileDatabase(targetId); } catch (_) {}
                try { await deleteProfileAccount(targetId); } catch (_) {}
            }
            throw error;
        }
    }

    async function restoreBackupHistoryEntry(row) {
        try {
            let file = null;
            if (row.blob instanceof Blob) {
                file = new File([row.blob], row.filename || "workspace-backup.hbtbackup", { type: row.encrypted ? "application/vnd.hbt.encrypted-backup+json" : "application/json" });
            } else {
                const settings = await getAutoBackupSettings();
                if (settings.location === "folder" && settings.directoryHandle) {
                    const handle = settings.directoryHandle;
                    let permission = await handle.queryPermission({ mode: "read" });
                    if (permission !== "granted" && typeof handle.requestPermission === "function") permission = await handle.requestPermission({ mode: "read" });
                    if (permission === "granted") {
                        const backupHandle = await handle.getFileHandle(row.filename);
                        file = await backupHandle.getFile();
                    }
                }
            }
            if (!file) {
                await notify("This older history entry has no recovery copy stored in this browser. Select the downloaded backup file from Backup & Install to restore it.", { title: "Backup File Not Available" });
                return;
            }
            await handleRestoreFile(file);
        } catch (error) {
            await notify(`Could not open this backup history entry: ${error.message}`, { title: "Restore From History Failed", danger: true });
        }
    }

    async function prepareWorkspaceEncryptionForRestore(backup) {
        const targetId = getWorkspaceIdForBackup();
        const sourceId = backup.workspaceId ? String(backup.workspaceId) : null;
        const account = typeof getProfileAccount === "function" ? await getProfileAccount(targetId) : null;
        const currentProtected = Boolean(account?.encryption?.enabled);
        const backupHasEncryptionField = Object.prototype.hasOwnProperty.call(backup, "workspaceEncryption");
        const backupProtected = Boolean(backup.workspaceEncryption?.enabled);
        const hasEncryptedRecords = EXPECTED_STORES.some(storeName =>
            backup.stores[storeName].some(record => record?.__hbtEncrypted === true)
        );

        if (backupProtected && sourceId && sourceId !== targetId) {
            throw new Error(`This backup belongs to workspace ID "${sourceId}". Create/open that same workspace ID before restoring; protected record encryption is bound to its original workspace ID.`);
        }
        if (backupHasEncryptionField && !backupProtected && currentProtected) {
            throw new Error("This backup is from a workspace without password encryption, but the current workspace is password-protected. Remove password protection first or restore into an unprotected workspace.");
        }
        if (!backupHasEncryptionField && currentProtected && !hasEncryptedRecords) {
            throw new Error("This older backup contains plain records, but the current workspace is password-protected. Remove password protection before restoring it, or use an unprotected workspace.");
        }
        if (hasEncryptedRecords && !backupProtected && (!currentProtected || (sourceId && sourceId !== targetId))) {
            throw new Error("This backup contains encrypted records but does not include the encryption metadata required for cross-device recovery. Restore it into the original password-protected workspace on the device where it was created, or create a fresh backup using this version.");
        }

        if (backupProtected && !currentProtected) {
            if (typeof saveProfileAccount !== "function") {
                throw new Error("Workspace security metadata could not be restored in this build.");
            }
            await saveProfileAccount({
                ...(account || {}),
                id: targetId,
                name: account?.name || backup.workspaceName || "Restored Workspace",
                workspaceName: account?.workspaceName || backup.workspaceName || "Restored Workspace",
                encryption: backup.workspaceEncryption
            });
            return { previousAccount: account, changed: true, targetId };
        }
        return { previousAccount: account, changed: false, targetId };
    }

    async function handleRestoreFile(file) {
        if (!file) return;
        if (file.size > MAX_BACKUP_BYTES) {
            await notify("This backup is larger than the 50 MB safety limit.");
            return;
        }

        let backup;
        try {
            const parsed = JSON.parse(await file.text());
            backup = await decodeBackupPayload(parsed);
        } catch (error) {
            await notify(`Backup validation failed: ${error.message}`, { title: "Cannot Restore Backup", danger: true });
            return;
        }

        const recordCount = EXPECTED_STORES.reduce((sum, name) => sum + backup.stores[name].length, 0);
        const confirmed = await confirmAction(
            `This will replace the current profile and all tasks, habits, milestones and projects with ${recordCount} records from this backup. A safety backup of your current data will be downloaded first. Continue?`,
            { title: "Restore Workspace Backup", confirmText: "Restore Data", cancelText: "Cancel", danger: true }
        );
        if (!confirmed) return;

        let encryptionRestore = null;
        try {
            // Trigger a complete safety backup before any records are changed.
            await downloadBackup("safety-before-restore");
            encryptionRestore = await prepareWorkspaceEncryptionForRestore(backup);
            try {
                await replaceAllStores(backup);
                if (typeof window.restoreFocusWorkspaceData === "function") {
                    await window.restoreFocusWorkspaceData(backup.clientState?.focusMode || null);
                }
            } catch (restoreError) {
                if (encryptionRestore?.changed && typeof saveProfileAccount === "function") {
                    if (encryptionRestore.previousAccount) await saveProfileAccount(encryptionRestore.previousAccount);
                    else if (typeof deleteProfileAccount === "function") await deleteProfileAccount(encryptionRestore.targetId);
                }
                throw restoreError;
            }
            await notify("Your backup has been restored successfully. The application will now reload to refresh all sections. If this backup was password-protected, enter the original workspace password after reload.", {
                title: "Restore Complete"
            });
            window.location.reload();
        } catch (error) {
            console.error("Backup restore failed:", error);
            await notify(`Restore failed: ${error.message}\nYour current data was not intentionally cleared. Check the safety backup download before trying again.`, {
                title: "Restore Failed",
                danger: true
            });
        }
    }

    function setPwaStatus(message, state = "info") {
        const status = document.getElementById("pwa-status");
        if (!status) return;
        status.textContent = message;
        status.dataset.state = state;
    }

    function isInstalledMode() {
        return window.matchMedia?.("(display-mode: standalone)").matches ||
            window.navigator.standalone === true;
    }

    async function registerServiceWorker() {
        const supported = "serviceWorker" in navigator;
        const secureOrigin = window.isSecureContext ||
            location.hostname === "localhost" ||
            location.hostname === "127.0.0.1";

        if (!supported) {
            setPwaStatus("Offline app support is not available in this browser.", "warning");
            return;
        }
        if (!secureOrigin) {
            setPwaStatus("Open this app on localhost or HTTPS to enable installation and offline support.", "warning");
            return;
        }

        try {
            await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });
            setPwaStatus(navigator.onLine ? "App shell is ready for offline use." : "Offline mode — cached app shell is available.", "success");
        } catch (error) {
            console.error("Service worker registration failed:", error);
            setPwaStatus("Offline setup could not start. Check the local server and reload.", "warning");
        }
    }

    async function handleInstallClick() {
        if (isInstalledMode()) {
            await notify("Habit Builder Tracker is already installed on this device.", { title: "Already Installed" });
            return;
        }

        if (deferredInstallPrompt) {
            deferredInstallPrompt.prompt();
            const choice = await deferredInstallPrompt.userChoice;
            deferredInstallPrompt = null;
            if (choice?.outcome === "accepted") {
                setPwaStatus("Installation started. You can open the app from your home screen or apps list.", "success");
            } else {
                setPwaStatus("Installation was not completed. You can try again from this page.", "info");
            }
            return;
        }

        await notify(
            "To install on a supported desktop or Android browser, use the browser menu and choose Install App or Add to Home Screen. On iPhone or iPad, open the Share menu in Safari and choose Add to Home Screen. Use localhost or HTTPS; a plain local-network HTTP address may not allow installation.",
            { title: "Install Habit Builder Tracker" }
        );
    }

    function initializeBackupControls() {
        const downloadButton = document.getElementById("backup-download-btn");
        const restoreButton = document.getElementById("backup-restore-btn");
        const fileInput = document.getElementById("backup-file-input");
        const installButton = document.getElementById("pwa-install-btn");

        if (downloadButton && downloadButton.dataset.bound !== "true") {
            downloadButton.dataset.bound = "true";
            downloadButton.addEventListener("click", async () => {
                downloadButton.disabled = true;
                try {
                    const result = await downloadBackup("backup");
                    await notify(`Backup created: ${result.filename}\nLocation: ${result.destination}\n${result.counts}`, { title: "Backup Complete" });
                    await renderBackupHistory();
                } catch (error) {
                    console.error("Backup export failed:", error);
                    await notify(`Could not create the backup: ${error.message}`, { title: "Backup Failed", danger: true });
                } finally {
                    downloadButton.disabled = false;
                }
            });
        }

        if (restoreButton && fileInput && restoreButton.dataset.bound !== "true") {
            restoreButton.dataset.bound = "true";
            restoreButton.addEventListener("click", () => fileInput.click());
            fileInput.addEventListener("change", async () => {
                const file = fileInput.files?.[0];
                try {
                    await handleRestoreFile(file);
                } finally {
                    fileInput.value = "";
                }
            });
        }

        if (installButton && installButton.dataset.bound !== "true") {
            installButton.dataset.bound = "true";
            installButton.addEventListener("click", handleInstallClick);
        }
    }

    function initializePwaEvents() {
        window.addEventListener("beforeinstallprompt", event => {
            event.preventDefault();
            deferredInstallPrompt = event;
            setPwaStatus("This browser can install the app.", "success");
        });

        window.addEventListener("appinstalled", () => {
            deferredInstallPrompt = null;
            setPwaStatus("Installed on this device.", "success");
        });

        window.addEventListener("online", () => {
            setPwaStatus("Back online. Your local data remains available.", "success");
        });

        window.addEventListener("offline", () => {
            setPwaStatus("Offline. The cached app shell and local IndexedDB data remain available.", "warning");
        });

        if (isInstalledMode()) {
            setPwaStatus("Installed on this device.", "success");
        }
    }

    async function initializeDataTools() {
        initializeBackupControls();
        initializePwaEvents();
        await initializeAutoBackupControls();
        initializeAutoBackupVisibilityCheck();
        await registerServiceWorker();
        // The scheduled job only runs while the app is open/foregrounded.
        await runScheduledBackupIfDue();
    }

    window.initializeDataTools = initializeDataTools;
    window.createAutomaticWorkspaceBackup = createAutomaticWorkspaceBackup;
    window.inspectWorkspaceBackupFile = inspectWorkspaceBackupFile;
    window.importWorkspaceBackupAsProfile = importWorkspaceBackupAsProfile;
    window.runScheduledWorkspaceBackupIfDue = runScheduledBackupIfDue;
})();
