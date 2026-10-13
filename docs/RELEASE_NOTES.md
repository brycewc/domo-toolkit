# Domo Toolkit v1.8.0 Release Notes

## New Features and Improvements

- A new Get Collections button lists the AppDB collections used by an app card, the app cards on a page or App Studio app, every instance of an app design, or a Jupyter workspace, including collections borrowed from other apps.
- A new Enable Dev Tools button on a dataflow reloads it with the dataflows-dev feature switch turned on, and turns it back off once it is on.
- The Current Context footer on a Jupyter dataflow now has a Jupyter Workspace tab linking to the workspace that runs it.

### Get Cards

- Now lists the workflows on an App Studio page, in their own Workflows group.
- Now lists the forms placed directly on an App Studio page, and the forms and workflows behind its buttons.

### Activity Log

- Added a button to the header of the object details view.
- Holding the button on a user or group now offers Owned Objects, which opens the activity log for everything they own.

### Code Engine Packages

- Get Usage now lists the AI toolkits that use a package, and the Current Context footer has an AI Toolkits tab.
- Deleting a package is now blocked while an AI toolkit uses it.

## UI Improvements

- The Action and Object Type filters in the activity log are now searchable fields that show your selections as removable tags.
- The "Not Checked" warning in Objects Owned and Transfer Ownership can now be dismissed.

### Delete

- Impact counts on a dataflow's output datasets and a dataset's child views now appear right away instead of about 10 seconds later.
- Total downstream counts on datasets now read "(N impact)" instead of "(N dependencies)".
- Connector input datasets on a dataflow now show their full downstream impact outside the dataflow, as "(N other impact)".
- Confirming the delete of a dataflow or dataset now warns about downstream dependencies.
- A dataflow or dataset with downstream dependencies now requires holding the Delete button, for 5 seconds when dataflows or datasets depend on it and 2.5 seconds when only cards and alerts do.
- The Output DataSets group now opens automatically when a dataflow has only one output.

## Bug Fixes

- Navigate to Copied Object's manual selection list now offers every matching type, including DataSet, Worksheet, and Variable, instead of hiding types that open the same page.
- Update Details and Generate Schema now lock their text fields while saving.
- Errors returned by Domo now show up as errors instead of being reported as success or as finding nothing.
- Get Usage's filter to the current Code Engine Package Version now shows the workflows that use that version.
- Switching the activity log from the DomoStats dataset to the API now shows the Description column in place of the Source column.
- Get Workspaces no longer appears on system pages like Overview and Favorites.
- Copy now copies the dataset's ID instead of the highlighted cell when a cell is selected in the dataset's data table.
- Migrate Beast Mode Usage no longer deletes the original Beast Mode while drills it can't update still use it, and checks with Domo that nothing uses it right before deleting.

### Get Cards

- Workflows on an App Studio page are now listed as workflows instead of as a form named "Start the workflow".
- Task Center queues on an App Studio page now show up even when you aren't shared on the queue.
- A page holding only forms, workflows, or queues now lists them instead of reporting that nothing is there.

### Delete

- Views can be deleted again.
- Views, data fusions, and data models now list their downstream dependencies instead of reporting that they aren't supported.

### API Errors

- Now captures failed requests on tabs that were already open when the extension updated.
- No longer loses its captured errors after the browser sits idle for a short while.

### Transfer Ownership

- Now lists a user's certification processes instead of failing to load them, as does Objects Owned.
- No longer lets you pick the source user or group as the new owner.
- Now only offers to delete the user when every type loaded and every object they own is selected for transfer, and warns that the types it can't check will be orphaned.
- Opening another view right after a transfer finishes no longer closes the new view a few seconds later.

### Migrate Content and Remap Columns

- Migrate Content now moves cards that filter or have a slicer on a column the dataset no longer has, removing that filter or slicer, instead of failing.
- Both now update older dataset views that filter rows or calculate a column, instead of failing with "GET fusion HTTP 400".
- Both now update dataset unions in views.
