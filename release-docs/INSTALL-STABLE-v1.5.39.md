# Installation — Habit Builder Tracker v1.5.39 Local Storage Stable

## Existing installation

1. Open every existing workspace and download a backup before upgrading.
2. Keep the existing project folder and its local application data.
3. Replace application source files with this complete release package, or use the complete source package in a separate folder for evaluation.
4. Run `npm install`.
5. Start the Windows desktop app with `npm run desktop:dev`, or prepare the web app using `npm run copy:web`.
6. Verify that the existing profile list appears and unlock password-protected profiles with their existing passwords.

**Do not clear IndexedDB, browser site data, or Electron app data.** This release does not require a database migration or a profile reset.

## New browser or device

Browser profiles and devices have separate IndexedDB stores. To transfer data, export a backup from the source workspace, move the backup file securely, then open Workspace Manager → Find & import workspaces on the destination and choose the backup file. Import creates a separate local profile; it does not replace an existing profile. Use Backup & Install → Restore only when you intentionally want to replace the records in the currently open matching workspace.

## Platform notes

- Browser/PWA: open through HTTPS or localhost for secure Web Crypto and service-worker support.
- Windows desktop: run the Electron app from the project root.
- Android: use the existing Capacitor workflow (`npm run android:sync` and the Android Studio release flow).

This release intentionally contains no shared-folder repository, native folder bridge, or automatic cloud sync.
