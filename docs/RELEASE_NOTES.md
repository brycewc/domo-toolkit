# Domo Toolkit v2.0.0 Release Notes

## Lineage Graph

- **Trace upstream and downstream dependencies** for datasets and dataflows via the new Lineage Viewer
- Full rewrite of data preview panel using HeroUI tables with proper handling of empty strings and nulls
- Dark mode support for the lineage graph
- Improved legend positioning and styling, added root node indicator
- Caching for dataflow inspector and data preview for faster repeated loads
- Sidepanel automatically closes when launching lineage for a cleaner experience

## Clipboard Navigation Overhaul

- **Navigate to copied objects** now activates on button click instead of passive clipboard monitoring
- Removed all background clipboard listening infrastructure for improved reliability and reduced resource usage

## New Object Types

- **WORKFLOW_TRIGGER** — replaces WORKFLOW_START_TIMER with modal recognition and related object support
- **HOPPER_TASK** — recognized from workflow user-task-response pages

## UI Refresh

- **Upgraded to HeroUI RC** with refreshed components throughout the extension
- Alert icons updated to Tabler icon set for consistency
- New transparent extension icon that looks great on all toolbar backgrounds — removed the light/dark icon toggle from settings
- Centered Welcome and Release Notes pages for better visual balance

## Bug Fixes and Improvements

- Fixed case sensitivity in URL-based object detection
- Fixed governance toolkit job detection
- Fixed theme preferences not matching between production and dev versions
- Fixed Get Card Pages not working from the popup
- Updated workflow save to fetch the latest definition first, preventing accidental overwrites of concurrent changes
- Added Code Engine version update functionality
- New child pages API endpoint for improved page discovery
