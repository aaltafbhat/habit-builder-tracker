# Publishing this release to GitHub

Target repository: `https://github.com/aaltafbhat/habit-builder-tracker`

## 1. Create the repository

On GitHub, create a new repository named `habit-builder-tracker` under `aaltafbhat`.
Choose **Private** unless you explicitly intend to make the contact information in `assets/gstinfusion-contact.vcf` and `assets/gstinfusion-contact-qr.png` publicly accessible. Leave README, .gitignore, and license initialization unchecked so the repository is empty.

## 2. Extract the project

Extract this ZIP into a dedicated folder. Its contents are already arranged at the repository root; `README.md`, `package.json`, `assets/`, `icons/`, `css/`, `js/`, `packaging/`, `tests/`, and `www/` should appear directly inside that folder.

## 3. Publish

On Windows, double-click `PUBLISH-TO-GITHUB.bat`, paste the repository URL, and follow Git's sign-in prompt. It initializes Git, stages the project, creates the v1.5.39 release commit, and pushes the `main` branch.

Alternatively, run these commands from the extracted project folder:

```powershell
git init
git add -A
git commit -m "Release Habit Builder Tracker v1.5.39 - local storage stable"
git branch -M main
git remote add origin https://github.com/aaltafbhat/habit-builder-tracker.git
git push -u origin main
```

## Included

The complete v1.5.39 source package, including app assets, app icons, CSS, JavaScript, PWA files, Electron/Capacitor packaging configuration, tests, installation instructions, and release notes. Generated dependencies and Windows build output are not included; `npm install` restores dependencies and `npm run desktop:win` builds the Windows installer.
