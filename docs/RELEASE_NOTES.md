# Domo Toolkit v2.0.0 Release Notes (WIP)

## New Features and Improvements

- Users now support Delete, which opens Transfer Ownership with Delete user after transfer turned on.

## UI Improvements

- Deleting a card that doesn't live anywhere now says which places were checked for it, even when it has Beast Modes or drills to delete.
- The No Dependencies Found message on a delete no longer sits inside the collapsible Warnings section.
- Get Card Pages on a card now lists the workspaces it has been added to, replacing the card's Get Workspaces button.
- Deleting a card now lists the workspaces it has been added to.
- Get Card Pages on other objects, and deleting a page, now offer a Check Workspaces option for the cards involved, including on the toast when no pages are found.
- Once workspaces are checked, cards in a workspace no longer count as orphaned or as cards that only live here.
- Hovering over a cut-off notification now shows its full text.

## Bug Fixes

- Deleting a dataset or dataflow now requires a hold when a Jupyter Workspace uses a dataset the delete removes.
