# Domo Toolkit v2.0.0 Release Notes (WIP)

## New Features and Improvements

- Users now support Delete, which opens Transfer Ownership with Delete user after transfer turned on.
- Deleting a scheduled report now lists the card or page it is scheduled on.
- Deleting a scheduled report now lists its recipients under Subscriptions.
- Deleting a scheduled report now shows whether it is active, disabled, or expired.
- Deleting an active scheduled report with recipients now requires a hold.
- Report Builder deliveries no longer support Delete.
- Deleting the only page in an App Studio app or worksheet now offers only the app delete options, with a note that the page can't be deleted on its own.
- Sandbox Repositories now support Delete, listing their content and the instances they are shared with.

## UI Improvements

- Deleting a card that doesn't live anywhere now says which places were checked for it, even when it has Beast Modes or drills to delete.
- The No Dependencies Found message on a delete no longer sits inside the collapsible Warnings section.
- Get Card Pages on a card now lists the workspaces it has been added to, replacing the card's Get Workspaces button.
- Deleting a card now lists the workspaces it has been added to.
- Deleting a card now lists its alerts.
- Alert links now open the alert on its card or dataset.
- Current Context now shows the parent of more objects, such as a card's dataset or custom app, an alert's card or dataset, a subpage's parent page, and a Beast Mode's card when it is saved to one.
- Get Card Pages on other objects, and deleting a page, now offer a Check Workspaces option for the cards involved, including on the toast when no pages are found.
- Once workspaces are checked, cards in a workspace no longer count as orphaned or as cards that only live here.
- Hovering over a cut-off notification now shows its full text.

## Bug Fixes

- Sandbox Repositories now load their details, so their names show instead of IDs.
- Deleting a dataset or dataflow now lists the alerts on its cards, not just the alerts on the dataset/output datasets.
- Get App Cards and Get Worksheet Cards no longer silently leave out a page that failed to load, and flag it in the list instead.
- Get Card Pages and Get Beast Modes for a whole app or worksheet now warn when a page's cards could not be loaded.

- Deleting a dataset or dataflow now requires a hold when a Jupyter Workspace uses a dataset the delete removes.
