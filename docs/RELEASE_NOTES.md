# Domo Toolkit v1.8.0 Release Notes (WIP)

## New Features and Improvements

- Get Cards now lists the workflows on an App Studio page, in their own Workflows group.
- Get Cards now lists the forms placed directly on an App Studio page, and the forms and workflows behind its buttons.
- The object details view now has an Activity Log button in its header.
- A new Get Collections button lists the AppDB collections used by an app card, the app cards on a page or App Studio app, every instance of an app design, or a Jupyter workspace, including collections borrowed from other apps.
- Get Usage on a Code Engine Package now lists the AI toolkits that use it, and the Current Context footer has an AI Toolkits tab.
- Deleting a Code Engine Package is now blocked while an AI toolkit uses it.
- A new Enable DataFlows Dev button on a dataflow reloads it with the dataflows-dev feature switch turned on, and turns it back off once it is on.
- The Current Context footer on a Jupyter dataflow now has a Jupyter Workspace tab linking to the workspace that runs it.

## UI Improvements

- When deleting a dataflow or dataset, the impact counts on output datasets and child views now appear right away instead of about 10 seconds later.
- Total downstream counts on datasets in the delete view now read "(N impact)" instead of "(N dependencies)".
- Connector input datasets in the dataflow delete view now show their full downstream impact outside the dataflow, as "(N other impact)".
- The dataflow and dataset delete confirmations now warn about downstream dependencies.
- Deleting a dataflow or dataset with downstream dependencies now requires holding the Delete button, for 5 seconds when dataflows or datasets depend on it and 2.5 seconds when only cards and alerts do.
- The dataflow delete view now opens the Output DataSets group automatically when the dataflow has only one output.
- The Action and Object Type filters in the activity log are now searchable fields that show your selections as removable tags.

## Bug Fixes

- Navigate to Copied Object's manual selection list now offers every matching type, including DataSet, Worksheet, and Variable, instead of hiding types that open the same page.
- Workflows on an App Studio page are now listed as workflows instead of as a form named "Start the workflow".
- Task Center queues on an App Studio page now show up even when you aren't shared on the queue.
- Get Cards on a page holding only forms, workflows, or queues now lists them instead of reporting that nothing is there.
- Update Details and Generate Schema now lock their text fields while saving.
- Views can be deleted again.
- Objects Owned and Transfer Ownership now list a user's certification processes instead of failing to load them.
- Deleting a view, data fusion, or data model now lists its downstream dependencies instead of reporting that they aren't supported.
- API Errors now captures failed requests on tabs that were already open when the extension updated.
- API Errors no longer loses its captured errors after the browser sits idle for a short while.
- Errors returned by Domo now show up as errors instead of being reported as success or as finding nothing.
- Get Usage's filter to the current Code Engine Package Version now shows the workflows that use that version.
- Migrate Content now moves cards that filter or have a slicer on a column the dataset no longer has, removing that filter or slicer, instead of failing.
- Migrate Content and Remap Columns now update older DataSet views that filter rows or calculate a column, instead of failing with "GET fusion HTTP 400".
- Get Workspaces no longer appears on system pages like Overview and Favorites.
- Migrate Content and Remap Columns now update DataSet unions. _(TODO: unverified whether unions failed or were saved wrong in 1.7.0)_
