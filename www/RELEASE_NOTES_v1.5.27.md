# Habit Builder Tracker v1.5.27

## Focus timer notification panel restored

- The header Notifications panel shows an active Focus Mode or break timer while a session is active, including when paused.
- Shows session type, selected task (when linked), remaining time, and running/paused status.
- The remaining time updates from the timer state and is restored after a page refresh.
- The **Open Focus Mode** action returns to the timer screen.
- The empty “You’re all caught up” state appears only when no timer session is active.
- The card clears when a session completes, is reset, or the workspace is locked/signed out.
- Existing browser/system notification permission and settings are unchanged.

## Updated files

- `js/focus-mode.js` publishes a timer-state snapshot.
- `js/header-notifications.js` renders the live timer card and panel controls.
- `index.html`, `service-worker.js`, package version metadata updated to 1.5.27.
