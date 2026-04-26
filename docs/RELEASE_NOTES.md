# Domo Toolkit v1.3.0 Release Notes (WIP)

> Version bumped from 1.2.1 → 1.3.0 due to scope of new features.

## New Features

### Off-boarding: Transfer Ownership

- Transfer ownership of all object types from one user to another
- Select which object types to include in the transfer
- Preview what needs to be (or can be) transferred beforehand, with object counts shown on mount
- Option to delete the user after a successful transfer
- Option to email the recipient with an Excel attachment listing everything transferred (types + IDs)
- Quick button to transfer ownership to the user's manager (uses `reportsTo` from user context)

### View Ownership by User

- View everything a given user owns, grouped by object type
- Shares much of its functionality with Transfer Ownership
- Virtualized list for fast rendering of large ownership results

### Duplicate (Clone) User

- Clone an existing user — copies all access, group membership, and user configuration
- Just change the name and email; everything else carries over
- (Consider renaming the button to "Clone")

### Direct Sign-On

- New Direct Sign-On button

### Update Object Details

- Generalized "Update Dataflow Details" into a generic component that works for any object type
- Newly supports datasets (used to update `userDefinedType`)
- Interface moved from a modal to a view

### Delete Object Improvements

- Lists the object's dependencies (child pages, output datasets, downstream cards) before confirming the delete — collapsible groups so even objects with many dependents stay scannable
- Pages with child pages are now hard-blocked from deletion (with the reason shown inline) instead of just warning after the fact
- Interface moved from a modal to a view, consistent with Update Object Details
- Worksheet pages are now deletable (previously the primary delete button was disabled for them)
- The "Delete app and all cards" cascade option for app pages is now a visible button inside the view (previously hidden behind a long-press on the trigger)

## Newly Supported Object Types

- Certification Process (recognized objects + Navigate to Copied Object)
- AI Toolkits and AI Agents in the AI Library (registered objects + URL detection)
  - TODO: Navigate to Copied Object, Transfer Ownership, View Ownership

## API Error Tracking Expansion

- Expanded from just cards to all object types
- Also tracks non-object errors (e.g., list pages) — shows all errors
- ApiErrors count now rendered as a soft-danger chip
- General UI refinements to ApiErrorsView
- Not fully done yet, maybe some UI changes

## UI/UX Changes

- Dropped mobile breakpoints for the extension UI — buttons are smaller with less padding, overall more desktop-sized (side panel and popup were too large before because they inherited mobile styles)
- Activity Log: filter by multiple users _(not fully working yet)_
- New `ObjectTypeIcon` component renders in DataListView for visual object-type identification
- CopyFilteredUrl: count moved next to the label; button relabeled "Copy Filters"
- Toast messages now truncate at max-height (was growing unbounded for long text)
- Code Engine Package Version: default copy action now copies the parent Code Engine Package ID (via new `copyConfigs` on DomoObjectType)
- Tooltips added to all action buttons
- Current context header truncates when chips are too large
- Update Code Engine Versions: built-in Domo packages restricted to upgrade-to-latest only (no downgrades or intermediate versions); built-ins are labeled with a "Built-in" chip

## Bug Fixes and Improvements

- Removed duplicate icon in the alternate/additional actions menu for Copy
- Fixed side panel state not syncing when two separate browser windows were open (windows didn't share focus, so state wouldn't update on one and would overwrite on the other)
- Fixed detection issues caused by the URL-lowercasing change:
  - Code Engine route with capitalized "Engine" broke some detection logic
  - Card ID detection broke when "I" was capitalized
- Fixed Navigate to Copied Object incorrectly identifying Pages as App Studio apps
- Fixed Delete button not showing its normal tooltip for objects that have additional options (verified)
- ID validation added to current object detection

## Security

- CodeQL remediation: tightened URL matching; scoped GitHub Actions permissions

## Docs / GitHub Pages Site

- Local development setup for the docs site
- Dark mode support on the GitHub Pages site

## Refactoring

- Various internal refactors for extensibility and code quality (not user-facing)
- Removed `allObjects.js`; dispatch functions moved to per-domain files (e.g., `share.js`) and domain logic extracted into service files
- `DomoObjectType` now uses an objects-object argument for cleaner configuration
