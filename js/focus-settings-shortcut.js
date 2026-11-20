/* ==========================================
   FOCUS TIMER SETTINGS SHORTCUT
   Version 1.5.25
   Opens Profile & Appearance at the exact
   Focus Timer Preferences section.
========================================== */
(() => {
    "use strict";

    function bindFocusSettingsShortcut() {
        const button = document.getElementById("focus-settings-shortcut");
        if (!button || button.dataset.bound === "true") return;
        button.dataset.bound = "true";

        button.addEventListener("click", () => {
            const settingsLink = document.querySelector('.sidebar a[href="#profile-settings"]');
            const target = document.getElementById("focus-preferences-card");

            if (!settingsLink || !target) {
                console.warn("Focus Timer Preferences shortcut could not find its settings target.");
                return;
            }

            // Use the app's normal navigation flow so active sidebar state and history remain correct.
            settingsLink.click();

            const reduceMotion = window.matchMedia &&
                window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            const smoothAllowed = !reduceMotion &&
                !document.documentElement.classList.contains("reduce-motion") &&
                document.documentElement.dataset.reduceMotion !== "true";

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    target.scrollIntoView({
                        behavior: smoothAllowed ? "smooth" : "auto",
                        block: "start"
                    });
                    target.setAttribute("tabindex", "-1");
                    target.focus({ preventScroll: true });
                });
            });
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bindFocusSettingsShortcut, { once: true });
    } else {
        bindFocusSettingsShortcut();
    }
})();
