/* Habit Builder Tracker — offline app shell service worker */
const CACHE_NAME = "habit-builder-tracker-v1.5.39";
const APP_SHELL = [
    "./",
    "./index.html",
    "./manifest.webmanifest",
    "./css/style.css",
    "./css/visual-header-themes.css",
    "./css/workspace-reset.css",
    "./css/workspace-import.css",
    "./css/header-signout.css",
    "./js/dialogs.js",
    "./js/database.js",
    "./js/profile-manager.js",
    "./js/navigation.js",
    "./js/onboarding.js",
    "./js/tasks.js",
    "./js/habits.js",
    "./js/milestones.js",
    "./js/projects.js",
    "./js/reports.js",
    "./js/dashboard.js",
    "./js/data-tools.js",
    "./js/profile-settings.js",
    "./js/notes-vault.js",
    "./js/focus-mode.js",
    "./js/header-notifications.js",
    "./js/about.js",
    "./js/focus-settings-shortcut.js",
    "./js/workspace-reset.js",
    "./assets/gstinfusion-contact-qr.png",
    "./assets/gstinfusion-contact.vcf",
    "./js/app.js",
    "./icons/icon-192.png",
    "./icons/icon-512.png",
    "./icons/focus-timer.png"
];

self.addEventListener("install", event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(APP_SHELL);
        await self.skipWaiting();
    })());
});

self.addEventListener("activate", event => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(key => (key.startsWith("90day-command-center-") || key.startsWith("habit-builder-tracker-")) && key !== CACHE_NAME)
            .map(key => caches.delete(key)));
        await self.clients.claim();
    })());
});

self.addEventListener("fetch", event => {
    const request = event.request;
    if (request.method !== "GET") return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (request.mode === "navigate") {
        event.respondWith((async () => {
            try {
                const response = await fetch(request);
                if (response && response.ok) {
                    const cache = await caches.open(CACHE_NAME);
                    cache.put("./index.html", response.clone());
                }
                return response;
            } catch (error) {
                return (await caches.match("./index.html")) || (await caches.match("./"));
            }
        })());
        return;
    }

    // Cache-first for same-origin shell files; IndexedDB is never cached or replaced.
    event.respondWith((async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
            const response = await fetch(request);
            if (response && response.ok && response.type === "basic") {
                const cache = await caches.open(CACHE_NAME);
                cache.put(request, response.clone());
            }
            return response;
        } catch (error) {
            return new Response("Offline: this resource is not available in the app shell cache.", {
                status: 503,
                statusText: "Offline",
                headers: { "Content-Type": "text/plain; charset=utf-8" }
            });
        }
    })());
});


// Open the active Focus Mode screen when the user taps the timer notification.
self.addEventListener("notificationclick", event => {
    const target = new URL(event.notification?.data?.url || "./index.html#focus-mode", self.location.origin).href;
    event.notification?.close();
    event.waitUntil((async () => {
        const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        const existing = windows.find(client => client.url.startsWith(self.location.origin));
        if (existing) {
            if (typeof existing.navigate === "function") await existing.navigate(target);
            await existing.focus();
            return;
        }
        await self.clients.openWindow(target);
    })());
});
