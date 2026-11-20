# Habit Builder Tracker v1.5.39 — Local Storage Stable

Habit Builder Tracker is an offline-first productivity app. Its local profile system uses a profile registry plus a separate IndexedDB database per workspace. Optional profile password protection encrypts workspace records using Web Crypto (PBKDF2 + AES-GCM). Backup, restore and import-as-new-profile workflows remain available.

## Storage model

- **Local working data:** IndexedDB in the current browser profile or desktop app installation.
- **Profiles:** Managed locally by the Workspace Manager; switching profiles opens the matching IndexedDB database.
- **Encryption:** Existing profile password and encrypted-record flows are retained. Encryption keys remain in memory only while a profile is unlocked.
- **Backups:** Export a portable backup file. Importing a backup as a new profile keeps the existing local profiles. Restoring into the active profile replaces its records only after validation and confirmation, with a safety backup first.
- **Cross-browser/device transfer:** Browsers and desktop installations have separate local IndexedDB stores. Move a backup file from the source device and import it on the destination device. There is no shared-folder connection or automatic cloud sync in this release.

## Run locally

1. Install Node.js LTS.
2. Run `npm install`.
3. Run `npm run copy:web` to prepare the desktop web shell.
4. Run `npm run desktop:dev` to open the Electron desktop app.
5. Run `npm test` for the local-storage release checks.

For a Windows installer, run `npm run desktop:win` on a supported Windows build environment.

For the browser/PWA version, serve the project over HTTPS or localhost. IndexedDB data is isolated by browser and origin. Do not clear site data if you need to retain local profiles.

## Data safety

Before upgrading, export a backup from each profile that contains data you need. Do not delete browser data, IndexedDB databases, or the app's Electron user-data folder during installation. Keep backup files private, particularly when they contain unencrypted workspace data.
