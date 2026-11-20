<p align="center">
  <img src="icons/icon-512.png" alt="Habit Builder Tracker icon" width="112">
</p>
<h1 align="center">Habit Builder Tracker</h1>
<p align="center">
  <strong>Build consistency. Track progress. Stay focused.</strong><br>
  Offline-first personal productivity app · v1.5.39 · Local Storage Stable
</p>
<p align="center">
  <a href="https://github.com/aaltafbhat/habit-builder-tracker/releases/tag/v1.5.39">Download v1.5.39</a>
  ·
  <a href="#screenshots">Screenshots</a>
  ·
  <a href="#installation">Installation</a>
</p>
Habit Builder Tracker is an offline-first personal productivity application for managing daily habits, tasks, projects, milestones, notes and focused work. It uses a local profile system with a separate IndexedDB database per workspace. Optional profile password protection encrypts workspace records using Web Crypto (PBKDF2 + AES-GCM).
Features
Multiple local profiles: Create, switch, edit and manage separate workspaces.
Daily tracking: Organize daily tasks, habits and priorities.
Discipline Builder: Monitor consistency and personal progress.
Projects and milestones: Manage workstreams, targets and outcomes.
Focus Mode: Run focused sessions and retain session state in workspace backups.
Notes and ideas: Capture and organize personal notes.
Profile protection: Optional profile password protection and encrypted workspace records.
Backup and restore: Export portable backups, validate imports and restore with a pre-restore safety backup.
Offline-capable PWA: App shell and local assets support offline use after installation.
Desktop packaging: Windows Electron installer and existing Capacitor workflows.
Screenshots
<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/screenshots/01-welcome-screen.webp" alt="Welcome screen" width="100%">
      <p align="center"><sub><b>Welcome screen</b></sub></p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/screenshots/02-dashboard-overview.webp" alt="Dashboard overview" width="100%">
      <p align="center"><sub><b>Dashboard overview</b></sub></p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/screenshots/03-overview-task-board.webp" alt="Workspace overview" width="100%">
      <p align="center"><sub><b>Workspace overview</b></sub></p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/screenshots/04-discipline-snapshot.webp" alt="Discipline snapshot" width="100%">
      <p align="center"><sub><b>Discipline snapshot</b></sub></p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/screenshots/05-daily-tracker.webp" alt="Daily tracker" width="100%">
      <p align="center"><sub><b>Daily tracker</b></sub></p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/screenshots/06-discipline-builder.webp" alt="Discipline builder" width="100%">
      <p align="center"><sub><b>Discipline builder</b></sub></p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/screenshots/07-projects.webp" alt="Project management" width="100%">
      <p align="center"><sub><b>Project management</b></sub></p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/screenshots/08-milestones.webp" alt="Milestones" width="100%">
      <p align="center"><sub><b>Milestones</b></sub></p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/screenshots/09-focus-mode.webp" alt="Focus mode" width="100%">
      <p align="center"><sub><b>Focus mode</b></sub></p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/screenshots/10-reports-analytics.webp" alt="Reports and analytics" width="100%">
      <p align="center"><sub><b>Reports and analytics</b></sub></p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/screenshots/11-notes-and-ideas.webp" alt="Notes and ideas" width="100%">
      <p align="center"><sub><b>Notes and ideas</b></sub></p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/screenshots/12-profile-appearance.webp" alt="Profile and appearance" width="100%">
      <p align="center"><sub><b>Profile and appearance</b></sub></p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/screenshots/13-backup-and-restore.webp" alt="Backup and restore" width="100%">
      <p align="center"><sub><b>Backup and restore</b></sub></p>
    </td>
    <td width="50%"></td>
  </tr>
</table>
Local-first storage model
Local working data: IndexedDB in the current browser profile or desktop app installation.
Profiles: Managed locally by Workspace Manager; switching profiles opens the matching IndexedDB database.
Encryption: Profile password and encrypted-record flows are retained. Encryption keys remain in memory only while a profile is unlocked.
Backups: Export a portable backup file. Importing a backup as a new profile keeps existing local profiles. Restoring into the active profile replaces its records only after validation and confirmation, with a safety backup first.
Cross-browser/device transfer: Browsers and desktop installations have separate local IndexedDB stores. Move a backup file from the source device and import it on the destination device. Automatic cloud synchronization and shared-folder storage are not included in v1.5.39.
Installation
Windows desktop
Download Habit Builder Tracker Setup 1.5.39.exe from the v1.5.39 GitHub Release.
Run the installer and follow the setup prompts.
Launch Habit Builder Tracker from the Start Menu or desktop shortcut.
Run from source
Install Node.js LTS.
Clone this repository and open its project folder.
Run `npm install`.
Run `npm run desktop:dev` to launch the Electron desktop app.
Run `npm test` to execute the local-storage release checks.
To build a Windows installer from source, run `npm run desktop:win` on a supported Windows build environment.
For the browser/PWA version, serve the project over HTTPS or localhost. IndexedDB data is isolated by browser and origin.
Data safety
Before upgrading, export a backup from each profile that contains data you need. Do not delete browser data, IndexedDB databases, or the app's Electron user-data folder during installation. Keep backup files private, particularly when they contain unencrypted workspace data.
Release
Current stable release: Habit Builder Tracker v1.5.39 — Local Storage Stable
