# Habit Builder Tracker v1.5.12 — Notification Center & Sidebar Polish

## Changes
- Replaced the header's standalone appearance shortcut with a Notification Center bell button.
- Added a compact notification panel with a bell-icon empty state: “You're all caught up”.
- When a Focus Mode session is active, the panel shows the current timer, task, running/paused status, and an Open Focus Mode action.
- Focus Mode publishes a minimal status event for the header panel; existing browser/system notifications continue to use the Focus Timer Notifications setting and browser permission.
- Tightened the Profile & Appearance sidebar row so its icon and label stay on one line at the standard sidebar width.
- Updated the service-worker cache and app package version to 1.5.12.

## Compatibility
- No IndexedDB schema changes.
- No workspace data migration or reset required.
- Existing Focus Mode notification permission and setting are preserved.

## Validation performed
- Node syntax checks for all JavaScript files.
- JSON parsing for package metadata.
- HTML parsing and duplicate-ID check.
- Verified the new notification-center script is included in the HTML and service-worker app shell.

Live browser, Windows, and Android notification testing is still required.
