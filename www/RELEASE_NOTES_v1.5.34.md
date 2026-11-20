# Habit Builder Tracker v1.5.34 — Cross-browser Workspace Import

## Added
- Workspace Manager now offers **Import / Restore workspace**.
- Scan a selected backup folder (including nested folders) or choose multiple `.json` / `.hbtbackup` files.
- Valid backups are listed with workspace name where available, filename, export date, file size, encryption state and record counts.
- Import adds a new workspace without replacing existing workspaces.
- Encrypted backup files request the backup recovery passphrase at import time.
- Password-protected workspace records retain their original workspace ID and password protection.
- Imported workspaces appear in the normal workspace selector and can be opened from the list.

## Important storage behaviour
Browsers isolate IndexedDB by browser profile and origin. Existing workspaces from another browser cannot be discovered automatically. Export a Habit Builder Tracker backup in the source browser, move it to a shared folder or local file location, then use the new import action in the destination browser. This is backup-based transfer, not live sync.

## Safety
- Existing workspaces are never overwritten by the Import action.
- Import is available only after signing out of the current workspace.
- Encrypted workspace data remains bound to its original workspace ID; duplicate protected IDs are rejected with guidance.
- Invalid or unsupported files are skipped and reported.
