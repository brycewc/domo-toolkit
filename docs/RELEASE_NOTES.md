# Domo Toolkit v1.7.0 Release Notes (WIP)

## New Features and Improvements

- Migrate Content and Remap Columns can now drop a column that a dataset view only selects, removing the output columns it feeds instead of forcing a remap.
- Choosing to drop such a column now says which view columns go away with it.

## UI Improvements

## Bug Fixes

- Remap Columns no longer offers to drop a broken view column that the view also filters, groups, or sorts on.
