# Habit Builder Tracker v1.5.39 — Local Storage Stable

## Release scope

This release removes the experimental shared-workspace location feature and returns the product to a straightforward local-first storage model.

## Retained

- Per-profile IndexedDB databases and local profile registry.
- Profile creation, switching, editing, deletion safeguards and sign-out.
- Optional profile password protection with PBKDF2 and AES-GCM encrypted records.
- Encryption migration and recovery behavior already present in the local database module.
- Backup Recovery Passphrase and encrypted portable backup support.
- Local automatic backup, manual export, restore with validation and pre-restore safety backup.
- Import-as-new-profile for portable backups, preserving existing local profiles.
- Focus Mode session state included in workspace backup/restore.
- PWA shell, offline assets, Windows Electron and existing Capacitor packaging workflows.

## Removed from this release

- Shared Workspace Repository UI.
- Browser shared-folder repository adapter and repository catalogue.
- Electron filesystem bridge and native shared-folder picker.
- Shared snapshot publishing, scanning, conflict tracking and auto-publish-on-sign-out.

## Storage behavior

IndexedDB remains the source of truth on each browser/device. Browser profiles and desktop installations do not share databases. Cross-device transfer is performed with portable backup files. Automatic synchronization is not included.

## Compatibility and safety

- No IndexedDB schema change is introduced by this release.
- No existing profile or record is deleted or migrated as part of installation.
- The versioned service-worker cache is updated to invalidate the prior app shell.
- Existing backup and restore formats remain in place.
