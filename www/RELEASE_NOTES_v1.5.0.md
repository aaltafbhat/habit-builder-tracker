# Habit Builder Tracker v1.5.0

## What changed

- Moved Automatic Backup, encryption, folder destination and backup history into **Backup & Install**.
- Added **Windows Classic** appearance alongside Light, Dark and Follow system.
- Added configurable interface animation polish; the existing animation and reduce-motion controls remain respected.
- Added **Notes & Ideas** with search, importance colors (Critical, High, Normal, Low), pinning, editing, copying and deletion.
- Added a **Password Vault** for service, website, username, password and private account notes.
- Vault entries are encrypted locally with AES-256-GCM. A separate passphrase is derived with PBKDF2-SHA-256 (310,000 iterations). The passphrase and derived key are not stored; the key exists only in memory while unlocked.
- Vault auto-locks after five minutes of inactivity, and locks on sign-out, workspace lock and page unload.
- Notes and the encrypted vault envelope are stored in the workspace profile record, so they are included in the existing workspace backup and restore process.
- Fixed profile-settings writes to merge with the latest stored profile record so notes and vault data are not overwritten by stale settings state.
- Updated the service-worker cache and build version for v1.5.0.

## Security and recovery notes

- The credential vault is separate from Workspace Password & Security and from the encrypted-backup recovery passphrase.
- If the vault passphrase is lost, the encrypted vault cannot be recovered. Store it separately in a trusted password manager.
- Workspace backups include the encrypted vault payload, not plaintext vault passwords. A restored vault still requires its vault passphrase.
- Notes are covered by workspace-level encryption only when Workspace Password & Security is enabled. Otherwise notes are local workspace data and may be present in unencrypted local browser storage.
- Copy actions place the selected username or password on the system clipboard. The application cannot guarantee when another app or the operating system clears clipboard contents.
- The vault is a local encrypted convenience feature, not a replacement for a dedicated audited enterprise password manager. Do not store one-time codes, recovery codes or highly sensitive financial secrets in it.

## Build commands

- Windows installer: `npm run desktop:win`
- Android project initialization: `npm run android:init`
- Android sync: `npm run android:sync`
- Android debug run: `npm run android:debug`

Run these commands from the project root after installing dependencies. A Windows installer must be built on Windows or a supported Windows build environment. Android release signing and keystore configuration are separate release steps.
