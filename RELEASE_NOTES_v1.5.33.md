# Habit Builder Tracker v1.5.33 — Header Sign Out Restoration

## Fix
- Restore the global **Sign out** text action beneath **Appearance** whenever a workspace is active.
- Hide the header sign-out action when the user is signed out or viewing Workspace Manager.
- Bind the header action to the same sign-out workflow as the Workspace Manager action.
- Preserve confirmation, Focus Mode stop/persist, automatic backup, workspace lock and sign-out behaviour.
- Keep the existing header appearance; add responsive spacing and accessible keyboard focus styling.

## Files changed
- `index.html`
- `js/profile-manager.js`
- `css/header-signout.css` (new)
- `service-worker.js`
- `package.json`

## Install
Extract into the existing project root, replace matching files, restart the app and hard-refresh (`Ctrl + Shift + R`). Do not clear IndexedDB or browser site data.
