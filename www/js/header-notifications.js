/* ==========================================
   HABIT BUILDER TRACKER
   HEADER NOTIFICATION CENTRE
   Restores live Focus Mode timer card
========================================== */
(() => {
    "use strict";

    const byId = id => document.getElementById(id);
    let lastState = null;

    function formatTime(totalSeconds) {
        const value = Math.max(0, Math.ceil(Number(totalSeconds) || 0));
        const minutes = Math.floor(value / 60);
        const seconds = value % 60;
        return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }

    function renderEmpty(content) {
        content.innerHTML = `
            <div class="header-notification-empty">
                <span class="header-notification-empty-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path><path d="M10 21h4"></path></svg>
                </span>
                <strong>You're all caught up</strong>
                <p>New notifications will appear here.</p>
            </div>`;
    }

    function createTimerCard(content) {
        content.replaceChildren();

        const card = document.createElement("article");
        card.className = "header-focus-notification";

        const icon = document.createElement("span");
        icon.className = "header-focus-notification-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"></circle><path d="M12 9v4l2.5 1.5M9 2h6M12 2v3"></path></svg>`;

        const copy = document.createElement("div");
        copy.className = "header-focus-notification-copy";

        const title = document.createElement("strong");
        title.dataset.role = "title";

        const task = document.createElement("small");
        task.dataset.role = "task";

        copy.append(title, task);

        const time = document.createElement("span");
        time.className = "header-focus-notification-time";
        time.dataset.role = "time";
        time.setAttribute("aria-live", "off");

        card.append(icon, copy, time);

        const status = document.createElement("p");
        status.className = "header-focus-notification-status";
        status.dataset.role = "status";

        const open = document.createElement("button");
        open.type = "button";
        open.className = "header-focus-open";
        open.textContent = "Open Focus Mode";
        open.addEventListener("click", openFocusMode);

        content.append(card, status, open);
    }

    function openFocusMode() {
        closePanel();
        const focusLink = document.querySelector('.sidebar a[href="#focus-mode"]');
        if (focusLink) {
            focusLink.click();
            return;
        }
        window.location.hash = "focus-mode";
    }

    function closePanel() {
        const panel = byId("header-notification-panel");
        const button = byId("header-notification-button");
        if (panel) panel.hidden = true;
        if (button) button.setAttribute("aria-expanded", "false");
    }

    function render(snapshot) {
        const content = byId("header-notification-content");
        const button = byId("header-notification-button");
        const dot = byId("header-notification-dot");
        if (!content) return;

        const state = snapshot || (typeof window.getFocusTimerNotificationState === "function"
            ? window.getFocusTimerNotificationState()
            : null);

        const active = Boolean(state && (state.active || state.running));
        if (dot) dot.hidden = !active;
        if (button) {
            button.setAttribute("aria-label", active ? "Open notifications. Focus timer active" : "Open notifications");
            button.title = active ? "Notifications — Focus timer active" : "Notifications";
        }

        if (!active) {
            if (!content.querySelector(".header-notification-empty")) renderEmpty(content);
            lastState = null;
            return;
        }

        if (!content.querySelector(".header-focus-notification")) createTimerCard(content);

        const title = content.querySelector('[data-role="title"]');
        const task = content.querySelector('[data-role="task"]');
        const time = content.querySelector('[data-role="time"]');
        const status = content.querySelector('[data-role="status"]');

        const modeLabel = state.modeLabel || (state.mode === "short" ? "Short break" : state.mode === "long" ? "Long break" : "Focus session");
        const taskLabel = state.taskName || (state.mode === "focus" ? "No linked task" : "Break session");
        const timeLabel = formatTime(state.remainingSeconds);
        const statusLabel = state.running ? "● Timer running · Remaining time" : "Ⅱ Timer paused · Remaining time";

        if (title) title.textContent = modeLabel;
        if (task) task.textContent = taskLabel;
        if (time) time.textContent = timeLabel;
        if (status) status.textContent = statusLabel;

        lastState = {
            active: true,
            running: Boolean(state.running),
            mode: state.mode,
            remainingSeconds: Number(state.remainingSeconds) || 0
        };
    }

    function bind() {
        const button = byId("header-notification-button");
        const panel = byId("header-notification-panel");
        const close = byId("header-notification-close");
        const wrap = document.querySelector(".header-notification-wrap");

        if (!button || !panel || button.dataset.bound === "true") return;
        button.dataset.bound = "true";

        button.addEventListener("click", event => {
            event.stopPropagation();
            const willOpen = panel.hidden;
            panel.hidden = !willOpen;
            button.setAttribute("aria-expanded", String(willOpen));
            if (willOpen) render();
        });

        close?.addEventListener("click", closePanel);

        document.addEventListener("pointerdown", event => {
            if (panel.hidden || !wrap || wrap.contains(event.target)) return;
            closePanel();
        });

        document.addEventListener("keydown", event => {
            if (event.key === "Escape" && !panel.hidden) {
                closePanel();
                button.focus();
            }
        });

        window.addEventListener("hbt:focus-timer-state", event => render(event.detail));

        // A workspace lock/sign-out must never leave a previous workspace timer visible.
        window.addEventListener("hbt:profile-locked", () => render({ active: false }));
        window.addEventListener("hbt:profile-signed-out", () => render({ active: false }));

        // Restore immediately on page load, including a timer that was running before refresh.
        render();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bind, { once: true });
    } else {
        bind();
    }
})();
