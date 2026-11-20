# Habit Builder Tracker v1.5.11

## Focus timer system notifications
- Moved browser notification enable/disable into Profile & Appearance → Focus Timer Preferences.
- Adds a timer-symbol system notification with active task and remaining time.
- Uses the service worker notification API where available and updates the same notification at minute boundaries.
- Notification click opens Focus Mode.
- Pause retains a paused timer notification; reset, completion, sign-out and workspace changes close it.
- Browser permission is requested only after the user enables the setting.

## Header appearance shortcut
- Adds a subtle palette shortcut beside the Profile button; it opens Profile & Appearance and scrolls to Appearance settings.

## Platform note
System notifications require browser permission and a secure context (HTTPS or localhost). Timer updates are sent while the app page is running; browser throttling and operating-system notification settings can affect visibility and update timing. This is not a native always-on-top tray timer.
