# Habit Builder Tracker v1.5.23 — Focus Timer Alignment Fix

## Focus Timer Preferences
- Moved each “min” unit label beneath its matching duration input.
- Kept Focus, Short break and Long break fields in equal-width columns on desktop.
- Reworked the Save timer lengths action row into a two-column layout with a flexible helper-text area.
- Helper text now wraps naturally without overflowing or being clipped at the panel edge.
- On narrow screens, duration fields and the action row stack vertically for readability.

## Compatibility
- Preserved all existing focus-duration input IDs and the Save timer lengths button ID.
- No database schema or IndexedDB changes.
- Updated service-worker cache and package versions to 1.5.23.
