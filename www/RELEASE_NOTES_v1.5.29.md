# Habit Builder Tracker v1.5.29

## Header Sign out visibility fix
- Displays the Sign out text link directly beneath the Appearance control whenever a workspace is signed in.
- Hides the link on the Workspace Manager, onboarding, and signed-out states.
- Binds the header link to the same backup-first confirmation and sign-out workflow used by Profile Manager.
- Preserves Focus Mode stop/persist behaviour before the automatic backup and workspace lock.

## Installation
Replace the matching files in the existing project root. Do not clear IndexedDB or browser site data. Restart the app and hard-refresh.
