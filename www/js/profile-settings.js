/* Habit Builder Tracker — Profile Profile & Appearance Settings v1.1.0 Appearance Settings v1.1.1 */
(() => {
    "use strict";
    const DEFAULTS = { subtitle: "Your Personal Command Center", goal: "", theme: "light", visualStyle: "flat-2", accentColor: "#2563eb", animationsEnabled: true, reduceMotion: false, avatarDataUrl: "" };
    let currentProfile = null;
    const byId = id => document.getElementById(id);

    function initials(name) {
        const parts = String(name || "Y").trim().split(/\s+/).filter(Boolean);
        return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] || "Y").slice(0, 1)).toUpperCase().slice(0, 2);
    }
    function setAvatar(el, profile) {
        if (!el) return;
        el.replaceChildren();
        if (profile.avatarDataUrl) {
            const img = document.createElement("img"); img.src = profile.avatarDataUrl; img.alt = ""; el.appendChild(img); el.classList.add("has-photo");
        } else { el.textContent = initials(profile.name); el.classList.remove("has-photo"); }
    }
    function applyTheme(theme) {
        document.documentElement.dataset.theme = ["light", "dark", "system", "windows-classic"].includes(theme) ? theme : "light";
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.content = theme === "dark" ? "#171827" : "#f4f5f9";
    }
    const VISUAL_STYLES = ["soft-ui", "claymorphism", "skeuomorphism", "aurora", "flat-2", "minimal", "liquid-glass"];
    function applyVisualStyle(value) {
        const style = VISUAL_STYLES.includes(String(value || "")) ? String(value) : "flat-2";
        document.documentElement.dataset.visualStyle = style;
        const grid = byId("visual-style-grid");
        if (grid) grid.querySelectorAll("[data-visual-style]").forEach(button => {
            const selected = button.dataset.visualStyle === style;
            button.classList.toggle("selected", selected);
            button.setAttribute("aria-pressed", selected ? "true" : "false");
        });
        const status = byId("visual-style-status");
        if (status) {
            const names = {"soft-ui":"Neumorphism", claymorphism:"Claymorphism", skeuomorphism:"Skeuomorphism", aurora:"Aurora UI", "flat-2":"Flat Design 2.0", minimal:"Minimalism", "liquid-glass":"Liquid Glass"};
            status.textContent = (names[style] || "Flat Design 2.0") + " selected.";
        }
        return style;
    }

    const ACCENT_PRESETS = ["#2563eb", "#7c3aed", "#059669", "#0d9488", "#e11d48", "#ea580c", "#d97706", "#475569"];
    function normalizeHex(value) {
        return /^#[0-9a-fA-F]{6}$/.test(String(value || "")) ? value.toLowerCase() : "#2563eb";
    }
    function mixWithWhite(hex, amount) {
        const n = parseInt(hex.slice(1), 16);
        const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
        const blend = c => Math.round(c + (255 - c) * amount).toString(16).padStart(2, "0");
        return "#" + blend(r) + blend(g) + blend(b);
    }
    function applyAccent(value) {
        const color = normalizeHex(value);
        const root = document.documentElement;
        root.style.setProperty("--primary", color);
        root.style.setProperty("--primary-dark", mixWithWhite(color, -0.12));
        // A pale tint for selected navigation and soft accent surfaces.
        const n = parseInt(color.slice(1), 16);
        const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
        const pale = c => Math.round(c + (255 - c) * 0.88).toString(16).padStart(2, "0");
        root.style.setProperty("--primary-light", "#" + pale(r) + pale(g) + pale(b));
        const picker = byId("custom-accent-color");
        if (picker) picker.value = color;
        document.querySelectorAll(".accent-swatch").forEach(button => {
            const selected = normalizeHex(button.dataset.accent) === color;
            button.classList.toggle("selected", selected);
            button.setAttribute("aria-pressed", selected ? "true" : "false");
        });
        const status = byId("accent-color-status");
        if (status) {
            const preset = document.querySelector('.accent-swatch[data-accent="' + color + '"]');
            status.textContent = preset ? preset.getAttribute("aria-label") + " accent selected." : "Custom accent color selected.";
        }
        return color;
    }
    function applyMotion(profile) {
        document.documentElement.classList.toggle("motion-disabled", profile.animationsEnabled === false || profile.reduceMotion === true);
        document.documentElement.classList.toggle("reduce-motion", profile.reduceMotion === true);
    }
    function syncUI(profile) {
        const p = { ...DEFAULTS, ...(profile || {}) };
        if (byId("header-user-name")) byId("header-user-name").textContent = p.name || "Your Name";
        if (byId("header-subtitle")) byId("header-subtitle").textContent = p.subtitle || DEFAULTS.subtitle;
        setAvatar(byId("header-profile-avatar"), p); setAvatar(byId("profile-avatar-preview"), p);
        if (byId("profile-display-name")) byId("profile-display-name").value = p.name || "";
        if (byId("profile-subtitle")) byId("profile-subtitle").value = p.subtitle;
        if (byId("profile-goal")) byId("profile-goal").value = p.goal || "";
        if (byId("theme-choice")) byId("theme-choice").value = p.theme;
        if (byId("animations-enabled")) byId("animations-enabled").checked = p.animationsEnabled !== false;
        if (byId("reduce-motion")) byId("reduce-motion").checked = p.reduceMotion === true;
        applyTheme(p.theme); applyVisualStyle(p.visualStyle); applyAccent(p.accentColor); applyMotion(p);
    }
    async function persist(patch) {
        const base = currentProfile || await getProfile() || { id: "current-user", createdAt: new Date().toISOString() };
        currentProfile = { ...base, ...patch, id: "current-user" };
        await saveProfile(currentProfile); syncUI(currentProfile);
    }
    function openSettings() {
        const link = document.querySelector('.sidebar a[href="#profile-settings"]');
        if (link) link.click();
    }

    async function initializeProfileSettings() {
        currentProfile = { ...DEFAULTS, ...(await getProfile() || {}) };
        syncUI(currentProfile);

        const form = byId("profile-settings-form");
        if (form && form.dataset.bound !== "true") {
            form.dataset.bound = "true";
            form.addEventListener("submit", async e => {
                e.preventDefault();
                const name = byId("profile-display-name").value.trim();
                if (!name) { await showAppDialog("Please enter your name.", { title: "Name required" }); byId("profile-display-name").focus(); return; }
                try {
                    await persist({ name, subtitle: byId("profile-subtitle").value.trim() || DEFAULTS.subtitle, goal: byId("profile-goal").value.trim() });
                    await showAppDialog("Your profile has been saved on this device.", { title: "Profile updated" });
                } catch (err) { console.error(err); await showAppDialog("Your profile could not be saved. Please try again.", { title: "Save failed" }); }
            });
        }
        const bindChange = (id, handler) => {
            const el = byId(id); if (!el || el.dataset.bound === "true") return;
            el.dataset.bound = "true"; el.addEventListener("change", handler);
        };
        bindChange("theme-choice", async e => { applyTheme(e.target.value); try { await persist({ theme: e.target.value }); } catch (err) { console.error(err); } });
        const visualGrid = byId("visual-style-grid");
        if (visualGrid && visualGrid.dataset.bound !== "true") {
            visualGrid.dataset.bound = "true";
            visualGrid.addEventListener("click", async e => {
                const button = e.target.closest("[data-visual-style]");
                if (!button || !visualGrid.contains(button)) return;
                const visualStyle = applyVisualStyle(button.dataset.visualStyle);
                try { await persist({ visualStyle }); }
                catch (err) { console.error(err); await showAppDialog("The visual style could not be saved.", { title: "Appearance setting failed" }); }
            });
        }
        const palette = byId("accent-palette");
        if (palette && palette.dataset.bound !== "true") {
            palette.dataset.bound = "true";
            palette.addEventListener("click", async e => {
                const button = e.target.closest("[data-accent]");
                if (!button) return;
                const accentColor = applyAccent(button.dataset.accent);
                try { await persist({ accentColor }); }
                catch (err) { console.error(err); await showAppDialog("The accent color could not be saved.", { title: "Color setting failed" }); }
            });
        }
        bindChange("custom-accent-color", async e => {
            const accentColor = applyAccent(e.target.value);
            try { await persist({ accentColor }); }
            catch (err) { console.error(err); await showAppDialog("The custom color could not be saved.", { title: "Color setting failed" }); }
        });
        bindChange("animations-enabled", async e => { try { await persist({ animationsEnabled: e.target.checked }); } catch (err) { console.error(err); } });
        bindChange("reduce-motion", async e => { try { await persist({ reduceMotion: e.target.checked }); } catch (err) { console.error(err); } });

        const photo = byId("profile-photo");
        if (photo && photo.dataset.bound !== "true") {
            photo.dataset.bound = "true";
            photo.addEventListener("change", async () => {
                const file = photo.files && photo.files[0]; if (!file) return;
                if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { await showAppDialog("Choose a JPG, PNG or WebP image.", { title: "Unsupported image" }); photo.value = ""; return; }
                if (file.size > 2 * 1024 * 1024) { await showAppDialog("Choose an image smaller than 2 MB.", { title: "Image too large" }); photo.value = ""; return; }
                const reader = new FileReader();
                reader.onload = async () => { try { await persist({ avatarDataUrl: String(reader.result || "") }); } catch (err) { console.error(err); await showAppDialog("The photo could not be saved. Try a smaller image.", { title: "Photo save failed" }); } };
                reader.onerror = () => showAppDialog("The selected image could not be read.", { title: "Photo error" });
                reader.readAsDataURL(file);
            });
        }
        const remove = byId("remove-profile-photo");
        if (remove && remove.dataset.bound !== "true") {
            remove.dataset.bound = "true";
            remove.addEventListener("click", async () => { try { await persist({ avatarDataUrl: "" }); } catch (err) { console.error(err); } if (photo) photo.value = ""; });
        }
        const quick = byId("open-profile-settings");
        if (quick && quick.dataset.bound !== "true") { quick.dataset.bound = "true"; quick.addEventListener("click", openSettings); }
        window.refreshProfileSettings = async () => { currentProfile = { ...DEFAULTS, ...(await getProfile() || {}) }; syncUI(currentProfile); };
        console.log("Profile, appearance, visual style and accent-color settings initialized.");
    }
    window.initializeProfileSettings = initializeProfileSettings;
})();
