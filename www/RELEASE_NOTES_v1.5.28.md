# Habit Builder Tracker v1.5.28

## Focus lifecycle and history controls

- Restored `window.stopFocusModeForSignOut` so the active or paused Focus session is stopped before the workspace backup is created and the database is locked.
- Interrupted sessions are recorded in Focus Session History as `Stopped — signed out`; the timer is reset to the selected Focus/Break duration and its interval/audio activity is stopped.
- Added sign-out and workspace-lock fallback listeners so timer state and the header notification centre are cleared even when a lock path bypasses the direct sign-out action.
- Restored the Focus Session History collapse control. It hides only the session groups inside `#focus-history-content`; the history title and description remain visible. The collapse preference is stored per workspace.
- Removed the nested rounded/bordered sub-card around Session lengths while retaining the duration inputs, labels, and Save button.
- Updated service-worker cache and package metadata to v1.5.28.

## Compatibility

No database schema migration or IndexedDB reset is required.
