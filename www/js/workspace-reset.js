/* Habit Builder Tracker v1.5.32 — Workspace Data Reset */
(() => {
    "use strict";

    const EMPTY_WORKSPACE = Object.freeze({
        tasks: [],
        habits: [],
        milestones: [],
        projects: []
    });

    let busy = false;
    const byId = id => document.getElementById(id);

    function setStatus(message, type = "info") {
        const node = byId("workspace-reset-status");
        if (!node) return;
        node.textContent = message;
        node.dataset.state = type;
    }

    async function showDialog(message, options = {}) {
        if (typeof window.showAppDialog !== "function") {
            throw new Error("The confirmation dialog is unavailable. Reload the app and try again.");
        }
        return window.showAppDialog(message, options);
    }

    async function confirmResetStart(workspaceName) {
        if (typeof window.showAppConfirm !== "function") {
            throw new Error("The confirmation dialog is unavailable. Workspace data was not changed.");
        }
        return window.showAppConfirm(
            `Reset all working data in “${workspaceName}”? A safety backup will be created before anything is cleared. You will then be asked to type RESET. The workspace identity and password protection will remain.`,
            {
                title: "Reset Workspace Data",
                confirmText: "Continue to Reset",
                cancelText: "Keep My Data",
                danger: true
            }
        );
    }

    async function requireTypedConfirmation(workspaceName) {
        if (typeof window.showAppTextConfirm !== "function") {
            throw new Error("The secure text confirmation is unavailable. Workspace data was not changed.");
        }
        return window.showAppTextConfirm(
            `This permanently clears the saved profile details and appearance, tasks, habits, milestones, projects, notes, Password Vault entries, and Focus Mode settings and history for “${workspaceName}”.

A backup is required before reset. Existing backups, backup settings and backup history are kept.`,
            {
                title: "Final Confirmation — Reset Everything",
                confirmText: "Reset Workspace",
                cancelText: "Cancel",
                danger: true,
                inputLabel: "Type RESET in capital letters to continue",
                placeholder: "RESET",
                expectedText: "RESET"
            }
        );
    }

    async function resetWorkspace() {
        const button = byId("reset-workspace-data-btn");
        if (busy || !button) return;

        if (typeof window.isProfileGateActive === "function" && window.isProfileGateActive()) {
            setStatus("Open a workspace before resetting its data.", "warning");
            return;
        }
        if (typeof window.getActiveProfileId !== "function" || typeof window.restoreWorkspaceData !== "function") {
            setStatus("Workspace storage is unavailable. Nothing has been reset.", "error");
            return;
        }
        if (typeof isDatabaseReady === "function" && !isDatabaseReady()) {
            setStatus("Unlock the active workspace before resetting its data.", "warning");
            return;
        }

        const workspaceId = String(window.getActiveProfileId() || "current-user");
        let account = null;
        let workspaceName = workspaceId;
        try {
            account = typeof window.getProfileAccount === "function"
                ? await window.getProfileAccount(workspaceId)
                : null;
            workspaceName = String(account?.workspaceName || account?.name || workspaceId);
        } catch (_) { /* The stable workspace ID is a safe fallback label. */ }

        // Keep the workspace identity visible after reset so the app returns to
        // the dashboard rather than reopening first-run onboarding. Personal
        // fields and content are intentionally returned to safe defaults.
        const resetProfile = {
            id: "current-user",
            name: workspaceName,
            workspaceName,
            subtitle: "Your Personal Command Center",
            goal: "",
            theme: "light",
            visualStyle: "flat-2",
            accentColor: "#2563eb",
            animationsEnabled: true,
            reduceMotion: false,
            avatarDataUrl: "",
            createdAt: account?.createdAt || new Date().toISOString()
        };

        let resetCommitted = false;
        let backupResult = null;

        try {
            const firstConfirmed = await confirmResetStart(workspaceName);
            if (!firstConfirmed) return;
            const typed = await requireTypedConfirmation(workspaceName);
            if (typed !== "RESET") return;

            busy = true;
            button.disabled = true;
            button.textContent = "Creating safety backup…";
            setStatus("Stopping the Focus timer and creating a safety backup. Your data has not been cleared yet.", "info");

            if (typeof window.stopFocusModeForWorkspaceReset !== "function") {
                throw new Error("Focus Mode reset support is missing. Update the application before resetting data.");
            }
            if (typeof window.createAutomaticWorkspaceBackup !== "function") {
                throw new Error("Automatic backup is unavailable. Reset has been cancelled.");
            }

            // Persist an interrupted session in the safety backup before clearing it.
            window.stopFocusModeForWorkspaceReset();
            backupResult = await window.createAutomaticWorkspaceBackup(workspaceName);
            if (!backupResult || !backupResult.filename || !["success", "download-started"].includes(backupResult.status)) {
                throw new Error("The safety backup could not be created. Workspace data was not cleared.");
            }

            const backupDelivery = backupResult.status === "success"
                ? `Backup written to ${backupResult.destination || "the selected folder"}.`
                : `Browser download initiated for ${backupResult.filename}. Confirm the file appears in ${backupResult.destination || "Downloads"}.`;

            button.textContent = "Resetting workspace…";
            setStatus(`${backupDelivery} Clearing workspace records…`, "info");

            // This database operation is atomic across all workspace stores and
            // re-encrypts through the existing workspace key when protection is enabled.
            await window.restoreWorkspaceData({
                profile: [resetProfile],
                tasks: EMPTY_WORKSPACE.tasks,
                habits: EMPTY_WORKSPACE.habits,
                milestones: EMPTY_WORKSPACE.milestones,
                projects: EMPTY_WORKSPACE.projects
            });
            resetCommitted = true;

            // Focus state and history are stored separately from IndexedDB.
            // Clear them only after the atomic workspace-record replacement succeeds.
            if (typeof window.resetFocusModeWorkspaceData === "function") {
                window.resetFocusModeWorkspaceData();
            }

            setStatus("Workspace data reset successfully. Reloading your clean workspace…", "success");
            try {
                await showDialog(
                    `Workspace data has been reset successfully.

Safety backup: ${backupResult.filename}
Backup destination: ${backupResult.destination || "your configured backup location"}

Your workspace name and password protection remain. Backup settings, backup history and existing backup files are preserved.`,
                    { title: "Workspace Reset Complete" }
                );
            } catch (dialogError) {
                console.warn("Reset completed, but the completion dialog could not be shown:", dialogError);
            }
            window.location.reload();
        } catch (error) {
            console.error("Workspace reset failed:", error);
            if (resetCommitted) {
                // The IndexedDB replacement already succeeded. Do not describe
                // a post-commit UI/local-storage issue as a cancelled reset.
                setStatus("Workspace records were reset. A remaining local cleanup step needs attention; reload the app to finish.", "warning");
                try {
                    await showDialog(
                        `Workspace records were reset and the safety backup is available: ${backupResult?.filename || "check Backup & Install"}.

A final local cleanup step reported: ${error.message || "Unknown error"}

The workspace will reload now. If any Focus Mode state remains, use the safety backup to recover it.`,
                        { title: "Workspace Reset — Reload Required", danger: true }
                    );
                } catch (_) { /* Reload still completes the committed reset. */ }
                window.location.reload();
                return;
            }

            setStatus(error.message || "Workspace reset failed. Check the backup and try again.", "error");
            try {
                await showDialog(
                    `Workspace reset was cancelled before workspace records were cleared.

${error.message || "Unknown error"}

The Focus timer may have been stopped while preparing the backup. Your saved workspace records remain unchanged.`,
                    { title: "Workspace Reset Cancelled", danger: true }
                );
            } catch (_) { /* Keep the page usable if the dialog subsystem failed. */ }
        } finally {
            busy = false;
            if (button && document.contains(button)) {
                button.disabled = false;
                button.textContent = "Reset Workspace Data";
            }
        }
    }

    function initializeWorkspaceReset() {
        const button = byId("reset-workspace-data-btn");
        if (!button || button.dataset.resetBound === "true") return;
        button.dataset.resetBound = "true";
        button.addEventListener("click", resetWorkspace);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeWorkspaceReset, { once: true });
    } else {
        initializeWorkspaceReset();
    }
})();
