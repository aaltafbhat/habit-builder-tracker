/* ==========================================
   90-DAY COMMAND CENTER
   APPLICATION INITIALIZATION
   Version 1.5.2 — Windows 8 Classic theme
   ========================================== */

(() => {
    "use strict";

    // ======================================
    // APPLICATION STATE
    // ======================================

    const initializedModules = new Set();

    let workspaceModulesInitialized = false;
    let workspaceInitializationPromise = null;
    let workspaceChangeQueue = Promise.resolve();
    let profileChangeListenerBound = false;
    let workspaceLockSequence = 0;


    // ======================================
    // GLOBAL FUNCTION RESOLVER
    // ======================================

    function getAppFunction(name) {
        const fn = window[name];

        return typeof fn === "function"
            ? fn
            : null;
    }


    async function initializeModule(
        moduleKey,
        functionName,
        required = false
    ) {
        if (initializedModules.has(moduleKey)) {
            return true;
        }

        const fn = getAppFunction(functionName);

        if (!fn) {
            if (required) {
                throw new Error(
                    `${functionName}() is not available.`
                );
            }

            console.warn(
                `Optional module skipped: ${functionName}`
            );

            return false;
        }

        await fn();

        initializedModules.add(moduleKey);

        console.log(
            `Module initialized: ${moduleKey}`
        );

        return true;
    }


    // ======================================
    // DATABASE AND SECURITY CHECKS
    // ======================================

    async function getActiveWorkspaceReadiness() {
        const getActiveProfileId =
            getAppFunction("getActiveProfileId");

        const isProtected =
            getAppFunction("isProfilePasswordProtected");

        const isUnlocked =
            getAppFunction("isProfileUnlocked");

        if (
            !getActiveProfileId ||
            !isProtected ||
            !isUnlocked
        ) {
            throw new Error(
                "Required database security APIs are unavailable."
            );
        }

        const profileId = await getActiveProfileId();

        const protectedProfile =
            await isProtected(profileId);

        if (!protectedProfile) {
            return {
                profileId,
                ready: true,
                protected: false
            };
        }

        const unlocked = isUnlocked(profileId);

        return {
            profileId,
            ready: Boolean(unlocked),
            protected: true
        };
    }


    function assertDatabaseReady() {
        const check = getAppFunction("isDatabaseReady");

        if (!check || !check()) {
            throw new Error(
                "The active profile database is not ready."
            );
        }
    }


    // ======================================
    // HEADER CONFIGURATION
    // ======================================

    function applyHeaderConfiguration() {
        const subtitle =
            document.getElementById("header-subtitle");

        if (subtitle) {
            subtitle.textContent =
                "Your Personal Command Center";
        }
    }


    // ======================================
    // INITIALIZE WORKSPACE MODULES
    // ======================================

    async function initializeWorkspaceModules() {
        if (workspaceModulesInitialized) {
            return true;
        }

        if (workspaceInitializationPromise) {
            return workspaceInitializationPromise;
        }

        workspaceInitializationPromise = (async () => {

            // ----------------------------------
            // STEP 1 — ONBOARDING
            // ----------------------------------

            await initializeModule(
                "onboarding",
                "initializeOnboarding",
                true
            );


            // ----------------------------------
            // STEP 2 — DATABASE
            // ----------------------------------

            assertDatabaseReady();


            // ----------------------------------
            // STEP 3 — DATA TOOLS
            // ----------------------------------

            await initializeModule(
                "data-tools",
                "initializeDataTools"
            );


            // ----------------------------------
            // STEP 4 — TASKS
            // ----------------------------------

            await initializeModule(
                "tasks",
                "initializeTasks",
                true
            );


            // ----------------------------------
            // STEP 5 — HABITS
            // ----------------------------------

            await initializeModule(
                "habits",
                "initializeHabits",
                true
            );


            // ----------------------------------
            // STEP 6 — PROFILE SETTINGS
            // ----------------------------------

            await initializeModule(
                "profile-settings",
                "initializeProfileSettings"
            );


            // ----------------------------------
            // STEP 7 — NOTES & PRIVATE VAULT
            // ----------------------------------

            await initializeModule(
                "notes-vault",
                "initializeNotesVault"
            );


            // ----------------------------------
            // STEP 8 — MILESTONES
            // ----------------------------------

            await initializeModule(
                "milestones",
                "initializeMilestones"
            );


            // ----------------------------------
            // STEP 9 — PROJECTS
            // ----------------------------------

            await initializeModule(
                "projects",
                "initializeProjects"
            );


            // ----------------------------------
            // STEP 10 — REPORTS
            // ----------------------------------

            await initializeModule(
                "reports",
                "initializeReports"
            );


            // ----------------------------------
            // STEP 11 — OVERVIEW DASHBOARD
            // ----------------------------------

            await initializeModule(
                "overview",
                "initializeOverviewDashboard"
            );


            // ----------------------------------
            // STEP 12 — FOCUS MODE
            // ----------------------------------

            await initializeModule(
                "focus-mode",
                "initializeFocusMode"
            );


            // ----------------------------------
            // INITIALIZATION COMPLETE
            // ----------------------------------

            applyHeaderConfiguration();

            workspaceModulesInitialized = true;

            console.log(
                "Workspace modules initialized successfully."
            );

            return true;

        })();

        try {
            return await workspaceInitializationPromise;

        } finally {
            workspaceInitializationPromise = null;
        }
    }


    // ======================================
    // REFRESH DATA AFTER PROFILE SWITCH
    // ======================================

    async function refreshActiveWorkspaceData() {
        assertDatabaseReady();

        // Tasks
        const loadTasks = getAppFunction("loadTasks");

        if (loadTasks) {
            await loadTasks();
        }

        // Habits
        const refreshHabits = getAppFunction("refreshHabits");

        if (refreshHabits) {
            await refreshHabits();
        }

        // Milestones
        const renderMilestones =
            getAppFunction("renderMilestones");

        if (renderMilestones) {
            await renderMilestones();
        }

        // Projects
        const loadProjects = getAppFunction("loadProjects");

        if (loadProjects) {
            await loadProjects();
        }

        // Overview
        const refreshOverview =
            getAppFunction("refreshOverviewDashboard");

        if (refreshOverview) {
            await refreshOverview();
        }

        // Focus Mode
        const refreshFocus =
            getAppFunction("refreshFocusModeForProfile");

        if (refreshFocus) {
            await refreshFocus();
        }

        // Profile appearance and settings
        const refreshProfileSettings =
            getAppFunction("refreshProfileSettings");

        if (refreshProfileSettings) {
            await refreshProfileSettings();
        }

        const refreshNotesVault = getAppFunction("refreshNotesVaultForProfile");
        if (refreshNotesVault) {
            await refreshNotesVault();
        }

        applyHeaderConfiguration();

        console.log(
            "Active workspace data refreshed."
        );

        return true;
    }


    // ======================================
    // HANDLE PROFILE CHANGES
    // ======================================

    async function handleWorkspaceChange(profileId) {
        const readiness =
            await getActiveWorkspaceReadiness();

        // Ignore an outdated event from a previous switch.
        if (
            profileId &&
            String(profileId) !== String(readiness.profileId)
        ) {
            return false;
        }

        // Never load workspace records while locked.
        if (!readiness.ready) {
            console.warn(
                "Workspace remains locked. Data loading skipped."
            );

            return false;
        }

        assertDatabaseReady();

        if (!workspaceModulesInitialized) {
            // First initialization after unlocking.
            return initializeWorkspaceModules();
        }

        return refreshActiveWorkspaceData();
    }


    // ======================================
    // HANDLE PROFILE LOCK
    // ======================================

    function runWorkspaceCleanup(name) {
        const cleanup = getAppFunction(name);
        if (!cleanup) return;

        try {
            cleanup();
        } catch (error) {
            console.warn(`${name}() failed during profile lock:`, error);
        }
    }


    function clearLockedWorkspaceCaches() {
        // Invalidate in-flight module reads before clearing their caches.
        if (typeof taskLoadSequence !== "undefined") {
            taskLoadSequence += 1;
        }
        if (typeof taskItems !== "undefined") taskItems = [];
        if (typeof taskItemsProfileId !== "undefined") taskItemsProfileId = null;

        if (typeof habitsLoadSequence !== "undefined") habitsLoadSequence += 1;
        if (typeof habitsCache !== "undefined") habitsCache = [];
        if (typeof habitsCacheProfileId !== "undefined") habitsCacheProfileId = null;
        runWorkspaceCleanup("resetHabitForm");
        runWorkspaceCleanup("renderHabits");

        if (typeof milestoneRenderSequence !== "undefined") milestoneRenderSequence += 1;
        if (typeof milestoneViewProfileId !== "undefined") milestoneViewProfileId = null;
        runWorkspaceCleanup("clearMilestoneWorkspaceView");

        if (typeof projectsLoadSequence !== "undefined") projectsLoadSequence += 1;
        if (typeof projectsViewProfileId !== "undefined") projectsViewProfileId = null;
        if (typeof allProjects !== "undefined") allProjects = [];
        runWorkspaceCleanup("clearProjectWorkspaceView");

        if (typeof reportRefreshSequence !== "undefined") reportRefreshSequence += 1;
        if (typeof reportCacheProfileId !== "undefined") reportCacheProfileId = null;
        runWorkspaceCleanup("clearReportsWorkspaceView");

        if (typeof overviewRefreshSequence !== "undefined") overviewRefreshSequence += 1;
        if (typeof overviewViewProfileId !== "undefined") overviewViewProfileId = null;
        runWorkspaceCleanup("clearOverviewDashboardView");

        // Optional module-specific cleanup hooks are used when implemented.
        const optionalClearers = [
            "clearFocusModeWorkspaceView",
            "clearProfileSettingsWorkspaceView",
            "clearNotesVaultWorkspaceView"
        ];

        optionalClearers.forEach(runWorkspaceCleanup);

        // Reset task-related controls and rendered collections after clearing the cache.
        [
            "resetTaskForm",
            "renderTasks",
            "updateTaskStats",
            "renderOverdueTasks",
            "renderDailySchedule"
        ].forEach(runWorkspaceCleanup);
    }

    async function handleWorkspaceLock(profileId) {
        const readiness = await getActiveWorkspaceReadiness();

        // Ignore a stale lock event after the user has switched elsewhere.
        if (
            profileId &&
            String(profileId) !== String(readiness.profileId)
        ) {
            return false;
        }

        // Ignore a delayed lock event if this workspace has already been unlocked.
        if (!readiness.protected || readiness.ready) {
            return false;
        }

        workspaceLockSequence += 1;
        clearLockedWorkspaceCaches();

        console.log(
            `Workspace lock cleanup applied (${workspaceLockSequence}).`
        );

        return true;
    }


    // ======================================
    // PROFILE CHANGE EVENT LISTENER
    // ======================================

    function bindProfileChangeListener() {
        if (profileChangeListenerBound) {
            return;
        }

        window.addEventListener(
            "hbt:profile-changed",
            event => {

                const profileId =
                    event.detail?.profileId || null;

                // Serialize rapid profile switches.
                workspaceChangeQueue =
                    workspaceChangeQueue
                        .then(() =>
                            handleWorkspaceChange(profileId)
                        )
                        .catch(async error => {
                            console.error(
                                "Workspace refresh failed:",
                                error
                            );

                            // A lock can interrupt an in-flight refresh. Treat that as
                            // a security transition rather than an initialization error.
                            try {
                                const readiness =
                                    await getActiveWorkspaceReadiness();

                                if (!readiness.ready) {
                                    await handleWorkspaceLock(readiness.profileId);
                                    return;
                                }
                            } catch (readinessError) {
                                console.warn(
                                    "Could not confirm workspace readiness after refresh failure:",
                                    readinessError
                                );
                            }

                            showInitializationError(error);
                        });

            }
        );

        window.addEventListener(
            "hbt:profile-signed-out",
            () => {
                workspaceChangeQueue = workspaceChangeQueue
                    .then(() => {
                        clearLockedWorkspaceCaches();
                        console.log("Signed-out workspace caches cleared.");
                    })
                    .catch(error => {
                        console.error("Signed-out workspace cleanup failed:", error);
                    });
            }
        );

        window.addEventListener(
            "hbt:profile-locked",
            event => {
                const profileId = event.detail?.profileId || null;

                // Serialize lock cleanup with any profile refresh already in progress.
                workspaceChangeQueue = workspaceChangeQueue
                    .then(() => handleWorkspaceLock(profileId))
                    .catch(error => {
                        // Lock cleanup must not expose workspace data or trigger a new
                        // data load. Log cleanup failures without showing a data dialog.
                        console.error("Workspace lock cleanup failed:", error);
                    });
            }
        );

        profileChangeListenerBound = true;
    }


    // ======================================
    // ERROR HANDLING
    // ======================================

    async function showInitializationError(error) {
        const message =
            "Application initialization failed:\n" +
            (error?.name || "Error") +
            ": " +
            (error?.message || "Unknown error");

        console.error(
            "Command Center error:",
            error
        );

        const showDialog =
            getAppFunction("showAppDialog");

        if (showDialog) {
            try {
                await showDialog(message, {
                    title: "Initialization Error"
                });

                return;

            } catch (dialogError) {
                console.error(
                    "Error dialog failed:",
                    dialogError
                );
            }
        }

        window.alert(message);
    }


    // ======================================
    // APPLICATION INITIALIZATION
    // ======================================

    async function initializeApplication() {
        try {

            console.log(
                "Initializing 90-Day Command Center..."
            );


            // ----------------------------------
            // STEP 1 — PROFILE CHANGE LISTENER
            // ----------------------------------

            bindProfileChangeListener();


            // ----------------------------------
            // STEP 2 — PROFILE MANAGER
            // ----------------------------------

            const initializeProfileManager =
                getAppFunction("initializeProfileManager");

            if (!initializeProfileManager) {
                throw new Error(
                    "Profile Manager is unavailable. " +
                    "Check that profile-manager.js is loaded after database.js."
                );
            }

            await initializeProfileManager();

            const profileGateActive = getAppFunction("isProfileGateActive");
            if (profileGateActive && profileGateActive()) {
                console.log("Profile selection or authentication is required before opening a workspace.");
                return true;
            }


            // ----------------------------------
            // STEP 3 — DATABASE READINESS
            // ----------------------------------

            assertDatabaseReady();


            // ----------------------------------
            // STEP 4 — ENCRYPTION STATUS
            // ----------------------------------

            const readiness =
                await getActiveWorkspaceReadiness();

            if (!readiness.ready) {

                console.warn(
                    "Active profile is locked. " +
                    "Waiting for password authentication."
                );

                // Profile Manager displays the unlock screen.
                // Workspace modules must remain uninitialized
                // until the profile is unlocked.

                return true;
            }


            // ----------------------------------
            // STEP 5 — WORKSPACE MODULES
            // ----------------------------------

            await initializeWorkspaceModules();


            // ----------------------------------
            // INITIALIZATION COMPLETE
            // ----------------------------------

            console.log(
                "90-Day Command Center initialized successfully."
            );

            return true;

        } catch (error) {

            await showInitializationError(error);

            return false;
        }
    }


    // ======================================
    // START APPLICATION
    // ======================================

    function startApplication() {

        if (window.commandCenterInitializationPromise) {
            return window.commandCenterInitializationPromise;
        }

        window.commandCenterInitializationPromise =
            initializeApplication();

        return window.commandCenterInitializationPromise;
    }


    // ======================================
    // PUBLIC APPLICATION API
    // ======================================

    window.initializeApplication =
        initializeApplication;

    window.activateWorkspaceAfterProfileLogin = async function() {
        const readiness = await getActiveWorkspaceReadiness();
        if (!readiness.ready) {
            throw new Error("The selected profile is still locked.");
        }
        assertDatabaseReady();
        if (!workspaceModulesInitialized) {
            return initializeWorkspaceModules();
        }
        return refreshActiveWorkspaceData();
    };

    window.startApplication =
        startApplication;


    // ======================================
    // DOM READY
    // ======================================

    if (document.readyState === "loading") {

        document.addEventListener(
            "DOMContentLoaded",
            startApplication,
            { once: true }
        );

    } else {

        startApplication();

    }

})();