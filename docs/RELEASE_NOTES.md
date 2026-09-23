# Domo Toolkit v1.8.0 Release Notes (WIP)

## New Features and Improvements

- Get Cards now lists the workflows on an App Studio page, in their own Workflows group.
- Get Cards now lists the forms placed directly on an App Studio page, and the forms and workflows behind its buttons.
- The object details view now has an Activity Log button in its header.

## UI Improvements

- When deleting a dataflow or dataset, the impact counts on output datasets and child views now appear right away instead of about 10 seconds later.
- Total downstream counts on datasets in the delete view now read "(N impact)" instead of "(N dependencies)".
- Connector input datasets in the dataflow delete view now show their full downstream impact outside the dataflow, as "(N other impact)".
- The dataflow delete confirmation now warns which output datasets have downstream dependencies.
- Deleting a dataflow whose output datasets have downstream dependencies now requires holding the Delete button for 5 seconds.
- Menus, selects, and buttons that open a popover no longer show a focus ring after a mouse click. _(TODO: from the HeroUI 3.2.6 upgrade; confirm 1.7.0 actually showed one, else drop)_

## Bug Fixes

- Workflows on an App Studio page are now listed as workflows instead of as a form named "Start the workflow".
- Task Center queues on an App Studio page now show up even when you aren't shared on the queue.
- Get Cards on a page holding only forms, workflows, or queues now lists them instead of reporting that nothing is there.
- Update Details and Generate Schema now lock their text fields while saving.
