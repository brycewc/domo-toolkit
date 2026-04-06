# Domo Toolkit v2.0.0 Release Notes

## Lineage

- Trace upstream and downstream datasets and dataflows via the new lightning-fast lineage viewer
- View dataset previews and dataflow tile operations directly from the graph for quick insights into your data pipelines
- Can be opened from dataset and dataflow pages and any data discovery views with dataset/dataflow links
- Includes support for dark mode and opens in a new tab for maximum screen real estate
- Huge thank you to Will West for his work on this feature!

## Bulk Update Workflow Code Engine Package Versions

- New bulk update feature for workflow actions and their defined code engine package versions
- Update all package references to the latest version with a single click, or select specific packages and versions to update
- Keeps all input and output mappings, saving you hours per week of tedious clicks

## Clipboard Navigation Overhaul

- Navigate to copied object now activates on button click instead of passive clipboard monitoring for improved reliability and reduced resource usage

## New Object Types

- **WORKFLOW_TRIGGER** — modal recognition and related object support

## Bug Fixes and Improvements

- New transparent extension icon that looks great on all toolbar backgrounds — removed the light/dark icon toggle from settings
- Alert icons updated to Tabler icon set for consistency
- Removed case sensitivity in URL-based object detection (accommodates a new code engine route)
- Improved reliability of governance toolkit job detection
- Fixed Get Card Pages not working from the popup
- New child pages API endpoint for improved speed of page discovery
