/* ==========================================
   HABIT BUILDER TRACKER
   FOCUS MODE v1.3.0
   Focus Timer, Motivation & Personal Goal
========================================== */

(() => {

    const STORAGE_KEY_PREFIX = "hbt-focus-state-v1";
    const HISTORY_KEY_PREFIX = "hbt-focus-history-v1";
    const LEGACY_STORAGE_KEY = STORAGE_KEY_PREFIX;
    const LEGACY_HISTORY_KEY = HISTORY_KEY_PREFIX;

    function resolveWorkspaceId() {
        try {
            if (typeof window.getActiveProfileId === "function") {
                return String(window.getActiveProfileId() || "current-user");
            }
            return String(localStorage.getItem("cc-active-profile-id") || "current-user");
        } catch (_) {
            return "current-user";
        }
    }

    function sanitizeWorkspaceId(value) {
        return String(value || "current-user").replace(/[^a-zA-Z0-9_-]/g, "_");
    }

    let activeWorkspaceStorageId = sanitizeWorkspaceId(resolveWorkspaceId());

    function focusStateStorageKey(profileId = activeWorkspaceStorageId) {
        return `${STORAGE_KEY_PREFIX}:${sanitizeWorkspaceId(profileId)}`;
    }

    function focusHistoryStorageKey(profileId = activeWorkspaceStorageId) {
        return `${HISTORY_KEY_PREFIX}:${sanitizeWorkspaceId(profileId)}`;
    }

    function focusHistoryCollapseKey(profileId = activeWorkspaceStorageId) {
        return `hbt-focus-history-collapsed-v1:${sanitizeWorkspaceId(profileId)}`;
    }

    function migrateLegacyFocusStorage(profileId = activeWorkspaceStorageId) {
        try {
            const scopedStateKey = focusStateStorageKey(profileId);
            const scopedHistoryKey = focusHistoryStorageKey(profileId);
            const legacyState = localStorage.getItem(LEGACY_STORAGE_KEY);
            const legacyHistory = localStorage.getItem(LEGACY_HISTORY_KEY);
            if (!localStorage.getItem(scopedStateKey) && legacyState) {
                localStorage.setItem(scopedStateKey, legacyState);
            }
            if (!localStorage.getItem(scopedHistoryKey) && legacyHistory) {
                localStorage.setItem(scopedHistoryKey, legacyHistory);
            }
            // The legacy keys were shared by all workspaces. Migrate them once to
            // the last active workspace so other workspaces cannot inherit them.
            if (legacyState) localStorage.removeItem(LEGACY_STORAGE_KEY);
            if (legacyHistory) localStorage.removeItem(LEGACY_HISTORY_KEY);
        } catch (error) {
            console.warn("Focus data workspace migration could not complete:", error);
        }
    }

    migrateLegacyFocusStorage();

    const QUOTES = [
        {
            text: "Small disciplines repeated with consistency every day lead to great achievements.",
            author: "John C. Maxwell",
            category: "Consistency"
        },
        {
            text: "The secret of getting ahead is getting started.",
            author: "Mark Twain",
            category: "Action"
        },
        {
            text: "It always seems impossible until it's done.",
            author: "Nelson Mandela",
            category: "Persistence"
        },
        {
            text: "Focus on being productive instead of busy.",
            author: "Tim Ferriss",
            category: "Focus"
        },
        {
            text: "Well done is better than well said.",
            author: "Benjamin Franklin",
            category: "Execution"
        },
        {
            text: "The future depends on what you do today.",
            author: "Mahatma Gandhi",
            category: "Action"
        }
    ];

    const DEFAULTS = {
        focus: 25,
        short: 5,
        long: 15
    };

    let state = loadState();

    let interval = null;

    let audioContext = null;

    let focusPageObserver = null;


    // Focus Session History collapse is stored per workspace using the same
    // storage identity as the timer and session history.

    function syncFocusHistoryCollapseUI() {
        const content = $("focus-history-content");
        const button = $("focus-history-toggle");
        if (!content || !button) return;

        let collapsed = false;
        try { collapsed = localStorage.getItem(focusHistoryCollapseKey()) === "1"; }
        catch (_) { /* Keep history expanded when storage is unavailable. */ }

        // Only the session groups are collapsed; the title and description remain visible.
        content.hidden = collapsed;
        button.setAttribute("aria-expanded", String(!collapsed));
        button.innerHTML = collapsed
            ? 'Expand history <span aria-hidden="true">▾</span>'
            : 'Collapse history <span aria-hidden="true">▴</span>';
    }

    function bindFocusHistoryCollapse() {
        const button = $("focus-history-toggle");
        if (!button || button.dataset.collapseBound === "true") {
            syncFocusHistoryCollapseUI();
            return;
        }

        button.dataset.collapseBound = "true";
        button.addEventListener("click", () => {
            const content = $("focus-history-content");
            if (!content) return;
            try {
                localStorage.setItem(focusHistoryCollapseKey(), content.hidden ? "0" : "1");
            } catch (error) {
                console.warn("Could not save Focus Session History preference:", error);
            }
            syncFocusHistoryCollapseUI();
        });
        syncFocusHistoryCollapseUI();
    }


    // ======================================
    // LOAD STATE
    // ======================================

    function loadState() {

        try {

            const saved = JSON.parse(
                localStorage.getItem(focusStateStorageKey()) || "{}"
            );

            const durations = {
                ...DEFAULTS,
                ...(saved.durations || {})
            };

            Object.keys(durations).forEach(key => {

                durations[key] = Math.min(
                    180,
                    Math.max(
                        1,
                        Number(durations[key]) || DEFAULTS[key]
                    )
                );

            });

            return {

                mode: ["focus", "short", "long"].includes(saved.mode)
                    ? saved.mode
                    : "focus",

                durations,

                customFocusMinutes: Math.min(59, Math.max(0, Number(saved.customFocusMinutes) || 0)),

                remaining: Number.isFinite(saved.remaining)
                    ? Math.max(0, saved.remaining)
                    : (Math.min(59, Math.max(0, Number(saved.customFocusMinutes) || 0)) || durations.focus) * 60,

                running: Boolean(saved.running),

                endAt: Number(saved.endAt) || null,

                sessionActive: Boolean(
                    saved.sessionActive || saved.running
                ),

                sessionElapsed: Math.max(
                    0,
                    Number(saved.sessionElapsed) || 0
                ),

                sessionStartedAt:
                    Number(saved.sessionStartedAt) || null,

                sessionTaskId:
                    saved.sessionTaskId || "",

                sessionTaskName:
                    saved.sessionTaskName || "",

                totalFocusSeconds: Math.max(
                    0,
                    Number(saved.totalFocusSeconds) || 0
                ),

                completedSessions: Math.max(
                    0,
                    Number(saved.completedSessions) || 0
                ),

                browserNotifications:
                    Boolean(saved.browserNotifications),

                inAppNotifications:
                    saved.inAppNotifications !== false,

                soundEnabled:
                    Boolean(saved.soundEnabled),

                linkedTask:
                    saved.linkedTask || ""

            };

        } catch (error) {

            console.warn(
                "Could not load Focus Mode state:",
                error
            );

            return {

                mode: "focus",

                durations: { ...DEFAULTS },

                customFocusMinutes: 0,

                remaining: 1500,

                running: false,

                endAt: null,

                sessionActive: false,

                sessionElapsed: 0,

                sessionStartedAt: null,

                sessionTaskId: "",

                sessionTaskName: "",

                totalFocusSeconds: 0,

                completedSessions: 0,

                browserNotifications: false,

                inAppNotifications: true,

                soundEnabled: false,

                linkedTask: ""

            };

        }

    }


    // ======================================
    // SAVE STATE
    // ======================================

    function saveState() {

        try {

            localStorage.setItem(
                focusStateStorageKey(),
                JSON.stringify(state)
            );

        } catch (error) {

            console.warn(
                "Focus state save failed:",
                error
            );

        }

    }


    // ======================================
    // SESSION HISTORY STORAGE
    // ======================================

    function getHistory() {

        try {

            return JSON.parse(
                localStorage.getItem(focusHistoryStorageKey()) || "[]"
            );

        } catch (_) {

            return [];

        }

    }


    function saveHistory(rows) {

        try {

            localStorage.setItem(
                focusHistoryStorageKey(),
                JSON.stringify(rows.slice(0, 500))
            );

        } catch (error) {

            console.warn(
                "Focus history save failed:",
                error
            );

        }

    }


    // ======================================
    // HELPERS
    // ======================================

    const $ = id =>
        document.getElementById(id);


    // The Focus slider is an explicit one-off override:
    // 0 = use the saved Focus preset; 1–59 = use a custom Focus session.
    // Short and Long Break always use their saved preset durations.
    const activeFocusMinutes = () => {
        const customMinutes = Number(state.customFocusMinutes) || 0;
        return customMinutes > 0
            ? Math.min(59, Math.max(1, customMinutes))
            : state.durations.focus;
    };

    const duration = mode =>
        (mode === "focus" ? activeFocusMinutes() : state.durations[mode]) * 60;


    const formatTime = seconds => {

        const value = Math.max(
            0,
            Math.ceil(seconds)
        );

        const minutes = Math.floor(value / 60);

        const remainingSeconds = value % 60;

        return (
            String(minutes).padStart(2, "0") +
            ":" +
            String(remainingSeconds).padStart(2, "0")
        );

    };


    const formatDuration = seconds => {

        const hours = Math.floor(seconds / 3600);

        const minutes = Math.floor(
            (seconds % 3600) / 60
        );

        return `${hours}h ${minutes}m`;

    };


    // ======================================
    // MOTIVATION & PERSONAL GOAL LAYOUT
    // ======================================

 function addFocusHighlightStyles() {

    let style = $("focus-highlight-styles");

    if (!style) {
        style = document.createElement("style");
        style.id = "focus-highlight-styles";
        document.head.append(style);
    }

    style.textContent = `

        /* DAILY MOTIVATION STRIP */

        .focus-highlight-grid {
            display: block !important;
            margin: 0 0 18px;
        }

        .focus-quote-feature-card {
            display: grid !important;

            grid-template-columns:
                150px
                minmax(0, 1fr)
                auto;

            align-items: center;
            column-gap: 18px;

            min-height: 82px;
            padding: 14px 20px !important;

            margin: 0 !important;

            background: var(--surface) !important;

            border: 1px solid var(--border) !important;
            border-left: 3px solid var(--primary) !important;

            border-radius: 11px !important;

            box-shadow: none !important;
        }

        .focus-quote-feature-card > .section-eyebrow {
            grid-column: 1;
            grid-row: 1;

            margin: 0;

            font-size: 10px;
            font-weight: 800;
            letter-spacing: 1px;

            white-space: nowrap;
        }

        .focus-quote-feature-card blockquote {
            grid-column: 2;
            grid-row: 1;

            margin: 0 !important;
            padding: 0 !important;

            border: 0 !important;
            background: transparent !important;

            color: var(--text) !important;

            font-size: 16px !important;
            font-weight: 700 !important;
            line-height: 1.45 !important;
        }

        .focus-quote-feature-card .focus-quote-author {
            grid-column: 3;
            grid-row: 1;

            margin: 0 !important;

            color: var(--text-secondary);

            font-size: 12px;
            white-space: nowrap;
        }

        .focus-quote-feature-card .focus-quote-category {
            display: none !important;
        }

        /* GROUPED SESSION HISTORY */

        .focus-history-group {
            border-bottom: 1px solid var(--border);
            padding: 15px 0;
        }

        .focus-history-group:last-child {
            border-bottom: 0;
        }

        .focus-history-group-heading {
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 8px;

            margin-bottom: 9px;
        }

        .focus-history-group-title {
            color: var(--text);
            font-size: 14px;
            font-weight: 800;
        }

        .focus-history-group-summary {
            color: var(--text-secondary);
            font-size: 11px;
            margin-top: 3px;
        }

        .focus-history-group-total {
            color: var(--primary);
            font-size: 13px;
            font-weight: 800;
            white-space: nowrap;
        }

        .focus-history-session {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;

            padding: 9px 12px;
            margin-top: 6px;

            border-radius: 8px;

            background: var(--background);
        }

        .focus-history-session-meta {
            color: var(--text-secondary);
            font-size: 11px;
            line-height: 1.6;
        }

        .focus-history-session-time {
            color: var(--primary);
            font-size: 12px;
            font-weight: 800;
            white-space: nowrap;
        }

        @media (max-width: 700px) {

            .focus-quote-feature-card {
                grid-template-columns: 1fr;
                row-gap: 7px;
                padding: 15px 17px !important;
            }

            .focus-quote-feature-card > .section-eyebrow,
            .focus-quote-feature-card blockquote,
            .focus-quote-feature-card .focus-quote-author {
                grid-column: 1;
                grid-row: auto;
            }

            .focus-quote-feature-card .focus-quote-author {
                white-space: normal;
            }

        }

    `;

}

function ensureFocusHighlights() {

    const page = $("focus-mode");

    if (!page) return;

    const heading = page.querySelector(".page-heading");

    const focusLayout = page.querySelector(".focus-layout");

    if (!heading || !focusLayout) return;

    addFocusHighlightStyles();

    let grid = $("focus-highlight-grid");

    if (!grid) {

        grid = document.createElement("div");

        grid.id = "focus-highlight-grid";

        grid.className = "focus-highlight-grid";

        heading.after(grid);

    }

    // Only one full-width Motivation card.
    grid.style.gridTemplateColumns = "";
	grid.style.display = "block";

    let quoteCard = page.querySelector(".focus-quote-card");

    if (!quoteCard) {

        quoteCard = document.createElement("article");

        quoteCard.className =
            "content-card focus-quote-card";

    }

    quoteCard.classList.add(
        "focus-quote-feature-card"
    );

    let label = quoteCard.querySelector(".section-eyebrow");

    if (!label) {

        label = document.createElement("span");

        label.className = "section-eyebrow";

        quoteCard.prepend(label);

    }

    label.textContent = "TODAY'S MOTIVATION";

    let quote = $("focus-quote-text");

    if (!quote) {

        quote = document.createElement("blockquote");

        quote.id = "focus-quote-text";

        quoteCard.append(quote);

    }

    let author = $("focus-quote-author");

    if (!author) {

        author = document.createElement("p");

        author.id = "focus-quote-author";

        author.className = "focus-quote-author";

        quote.after(author);

    }

    let category = $("focus-quote-category");

    if (!category) {

        category = document.createElement("small");

        category.id = "focus-quote-category";

        category.className = "focus-quote-category";

        author.after(category);

    }

    // Move Motivation above the timer.
    if (quoteCard.parentElement !== grid) {
        grid.append(quoteCard);
    }

    // Remove the unwanted Personal Goal display card.
    document.querySelectorAll(
        "#focus-personal-goal-card, .focus-personal-goal-card"
    ).forEach(card => card.remove());

}

    // ======================================
    // DAILY MOTIVATION
    // ======================================

    function getDailyQuote() {

        const day = Math.floor(
            Date.now() / 86400000
        );

        return QUOTES[
            ((day % QUOTES.length) + QUOTES.length) %
            QUOTES.length
        ];

    }


    function renderPersonalGoal(quote = getDailyQuote()) {

        const input = $("profile-goal");

        const display = $("focus-personal-goal-text");

        const note = $("focus-personal-goal-note");

        if (!display) {
            return;
        }

        const personalGoal =
            input?.value?.trim() || "";

        if (personalGoal) {

            display.textContent = personalGoal;

            if (note) {

                note.textContent =
                    "Your saved goal from Profile & Appearance.";

            }

        } else {

            display.textContent =
                `“${quote.text}”`;

            if (note) {

                note.textContent =
                    `No personal goal entered. Today's reminder — ${quote.author}.`;

            }

        }

    }


    function renderQuote(quote = getDailyQuote()) {

        if ($("daily-quote-text")) {

            $("daily-quote-text").textContent =
                `“${quote.text}”`;

        }

        if ($("daily-quote-author")) {

            $("daily-quote-author").textContent =
                `— ${quote.author}`;

        }

        if ($("daily-quote-category")) {

            $("daily-quote-category").textContent =
                quote.category;

        }

        if ($("focus-quote-text")) {

            $("focus-quote-text").textContent =
                `“${quote.text}”`;

        }

        if ($("focus-quote-author")) {

            $("focus-quote-author").textContent =
                `— ${quote.author}`;

        }

        if ($("focus-quote-category")) {

            $("focus-quote-category").textContent =
                quote.category;

        }
    }


    // ======================================
    // WEB AUDIO SOUND SYSTEM
    // ======================================

    function getAudioContext() {

        const AudioContextClass =
            window.AudioContext ||
            window.webkitAudioContext;

        if (!AudioContextClass) {
            return null;
        }

        try {

            if (
                !audioContext ||
                audioContext.state === "closed"
            ) {

                audioContext = new AudioContextClass();

            }

            return audioContext;

        } catch (error) {

            console.warn(
                "Focus audio unavailable:",
                error
            );

            return null;

        }

    }


    function resumeAudioContext(ctx) {

        if (!ctx) {
            return Promise.resolve();
        }

        try {

            if (ctx.state === "suspended") {
                return ctx.resume();
            }

            return Promise.resolve();

        } catch (error) {

            return Promise.reject(error);

        }

    }


    function scheduleFocusTone(
        ctx,
        frequency,
        startAt,
        length,
        volume = 0.025
    ) {

        if (!ctx || ctx.state === "closed") {
            return;
        }

        try {

            const oscillator = ctx.createOscillator();

            const gain = ctx.createGain();

            oscillator.type = "sine";

            oscillator.frequency.setValueAtTime(
                frequency,
                startAt
            );

            gain.gain.setValueAtTime(
                0.0001,
                startAt
            );

            gain.gain.exponentialRampToValueAtTime(
                volume,
                startAt + 0.008
            );

            gain.gain.exponentialRampToValueAtTime(
                0.0001,
                startAt + length
            );

            oscillator.connect(gain);

            gain.connect(ctx.destination);

            oscillator.start(startAt);

            oscillator.stop(
                startAt + length + 0.025
            );

        } catch (error) {

            console.warn(
                "Could not schedule focus sound:",
                error
            );

        }

    }


    function playTickPair() {

        if (!state.soundEnabled) {
            return;
        }

        const ctx = getAudioContext();

        if (!ctx) {
            return;
        }

        resumeAudioContext(ctx)
            .then(() => {

                if (
                    !state.soundEnabled ||
                    ctx.state !== "running"
                ) {
                    return;
                }

                const startAt =
                    ctx.currentTime + 0.015;

                scheduleFocusTone(
                    ctx,
                    1050,
                    startAt,
                    0.035,
                    0.022
                );

                scheduleFocusTone(
                    ctx,
                    820,
                    startAt + 0.085,
                    0.035,
                    0.022
                );

            })
            .catch(error => {

                console.warn(
                    "Focus tick could not play:",
                    error
                );

            });

    }


    function playCompletionChime() {

        if (!state.soundEnabled) {
            return;
        }

        const ctx = getAudioContext();

        if (!ctx) {
            return;
        }

        resumeAudioContext(ctx)
            .then(() => {

                if (
                    !state.soundEnabled ||
                    ctx.state !== "running"
                ) {
                    return;
                }

                const startAt =
                    ctx.currentTime + 0.02;

                const notes = [
                    659.25,
                    783.99,
                    987.77
                ];

                notes.forEach((frequency, index) => {

                    scheduleFocusTone(
                        ctx,
                        frequency,
                        startAt + index * 0.16,
                        0.19,
                        0.045
                    );

                });

            })
            .catch(error => {

                console.warn(
                    "Completion chime could not play:",
                    error
                );

            });

    }


    // ======================================
    // NOTIFICATIONS
    // ======================================

    function showToast(
        title,
        message,
        kind = "success"
    ) {

        if (!state.inAppNotifications) {
            return;
        }

        let host = $("hbt-toast-host");

        if (!host) {

            host = document.createElement("div");

            host.id = "hbt-toast-host";

            host.className = "hbt-toast-host";

            host.setAttribute(
                "aria-live",
                "polite"
            );

            document.body.append(host);

        }

        const toast =
            document.createElement("div");

        toast.className =
            `hbt-toast hbt-toast-${kind}`;

        const strong =
            document.createElement("strong");

        strong.textContent = title;

        const span =
            document.createElement("span");

        span.textContent = message;

        toast.append(strong, span);

        host.append(toast);

        setTimeout(
            () => toast.classList.add("visible"),
            10
        );

        setTimeout(() => {

            toast.classList.remove("visible");

            setTimeout(
                () => toast.remove(),
                250
            );

        }, 4200);

    }


    function notify(title, message) {

        showToast(title, message);

        if (
            state.browserNotifications &&
            "Notification" in window &&
            Notification.permission === "granted"
        ) {

            try {

                new Notification(title, {
                    body: message,
                    icon: "icons/icon-192.png",
                    tag: "hbt-focus"
                });

            } catch (error) {

                console.warn(
                    "Browser notification failed:",
                    error
                );

            }

        }

    }


    // ======================================
    // ELAPSED TIME
    // ======================================

    function currentElapsed() {

        if (
            state.running &&
            state.sessionStartedAt
        ) {

            return state.sessionElapsed +
                Math.max(
                    0,
                    Math.floor(
                        (Date.now() - state.sessionStartedAt) / 1000
                    )
                );

        }

        return state.sessionElapsed;

    }


    // ======================================
    // FOCUS TIMER NOTIFICATION STATE
    // ======================================

    function getFocusTimerNotificationState() {
        const remainingSeconds = state.running && state.endAt
            ? Math.max(0, Math.ceil((state.endAt - Date.now()) / 1000))
            : Math.max(0, Number(state.remaining) || 0);

        const modeLabel = state.mode === "focus"
            ? (Number(state.customFocusMinutes) > 0 ? "Custom focus session" : "Focus session")
            : state.mode === "short" ? "Short break" : "Long break";

        return {
            active: Boolean(state.sessionActive || state.running),
            running: Boolean(state.running),
            mode: state.mode,
            modeLabel,
            remainingSeconds,
            durationSeconds: Math.max(1, duration(state.mode)),
            taskName: String(state.sessionTaskName || "").trim(),
            customFocus: state.mode === "focus" && Number(state.customFocusMinutes) > 0
        };
    }

    function publishFocusTimerNotificationState() {
        const snapshot = getFocusTimerNotificationState();
        window.dispatchEvent(new CustomEvent("hbt:focus-timer-state", { detail: snapshot }));
    }


    // ======================================
    // UPDATE USER INTERFACE
    // ======================================

    function updateUI(options = {}) {

        const remaining =
            state.running && state.endAt
                ? Math.max(
                    0,
                    Math.ceil(
                        (state.endAt - Date.now()) / 1000
                    )
                )
                : state.remaining;


        if ($("focus-time")) {

            $("focus-time").textContent =
                formatTime(remaining);

        }


        if ($("focus-mode-label")) {

            $("focus-mode-label").textContent =
                state.mode === "focus"
                    ? (Number(state.customFocusMinutes) > 0
                        ? "Custom focus session"
                        : "Focus session")
                    : state.mode === "short"
                        ? "Short break"
                        : "Long break";

        }


        if ($("focus-start-btn")) {

            $("focus-start-btn").textContent =
                state.running
                    ? "Pause"
                    : state.sessionActive
                        ? "Resume"
                        : "Start " + (
                            state.mode === "focus"
                                ? "focus"
                                : "break"
                        );

        }


        if ($("focus-session-count")) {

            $("focus-session-count").textContent =
                state.completedSessions;

        }


        if ($("focus-total-time")) {

            $("focus-total-time").textContent =
                formatDuration(state.totalFocusSeconds);

        }


        if ($("dashboard-focus-time")) {

            $("dashboard-focus-time").textContent =
                formatTime(remaining);

        }


        if ($("dashboard-focus-status")) {

            $("dashboard-focus-status").textContent =
                state.running
                    ? "Session in progress"
                    : "Ready when you are";

        }


        if ($("focus-linked-task")) {

            $("focus-linked-task").disabled =
                state.sessionActive;

        }


        if ($("focus-sound-toggle")) {

            $("focus-sound-toggle").textContent =
                state.soundEnabled
                    ? "Sound: On"
                    : "Sound: Muted";

            $("focus-sound-toggle").setAttribute(
                "aria-pressed",
                String(state.soundEnabled)
            );

        }


        if ($("focus-sounds-enabled")) {

            $("focus-sounds-enabled").checked =
                state.soundEnabled;

        }


        const customSlider = $("focus-custom-slider");
        const customSliderValue = $("focus-custom-slider-value");
        const customMinutes = Math.max(0, Math.min(59, Number(state.customFocusMinutes) || 0));

        const customDurationControl = $("focus-custom-duration-control");
        if (customDurationControl) {
            customDurationControl.classList.toggle("is-custom-active", customMinutes > 0);
            customDurationControl.classList.toggle("is-using-preset", customMinutes === 0);
        }

        if (customSlider) {
            customSlider.value = String(customMinutes);
            customSlider.disabled = state.sessionActive;
            customSlider.setAttribute(
                "aria-valuetext",
                customMinutes > 0
                    ? `Custom Focus session, ${customMinutes} minutes`
                    : `Default Focus timer, ${state.durations.focus} minutes`
            );
        }

        if (customSliderValue) {
            customSliderValue.textContent = customMinutes > 0
                ? `Custom session · ${customMinutes} min`
                : `Default timer · ${state.durations.focus} min`;
        }

        document.querySelectorAll(
            "[data-focus-mode]"
        ).forEach(button => {

            button.classList.toggle(
                "selected",
                button.dataset.focusMode === state.mode
            );

            button.disabled = state.sessionActive;

        });


        const progress =
            1 - remaining / duration(state.mode);


        [
            "focus-progress-ring",
            "dashboard-focus-progress"
        ].forEach(id => {

            const element = $(id);

            if (element) {

                element.style.setProperty(
                    "--focus-progress",
                    `${Math.max(0, Math.min(1, progress)) * 100}%`
                );

            }

        });


        [
            "focus-custom-minutes",
            "focus-short-minutes",
            "focus-long-minutes",
            "focus-apply-custom"
        ].forEach(id => {

            if ($(id)) {
                $(id).disabled = state.sessionActive;
            }

        });


        if (options.renderHistory !== false) {
            renderHistory();
        }
        syncFocusHistoryCollapseUI();

        // Keep the header notification centre synchronized with Focus Mode.
        // This publishes active, paused, resumed, reset and completed states.
        publishFocusTimerNotificationState();

    }


    // ======================================
    // SESSION HISTORY
    // ======================================

    function appendHistory(status, seconds) {

        if (seconds <= 0) {
            return;
        }

        const row = {

            id:
                `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,

            date: new Date().toISOString(),

            mode: state.mode,

            taskId:
                state.mode === "focus"
                    ? state.sessionTaskId
                    : "",

            taskName:
                state.mode === "focus"
                    ? (
                        state.sessionTaskName ||
                        "Unlinked focus session"
                    )
                    : "—",

            durationSeconds: Math.max(
                0,
                Math.round(seconds)
            ),

            status

        };


        const rows = getHistory();

        rows.unshift(row);

        saveHistory(rows);


        if (state.mode === "focus") {

            state.totalFocusSeconds +=
                row.durationSeconds;

        }

    }


    function clearSession() {

        state.running = false;

        state.endAt = null;

        state.sessionActive = false;

        state.sessionElapsed = 0;

        state.sessionStartedAt = null;

        state.sessionTaskId = "";

        state.sessionTaskName = "";

    }


    // Stop the active or paused session before a workspace is backed up and locked.
    // This is intentionally idempotent because both the sign-out action and the
    // profile-locked lifecycle may call it during the same sign-out sequence.
    function stopFocusForSignOut() {
        const wasActive = Boolean(state.sessionActive || state.running);
        const elapsed = wasActive ? currentElapsed() : 0;

        stopTicker();

        if (wasActive && elapsed > 0) {
            appendHistory("Stopped — signed out", elapsed);
        }

        state.running = false;
        state.endAt = null;
        state.remaining = duration(state.mode);
        clearSession();

        if (audioContext && audioContext.state !== "closed") {
            try { audioContext.suspend().catch(() => {}); } catch (_) { /* Ignore audio shutdown errors. */ }
        }

        saveState();
        updateUI();
        return wasActive;
    }


    function stopFocusForWorkspaceReset() {
        const wasActive = Boolean(state.sessionActive || state.running);
        const elapsed = wasActive ? currentElapsed() : 0;
        stopTicker();
        if (wasActive && elapsed > 0) {
            appendHistory("Stopped — workspace reset", elapsed);
        }
        state.running = false;
        state.endAt = null;
        state.remaining = duration(state.mode);
        clearSession();
        if (audioContext && audioContext.state !== "closed") {
            try { audioContext.suspend().catch(() => {}); } catch (_) { /* Ignore audio shutdown errors. */ }
        }
        saveState();
        updateUI();
        publishFocusTimerNotificationState();
        return wasActive;
    }

    function exportFocusWorkspaceData() {
        let stateData = {};
        let historyData = [];
        try { stateData = JSON.parse(localStorage.getItem(focusStateStorageKey()) || "{}"); } catch (_) {}
        try { historyData = JSON.parse(localStorage.getItem(focusHistoryStorageKey()) || "[]"); } catch (_) {}
        return {
            version: 1,
            workspaceId: activeWorkspaceStorageId,
            state: stateData && typeof stateData === "object" ? stateData : {},
            history: Array.isArray(historyData) ? historyData : [],
            historyCollapsed: localStorage.getItem(focusHistoryCollapseKey()) === "1"
        };
    }

    function restoreFocusWorkspaceData(payload) {
        const data = payload && typeof payload === "object" ? payload : null;
        try {
            localStorage.setItem(focusStateStorageKey(), JSON.stringify(data?.state && typeof data.state === "object" ? data.state : {}));
            localStorage.setItem(focusHistoryStorageKey(), JSON.stringify(Array.isArray(data?.history) ? data.history.slice(0, 500) : []));
            if (data?.historyCollapsed) localStorage.setItem(focusHistoryCollapseKey(), "1");
            else localStorage.removeItem(focusHistoryCollapseKey());
        } catch (error) {
            throw new Error(`Focus Mode data could not be restored: ${error.message}`);
        }
        stopTicker();
        state = loadState();
        renderHistory();
        syncFocusHistoryCollapseUI();
        updateUI();
        publishFocusTimerNotificationState();
        return true;
    }

    function resetFocusWorkspaceData() {
        stopTicker();
        try {
            localStorage.removeItem(focusStateStorageKey());
            localStorage.removeItem(focusHistoryStorageKey());
            localStorage.removeItem(focusHistoryCollapseKey());
        } catch (error) {
            throw new Error(`Focus Mode data could not be cleared: ${error.message}`);
        }
        state = loadState();
        renderHistory();
        syncFocusHistoryCollapseUI();
        updateUI();
        publishFocusTimerNotificationState();
        return true;
    }

    function handleWorkspaceOpened(event) {
        const nextId = sanitizeWorkspaceId(event?.detail?.profileId || resolveWorkspaceId());
        if (!nextId || nextId === activeWorkspaceStorageId) return;
        stopTicker();
        activeWorkspaceStorageId = nextId;
        migrateLegacyFocusStorage(activeWorkspaceStorageId);
        state = loadState();
        renderHistory();
        syncFocusHistoryCollapseUI();
        updateUI();
        publishFocusTimerNotificationState();
    }


    function finishSession() {

        const mode = state.mode;

        if (mode === "focus") {

            appendHistory(
                "Completed",
                duration("focus")
            );

            state.completedSessions++;

            notify(
                "Focus session complete",
                "Excellent work. Your session has been saved."
            );

        } else {

            appendHistory(
                "Completed",
                duration(mode)
            );

            notify(
                "Break complete",
                "Your break is over. Ready for another focused session?"
            );

        }


        state.remaining = 0;

        clearSession();

        stopTicker();

        playCompletionChime();

        saveState();

        updateUI();

    }


    // ======================================
    // TIMER TICK
    // ======================================

    function tick() {

        if (!state.running || !state.endAt) {
            return;
        }

        const nextRemaining = Math.max(
            0,
            Math.ceil(
                (state.endAt - Date.now()) / 1000
            )
        );


        if (nextRemaining <= 0) {

            state.remaining = 0;

            finishSession();

            return;

        }


        if (nextRemaining !== state.remaining) {

            state.remaining = nextRemaining;

            if (state.soundEnabled) {
                playTickPair();
            }

            updateUI({
                renderHistory: false
            });

            saveState();

        }

    }


    // ======================================
    // TIMER INTERVAL
    // ======================================

    function startTicker() {

        stopTicker();

        interval = setInterval(
            tick,
            250
        );

    }


    function stopTicker() {

        if (interval) {
            clearInterval(interval);
        }

        interval = null;

    }


    // ======================================
    // START / PAUSE / RESUME
    // ======================================

    function startPause() {

        if (state.running) {

            tick();

            if (!state.running) {
                return;
            }

            state.sessionElapsed = currentElapsed();

            state.sessionStartedAt = null;

            state.running = false;

            state.endAt = null;

            stopTicker();

            saveState();

            updateUI();

            showToast(
                "Timer paused",
                "Your task selection remains locked until reset or completion.",
                "info"
            );

            return;

        }


        if (!state.sessionActive) {

            const select = $("focus-linked-task");

            state.linkedTask =
                select
                    ? select.value
                    : state.linkedTask;

            const option =
                select?.selectedOptions?.[0];

            state.sessionTaskId =
                state.mode === "focus"
                    ? state.linkedTask
                    : "";

            state.sessionTaskName =
                state.mode === "focus" && state.linkedTask
                    ? option?.textContent || "Selected task"
                    : "";

            state.sessionElapsed = 0;

            state.sessionActive = true;

        }


        if (state.remaining <= 0) {

            state.remaining = duration(state.mode);

        }


        state.running = true;

        state.sessionStartedAt = Date.now();

        state.endAt =
            Date.now() + state.remaining * 1000;


        // Unlock browser audio only if sounds are enabled.

        if (state.soundEnabled) {

            const ctx = getAudioContext();

            if (ctx) {

                resumeAudioContext(ctx).catch(error => {

                    console.warn(
                        "Focus audio could not start:",
                        error
                    );

                });

            }

        }


        saveState();

        updateUI();

        startTicker();


        showToast(
            "Session started",
            state.mode === "focus"
                ? "Protect this time. One task at a time."
                : "Enjoy your break.",
            "info"
        );

    }


    // ======================================
    // RESET TIMER
    // ======================================

    function resetTimer() {

        if (state.sessionActive) {

            appendHistory(
                "Stopped",
                currentElapsed()
            );

        }

        clearSession();

        state.remaining = duration(state.mode);

        stopTicker();

        saveState();

        updateUI();

        showToast(
            "Timer reset",
            "You can now choose another task.",
            "info"
        );

    }


    // ======================================
    // CHANGE TIMER MODE
    // ======================================

    function setMode(mode) {

        if (
            !["focus", "short", "long"].includes(mode) ||
            state.sessionActive
        ) {
            return;
        }

        state.mode = mode;

        state.remaining = duration(mode);

        saveState();

        updateUI();

    }


    // ======================================
    // CUSTOM TIMER DURATIONS
    // ======================================

    function applyCustomDurations() {

        if (state.sessionActive) {
            return;
        }

        const vals = {

            focus: Number(
                $("focus-custom-minutes")?.value
            ),

            short: Number(
                $("focus-short-minutes")?.value
            ),

            long: Number(
                $("focus-long-minutes")?.value
            )

        };


        if (
            Object.values(vals).some(
                value =>
                    !Number.isInteger(value) ||
                    value < 1 ||
                    value > 180
            )
        ) {

            showToast(
                "Check your durations",
                "Enter whole minutes from 1 to 180.",
                "warning"
            );

            return;

        }


        state.durations = vals;

        state.remaining = duration(state.mode);

        saveState();

        updateUI();

        showToast(
            "Timer settings saved",
            "Your custom durations are ready in Profile & Appearance.",
            "success"
        );

    }


    // ======================================
    // TASK SELECTOR
    // ONLY PENDING TASKS
    // ======================================

    async function populateTaskSelect() {

        const select = $("focus-linked-task");

        if (
            !select ||
            typeof getAllTasks !== "function"
        ) {
            return;
        }

        try {

            const tasks = await getAllTasks();

            // Exclude completed tasks from Focus Mode.
            // Task records use the Boolean "completed" field.

            const activeTasks = tasks.filter(task => {

                return task && task.completed !== true;

            });


            const previousSelection =
                state.sessionActive
                    ? state.sessionTaskId
                    : (
                        select.value ||
                        state.linkedTask
                    );


            select.replaceChildren();


            const emptyOption =
                document.createElement("option");

            emptyOption.value = "";

            emptyOption.textContent =
                "No linked task";

            select.append(emptyOption);


            activeTasks.forEach(task => {

                const option =
                    document.createElement("option");

                option.value = String(task.id);

                option.textContent =
                    task.title ||
                    task.name ||
                    "Untitled task";

                select.append(option);

            });


            const selectionAvailable =
                activeTasks.some(task =>
                    String(task.id) === String(previousSelection)
                );


            if (
                !state.sessionActive &&
                previousSelection &&
                !selectionAvailable
            ) {

                // Clear a task selection that is no longer pending.

                state.linkedTask = "";

                saveState();

            }


            select.value = selectionAvailable
                ? String(previousSelection)
                : "";


            select.disabled = state.sessionActive;

        } catch (error) {

            console.warn(
                "Could not refresh Focus Mode tasks:",
                error
            );

        }

    }


    // ======================================
    // REFRESH TASKS WHEN FOCUS MODE OPENS
    // ======================================

    function observeFocusPage() {

        const page = $("focus-mode");

        if (!page || typeof MutationObserver === "undefined") {
            return;
        }

        if (focusPageObserver) {
            focusPageObserver.disconnect();
        }

        focusPageObserver = new MutationObserver(() => {

            if (page.classList.contains("active")) {
                populateTaskSelect();
            }

        });

        focusPageObserver.observe(page, {

            attributes: true,

            attributeFilter: ["class"]

        });

    }


    // ======================================
    // RENDER SESSION HISTORY
    // ======================================

function renderHistory() {

    const host = $("focus-history-list");

    if (!host) return;

    const rows = getHistory();

    host.replaceChildren();

    // Remove the old separate totals list.
    // Grouped totals will now appear in each task heading.

    const totalsHost = $("focus-task-totals");

    if (totalsHost) {
        totalsHost.replaceChildren();
        totalsHost.hidden = true;
    }


    if (!rows.length) {

        const empty = document.createElement("p");

        empty.className = "empty-state";

        empty.textContent =
            "No focus sessions recorded yet. Your completed and stopped sessions will appear here.";

        host.append(empty);

        return;

    }


    // ======================================
    // GROUP SESSIONS BY WORK / TASK NAME
    // ======================================

    const groups = new Map();

    rows.forEach(row => {

        const mode = row.mode || "focus";

        let title;
        let groupKey;

        if (mode === "focus") {

            title =
                (
                    row.taskName &&
                    row.taskName !== "—"
                )
                    ? row.taskName.trim()
                    : "Unlinked focus session";

            // Case-insensitive grouping by task name.
            groupKey =
                "focus:" + title.toLowerCase().replace(/\s+/g, " ");

        } else {

            title = mode === "short"
                ? "Short Breaks"
                : "Long Breaks";

            groupKey = "break:" + mode;

        }


        if (!groups.has(groupKey)) {

            groups.set(groupKey, {

                title,

                totalSeconds: 0,

                sessions: [],

                latestDate: 0

            });

        }


        const group = groups.get(groupKey);

        const seconds = Math.max(
            0,
            Number(row.durationSeconds) || 0
        );

        const timestamp =
            new Date(row.date).getTime() || 0;


        group.totalSeconds += seconds;

        group.sessions.push(row);

        group.latestDate = Math.max(
            group.latestDate,
            timestamp
        );

    });


    // ======================================
    // ORDER MOST RECENT WORK FIRST
    // ======================================

    const orderedGroups = [...groups.values()]
        .sort((a, b) => b.latestDate - a.latestDate);


    // ======================================
    // RENDER ONE HEADING PER WORK ITEM
    // ======================================

    orderedGroups.forEach(group => {

        const section =
            document.createElement("section");

        section.className =
            "focus-history-group";


        // GROUP HEADER

        const heading =
            document.createElement("div");

        heading.className =
            "focus-history-group-heading";


        const headingInfo =
            document.createElement("div");


        const title =
            document.createElement("div");

        title.className =
            "focus-history-group-title";

        title.textContent =
            group.title;


        const summary =
            document.createElement("div");

        summary.className =
            "focus-history-group-summary";

        const count = group.sessions.length;

        summary.textContent =
            `${count} ${count === 1 ? "session" : "sessions"}`;


        headingInfo.append(title, summary);


        const total =
            document.createElement("strong");

        total.className =
            "focus-history-group-total";

        total.textContent =
            formatDuration(group.totalSeconds);


        heading.append(
            headingInfo,
            total
        );


        // ======================================
        // INDIVIDUAL SESSION DETAILS
        // ======================================

        const sessions =
            document.createElement("div");

        group.sessions
            .sort((a, b) =>
                new Date(b.date).getTime() -
                new Date(a.date).getTime()
            )
            .forEach(row => {

                const session =
                    document.createElement("div");

                session.className =
                    "focus-history-session";


                const meta =
                    document.createElement("div");

                meta.className =
                    "focus-history-session-meta";


                const date =
                    document.createElement("div");

                const parsedDate = new Date(row.date);

                date.textContent =
                    Number.isNaN(parsedDate.getTime())
                        ? "Date unavailable"
                        : parsedDate.toLocaleString();


                const modeLabel =
                    row.mode === "focus"
                        ? "Focus"
                        : row.mode === "short"
                            ? "Short break"
                            : "Long break";


                const status =
                    document.createElement("div");

                status.textContent =
                    `${modeLabel} · ${row.status || "Recorded"}`;


                meta.append(date, status);


                const time =
                    document.createElement("strong");

                time.className =
                    "focus-history-session-time";

                time.textContent =
                    formatDuration(
                        Math.max(
                            0,
                            Number(row.durationSeconds) || 0
                        )
                    );


                session.append(meta, time);

                sessions.append(session);

            });


        section.append(
            heading,
            sessions
        );

        host.append(section);

    });

}

    // ======================================
    // EVENT LISTENERS
    // ======================================

    function bind() {

        bindFocusHistoryCollapse();

        if (!window.focusSignOutLifecycleBound) {
            window.focusSignOutLifecycleBound = true;
            window.addEventListener("hbt:profile-signed-out", stopFocusForSignOut);
            window.addEventListener("hbt:profile-locked", stopFocusForSignOut);
            window.addEventListener("hbt:profile-opened", handleWorkspaceOpened);
        }

        $("focus-start-btn")?.addEventListener(
            "click",
            startPause
        );


        $("focus-reset-btn")?.addEventListener(
            "click",
            resetTimer
        );


        $("focus-apply-custom")?.addEventListener(
            "click",
            applyCustomDurations
        );


        // Explicit Focus timer selector:
        // - At 0, the Focus timer uses the saved preset from Profile & Appearance.
        // - Moving to 1–59 activates a custom Focus session immediately.
        // - Returning to 0 switches back to the saved preset.
        // The override is retained across refreshes and workspace sessions.
        $("focus-custom-slider")?.addEventListener(
            "input",
            event => {
                if (state.sessionActive) return;

                const value = Math.max(0, Math.min(59, Number(event.target.value) || 0));
                state.customFocusMinutes = value;

                if (state.mode === "focus") {
                    state.remaining = duration("focus");
                }

                saveState();
                updateUI();
            }
        );


        // Focus Mode sound toggle.

        $("focus-sound-toggle")?.addEventListener(
            "click",
            () => {

                state.soundEnabled =
                    !state.soundEnabled;

                saveState();

                updateUI();

                if (state.soundEnabled) {

                    getAudioContext();

                    playTickPair();

                }

            }
        );


        // Profile & Appearance sound setting.

        $("focus-sounds-enabled")?.addEventListener(
            "change",
            event => {

                state.soundEnabled =
                    event.target.checked;

                saveState();

                updateUI();

                if (state.soundEnabled) {

                    getAudioContext();

                    playTickPair();

                }

            }
        );


        // Refresh selector when the user opens it.

        const taskSelect = $("focus-linked-task");

        if (
            taskSelect &&
            taskSelect.dataset.refreshBound !== "true"
        ) {

            taskSelect.dataset.refreshBound = "true";

            taskSelect.addEventListener(
                "focus",
                populateTaskSelect
            );

        }


        // Refresh selector after returning to the application.

        if (!window.focusTaskRefreshBound) {

            window.focusTaskRefreshBound = true;

            window.addEventListener(
                "focus",
                populateTaskSelect
            );

            document.addEventListener(
                "visibilitychange",
                () => {

                    if (!document.hidden) {
                        populateTaskSelect();
                    }

                }
            );

        }


        // Dashboard Focus shortcut.

        $("dashboard-focus-start")?.addEventListener(
            "click",
            () => {

                if (location.hash !== "#focus-mode") {
                    location.hash = "focus-mode";
                }

                if (!state.running) {
                    startPause();
                }

            }
        );


        // Timer mode controls.

        document.querySelectorAll(
            "[data-focus-mode]"
        ).forEach(button => {

            button.addEventListener(
                "click",
                () => setMode(button.dataset.focusMode)
            );

        });


        // Linked task selection.

        $("focus-linked-task")?.addEventListener(
            "change",
            event => {

                if (state.sessionActive) {
                    return;
                }

                state.linkedTask =
                    event.target.value;

                saveState();

            }
        );

        // Refresh motivation quote.

        $("focus-quote-refresh")?.addEventListener(
            "click",
            () => {

                const quote = QUOTES[
                    Math.floor(
                        Math.random() * QUOTES.length
                    )
                ];

                renderQuote(quote);

            }
        );


        // In-app notifications.

        $("focus-inapp-toggle")?.addEventListener(
            "change",
            event => {

                state.inAppNotifications =
                    event.target.checked;

                saveState();

            }
        );


        // Browser notifications.

        $("focus-browser-toggle")?.addEventListener(
            "change",
            async event => {

                if (!event.target.checked) {

                    state.browserNotifications = false;

                    saveState();

                    return;

                }


                if (!("Notification" in window)) {

                    event.target.checked = false;

                    showToast(
                        "Not supported",
                        "This browser does not support notifications.",
                        "warning"
                    );

                    return;

                }


                const permission =
                    Notification.permission === "default"
                        ? await Notification.requestPermission()
                        : Notification.permission;


                state.browserNotifications =
                    permission === "granted";

                event.target.checked =
                    state.browserNotifications;

                saveState();


                showToast(
                    state.browserNotifications
                        ? "Browser notifications enabled"
                        : "Permission not granted",

                    state.browserNotifications
                        ? "Timer alerts are enabled."
                        : "In-app notifications remain available.",

                    state.browserNotifications
                        ? "success"
                        : "warning"
                );

            }
        );


        // Keep state saved when the window closes.

        window.addEventListener(
            "beforeunload",
            saveState
        );

    }


    // ======================================
    // INITIALIZE FOCUS MODE
    // ======================================

    async function initialize() {

        if (!$("focus-time")) {
            return;
        }


        ensureFocusHighlights();


        // Restore unfinished timer after reload.

        if (state.running && state.endAt) {

            state.remaining = Math.max(
                0,
                Math.ceil(
                    (state.endAt - Date.now()) / 1000
                )
            );


            if (state.remaining <= 0) {

                finishSession();

            } else {

                startTicker();

            }

        }


        if ($("focus-custom-minutes")) {

            $("focus-custom-minutes").value =
                state.durations.focus;

        }


        if ($("focus-short-minutes")) {

            $("focus-short-minutes").value =
                state.durations.short;

        }


        if ($("focus-long-minutes")) {

            $("focus-long-minutes").value =
                state.durations.long;

        }


        if ($("focus-inapp-toggle")) {

            $("focus-inapp-toggle").checked =
                state.inAppNotifications;

        }


        if ($("focus-browser-toggle")) {

            $("focus-browser-toggle").checked =
                state.browserNotifications &&
                "Notification" in window &&
                Notification.permission === "granted";

        }


        bind();

        observeFocusPage();

        renderQuote();

        await populateTaskSelect();

        updateUI();

        saveState();

    }


    // ======================================
    // EXPOSE INITIALIZER
    // ======================================

    // Header notification centre reads this snapshot on first load and listens
    // for hbt:focus-timer-state events while the timer changes.
    window.getFocusTimerNotificationState = getFocusTimerNotificationState;
    window.initializeFocusMode = initialize;
    window.stopFocusModeForSignOut = stopFocusForSignOut;
    window.stopFocusModeForWorkspaceReset = stopFocusForWorkspaceReset;
    window.exportFocusWorkspaceData = exportFocusWorkspaceData;
    window.restoreFocusWorkspaceData = restoreFocusWorkspaceData;
    window.resetFocusModeWorkspaceData = resetFocusWorkspaceData;

})();