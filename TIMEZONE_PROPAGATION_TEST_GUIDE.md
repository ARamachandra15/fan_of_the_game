# Timezone Propagation & Save Button Behavior - Test Guide

## Overview
This document outlines how to test the new timezone propagation feature and save button behavior that ensures immediate timezone updates across the app.

## Implementation Summary

### What Changed
1. **Timezone Loading from Supabase** - Saved timezone is now loaded when user logs in
2. **Save Button State Management** - Button is disabled until timezone value actually changes
3. **Automatic Dropdown Closing** - Profile dropdown closes after successful save
4. **Immediate Game Time Updates** - All game times update instantly when timezone changes, no page reload needed

---

## Test Cases

### Test 1: Timezone Loads from Supabase on Login
**Objective**: Verify that a previously saved timezone persists after logout/login

**Steps**:
1. Open the app at `http://localhost:5173/`
2. Log in with your account (or create a new one)
3. Click the profile icon (top right)
4. Click "Time Zone"
5. Select a timezone different from the current one
6. Verify the **Save button is initially disabled** (grayed out) - ✓ This is the key new behavior
7. Verify the **Save button enables only after selecting a different timezone** - ✓
8. Click Save
9. Verify the profile dropdown **closes immediately** - ✓ New behavior
10. Log out (click profile → Sign out)
11. Log back in
12. Click profile → Time Zone
13. **Verify your previously saved timezone is now the highlighted one** - ✓ New: loaded from Supabase

### Test 2: Save Button Disabled Until Change Made
**Objective**: Verify save button correctly reflects whether a change has been made

**Steps**:
1. Log in and open timezone selector (profile → Time Zone)
2. **Verify no Save button appears** - Correct, because `pendingTimezoneOffset` is null
3. Select a timezone that's **the same as the currently saved one**
4. **Verify Save button appears but is disabled (grayed out)** - ✓ New behavior
5. Select a **different timezone**
6. **Verify Save button becomes enabled (bright amber)** - ✓ New behavior
7. Select the **original timezone again**
8. **Verify Save button is disabled again** - ✓ Works correctly

### Test 3: Cancel Reverts Selection Without Saving
**Objective**: Verify unsaved changes don't persist when user cancels

**Steps**:
1. Open timezone selector
2. Select a new timezone
3. Click Cancel
4. **Verify pendingTimezoneOffset is cleared and selector closes** - ✓
5. Close and reopen timezone selector
6. **Verify the previously saved timezone is still highlighted** - ✓ Change was reverted

### Test 4: Immediate Propagation to Calendar
**Objective**: Verify game times update immediately across all displays when timezone changes

**Preparation**:
- You must have at least one team selected with upcoming games
- Note the current time display for a game in the Calendar view

**Steps**:
1. In Calendar view, note the time of any upcoming game (e.g., "2:30 PM PST (7:30 PM UTC)")
2. Open profile → Time Zone
3. Select a **different timezone** (e.g., EST if you were on PST, or vice versa)
4. Click Save
5. **Verify dropdown closes immediately** - ✓
6. **Verify the game time in the calendar IMMEDIATELY updates to the new timezone** - ✓ No page reload!
7. **Verify the time shows the correct conversion** (offset should differ by your timezone difference)
8. Go back to previous timezone and save
9. **Verify game times revert to original display** - ✓

### Test 5: Immediate Propagation to My Teams View
**Objective**: Verify timezone changes propagate to My Teams/Team Profile section

**Preparation**:
- Have a team selected and visible in "My Teams" view with upcoming games

**Steps**:
1. Navigate to "My Teams" tab
2. Click on a team to view its profile
3. Note the "Next 10 Games" section and the time of the first upcoming game
4. Open profile → Time Zone
5. Select a different timezone
6. Click Save
7. **Verify dropdown closes** - ✓
8. **Verify game times in "Next 10 Games" section update immediately** - ✓
9. **Verify times in "Recent Results" also update if showing times** - ✓
10. If you can see the team's home page, **verify times there update too** - ✓

### Test 6: Immediate Propagation to Day Details
**Objective**: Verify timezone updates in day-click details

**Steps**:
1. In Calendar view, click on a day with games
2. Note the game times displayed in the day details popup/modal
3. Open profile → Time Zone and select a different timezone
4. Click Save
5. **Verify day details panel updates immediately** - ✓ No need to close and reopen
6. **Verify each game time shows correct conversion for new timezone** - ✓

### Test 7: New Teams Use Saved Timezone
**Objective**: Verify teams added AFTER changing timezone use the saved timezone

**Steps**:
1. Change timezone (profile → Time Zone → select → Save)
2. Navigate to Teams tab
3. Add a new team to your selection
4. Return to Calendar view
5. **Verify the new team's games display in the timezone you just set** - ✓
6. Switch to a different timezone
7. Add another team
8. **Verify this new team's games also use the latest saved timezone** - ✓

### Test 8: Guest Users Get Browser Detection
**Objective**: Verify non-authenticated users get browser timezone

**Steps**:
1. Click "Continue as Guest" on landing page
2. Navigate through the app
3. Note that profile icon is not available (no timezone selector for guests)
4. Game times should display based on browser-detected timezone - ✓

### Test 9: Closing Dropdown Without Save Reverts
**Objective**: Verify clicking outside or escaping reverts pending changes

**Steps**:
1. Open timezone selector
2. Select a new timezone (different from current)
3. **Verify Save button is enabled**
4. Click outside the dropdown (but within the app) to close it
5. **Verify dropdown closes and pending selection is discarded**
6. Reopen timezone selector
7. **Verify previously saved timezone is still highlighted** - ✓

---

## Visual Confirmation Checklist

- [ ] Save button is **disabled (grayed out, cursor shows "not-allowed")** when no change is made
- [ ] Save button becomes **enabled (bright amber, normal cursor)** when timezone differs from current
- [ ] Save button text is always "Save" (not conditional)
- [ ] Profile dropdown **closes completely** after Save is clicked
- [ ] Timezone selector shows correct current timezone highlighted
- [ ] Timezone selector shows pending selection highlighted in amber
- [ ] All game times update immediately across **all views** (Calendar, My Teams, Day Details)
- [ ] Times show proper format: "h:mm AM/PM ABBR (UTC time)"

---

## Edge Cases to Test

1. **Same timezone selected twice**: Should keep Save button disabled
2. **Rapid timezone changes**: Click multiple times, then Save - should persist last selected
3. **Timezone with half-hour offset** (e.g., UTC+5:30): Should convert properly
4. **Games at midnight boundary**: Should not cause calculation errors
5. **Daylight Saving transitions**: Times should be based on provided UTC, not system DST

---

## Expected Behavior Summary

| Action | Before | Now |
|--------|--------|-----|
| App loads (logged in) | Browser timezone | Saved timezone from Supabase |
| Select same timezone | Save button visible | Save button disabled |
| Select different timezone | Save button visible | Save button enabled |
| Click Save | Dropdown stays open | Dropdown closes, dropdown completely closes |
| Game time display changes | Required page reload | Immediate update |
| Add team after timezone change | Team uses old timezone | Team uses saved timezone |
| Cancel/click outside | Selection lost | Selection reverts, nothing saved |

---

## Browser Console

You should see **no errors** in the browser console. Expected logs:
- No timezone-related errors
- Timezone loads from Supabase with user data

---

## How to Verify Supabase Persistence

1. Open DevTools (F12)
2. Go to Console tab
3. Check there are no errors related to timezone saving
4. Log out and back in
5. Verify saved timezone persists

---

## Performance Notes

- Timezone change should update all 7 game time displays **instantly**
- No network requests trigger on timezone change viewing (only on Save)
- Once saved to Supabase, no need for page reload

---

## Rollback Instructions

If issues occur, the changes are minimal and localized to:
- Added `loadUserTimezone()` function
- Modified hydration to load timezone
- Changed Save button conditional to check for changes
- Added `setShowProfileMenu(false)` to close dropdown after save

To revert, revert these specific changes in `src/App.tsx`.
