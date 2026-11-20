# Habit Builder Tracker v1.5.32 — Safe Workspace Data Reset

## Added
- Added a Danger Zone action under Backup & Install to reset the active workspace.
- Requires two confirmations, including typing `RESET` exactly.
- Creates a safety backup before changing workspace records; the reset is cancelled if backup creation fails.
- Resets tasks, habits, milestones, projects, notes, Password Vault entries, personal profile details, appearance preferences, Focus Mode custom settings and Focus Session history.
- Preserves workspace name and account identity, workspace password protection, automatic-backup configuration, backup history and previously created backup files.
- Restores a minimal default profile using the workspace name so the app returns to its dashboard instead of first-run onboarding.
- Includes Focus Mode state and session history in subsequent workspace backups.
- Migrates legacy shared Focus Mode local storage to the active workspace and scopes timer/history data per workspace.

## Safety notes
- The backup is downloaded or written to the configured backup folder according to browser permissions. Confirm that the file exists at the displayed destination before relying on it.
- Existing backup files are not deleted by Reset Workspace Data.
- This action affects only the active workspace; other workspaces are not reset.

## Validation
- JavaScript syntax, HTML structure, CSS parsing, cache references, version metadata and ZIP integrity checked.
- Live Replit end-to-end testing remains required before declaring a stable release.
