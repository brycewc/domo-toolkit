# Domo Toolkit v1.9.0 Release Notes

## New Features and Improvements

## Newly Supported Object Types

- Connectors are now detected on their App Store page, with Streams and Accounts tabs listing where they are used.

## UI Improvements

## Bug Fixes

- Fixed Cancel Run not working on datasets with a long run history.
- Objects Owned and Transfer Ownership no longer show failed rows for object types the instance doesn't have enabled, such as Workflows, Code Engine, Jupyter, or Goals.
- Deleting a Code Engine package is no longer blocked on instances without Workflows or AI Services.
- Deleting a Workflow now succeeds when a deleted version was left running, and reports an error instead of success when the Workflow isn't actually deleted.
