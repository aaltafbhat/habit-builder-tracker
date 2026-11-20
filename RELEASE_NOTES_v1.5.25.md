# Habit Builder Tracker v1.5.25 — Focus Timer Quick Custom Duration

## Focus Mode
- Added a 0–59 minute custom Focus duration slider below the Start, Reset and Sound controls.
- Slider updates the timer immediately and persists the selected value in Focus Mode state.
- `0` uses the saved Focus preset from Profile & Appearance; `1–59` applies a custom Focus duration.
- Short and Long Break durations remain governed by their saved preferences.
- Custom duration control is disabled while a session is active and is keyboard accessible.
- Replaced the small cog artwork with a clearer sliders/settings icon for the Focus Timer Preferences shortcut.

## Profile & Appearance
- Reduced the height and typography of Focus, Short Break and Long Break numeric inputs for a more compact settings card.

## Compatibility
- Existing workspace data and IndexedDB schema are unchanged.
- Existing custom preset durations and Focus history remain intact.
- Service-worker cache is versioned to v1.5.25.
