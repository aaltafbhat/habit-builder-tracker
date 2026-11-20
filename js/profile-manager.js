/*
 * Habit Builder Tracker — Single-screen Profile Manager
 * CRUD: create, read/list, rename, delete, switch and sign out.
 * Profile records remain isolated in their own IndexedDB databases.
 */
(() => {
    "use strict";

    const SIGNED_OUT_KEY = "hbt-profile-session-signed-out";
    const PENDING_AUTH_KEY = "hbt-profile-pending-auth";
    const MANAGER_OPEN_KEY = "hbt-profile-manager-open";
    const MANAGER_VIEW_KEY = "hbt-profile-manager-view";
    const DEFAULT_PROFILE_ID = "current-user";
    const $ = id => document.getElementById(id);

    let accounts = [];
    let activeProfileId = null;
    let pendingProfileId = null;
    let initialized = false;
    let busy = false;
    let managerView = "entry";
    let createReturnView = "entry";
    let authReturnView = "list";
    let importReturnView = "entry";
    const importCandidates = new Map();
    let importCandidateCounter = 0;

    function isSignedOut() {
        try { return localStorage.getItem(SIGNED_OUT_KEY) === "1"; }
        catch (_) { return false; }
    }

    function setSignedOut(value) {
        try {
            if (value) localStorage.setItem(SIGNED_OUT_KEY, "1");
            else localStorage.removeItem(SIGNED_OUT_KEY);
        } catch (error) {
            console.warn("Could not persist profile session state:", error);
        }
    }

    function setPendingAuthProfile(profileId) {
        try {
            if (profileId) localStorage.setItem(PENDING_AUTH_KEY, String(profileId));
            else localStorage.removeItem(PENDING_AUTH_KEY);
        } catch (error) {
            console.warn("Could not persist pending workspace authentication:", error);
        }
    }

    function getPendingAuthProfile() {
        try { return localStorage.getItem(PENDING_AUTH_KEY) || null; }
        catch (_) { return null; }
    }

    function isPlaceholderName(value) {
        return !value || [
            "Default Profile", "Previous Workspace", "Your Name", "Unnamed Workspace",
            "No workspace selected", "No workspace signed in"
        ].includes(String(value).trim());
    }

    function workspaceDisplayName(account) {
        const candidate = String(account?.workspaceName || account?.name || "").trim();
        if (!isPlaceholderName(candidate)) return candidate;
        return account?.id === DEFAULT_PROFILE_ID ? "Previous Workspace" : "Unnamed Workspace";
    }

    function applyRegistryAppearance(account) {
        if (!account) return;
        const appearance = account.appearance || {};
        const theme = ["light", "dark", "system"].includes(appearance.theme || account.theme)
            ? (appearance.theme || account.theme) : null;
        const accent = /^#[0-9a-f]{6}$/i.test(appearance.accentColor || account.accentColor || "")
            ? (appearance.accentColor || account.accentColor) : null;
        const root = document.documentElement;
        if (theme) root.dataset.theme = theme;
        if (accent) {
            const rgb = [1, 3, 5].map(index => parseInt(accent.slice(index, index + 2), 16));
            const toHex = values => "#" + values.map(value => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("");
            root.style.setProperty("--primary", accent);
            root.style.setProperty("--primary-dark", toHex(rgb.map(value => value * 0.86)));
            root.style.setProperty("--primary-light", toHex(rgb.map(value => value + (255 - value) * 0.88)));
        }
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta && theme) meta.content = theme === "dark" ? "#171827" : "#f4f5f9";
    }

    function profileIdNow() {
        try {
            if (!isSignedOut() && activeProfileId) return activeProfileId;
            if (typeof getSavedActiveProfileId === "function") return getSavedActiveProfileId();
            return typeof getActiveProfileId === "function" ? getActiveProfileId() : null;
        } catch (_) { return null; }
    }

    function announce(message, type = "info") {
        const status = $("profile-manager-status");
        if (!status) return;
        status.textContent = message || "";
        status.dataset.type = type;
        status.hidden = !message;
    }

    function setBusy(value) {
        busy = Boolean(value);
        const panel = $("profile-manager-panel");
        if (panel) panel.classList.toggle("is-busy", busy);
        // Use the panel overlay rather than toggling individual disabled states;
        // row-level rules (for example, preventing deletion of the open workspace) remain intact.
        if (!busy) refreshControlAvailability();
    }

    function refreshControlAvailability() {
        const signedOut = isSignedOut();
        const signOut = $("profile-signout-btn");
        const headerSignOut = $("sidebar-signout-btn");
        const back = $("profile-back-btn");
        if (signOut) signOut.hidden = signedOut;
        // Keep the global header action in sync with the actual workspace session.
        // The header button has its own ID and must share the same sign-out handler.
        if (headerSignOut) headerSignOut.hidden = signedOut;
        if (back) back.hidden = signedOut;
        const passwordSection = $("profile-password-section");
        if (passwordSection) passwordSection.hidden = signedOut || !activeProfileId;
        const activeCard = $("profile-active-card");
        if (activeCard) activeCard.hidden = signedOut || !activeProfileId;
        const selectButton = $("profile-choice-select");
        if (selectButton) selectButton.disabled = accounts.length === 0;
        const selectDescription = $("profile-choice-select-description");
        if (selectDescription) selectDescription.textContent = accounts.length
            ? `Open one of your ${accounts.length} saved ${accounts.length === 1 ? "workspace" : "workspaces"}.`
            : "No saved workspaces yet. Create one first.";
        document.body.classList.toggle("profile-session-closed", signedOut);
    }

    function initials(name) {
        const parts = String(name || "Profile").trim().split(/\s+/).filter(Boolean);
        const value = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] || "P").slice(0, 1);
        return value.toUpperCase().slice(0, 2);
    }

    function formatCreated(value) {
        if (!value) return "Date not available";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "Date not available";
        return `Created ${date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}`;
    }


    function syncCreatePasswordFields() {
        const enabled = Boolean($("new-profile-password-enabled")?.checked);
        const fields = $("new-profile-password-options");
        const password = $("new-profile-password");
        const confirm = $("new-profile-password-confirm");
        if (fields) fields.hidden = !enabled;
        if (password) password.required = enabled;
        if (confirm) confirm.required = enabled;
        if (!enabled) {
            if (password) password.value = "";
            if (confirm) confirm.value = "";
        }
    }

    function makeButton(label, action, className = "secondary-btn", title = "") {
        const button = document.createElement("button");
        button.type = "button";
        button.className = className;
        button.textContent = label;
        button.dataset.action = action;
        if (title) button.title = title;
        return button;
    }

    function renderActiveCard() {
        const signedOut = isSignedOut();
        const account = accounts.find(item => item.id === activeProfileId);
        const name = !signedOut && account ? account.name : "No workspace signed in";
        const detail = !signedOut && account
            ? formatCreated(account.createdAt)
            : "Choose a workspace to continue";
        if ($("active-profile-name")) $("active-profile-name").textContent = name || "Unnamed Workspace";
        if ($("active-profile-id")) $("active-profile-id").textContent = detail;
        if ($("active-profile-avatar")) $("active-profile-avatar").textContent = !signedOut && account ? initials(account.name) : "—";
        if ($("profile-session-state")) {
            $("profile-session-state").textContent = signedOut ? "Signed out" : "Signed in";
            $("profile-session-state").classList.toggle("is-signed-in", !signedOut);
        }

        // Keep the active identity and the profile switch action together
        // directly beneath the sidebar brand.
        const sidebarName = $("sidebar-profile-name");
        const sidebarAvatar = $("sidebar-profile-avatar");
        if (sidebarName) sidebarName.textContent = !signedOut && account ? (account.name || "Unnamed Workspace") : "No workspace selected";
        if (sidebarAvatar) sidebarAvatar.textContent = !signedOut && account ? initials(account.name) : "P";

        refreshControlAvailability();
    }

    function renderProfiles() {
        const host = $("profile-list");
        if (!host) return;
        host.replaceChildren();
        const signedOut = isSignedOut();
        const lastUsedId = typeof getSavedActiveProfileId === "function" ? getSavedActiveProfileId() : profileIdNow();
        if ($("profile-count")) $("profile-count").textContent = `${accounts.length} ${accounts.length === 1 ? "workspace" : "workspaces"}`;

        if (!accounts.length) {
            const empty = document.createElement("p");
            empty.className = "empty-state";
            empty.textContent = "No workspaces yet. Use Create workspace to get started.";
            host.appendChild(empty);
            return;
        }

        accounts.slice().sort((a, b) => {
            if (!signedOut) {
                if (a.id === activeProfileId) return -1;
                if (b.id === activeProfileId) return 1;
            } else if (lastUsedId) {
                if (a.id === lastUsedId) return -1;
                if (b.id === lastUsedId) return 1;
            }
            return String(a.name || "").localeCompare(String(b.name || ""));
        }).forEach(account => {
            const isActive = !signedOut && account.id === activeProfileId;
            const isLastUsed = signedOut && account.id === lastUsedId;
            const protectedProfile = Boolean(account.encryption?.enabled);
            const row = document.createElement("article");
            row.className = "pm-profile-card";
            if (isActive) row.classList.add("is-active");

            const displayName = workspaceDisplayName(account);

            const avatar = document.createElement("span");
            avatar.className = "pm-profile-avatar";
            avatar.textContent = initials(displayName);
            avatar.setAttribute("aria-hidden", "true");

            const info = document.createElement("div");
            info.className = "pm-profile-info";
            const title = document.createElement("strong");
            title.textContent = displayName;
            const meta = document.createElement("small");
            meta.textContent = `${formatCreated(account.createdAt)} · ${protectedProfile ? "Password protected" : "No password set"}`;
            info.append(title, meta);

            const status = document.createElement("span");
            status.className = "pm-profile-badge";
            status.textContent = isActive ? "Current" : (isLastUsed ? "Last opened" : (protectedProfile ? "Protected" : "Available"));

            const main = document.createElement("div");
            main.className = "pm-profile-main";
            main.append(avatar, info, status);

            const actions = document.createElement("div");
            actions.className = "pm-profile-actions";
            const useButton = makeButton(isActive ? "Current workspace" : "Open workspace", "switch", "primary-btn");
            useButton.dataset.profileId = account.id;
            const editButton = makeButton("Rename", "edit", "secondary-btn");
            editButton.dataset.profileId = account.id;
            const deleteButton = makeButton("Delete", "delete", "pm-danger-outline-btn");
            deleteButton.dataset.profileId = account.id;
            if (isActive) {
                deleteButton.disabled = true;
                deleteButton.title = "Open another workspace or sign out before deleting this one";
            }
            actions.append(useButton, editButton, deleteButton);
            row.append(main, actions);
            host.appendChild(row);
        });
    }

    async function refreshProfiles() {
        accounts = await getAllProfileAccounts();
        const appearanceProfileId = !isSignedOut()
            ? (activeProfileId || profileIdNow())
            : (typeof getSavedActiveProfileId === "function" ? getSavedActiveProfileId() : null);
        const appearanceAccount = accounts.find(item => item.id === appearanceProfileId)
            || accounts[0];
        if (appearanceAccount) applyRegistryAppearance(appearanceAccount);
        if (!isSignedOut()) {
            activeProfileId = profileIdNow();
            if (!accounts.some(item => item.id === activeProfileId)) activeProfileId = null;
        } else {
            activeProfileId = null;
        }
        renderActiveCard();
        renderProfiles();
        await refreshPasswordPanel();
    }

    function setManagerView(view) {
        managerView = view;
        // Remember the exact manager sub-view so refresh never falls back to
        // workspace restoration (which would briefly open the dashboard).
        try { localStorage.setItem(MANAGER_VIEW_KEY, view); } catch (_) {}
        const entry = $("profile-entry-panel");
        const list = $("profile-list-section");
        const create = $("profile-create-panel");
        const auth = $("profile-auth-panel");
        const edit = $("profile-edit-panel");
        const importPanel = $("profile-import-panel");
        if (entry) entry.hidden = view !== "entry";
        if (list) list.hidden = view !== "list";
        if (create) create.hidden = view !== "create";
        if (auth) auth.hidden = view !== "auth";
        if (importPanel) importPanel.hidden = view !== "import";
        if (edit && view !== "list") edit.hidden = true;
        if (view !== "create") {
            $("profile-create-form")?.reset();
            syncCreatePasswordFields();
        } else {
            syncCreatePasswordFields();
            window.setTimeout(() => $("new-profile-name")?.focus(), 40);
        }
    }

    function openManagerScreen(view) {
        try { localStorage.setItem(MANAGER_OPEN_KEY, "1"); } catch (_) {}
        const onboarding = $("onboarding");
        const dashboard = $("dashboard");
        const page = $("profile-manager-screen");
        if (onboarding) onboarding.hidden = true;
        if (dashboard) dashboard.hidden = false;
        document.querySelectorAll("#dashboard .page-section").forEach(section => {
            section.hidden = section !== page;
            section.classList.toggle("active", section === page);
        });
        if (page) page.hidden = false;
        setManagerView(view || (isSignedOut() ? "entry" : "list"));
        if (location.hash !== "#profile-manager-screen" && !isSignedOut()) {
            history.replaceState(null, "", "#profile-manager-screen");
        }
        document.body.classList.add("profile-manager-open");
        document.body.classList.toggle("profile-session-closed", isSignedOut());
        refreshControlAvailability();
    }

    function openDashboard() {
        try {
            localStorage.removeItem(MANAGER_OPEN_KEY);
            localStorage.removeItem(MANAGER_VIEW_KEY);
        } catch (_) {}
        document.body.classList.remove("profile-manager-open", "profile-session-closed");
        const page = $("profile-manager-screen");
        if (page) {
            page.hidden = true;
            page.classList.remove("active");
        }
        const dashboard = $("dashboard");
        if (dashboard) dashboard.hidden = false;
        const overviewLink = document.querySelector('.sidebar a[href="#overview"]');
        if (overviewLink && overviewLink.dataset.navigationBound === "true") {
            overviewLink.click();
        } else {
            document.querySelectorAll("#dashboard .page-section").forEach(section => {
                const isOverview = section.id === "overview";
                section.hidden = !isOverview;
                section.classList.toggle("active", isOverview);
            });
            if (typeof window.initializeNavigation === "function") window.initializeNavigation();
        }
    }

    function showAuthPanel(profileId) {
        pendingProfileId = profileId;
        setPendingAuthProfile(profileId);
        authReturnView = managerView === "list" ? "list" : "entry";
        const account = accounts.find(item => item.id === profileId);
        if (account) applyRegistryAppearance(account);
        const form = $("profile-auth-form");
        if ($("profile-auth-heading")) $("profile-auth-heading").textContent = `Unlock ${account?.name || "Workspace"}`;
        if ($("profile-auth-description")) $("profile-auth-description").textContent = `Enter the password for ${account?.name || "this workspace"} to open its private data.`;
        if ($("profile-auth-error")) $("profile-auth-error").textContent = "";
        if ($("profile-auth-password")) $("profile-auth-password").value = "";
        openManagerScreen("auth");
        if (form) window.setTimeout(() => form.querySelector("input")?.focus(), 40);
    }

    async function lockCurrentSession() {
        if (isSignedOut()) return;
        const previousId = activeProfileId || profileIdNow();

        // Stop the Focus Mode timer while its workspace scope is still active.
        // The signed-out event below remains as a fallback for other listeners,
        // but this direct call guarantees cleanup before the database is closed.
        if (typeof window.stopFocusModeForSignOut === "function") {
            try {
                window.stopFocusModeForSignOut();
            } catch (error) {
                console.error("Focus Mode could not be stopped before sign-out:", error);
            }
        }

        if (typeof lockProfile === "function" && previousId) {
            lockProfile(previousId);
        } else if (typeof closeActiveDatabase === "function") {
            closeActiveDatabase();
        }
        activeProfileId = null;
        setSignedOut(true);
        window.dispatchEvent(new CustomEvent("hbt:profile-signed-out", { detail: { profileId: previousId } }));
    }

    async function finishProfileOpen(profileId) {
        activeProfileId = profileId;
        pendingProfileId = null;
        setPendingAuthProfile(null);
        setSignedOut(false);
        window.dispatchEvent(new CustomEvent("hbt:profile-opened", { detail: { profileId } }));
        if ($("profile-auth-panel")) $("profile-auth-panel").hidden = true;
        if ($("profile-auth-error")) $("profile-auth-error").textContent = "";
        if ($("profile-auth-password")) $("profile-auth-password").value = "";

        // Workspace names live in the profile registry. The separate
        // workspaceName field in the profile record keeps that identity apart
        // from the user's personal display name in Profile & Appearance.
        let account = accounts.find(item => item.id === profileId) || await getProfileAccount(profileId);
        let workspaceProfile = null;
        try { workspaceProfile = await getProfile(); } catch (_) {}

        const registeredName = String(account?.workspaceName || account?.name || "").trim();
        const savedWorkspaceName = String(workspaceProfile?.workspaceName || "").trim();
        const personalName = String(workspaceProfile?.name || "").trim();
        const workspaceName = !isPlaceholderName(registeredName)
            ? registeredName
            : (!isPlaceholderName(savedWorkspaceName)
                ? savedWorkspaceName
                : (!isPlaceholderName(personalName) ? personalName : "Previous Workspace"));

        const updatedProfile = {
            ...(workspaceProfile || {}),
            id: "current-user",
            name: isPlaceholderName(personalName) ? workspaceName : personalName,
            workspaceName,
            createdAt: workspaceProfile?.createdAt || account?.createdAt || new Date().toISOString()
        };
        if (!workspaceProfile || workspaceProfile.workspaceName !== workspaceName || isPlaceholderName(personalName)) {
            await saveProfile(updatedProfile);
            workspaceProfile = await getProfile();
        }

        // Normalize the old synthetic label to the best real name available.
        if (account && (account.name !== workspaceName || account.workspaceName !== workspaceName)) {
            account = { ...account, name: workspaceName, workspaceName };
            await saveProfileAccount(account);
            accounts = await getAllProfileAccounts();
        }

        await refreshProfiles();
        document.body.classList.remove("profile-session-closed");
        announce("Workspace opened successfully.", "success");
        if (typeof window.activateWorkspaceAfterProfileLogin === "function") {
            await window.activateWorkspaceAfterProfileLogin();
        } else if (typeof window.initializeApplication === "function") {
            await window.initializeApplication();
        }

        openDashboard();
        if (location.hash !== "#overview") history.replaceState(null, "", "#overview");
        await refreshProfiles();
    }

    async function switchToProfile(profileId) {
        if (busy) return;
        const account = accounts.find(item => item.id === profileId);
        if (!account) {
            announce("That workspace could not be found. Refresh the list and try again.", "error");
            return;
        }
        applyRegistryAppearance(account);
        if (!isSignedOut() && profileId === activeProfileId) {
            openDashboard();
            return;
        }

        setBusy(true);
        try {
            if (!isSignedOut()) {
                await lockCurrentSession();
                await refreshProfiles();
            }
            const protectedProfile = await isProfilePasswordProtected(profileId);
            if (protectedProfile && !isProfileUnlocked(profileId)) {
                showAuthPanel(profileId);
                announce(`Unlock ${account.name || "this workspace"} to continue.`, "info");
                return;
            }
            await switchProfileDatabase(profileId);
            await finishProfileOpen(profileId);
        } catch (error) {
            console.error("Workspace switch failed:", error);
            announce(error.message || "Unable to switch profile.", "error");
            openManagerScreen(isSignedOut() ? "list" : "entry");
        } finally {
            setBusy(false);
        }
    }

    function makeProfileId(name) {
        const base = String(name || "profile")
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 42) || "profile";
        let id = `profile-${base}`;
        let suffix = 1;
        while (accounts.some(item => item.id === id)) id = `profile-${base}-${suffix++}`;
        return id;
    }

    async function createProfile(event) {
        event.preventDefault();
        if (busy) return;
        const name = $("new-profile-name")?.value.trim() || "";
        const setPasswordNow = Boolean($("new-profile-password-enabled")?.checked);
        const password = $("new-profile-password")?.value || "";
        const passwordConfirm = $("new-profile-password-confirm")?.value || "";
        if (!name) return announce("Enter a name for the new workspace.", "error");
        if (setPasswordNow && password.length < 8) {
            announce("Use a workspace password with at least 8 characters.", "error");
            $("new-profile-password")?.focus();
            return;
        }
        if (setPasswordNow && password !== passwordConfirm) {
            announce("The workspace password and confirmation do not match.", "error");
            $("new-profile-password-confirm")?.focus();
            return;
        }

        setBusy(true);
        let id = null;
        try {
            if (!isSignedOut()) await lockCurrentSession();
            id = makeProfileId(name);
            await saveProfileAccount({
                id, name, workspaceName: name, createdAt: new Date().toISOString(),
                appearance: { theme: "light", accentColor: "#2563eb" }
            });
            await switchProfileDatabase(id);
            await saveProfile({ id: "current-user", name, workspaceName: name, createdAt: new Date().toISOString() });
            if (setPasswordNow) {
                // Encrypt after the first profile record is written, while the
                // newly-created workspace is active and before showing its dashboard.
                await enableProfilePassword(id, password);
            }
            $("profile-create-form")?.reset();
            syncCreatePasswordFields();
            await finishProfileOpen(id);
        } catch (error) {
            console.error("Workspace creation failed:", error);
            if (id) { try { lockProfile(id); } catch (_) {} }
            activeProfileId = null;
            setSignedOut(true);
            announce(error.message || "Unable to create workspace.", "error");
            try { await refreshProfiles(); } catch (_) {}
            openManagerScreen("entry");
        } finally {
            setBusy(false);
        }
    }

    function beginEdit(profileId) {
        const account = accounts.find(item => item.id === profileId);
        if (!account) return;
        $("edit-profile-id").value = account.id;
        $("edit-profile-name").value = account.name || "";
        $("profile-edit-panel").hidden = false;
        $("edit-profile-name").focus();
        $("profile-edit-panel").scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    async function saveProfileEdit(event) {
        event.preventDefault();
        if (busy) return;
        const id = $("edit-profile-id").value;
        const name = $("edit-profile-name").value.trim();
        if (!name) return announce("Workspace name cannot be empty.", "error");
        const account = accounts.find(item => item.id === id);
        if (!account) return announce("Workspace not found.", "error");
        const oldName = workspaceDisplayName(account);
        const confirmed = typeof window.showAppConfirm === "function"
            ? await window.showAppConfirm(`Rename “${oldName}” to “${name}”?`, {
                title: "Confirm Workspace Rename",
                confirmText: "Rename Workspace",
                cancelText: "Keep Current Name"
            })
            : false;
        if (!confirmed) return;
        setBusy(true);
        try {
            await saveProfileAccount({ ...account, name, workspaceName: name });
            if (!isSignedOut() && id === activeProfileId && typeof getProfile === "function") {
                const storedProfile = await getProfile() || {};
                await saveProfile({ ...storedProfile, id: "current-user", workspaceName: name });
                if (typeof window.refreshProfileSettings === "function") await window.refreshProfileSettings();
            }
            $("profile-edit-panel").hidden = true;
            await refreshProfiles();
            announce("Workspace name updated.", "success");
        } catch (error) {
            console.error("Profile rename failed:", error);
            announce(error.message || "Unable to rename workspace.", "error");
        } finally {
            setBusy(false);
        }
    }

    async function deleteProfile(profileId) {
        if (busy) return;
        const account = accounts.find(item => item.id === profileId);
        if (!account) return;
        if (!isSignedOut() && profileId === activeProfileId) return announce("Sign out or open another workspace before deleting this workspace.", "error");
        const typed = typeof window.showAppTextConfirm === "function"
            ? await window.showAppTextConfirm(
                `You are about to permanently delete “${workspaceDisplayName(account)}” and all of its local data. This cannot be undone.`,
                {
                    title: "Delete Workspace Permanently?",
                    inputLabel: 'Type DELETE in capital letters to confirm',
                    placeholder: "DELETE",
                    expectedText: "DELETE",
                    confirmText: "Delete Workspace",
                    cancelText: "Cancel"
                }
            )
            : null;
        if (typed !== "DELETE") return;
        setBusy(true);
        try {
            // Move the persisted last-used pointer to a remaining workspace
            // before deleting the one it referenced. No records are loaded here.
            if (isSignedOut() && profileId === profileIdNow()) {
                const replacement = accounts.find(item => item.id !== profileId);
                if (replacement) {
                    await switchProfileDatabase(replacement.id);
                    lockProfile(replacement.id);
                } else {
                    try { localStorage.removeItem("cc-active-profile-id"); } catch (_) {}
                }
            }
            await deleteProfileDatabase(profileId);
            await deleteProfileAccount(profileId);
            await refreshProfiles();
            announce("Workspace and its data were deleted.", "success");
        } catch (error) {
            console.error("Profile deletion failed:", error);
            announce(error.message || "Unable to delete profile.", "error");
        } finally {
            setBusy(false);
        }
    }

    async function submitUnlock(event) {
        event.preventDefault();
        if (busy || !pendingProfileId) return;
        const id = pendingProfileId;
        const password = $("profile-auth-password")?.value || "";
        const errorNode = $("profile-auth-error");
        if (errorNode) errorNode.textContent = "";
        setBusy(true);
        try {
            await unlockProfile(id, password);
            await finishProfileOpen(id);
        } catch (error) {
            console.error("Profile unlock failed:", error);
            if (errorNode) errorNode.textContent = "Incorrect password or this workspace could not be unlocked. Try again.";
            $("profile-auth-password")?.select();
        } finally {
            setBusy(false);
        }
    }

    async function refreshPasswordPanel() {
        const section = $("profile-password-section");
        if (!section) return;
        const signedOut = isSignedOut();
        const account = activeProfileId ? await getProfileAccount(activeProfileId) : null;
        const enabled = Boolean(account?.encryption?.enabled);
        section.hidden = signedOut || !activeProfileId;
        if ($("profile-password-state")) {
            $("profile-password-state").textContent = enabled ? "Password protected" : "Not protected";
            $("profile-password-state").classList.toggle("is-protected", enabled);
        }
        if ($("profile-password-description")) {
            $("profile-password-description").textContent = enabled
                ? "Change the password or remove password protection for this active workspace."
                : "Add a password to encrypt this workspace. You can change or remove it later.";
        }
        if ($("profile-current-password-wrap")) $("profile-current-password-wrap").hidden = !enabled;
        if ($("profile-current-password")) $("profile-current-password").required = enabled;
        if ($("profile-save-password-btn")) $("profile-save-password-btn").textContent = enabled ? "Change Password" : "Add Password";
        if ($("profile-remove-password-btn")) $("profile-remove-password-btn").hidden = !enabled;
    }

    async function savePassword(event) {
        event.preventDefault();
        if (busy || !activeProfileId || isSignedOut()) return;
        const current = $("profile-current-password")?.value || "";
        const next = $("profile-new-password")?.value || "";
        const confirm = $("profile-confirm-new-password")?.value || "";
        if (next.length < 8) return announce("Use a password with at least 8 characters.", "error");
        if (next !== confirm) return announce("The new password and confirmation do not match.", "error");
        setBusy(true);
        try {
            const enabled = await isProfilePasswordProtected(activeProfileId);
            if (enabled) await changeProfilePassword(activeProfileId, current, next);
            else await enableProfilePassword(activeProfileId, next);
            $("profile-password-form")?.reset();
            await refreshProfiles();
            announce(enabled ? "Workspace password changed." : "Password protection enabled for this workspace.", "success");
        } catch (error) {
            console.error("Profile password update failed:", error);
            announce(error.message || "Unable to update the profile password.", "error");
        } finally {
            setBusy(false);
        }
    }

    async function removePassword() {
        if (busy || !activeProfileId || isSignedOut()) return;
        const current = $("profile-current-password")?.value || "";
        if (!current) return announce("Enter the current password before removing protection.", "error");
        const confirmed = typeof window.showAppConfirm === "function"
            ? await window.showAppConfirm(
                "Remove password protection from this workspace? Its local data will be decrypted and stored without a password.",
                { title: "Remove Workspace Password?", confirmText: "Remove Password", cancelText: "Keep Password", danger: true }
            )
            : false;
        if (!confirmed) return;
        setBusy(true);
        try {
            await removeProfilePassword(activeProfileId, current);
            $("profile-password-form")?.reset();
            await refreshProfiles();
            announce("Password protection removed.", "success");
        } catch (error) {
            console.error("Workspace password removal failed:", error);
            announce(error.message || "Unable to remove the profile password.", "error");
        } finally {
            setBusy(false);
        }
    }

    async function signOut() {
        if (busy || isSignedOut()) return;
        const account = accounts.find(item => item.id === activeProfileId);
        const workspaceName = workspaceDisplayName(account) || "Workspace";
        const confirmed = typeof window.showAppConfirm === "function"
            ? await window.showAppConfirm(
                `Sign out of “${workspaceName}”? A backup of this workspace will be created at your configured backup location before the workspace is locked.`,
                {
                    title: "Back Up & Sign Out",
                    confirmText: "Create Backup & Sign Out",
                    cancelText: "Stay Signed In"
                }
            )
            : false;
        if (!confirmed) return;

        setBusy(true);
        try {
            // Stop and persist any active Focus Mode session before reading the
            // database, so the automatic backup includes its final stopped state.
            if (typeof window.stopFocusModeForSignOut === "function") {
                window.stopFocusModeForSignOut();
            }

            if (typeof window.createAutomaticWorkspaceBackup !== "function") {
                throw new Error("Automatic backup is unavailable. Please use Backup & Install to create a manual backup, then try signing out again.");
            }

            const backupResult = await window.createAutomaticWorkspaceBackup(workspaceName);

            // Only close the workspace after its backup data has been assembled
            // and the browser download has been initiated.
            await lockCurrentSession();
            pendingProfileId = null;
            if ($("profile-auth-panel")) $("profile-auth-panel").hidden = true;
            if ($("profile-password-form")) $("profile-password-form").reset();
            await refreshProfiles();
            openManagerScreen("entry");
            announce(`Signed out. Automatic backup created: ${backupResult.filename}`, "success");
            if (typeof window.showAppDialog === "function") {
                await window.showAppDialog(
                    `Your workspace backup was created before sign-out.\n\nFile: ${backupResult.filename}\nLocation: ${backupResult.destination || "Browser Downloads"}\n\n${backupResult.counts}\n\nCheck that location to confirm the backup file is present.`,
                    { title: "Backup Created — Signed Out" }
                );
            }
        } catch (error) {
            console.error("Automatic backup/sign-out failed:", error);
            announce(error.message || "Backup failed. You are still signed in.", "error");
            if (typeof window.showAppDialog === "function") {
                await window.showAppDialog(
                    `Sign-out was cancelled because the automatic backup could not be created. Your workspace remains open.\n\n${error.message || "Unknown backup error"}`,
                    { title: "Backup Failed — Still Signed In", danger: true }
                );
            }
        } finally {
            setBusy(false);
        }
    }

    async function cancelAuth() {
        pendingProfileId = null;
        setPendingAuthProfile(null);
        if ($("profile-auth-panel")) $("profile-auth-panel").hidden = true;
        if ($("profile-auth-form")) $("profile-auth-form").reset();
        await refreshProfiles();
        openManagerScreen(authReturnView === "entry" ? "entry" : "list");
        announce("Select a workspace to continue.", "info");
    }

    function formatImportDate(value) {
        if (!value) return "Date not shown in backup";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "Date not shown in backup";
        return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    }

    function isBackupFile(file) {
        return /\.(json|hbtbackup)$/i.test(file?.name || "");
    }

    function candidateAlreadyImported(meta) {
        if (!meta?.workspaceId) return false;
        return accounts.some(account =>
            account.importedFromWorkspaceId === meta.workspaceId ||
            (meta.encryptedWorkspace && account.id === meta.workspaceId)
        );
    }

    function renderImportCandidates() {
        const host = $("profile-import-results");
        if (!host) return;
        host.replaceChildren();
        if (!importCandidates.size) {
            const empty = document.createElement("p");
            empty.className = "empty-state";
            empty.textContent = "No backup files scanned yet. Choose a backup folder or select one or more backup files.";
            host.appendChild(empty);
            return;
        }

        for (const [key, candidate] of importCandidates) {
            const row = document.createElement("article");
            row.className = "pm-import-candidate";
            const copy = document.createElement("div");
            copy.className = "pm-import-candidate-copy";
            const title = document.createElement("strong");
            title.textContent = candidate.meta.workspaceName || candidate.file.name || "Workspace backup";
            const meta = document.createElement("small");
            meta.textContent = `${candidate.file.name} · ${formatImportDate(candidate.meta.exportedAt)} · ${(candidate.file.size / 1024).toFixed(1)} KB`;
            const detail = document.createElement("span");
            detail.className = "pm-import-candidate-detail";
            if (candidate.meta.counts) detail.textContent = candidate.meta.counts;
            else if (candidate.meta.encryptedBackup) detail.textContent = "Encrypted backup · recovery passphrase required during import";
            else detail.textContent = "Habit Builder Tracker workspace backup";
            copy.append(title, meta, detail);

            const actions = document.createElement("div");
            actions.className = "pm-import-candidate-actions";
            const badge = document.createElement("span");
            badge.className = "pm-import-badge";
            badge.textContent = candidate.meta.encryptedBackup || candidate.meta.encryptedWorkspace ? "Encrypted" : "Backup";
            const button = document.createElement("button");
            button.type = "button";
            button.className = "primary-btn";
            button.dataset.importKey = key;
            const alreadyImported = candidate.imported || candidateAlreadyImported(candidate.meta);
            button.disabled = alreadyImported || !candidate.valid;
            button.textContent = alreadyImported ? "Already added" : (candidate.valid ? "Import workspace" : "Unsupported file");
            actions.append(badge, button);
            row.append(copy, actions);
            host.appendChild(row);
        }
    }

    async function scanImportFiles(files, sourceLabel = "Selected files") {
        const supported = Array.from(files || []).filter(isBackupFile);
        if (!supported.length) {
            announce("No .json or .hbtbackup files were found. Select a Habit Builder Tracker backup.", "error");
            return;
        }
        importCandidates.clear();
        let accepted = 0;
        let skipped = 0;
        for (const file of supported.slice(0, 100)) {
            const key = `import-${++importCandidateCounter}`;
            try {
                if (typeof window.inspectWorkspaceBackupFile !== "function") {
                    throw new Error("Backup inspection is unavailable. Update js/data-tools.js.");
                }
                const meta = await window.inspectWorkspaceBackupFile(file);
                importCandidates.set(key, { file, meta, valid: true, imported: false });
                accepted++;
            } catch (error) {
                importCandidates.set(key, { file, meta: { workspaceName: file.name, encryptedBackup: false }, valid: false, error: error.message, imported: false });
                skipped++;
            }
        }
        renderImportCandidates();
        announce(`${sourceLabel}: found ${accepted} supported backup${accepted === 1 ? "" : "s"}${skipped ? `; skipped ${skipped} unsupported file${skipped === 1 ? "" : "s"}` : ""}.`, accepted ? "success" : "error");
        if (supported.length > 100) announce("The folder contains more than 100 backup files. The first 100 were scanned; use a narrower folder for the rest.", "info");
    }

    async function chooseImportFiles() {
        const input = $("profile-import-file-input");
        if (input) input.click();
    }

    async function scanImportFolder() {
        if (!isSignedOut()) {
            announce("Sign out of the current workspace before importing another one. This prevents an import from disturbing an open session.", "error");
            return;
        }
        if (typeof window.showDirectoryPicker !== "function") {
            announce("Folder scanning is not supported in this browser. Use Choose backup files instead.", "info");
            chooseImportFiles();
            return;
        }
        try {
            const directory = await window.showDirectoryPicker({ mode: "read" });
            const files = [];
            async function collect(handle, depth = 0) {
                if (depth > 3 || files.length >= 100) return;
                for await (const [name, entry] of handle.entries()) {
                    if (files.length >= 100) break;
                    if (entry.kind === "file" && /\.(json|hbtbackup)$/i.test(name)) {
                        files.push(await entry.getFile());
                    } else if (entry.kind === "directory") {
                        await collect(entry, depth + 1);
                    }
                }
            }
            await collect(directory);
            await scanImportFiles(files, `Scanned “${directory.name || "selected folder"}”`);
        } catch (error) {
            if (error?.name === "AbortError") return;
            console.error("Workspace backup folder scan failed:", error);
            announce(`Could not scan this folder: ${error.message || "Unknown error"}`, "error");
        }
    }

    async function importWorkspaceCandidate(key) {
        if (busy) return;
        if (!isSignedOut()) {
            announce("Sign out of the current workspace before importing another one.", "error");
            return;
        }
        const candidate = importCandidates.get(key);
        if (!candidate || !candidate.valid) return;
        const label = candidate.meta.workspaceName || candidate.file.name || "this workspace";
        const confirmed = typeof window.showAppConfirm === "function"
            ? await window.showAppConfirm(
                `Import “${label}” as a separate workspace on this browser? Existing workspaces will not be replaced. If the source workspace is password-protected, its original workspace ID must be available and you will need its original workspace password to open it.`,
                { title: "Import Workspace Backup", confirmText: "Import Workspace", cancelText: "Cancel" }
            )
            : false;
        if (!confirmed) return;

        setBusy(true);
        try {
            if (typeof window.importWorkspaceBackupAsProfile !== "function") {
                throw new Error("Workspace import is unavailable. Update js/data-tools.js and try again.");
            }
            const baseName = candidate.meta.workspaceName || candidate.file.name.replace(/\.(json|hbtbackup)$/i, "") || "Imported Workspace";
            const result = await window.importWorkspaceBackupAsProfile(candidate.file, makeProfileId(baseName));
            candidate.imported = true;
            candidate.meta.workspaceId = result.sourceWorkspaceId;
            candidate.meta.encryptedWorkspace = result.protectedWorkspace;
            candidate.meta.workspaceName = result.workspaceName;
            accounts = await getAllProfileAccounts();
            await refreshProfiles();
            setManagerView("list");
            announce(`“${result.workspaceName}” was imported successfully. Select it from Your Workspaces to open it.${result.protectedWorkspace ? " It will ask for the original workspace password." : ""}`, "success");
            renderImportCandidates();
        } catch (error) {
            console.error("Workspace import failed:", error);
            announce(error.message || "Unable to import this workspace backup.", "error");
        } finally {
            setBusy(false);
        }
    }

    function openImportPanel(returnView = "entry") {
        importReturnView = returnView;
        if (!isSignedOut()) {
            announce("Sign out of the current workspace before importing another one.", "error");
            return;
        }
        setManagerView("import");
        renderImportCandidates();
    }

    function bindEvents() {
        if (initialized) return;
        initialized = true;

        $("profile-create-form")?.addEventListener("submit", createProfile);
        $("new-profile-password-enabled")?.addEventListener("change", syncCreatePasswordFields);
        $("profile-create-cancel-btn")?.addEventListener("click", () => setManagerView(createReturnView));
        $("profile-choice-create")?.addEventListener("click", () => { createReturnView = "entry"; setManagerView("create"); });
        $("profile-choice-select")?.addEventListener("click", () => {
            if (!accounts.length) return announce("No existing workspaces yet. Create your first workspace.", "info");
            setManagerView("list");
        });
        $("profile-choice-import")?.addEventListener("click", () => openImportPanel("entry"));
        $("profile-show-import-btn")?.addEventListener("click", () => openImportPanel("list"));
        $("profile-import-back-btn")?.addEventListener("click", () => setManagerView(importReturnView));
        $("profile-import-select-files")?.addEventListener("click", chooseImportFiles);
        $("profile-import-scan-folder")?.addEventListener("click", scanImportFolder);
        $("profile-import-file-input")?.addEventListener("change", async event => {
            try { await scanImportFiles(event.target.files, "Selected backups"); }
            finally { event.target.value = ""; }
        });
        $("profile-import-results")?.addEventListener("click", event => {
            const button = event.target.closest("button[data-import-key]");
            if (button) importWorkspaceCandidate(button.dataset.importKey);
        });
        $("profile-show-create-btn")?.addEventListener("click", () => { createReturnView = "list"; setManagerView("create"); });
        $("profile-list-back-btn")?.addEventListener("click", () => setManagerView("entry"));
        $("profile-edit-form")?.addEventListener("submit", saveProfileEdit);
        $("profile-edit-cancel-btn")?.addEventListener("click", () => { $("profile-edit-panel").hidden = true; });
        $("profile-auth-form")?.addEventListener("submit", submitUnlock);
        $("profile-auth-cancel-btn")?.addEventListener("click", cancelAuth);
        $("profile-password-form")?.addEventListener("submit", savePassword);
        $("profile-remove-password-btn")?.addEventListener("click", removePassword);
        $("profile-signout-btn")?.addEventListener("click", signOut);
        $("sidebar-signout-btn")?.addEventListener("click", signOut);
        $("profile-back-btn")?.addEventListener("click", openDashboard);

        $("profile-list")?.addEventListener("click", event => {
            const button = event.target.closest("button[data-action]");
            if (!button || busy) return;
            const id = button.dataset.profileId;
            const action = button.dataset.action;
            if (action === "switch") switchToProfile(id);
            if (action === "edit") beginEdit(id);
            if (action === "delete") deleteProfile(id);
        });

        $("open-profile-manager")?.addEventListener("click", async () => {
            try {
                await refreshProfiles();
                openManagerScreen(isSignedOut() ? "entry" : "list");
            } catch (error) {
                console.error("Could not open profile manager:", error);
                announce(error.message || "Could not load workspaces.", "error");
            }
        });
    }

    async function initializeProfileManager() {
        bindEvents();
        try {
            accounts = await getAllProfileAccounts();
            pendingProfileId = null;

            const lastUsedId = typeof getSavedActiveProfileId === "function"
                ? getSavedActiveProfileId() : null;
            const pendingAuthId = getPendingAuthProfile();
            let restoreManagerScreen = false;
            try { restoreManagerScreen = localStorage.getItem(MANAGER_OPEN_KEY) === "1"; } catch (_) {}
            const pendingAccount = accounts.find(item => item.id === pendingAuthId);
            const lastUsedAccount = accounts.find(item => item.id === lastUsedId);

            // Prefer the profile being unlocked if the browser was refreshed on
            // the authentication screen. This keeps the user on the same step.
            if (pendingAccount) {
                activeProfileId = null;
                setSignedOut(true);
                await refreshProfiles();
                showAuthPanel(pendingAccount.id);
                announce(`Unlock ${workspaceDisplayName(pendingAccount)} to continue.`, "info");
                return true;
            }

            // If the user refreshed while viewing Workspace Manager, restore that
            // screen before attempting to reopen the last workspace. Previously,
            // the manager flag was checked only after finishProfileOpen(), which
            // opened the dashboard first and caused a visible dashboard flash.
            if (restoreManagerScreen) {
                activeProfileId = null;
                pendingProfileId = null;
                setPendingAuthProfile(null);
                setSignedOut(true);
                await refreshProfiles();

                let savedView = "entry";
                try { savedView = localStorage.getItem(MANAGER_VIEW_KEY) || "entry"; } catch (_) {}
                if (!["entry", "list", "create"].includes(savedView)) {
                    savedView = accounts.length ? "list" : "entry";
                }
                if (savedView === "list" && !accounts.length) savedView = "entry";

                openManagerScreen(savedView);
                announce(savedView === "entry"
                    ? (accounts.length
                        ? "Choose an existing workspace or create a new one to continue."
                        : "Welcome. Create your first workspace to get started.")
                    : "Workspace Manager restored.", "info");
                return true;
            }

            // Explicit sign-out must remain respected after refresh.
            if (isSignedOut()) {
                activeProfileId = null;
                await refreshProfiles();
                openManagerScreen("entry");
                announce(accounts.length
                    ? "Choose an existing workspace or create a new one to continue."
                    : "Welcome. Create your first workspace to get started.", "info");
                return true;
            }

            // Restore the previous unprotected workspace after refresh. Protected
            // workspaces restore to the unlock screen because encryption keys are
            // intentionally memory-only and must be entered again after reload.
            if (lastUsedAccount) {
                applyRegistryAppearance(lastUsedAccount);
                if (await isProfilePasswordProtected(lastUsedAccount.id)) {
                    activeProfileId = null;
                    setSignedOut(true);
                    setPendingAuthProfile(lastUsedAccount.id);
                    await refreshProfiles();
                    showAuthPanel(lastUsedAccount.id);
                    announce(`Enter the password to reopen ${workspaceDisplayName(lastUsedAccount)}.`, "info");
                    return true;
                }

                await switchProfileDatabase(lastUsedAccount.id);
                await finishProfileOpen(lastUsedAccount.id);
                return true;
            }

            // No remembered, signed-in workspace: show the workspace welcome page.
            activeProfileId = null;
            setSignedOut(true);
            await refreshProfiles();
            openManagerScreen("entry");
            announce(accounts.length
                ? "Choose an existing workspace or create a new one to continue."
                : "Welcome. Create your first workspace to get started.", "info");
            return true;
        } catch (error) {
            console.error("Profile manager initialization failed:", error);
            announce(error.message || "Workspace selection could not be initialized.", "error");
            setSignedOut(true);
            activeProfileId = null;
            try { await refreshProfiles(); } catch (_) {}
            openManagerScreen("entry");
            return true;
        }
    }

    window.initializeProfileManager = initializeProfileManager;
    window.isProfileGateActive = () => isSignedOut() || Boolean(pendingProfileId);
    window.openProfileManager = async () => {
        await refreshProfiles();
        openManagerScreen(isSignedOut() ? "entry" : "list");
    };
    window.refreshWorkspacePasswordSettings = refreshPasswordPanel;
})();
