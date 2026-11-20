@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Habit Builder Tracker - Publish to GitHub

echo ============================================================
echo  HABIT BUILDER TRACKER v1.5.39 - GITHUB PUBLISHER
echo ============================================================
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo ERROR: Git is not installed or is not available in PATH.
  echo Install Git for Windows, reopen this window, and run again.
  pause
  exit /b 1
)

echo IMPORTANT: Create an EMPTY GitHub repository first.
echo Recommended repository: aaltafbhat/habit-builder-tracker
 echo Keep it PRIVATE unless you intend to publish the contact details
 echo contained in assets/gstinfusion-contact.vcf and the QR image.
echo.
set /p REPO_URL=Paste the new repository URL (https://github.com/aaltafbhat/habit-builder-tracker.git): 
if "%REPO_URL%"=="" (
  echo ERROR: Repository URL is required.
  pause
  exit /b 1
)

if not exist ".git" (
  git init
  if errorlevel 1 goto :failed
)

git add -A
if errorlevel 1 goto :failed

git diff --cached --quiet
if not errorlevel 1 (
  echo No staged changes to commit. Continuing with the existing commit.
) else (
  git commit -m "Release Habit Builder Tracker v1.5.39 - local storage stable"
  if errorlevel 1 goto :failed
)

git branch -M main
if errorlevel 1 goto :failed

git remote get-url origin >nul 2>nul
if errorlevel 1 (
  git remote add origin "%REPO_URL%"
) else (
  git remote set-url origin "%REPO_URL%"
)
if errorlevel 1 goto :failed

git push -u origin main
if errorlevel 1 goto :failed

echo.
echo SUCCESS: Habit Builder Tracker v1.5.39 has been pushed to GitHub.
echo Repository: %REPO_URL%
pause
exit /b 0

:failed
echo.
echo PUBLISH FAILED. Read the Git error shown above.
echo If Git asks for identity, configure user.name and user.email, then run again.
echo If the GitHub repository was initialized with a README, create an empty repo
 echo or reconcile the remote history before pushing.
pause
exit /b 1
