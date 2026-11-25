---
published: false
---

# #10: Pin Preconfigured Set of Features to Left Nav for a New Instance

Status: **decided**. This is the plan for [#10](https://github.com/brycewc/domo-toolkit/issues/10), written 2026-11-20 against branch `2.0.0`, with every open decision settled by the maintainer on 2026-11-23. Cross-issue decisions (`DX.*`), the shared infrastructure, the landing order across issues, and the pre-existing bugs found while planning live in [open-issues-plan.md](open-issues-plan.md).

API claims in this plan carry one of these tags: **VERIFIED-LIVE** (called on domo.domo.com and the response inspected), **VERIFIED-CODE** (already used the same way in `src/`), **SPEC-ONLY** (from the OpenAPI spec, not exercised), or **INFERRED**.

## Summary

Power users (consultants, CSMs, SEs, admins, Domo staff) land on a lot of instances: customer instances, trials, sandboxes, rigs. Each new instance opens with Domo's default left-nav pins, so the user rebuilds the same nav by hand every time (unpin the defaults, then pin Workspaces, Apps, DataSets, DataFlows, Workflows, Code Engine, and so on). The issue asks for a preset, kept in the extension, that replaces the default pins the first time you sign in to a new instance.

Interpretations considered:

1. **Hand-built preset in options**: a picker over Domo's feature catalog where you add pins one at a time. This duplicates Domo's own Add Pin picker (see Scope check), so it is not planned.
2. **Captured presets (planned)**: you arrange your nav in Domo the way you like, then click **Capture from Instance** in options and name the preset. The extension keeps the pins that mean the same thing on any instance (feature pins, smart folders, external links, generic same-instance links, and folders of those) and applies that list elsewhere. You can keep several named presets, for example "Customer" and "Internal rig" (D10.6).
3. **Admin Navigation Views**: pushing a nav to _other_ users on one instance. Domo already does this (Admin > Company Settings > Navigation Views), so it is out of scope.

"The first time you login to a new instance" is read as an **offer, never an automatic change** (D10.1): the first time you open the side panel or popup on an instance this browser has no record of, and your personal pins there are still Domo's untouched defaults, a toast offers to apply your preset in one click. Nothing changes your nav until you press it. A manual **Apply Now** in options covers every other case, with **Replace** and **Add Missing** (D10.2).

## Scope check

**What Domo's UI already does, per instance only:**

- Pin, unpin, rename, recolor, and drag to reorder your own pins (the left nav's Edit Pins mode). The add-pin picker greys out a feature that is already pinned (`navigation/feature-already-pinned`, a client-side tooltip and `aria-disabled` state in chunk `28547-08a35b12fdd13e74`; nothing shows the server rejecting a duplicate).
- Pin a whole feature section as a folder in one click (chunk `4343-8566eb7aa4e62752`, component `ew`).
- Admins can build Navigation Views (`/admin/companysettings/navigationConfigs`) with a pin list, a "personalization disabled" lock, per-pin unlocking (`unlockPins`), and group or user assignments. These belong to one instance and target other people.

**What Domo cannot do:** carry your own nav from one instance to another, or offer it on first sign-in. That is a repeated multi-step chore, the "batches an operation Domo only offers one at a time" case in CLAUDE.md, so the feature belongs. The only "import" entry in the nav bundle (`showImportJson`, `data_etl_import_json`) is the dataset connector, not a pin import, so there is no competing Domo feature.

**Cut because Domo already does it well:** editing pin icons, colors, labels, and order inside the extension. Arrange the nav in Domo, then capture it. The options list only lets you drop an item from the preset or recapture.

**What already exists in this codebase:**

- `src/background.js` `getInstanceUser()` (line 475): resolves the signed-in user for an instance, used by the offer check and the apply handlers. `detectAndStoreContext()` (line 1559) is no longer a hook point, since nothing runs on detection (D10.1).
- `src/services/features.js` `getFeatureSwitches(tabId)` and `src/utils/featureSwitches.js` `isFeatureSwitchEnabled(requirement, context)`: switch reading and fail-open checks, reused for feature-pin availability.
- `src/utils/currentObject.js` `getValidTabForInstance(instance)` (line 748): prefers the active tab, matches by `instanceKeyFromUrl` authority (local ports included), and throws "No open tab found for X". Reused for every options-page action on a chosen instance.
- `src/utils/constants.js` `DOMO_MATCH_PATTERNS`: tab query patterns for hosted plus internal hosts. Reused for the instance picker.
- `src/utils/instance.js`: `instanceKeyFromUrl`, `instanceLabel`, `instanceOriginFromKey`.
- `src/services/governanceToolkit.js` (line 344) and `src/services/pageVariables.js` (line 69) `findStore()`: reaching Domo's Redux store from page context. Reused to refresh the nav in place.
- `src/hooks/useReleaseNotification.jsx`: a one-time toast with an action button, mounted in both `src/sidepanel/App.jsx` and `src/popup/App.jsx`. The first-visit offer copies this pattern.
- `src/utils/clearCookies.js`: `chrome.cookies.getAll` over Domo hosts (the manifest already grants `cookies`). Reused as one source of "instances this browser already uses".
- `src/hooks/usePerInstanceSettings.js`: the `chrome.storage.local.perInstance` map. Not reused for nav state, because `PerInstanceSettings.jsx` draws a card for every key in that map (`Object.entries(settings)`, line 47), so a marker per visited instance would fill that tab with empty cards. Its keys are read as a seeding source.
- `src/components/buttons/HoldToConfirmButton.jsx`: for Replace on a customized nav.
- Nothing in `src/services/` touches `/api/nav/` today.

## API and platform findings

All live calls were read-only GET (plus OPTIONS in earlier stages) against domo.domo.com as the token user `1813188617`. No pin was written: the token user's nav is off limits. Write semantics come from Domo's own frontend bundle on `cdndomo.com/public/` (chunks `64501-8fec046eb36eb488`, `4343-8566eb7aa4e62752`, `28547-08a35b12fdd13e74`, `18900-802b7956ec97ea05`, `49662-5bf3225b0fd69e37`, `11746-0c253f0890d1def4`, `63636-9f083576828eb1ff`). Domo's pin API wrapper (chunk `64501`, module `367389`) is, de-minified:

```js
const PINS = '/api/nav/v1/pins';
append = (pin, folderId = 0) => post(folderId ? `${PINS}/append?folderId=${folderId}` : `${PINS}/append`, normalize(pin));
update = (pin) => patch(`${PINS}/${pin.id}`, normalize(pin)); // edits and reorder
remove = (id) => delete `${PINS}/${id}`;
list = () => get(PINS);
// normalize() rewrites action.type through module 508867 (worksheet -> data_app, workflow_model/workflow_start -> workflow)
```

| Need                     | Method + path                                                                   | Tag                                                                                                                                                                                                      | Notes                                                                                                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read pins                | `GET /api/nav/v1/pins`                                                          | VERIFIED-LIVE                                                                                                                                                                                            | Personal pins, plus view pins when a Navigation View applies. No query params.                                                                                                                                                                          |
| Add pin                  | `POST /api/nav/v1/pins/append`, optional `?folderId=<pinId>`                    | method VERIFIED-LIVE (OPTIONS on `/pins/append`: `POST,PATCH,DELETE,OPTIONS`; PATCH and DELETE appear only because `append` also matches the `/pins/{id}` route); body and response INFERRED from bundle | Body is **one pin object** (the spec example shows an array, SPEC-ONLY). Response is the full pin list (the UI dispatches it straight into Redux).                                                                                                      |
| Move or edit pin         | `PATCH /api/nav/v1/pins/{id}`                                                   | method VERIFIED-LIVE (OPTIONS on `/pins/42597`: `PATCH,DELETE,OPTIONS`); body INFERRED from bundle                                                                                                       | Not in the spec. Reorder sends `{...pin, order, parentPinId: undefined}`, where `order` is the `order` of the pin it should land before, or `null` to land last (helper `Wc`, chunk `28547`). Response is the full list.                                |
| Remove pin               | `DELETE /api/nav/v1/pins/{id}`                                                  | method VERIFIED-LIVE (same OPTIONS); behavior INFERRED from bundle                                                                                                                                       | Not in the spec. Response is the full list.                                                                                                                                                                                                             |
| Bulk replace             | `POST /api/nav/v1/pins` (`updatePins`)                                          | SPEC-ONLY (OPTIONS on `/pins`: `POST,GET,HEAD,OPTIONS`)                                                                                                                                                  | Domo's UI never calls it. Avoided.                                                                                                                                                                                                                      |
| Reset to defaults        | `POST /api/nav/v1/pins/reset` (`resetPins`)                                     | SPEC-ONLY                                                                                                                                                                                                | Domo's UI never calls it, no body or response documented. Avoided.                                                                                                                                                                                      |
| New left nav on?         | `GET /api/nav/v1/leftnav/enabled`                                               | VERIFIED-LIVE                                                                                                                                                                                            | Body `true`. Domo's wrapper treats an error as `false`.                                                                                                                                                                                                 |
| View applied to a user   | `GET /api/nav/v1/views/users/{userId}/view`                                     | VERIFIED-LIVE: 204 for `1813188617`; 200 for group member `1084204596`                                                                                                                                   | 200 body is the view without pins: `{ id, name, description, createdBy, createdAt, updatedAt, locked, permissionsAware, pins: [], assignments: [] }`. Domo's nav calls this for every signed-in user on load (chunk `4343`), so no authority is needed. |
| View detail              | `GET /api/nav/v1/views/{viewId}`                                                | VERIFIED-LIVE                                                                                                                                                                                            | Only needed for testing. View pins carry `source: "VIEW"` and a per-pin `locked`.                                                                                                                                                                       |
| User created date        | `GET /api/content/v3/users/{id}?includeDetails=true`                            | VERIFIED-LIVE                                                                                                                                                                                            | `detail.created` in epoch seconds (`1748879739` for `1813188617`). Same endpoint as `getUserDetails` in `src/services/users.js` (VERIFIED-CODE). Not used: there is no account-age guard (D10.1).                                                       |
| Feature switches         | `window.features.getConfig()`                                                   | VERIFIED-CODE (`src/services/features.js`)                                                                                                                                                               | Polls up to 7.5 s, returns `null` if unreadable.                                                                                                                                                                                                        |
| User ID                  | `instanceUser.user.id`                                                          | VERIFIED-CODE (`getCurrentUser` in `src/services/users.js`)                                                                                                                                              | Already passed through `getInstanceUser`; no extra read.                                                                                                                                                                                                |
| Nav Redux slice          | `createSlice({ name: 'globalNavV2' })`, reducer `SET_NAVIGATION_PINS({ pins })` | INFERRED from bundle (chunk `64501`)                                                                                                                                                                     | Action type `globalNavV2/SET_NAVIGATION_PINS`. Domo dispatches it with the deduped `GET /pins` result after every pin call. Whether `findStore()` reaches the store holding this slice is a test step.                                                  |
| Writes from page context | plain `fetch` with `method: 'DELETE'` / `'PATCH'`                               | VERIFIED-CODE (`src/services/alerts.js` lines 665, 775)                                                                                                                                                  | Session cookie auth, no CSRF header.                                                                                                                                                                                                                    |

Managing your own pins needs no authority: every personal-pin call in the bundle is made for the signed-in user with no rights check (INFERRED).

**Pin shape** (trimmed `GET /api/nav/v1/pins`, VERIFIED-LIVE). Personal pins have exactly `action, icon, iconBackgroundColor, iconColor, id, label, order, source, sourceId` (no `locked` key):

```json
[
  {
    "id": 42597,
    "order": 0,
    "source": "PERSONAL",
    "sourceId": 1813188617,
    "icon": "data-app",
    "label": "MajorDomo Home",
    "action": {
      "type": "data_app",
      "id": "1644570665",
      "newTab": false,
      "iconDataFileId": 3290594,
      "currentRevisionId": 3387913,
      "showAppIcon": true
    }
  },
  {
    "id": 40162,
    "order": 2,
    "icon": "workspace",
    "iconColor": "#FFFFFFCC",
    "iconBackgroundColor": "#9E3C15FF",
    "label": "Workspaces",
    "action": { "type": "feature", "id": "teams_workspaces", "newTab": false }
  },
  { "id": 38330, "order": 3, "label": "Apps", "action": { "type": "feature", "id": "apps_apps", "newTab": false } },
  {
    "id": 43940,
    "order": 9,
    "label": "MajorDomo",
    "action": { "type": "workspace", "id": "be58b33f-da07-43d3-b874-00c0496b508b", "newTab": false }
  },
  {
    "id": 39523,
    "order": 10,
    "label": "Activity Log",
    "action": {
      "type": "link",
      "newTab": false,
      "url": "https://domo.domo.com/app-studio/1644570665/pages/1144346254/kpis/details/2019620443"
    }
  }
]
```

**Append body** (Domo's builder `L0`, chunk `28547`, INFERRED): `{ action: { type, newTab, id | url, ...type extras }, icon, iconColor, iconBackgroundColor, userId, label, id: 0, order: 0 }`. A new pin lands last. A feature-section folder is appended in **one POST with every child inline**: `{ userId, order: 0, label, icon, locked: false, action: { type: 'folder', newTab: false, children: [{ userId, order: i, label, icon, locked: false, action: { type: 'feature', id, newTab: false } }, ...] } }` (chunk `4343`, component `ew`, INFERRED). The Edit Pins dialog instead creates a folder with one child and adds more with `?folderId=` or a `parentPinId` PATCH; inline children of non-feature types are therefore unconfirmed.

**Domo's own pin identity** (chunk `64501`, function `d`, INFERRED), applied before every render:

```js
key = `${type}:${
  link
    ? url
    : smart_folder
      ? (id ?? `${smartFolderType}:${JSON.stringify(searchQuery ?? {})}`)
      : folder
        ? (id ?? `label:${label}`)
        : action.id
}`;
// on a collision, a VIEW pin replaces a PERSONAL one
```

Smart folders and folders are keyed by their server `id` when present, so a captured preset (no IDs) never matches a live one by Domo's key. The extension uses the id-free branch of this same scheme for cross-instance matching (Design).

**Action types** (bundle module `508867`, INFERRED): `alert, app, appstore, card, data_app, dataflow, dataset, feature, link, page, tool, workflow, workspace, folder, smart_folder`. Pin sources: `PERSONAL` and `VIEW`. A view pin can be `locked: false` while the view itself is not locked (`unlockPins`, chunk `11746`), so `source` and `locked` are independent.

**Portability across instances:**

| Action type                                                                                            | Identified by                                                     | Portable?                                                                                              |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `feature`                                                                                              | String constant (`teams_workspaces`, `data_etl_datasources`, ...) | Yes. Constants in Domo's shared frontend build; the live pins and the bundle catalog use the same IDs. |
| `smart_folder`                                                                                         | `smartFolderType` + `searchQuery`                                 | Yes (query based).                                                                                     |
| `link` to an external host                                                                             | URL                                                               | Yes.                                                                                                   |
| `link` to the source instance                                                                          | URL with that host                                                | Only when the path holds no object ID; the host is rewritten to the target.                            |
| `tool`                                                                                                 | Tool ID + `cloudProviderType`                                     | Yes (INFERRED), gated like features.                                                                   |
| `folder`                                                                                               | Label + children                                                  | Yes, with only its portable children; dropped if none are left.                                        |
| `data_app`, `card`, `page`, `dataset`, `dataflow`, `workflow`, `workspace`, `alert`, `app`, `appstore` | Instance-specific numeric ID or GUID                              | No. Skipped at capture and listed.                                                                     |

Captured from the token user's live nav, a preset would keep 7 of 15 pins (Workspaces, Apps, Dashboards, DataSets, DataFlows, Workflows, Code Engine) and skip 8 with a reason: MajorDomo Home (App Studio App `1644570665`), Object Exploration (App Studio App `699403591`), Product Release Training (App Studio App `1316297611`), MajorDomo (workspace `be58b33f-da07-43d3-b874-00c0496b508b`), Feature Owners (card `1404268240`), and Activity Log, Product Feedback Intake, and Snowflake Progress (links with object IDs).

**Feature visibility.** Domo's catalog (chunk `18900`) gives each feature a `show` condition built from switches and authorities. A _pinned_ item renders with `show: true` whatever the catalog says (chunk `4343`), so pinning a feature the instance lacks leaves a dead pin. Switch gates read from the bundle (constants resolved in chunk `63636`), INFERRED:

| Feature ID                         | Switch requirement           |
| ---------------------------------- | ---------------------------- |
| `teams_workspaces`                 | `workspaces-react`           |
| `apps_apps`                        | `data-app`                   |
| `worksheets`                       | `app-studio-worksheets`      |
| `automate_workflow`                | `workflows`                  |
| `automate_task_center`             | `hopper`                     |
| `automate_advanced_form_projects`  | `advanced-forms`             |
| `teams_approvals`                  | `approvalcenter`             |
| `teams_certification_center`       | `certified-content`          |
| `productivity_goals`               | `goals-v1`                   |
| `productivity_project_task`        | `!no-projects-tasks`         |
| `semantic_layer_semantic_layer`    | `data-modeling`              |
| `data_connections_cloud_amplifier` | `multi-cloud-data-warehouse` |
| `federated_agent_management`       | `federated-ui`               |
| `app_appdb_admin`                  | `appdb-admin`                |

This table mirrors the **nav catalog**, not `DomoObjectType.featureSwitch`, on purpose: Code Engine (`automate_code_engine_projects`) has no switch in the nav catalog (only `!isSocialUser`) although the code-engine object type uses `code-engine`, and Goals in the nav is `goals-v1` while the object type uses `['goals-beta', 'goals-v1']`. Authority conditions (`canManageDatasets`, `isSocialUser`, `goal.edit`) are not mirrored and fail open.

**Domo's default pins (INFERRED, the main unknown).** The Navigation View editor seeds a new view with Home (`main_nav_home`), Apps (`apps_apps`), Dashboards (`visualize_dashboards`), Alerts (`alerting_manage`), DataSets (`data_etl_datasources`), and DataFlows (`data_etl_dataflows`) (chunk `49662`). The token user's live pins `38330` to `38337` (Apps, Dashboards, DataSets, DataFlows, a gap at `38334` and `38335`, then Workflows and Code Engine) look like one server-materialized batch of real, deletable rows, so the server default probably also includes `automate_workflow` and `automate_code_engine_projects`. View `b9217b4c-26a3-45bf-b0f0-e4f42ce25ed5` is named "Default" (locked, no assignments) but is not applied to the token user (`views/users/1813188617/view` returns 204), so an unassigned view named Default is not an instance-wide default. What a brand-new user's first `GET /pins` returns is settled in testing on a fresh user.

**Out of scope but related:** `GET /api/nav/v1/workspaces/pins` (VERIFIED-LIVE) holds workspaces pinned inside the Workspaces feature, a separate list. `GET /api/nav/v1/leftnav/pin-state` (VERIFIED-LIVE, `false`) is whether the nav is held open. `GET /api/nav/v1/leftnav/user` returns 404 (VERIFIED-LIVE), so there is no per-user first-login flag to read.

## Design

**Where it lives**

- **Options page, new "Nav Pins" tab** (D10.5, `src/components/options/NavPinSettings.jsx`): the named presets, Capture, Apply Now (Replace and Add Missing), Rename, Delete, and the per-instance activity list with Undo.
- **Background** (`src/background.js`): seeding of known instances, the offer check, a per-instance lock, and the apply and undo message handlers. Nothing runs on detection, and the background never changes pins on its own (D10.1).
- **Side panel and popup**: a one-time offer toast the first time either surface opens on an instance that qualifies, and an Undo toast after an apply started from the offer. No badge, and no new action button: the feature is not tied to an object type, so `getAvailableActions()` is untouched.

**Storage**

```js
// chrome.storage.sync (follows the user to new browsers), one item per preset so each gets the 8 KB cap
navPinPresetIds = ['p_1f3a', 'p_9c02'];             // display order
'navPinPreset:p_1f3a' = {
  capturedAt: 1795219200000,
  capturedFrom: 'domo',                              // instance key
  id: 'p_1f3a',
  name: 'Customer',
  pins: [                                            // array order is nav order
    { action: { id: 'teams_workspaces', newTab: false, type: 'feature' },
      icon: 'workspace', iconBackgroundColor: '#9E3C15FF', iconColor: '#FFFFFFCC', label: 'Workspaces' },
    { action: { newTab: true, path: '/admin/companysettings', type: 'link' }, icon: 'gear', label: 'Admin' }
  ]
};

// chrome.storage.local (per device)
navPinKnownInstances = { acme: 1795219000000 };   // instances that were here before; never rendered
navPinLog = {
  globex: {
    appliedKeys: ['feature:teams_workspaces', ...],  // personal keys right after the apply, gates Undo
    at: 1795219300000,
    counts: { added: 4, moved: 3, removed: 2 },
    dropped: [],                     // pins the server accepted but did not keep
    error: null,
    mode: 'replace',                 // 'replace' | 'addMissing'
    navRefreshed: true,
    presetId: 'p_1f3a',
    presetName: 'Customer',          // kept so the row reads right after the preset is renamed or deleted
    reason: null,                    // 'locked-view' | 'leftnav-off' | 'changed'
    skippedView: ['DataSets'],       // preset pins already shown by a Navigation View
    snapshot: [/* personal pins as they were, for Undo */],
    status: 'applied',               // offered | dismissed | applying | applied | failed | undone
    unavailable: ['Task Center'],    // preset pins whose switch is off here
    unchecked: false                 // true when switches were unreadable and gates failed open
  }
};
```

A stored pin drops `id`, `sourceId`, `userId`, `order`, `source`, and `locked` (children too), keeping a 30-pin preset near 5 KB, under `chrome.storage.sync`'s 8,192-byte per-item cap. Capture measures each preset's serialized size and refuses above 8,000 bytes. Presets share `chrome.storage.sync`'s 102,400-byte total with the extension's other synced settings, so Capture also refuses a new preset when the area's `getBytesInUse()` would pass 90,000.

There is no auto-apply switch (D10.4). The offer needs no switch either: with no preset there is nothing to offer, and a dismissed offer never returns for that instance.

**New modules**

- `src/utils/navPins.js` (pure, no page access):
  - `pinKey(pin)`: the id-free branch of Domo's key, `feature:teams_workspaces`, `link:<url>`, `smart_folder:WORKSPACES:<query json>`, `<type>:<action.id>`. A folder's key is `folder:label:<label>` plus its children's keys, so a same-named folder with different contents counts as a different pin.
  - `toPresetPin(pin, sourceOrigin)` returns `{ pin, skipReason }` from the portability table. A same-instance link is kept as `path` only when the path matches neither `/\d{5,}/` nor a UUID.
  - `resolvePresetPin(presetPin, targetOrigin)` turns a `path` link back into a full `url`.
  - `NAV_FEATURE_SWITCHES` (the table above, with a one-line note that it mirrors the nav catalog, not `DomoObjectType`) and `isPresetPinAvailable(pin, context)`, wrapping `isFeatureSwitchEnabled` and recursing into folder children.
  - `DOMO_DEFAULT_FEATURE_IDS` (the six seed IDs plus `automate_workflow` and `automate_code_engine_projects`) and `isUntouchedNav(personalPins)`: true when there are none, or every personal pin is a `feature` pin whose ID is in that set. It is a subset test, so a default the server leaves out does not matter; an unknown extra default only yields a safe false "customized" skip.
  - `buildDesiredPins(preset, { context, currentPins, origin })` returns `{ desired, skippedView, unavailable }`: resolves links, drops unavailable pins, and drops any pin whose `pinKey` matches a `VIEW` pin already in the nav. With an unlocked Navigation View this puts the preset after the view's pins and skips the ones it already shows (D10.3).
  - `newPresetId()` and `presetStorageKey(id)` (`navPinPreset:<id>`).
- `src/services/navPins.js`, each function taking `tabId`, all through `executeInPage`:
  - `getNavPins(tabId)`: `GET /api/nav/v1/pins`.
  - `getNavPinEligibility({ userId }, tabId)`: one injected call returning `{ leftNavEnabled, view, pins }` (`leftnav/enabled`, then `views/users/{id}/view` with 204 as `null`, then `pins`). A failed fetch throws with `error.status`.
  - `applyNavPins({ desired, mode, userId }, tabId)`: one injected call that runs the converge (`mode: 'replace'`) or the append (`mode: 'addMissing'`) below sequentially, then refreshes Domo's nav in place, and returns `{ counts, dropped, finalPins, navRefreshed, orderMatches }`. The injected function cannot import, so it carries inlined copies of `pinKey`, Domo's dedupe `d`, and `findStore()` (the same pattern as `detectCurrentObject` and `pageVariables.js`); its JSDoc says so.

**Replace: converge algorithm** (idempotent; uses only the three calls Domo's UI uses)

1. `P` = current pins with `source === 'PERSONAL'` and not `locked`. `VIEW` pins are never touched, whatever their `locked` flag.
2. `D` = the desired list (from `buildDesiredPins`, or the snapshot for Undo).
3. `i` = length of the common prefix of `pinKey`s of `P` and `D`. Those pins stay put.
4. For each `d` in `D[i..]`, in order: if an unconsumed pin `p` in `P` has the same key, `PATCH /pins/{p.id}` with `{...p, order: null, parentPinId: undefined}` (move to last, keeps its ID); otherwise `POST /pins/append` with `d` (`id: 0, order: 0, userId`). A folder is appended in one POST with children inline; if the response folder is missing children, each missing child is appended with `?folderId=<new folder id>`.
5. `DELETE` every pin in `P` that was not consumed (extras and duplicates).
6. Read the last response (every call returns the full list) and compare personal keys to `D`. A pin that was posted but is absent goes to `dropped` (reported, not a failure). `orderMatches: false` is reported as a warning.
7. Refresh in place: `findStore()`; if `getState().globalNavV2` exists, dispatch `{ type: 'globalNavV2/SET_NAVIGATION_PINS', payload: { pins: d(finalPins) } }` and set `navRefreshed: true`.

Moving and appending before deleting means the nav is never empty mid-run, kept pins keep their IDs, and re-running from any interruption converges. An interrupted Replace is finished by running Apply Now again; the `applying` log entry keeps the first `snapshot` so Undo still restores the nav from before the first attempt.

**Add Missing** (D10.2). For each `d` in `desired`, in order, whose `pinKey` matches no personal pin and no `VIEW` pin, `POST /pins/append` (folders as in step 4 above). No PATCH, no DELETE, and no reorder: existing pins keep their place and new ones land at the end. Steps 6 and 7 (verify, refresh) run as in Replace. It never needs a hold, since it removes nothing.

**First-visit offer** (D10.1; replaces the automatic apply)

1. `useNavPresetOffer` runs in the side panel and popup once their current context names an instance. It sends `GET_NAV_PRESET_OFFER { instance }` to the background.
2. The background reads `navPinPresetIds` (sync) and `navPinLog`, `navPinKnownInstances` (local). If `navPinKnownInstances` is absent entirely (first run on this device, for example synced presets arriving on a new browser), it runs `seedKnownNavInstances({ exclude: instance })` first.
3. It answers `{ offer: false }` when there is no preset, the instance is known, or a log entry exists for it (any status, `dismissed` included).
4. Otherwise, with the tab from `getValidTabForInstance` and the user from `getInstanceUser`, it calls `getNavPinEligibility`. No offer, and nothing logged, when the left nav is off, a **locked** view applies, or `!isUntouchedNav(P)`. An unlocked view does not block the offer (D10.3). A failed read answers no offer and logs nothing, so the next open asks again.
5. Otherwise it logs `{ status: 'offered' }` for the instance and answers `{ offer: true, presets: [{ id, name, pinCount }] }`.
6. The hook shows the offer toast (UX). With one preset, its action sends `APPLY_NAV_PRESET { instance, mode: 'replace', presetId }`; with several, it opens the options page at `#nav-pins?instance=<key>` so the user picks one there. Closing the toast without acting sends `NAV_PRESET_OFFER_DISMISSED { instance }`, which logs `dismissed`. The offer is Replace because the nav is still Domo's defaults.
7. After an apply from the offer, the toast that reports it carries an **Undo** action (`UNDO_NAV_PRESET`).

**Seeding known instances** (`seedKnownNavInstances`). Runs when the first preset is captured, on `chrome.runtime.onInstalled` when a preset exists, and on first run on a device (offer step 2). Sources, each mapped through `instanceKeyFromUrl`: hosts of `chrome.cookies.getAll({ domain: 'domo.com' })`, open tabs on `DOMO_MATCH_PATTERNS`, `perInstance` keys, `instanceUsersBackup` (session), and `defaultDomoInstance` (sync). Seeding triggered by an offer check excludes that instance, whose sign-in cookie is already set, and that instance then goes through the normal untouched check.

**Apply, Undo, and preview (messages to background, sharing a per-instance lock)**

- `APPLY_NAV_PRESET { instance, mode, presetId }`: resolves the tab with `getValidTabForInstance`, the user with `getInstanceUser`, and always reads switches with `getFeatureSwitches(tabId)` (it polls up to 7.5 s, and the cache can be cold after a service worker restart; if still `null`, it continues fail-open and marks `unchecked`). A locked view blocks it with reason `locked-view`, and left nav off with `leftnav-off`. Otherwise it writes `{ status: 'applying', mode, presetId, presetName, snapshot: P }` **before** mutating (keeping an existing `applying` entry's snapshot), calls `applyNavPins`, then writes `applied` (with `appliedKeys`) or `failed`. No tab reload (Design decisions).
- `UNDO_NAV_PRESET { instance }`: re-reads pins and refuses with reason `changed` unless the personal keys still equal `appliedKeys`; otherwise converges to `snapshot` with Replace and logs `undone`.
- `GET_NAV_PRESET_PREVIEW { instance }`: read-only, returns `{ customized, personalCount, view }` so the options row knows whether Replace needs the hold.
- Capture is read-only, so the options page calls `getNavPins(tabId)` and `toPresetPin` directly and writes the preset item and `navPinPresetIds`.

**Failures.** A network error, a 5xx, or a 401 (session not ready) before the first write changes nothing and logs `failed` with the error, leaving Apply Now available. A failure mid-apply logs `failed`; the `snapshot` is kept so Undo and Apply Now stay available, and running Apply Now again converges from wherever it stopped.

Every page call goes through `executeInPage`, so `canActOnHost()` already gates internal instances.

## UX

**Entry point:** options page, new tab **Nav Pins**, after Per-Instance Settings.

**Flow:**

1. The user arranges their nav in Domo on a familiar instance.
2. Options > Nav Pins > pick that instance in **Capture From** > **Capture from Instance**, then name the preset (or pick an existing one to recapture into).
3. The preset renders. Pins left out are listed under "Not Captured" with a reason. Every instance this browser already knows is recorded as known when the first preset is captured.
4. The first time the user opens the side panel or popup on a new instance whose nav is still Domo's defaults, a toast offers the preset. Pressing **Apply** replaces the default pins in place, and the confirmation toast carries Undo. Closing the offer dismisses it for that instance.
5. Any time, Options > Nav Pins > **Apply To** an open instance, pick a preset, and press **Replace** or **Add Missing**.

**Options tab mockup:**

```
 Favicon Preferences   Per-Instance Settings   [Nav Pins]   General Settings

 Nav Pin Presets                                   [Customer v] [Rename] [Delete]
 Customer: captured from domo.domo.com on Nov 19, 2026 (7 pins)

 +--------------------------------------------------+
 | [icon] Workspaces          Feature            (x) |
 | [icon] Apps                Feature            (x) |
 | [icon] Dashboards          Feature            (x) |
 | [icon] DataSets            Feature            (x) |
 | [icon] DataFlows           Feature            (x) |
 | [icon] Workflows           Feature            (x) |
 | [icon] Code Engine         Feature            (x) |
 +--------------------------------------------------+
 > Not Captured (8)   MajorDomo Home: App Studio App only on domo.domo.com ...

 Capture From [domo.domo.com v]  Into [New preset...  v]  [Capture from Instance]
 Apply To     [acme.domo.com v]  Preset [Customer v]       [Replace] [Add Missing]

 Instances
 globex.domo.com    Customer applied Nov 19, 2026 (4 added, 3 moved, 2 removed)  [Undo]
 initech.domo.com   Internal rig added Nov 20, 2026 (3 added)                     [Undo]
 umbrella.domo.com  Skipped: an admin locked the nav on this instance.
```

**First-visit offer in the side panel and popup** (once per instance, `timeout: 0`; closing it logs `dismissed`):

```
 +----------------------------------------------------------+
 | (i) Use Your Nav Pins Here?                               |
 |     Replace Domo's default pins on globex.domo.com with   |
 |     your Customer preset (7 pins).                [Apply] |
 +----------------------------------------------------------+
```

With several presets the description reads "You have 3 nav pin presets. Choose one to replace Domo's default pins on globex.domo.com." and the action is **Choose Preset**, which opens the Nav Pins tab with globex.domo.com preselected in Apply To.

**After applying from the offer:**

```
 +----------------------------------------------------------+
 | (i) Nav Pins Applied                                      |
 |     Your 7 Customer pins replaced the default pins on     |
 |     globex.domo.com.                               [Undo] |
 +----------------------------------------------------------+
```

**States and copy** (toast titles in Title Case, descriptions end with a period):

| State                             | Where                           | Copy                                                                                                                                                    |
| --------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No preset                         | Options                         | Empty state: "No nav pin presets yet. Arrange your left nav in Domo, then capture it from that instance."                                               |
| No Domo tab open                  | Options pickers                 | Disabled select, tooltip "Open a Domo instance in a tab to capture or apply."                                                                           |
| Signed out on that tab (401)      | Toast (danger)                  | "Signed Out" / "Sign in to acme.domo.com, then try again."                                                                                              |
| Capturing, applying, undoing      | Button                          | `isPending` on the pressed button.                                                                                                                      |
| Naming a new preset               | Options                         | Input "Preset name", required, unique (case-insensitive); error "You already have a preset named Customer."                                             |
| Capture success                   | Toast                           | "Preset Captured" / "Saved 7 pins from domo.domo.com to Customer. 8 instance-specific pins were left out."                                              |
| Recapture into a preset           | Options                         | Plain button; the preset's pins are replaced and its name kept. Instances already applied are not changed.                                              |
| Capture, nothing portable         | Toast (warning)                 | "Nothing to Capture" / "None of your pins on domo.domo.com can be used on other instances."                                                             |
| Capture too large                 | Toast (danger)                  | "Preset Too Large" / "Remove some pins or folders and capture again."                                                                                   |
| Sync storage full                 | Toast (danger)                  | "No Room for Another Preset" / "Delete a preset you no longer use, then capture again."                                                                 |
| Offer (one preset)                | Side panel and popup toast      | "Use Your Nav Pins Here?" / "Replace Domo's default pins on globex.domo.com with your Customer preset (7 pins)." Action **Apply**.                      |
| Offer (several presets)           | Side panel and popup toast      | "Use Your Nav Pins Here?" / "You have 3 nav pin presets. Choose one to replace Domo's default pins on globex.domo.com." Action **Choose Preset**.       |
| Offer dismissed                   | Log row                         | "Offer dismissed." with **Replace** and **Add Missing** still available.                                                                                |
| Replace on an untouched nav       | Options                         | Plain **Replace** button.                                                                                                                               |
| Replace on a customized nav       | Options                         | **Replace** becomes a `HoldToConfirmButton` (`HOLD_DURATION_FULL`), helper text "Replaces the 12 pins you added on acme.domo.com. You can undo this."   |
| Add Missing                       | Options                         | Plain button, helper text "Adds the preset pins you don't have yet to the end of your nav. Nothing is removed."                                         |
| Add Missing, nothing missing      | Toast                           | "Nothing to Add" / "Every pin in Customer is already in your nav on acme.domo.com."                                                                     |
| Replace success                   | Toast                           | "Nav Pins Applied" / "Added 4, moved 3, and removed 2 pins on acme.domo.com." with an **Undo** action when started from the offer.                      |
| Add Missing success               | Toast                           | "Nav Pins Added" / "Added 3 pins on acme.domo.com."                                                                                                     |
| Apply success, nav not refreshed  | Toast suffix                    | " Reload the page to see them."                                                                                                                         |
| Some pins unavailable             | Toast suffix and log row        | "Task Center isn't available on this instance and was skipped."                                                                                         |
| Pins already in a Navigation View | Toast suffix and log row        | "DataSets is already in your nav from a Navigation View."                                                                                               |
| Switches unreadable               | Log row                         | "Applied without checking which features this instance has."                                                                                            |
| Server dropped a pin              | Log row                         | "Domo didn't keep Code Engine on this instance."                                                                                                        |
| Order differs                     | Toast (warning)                 | "Nav Pins Applied Out of Order" / "Your pins were added on acme.domo.com, but not in your preset's order."                                              |
| Partial or full failure           | Toast (danger) and log row      | "Nav Pins Not Fully Applied" / "Stopped on acme.domo.com after an error: {message}. Use Undo, or apply again to finish."                                |
| Locked view (permission denied)   | Log row, Apply buttons disabled | "Skipped: an admin locked the nav on this instance."                                                                                                    |
| Left nav off                      | Log row                         | "Skipped: this instance doesn't use the left nav."                                                                                                      |
| Unlocked Navigation View          | Options helper text             | "Your preset pins go after the pins your admin set, and any the admin already pinned are skipped."                                                      |
| Undo success                      | Toast                           | "Nav Pins Restored" / "Restored your previous pins on acme.domo.com."                                                                                   |
| Undo after later edits            | Toast (warning)                 | "Can't Undo" / "Your pins on acme.domo.com changed after the preset was applied. Edit them in Domo or use Apply Now."                                   |
| Undo, no tab                      | Options row                     | Undo disabled, tooltip "Open acme.domo.com in a tab to undo."                                                                                           |
| Rename preset                     | Options                         | Inline input with the same unique-name rule. Log rows keep the name they were applied with.                                                             |
| Delete preset                     | Options                         | Plain button. Toast "Preset Deleted" / "Your nav pins on every instance are unchanged." with a **Restore** action holding the deleted preset in memory. |

Undo is not hold-gated: it only runs while the nav is exactly what the apply produced, so it can never delete pins added later. Add Missing's Undo converges back to the snapshot too, which removes only the pins it added.

## Implementation plan

1. **`src/utils/navPins.js` (new):** `buildDesiredPins`, `DOMO_DEFAULT_FEATURE_IDS`, `isPresetPinAvailable`, `isUntouchedNav`, `NAV_FEATURE_SWITCHES`, `newPresetId`, `PIN_SKIP_REASONS`, `pinKey`, `presetStorageKey`, `resolvePresetPin`, `toPresetPin`, exported in the order `code-style.md` sorting requires. Reuse `isFeatureSwitchEnabled` from `src/utils/featureSwitches.js`.
2. **`src/services/navPins.js` (new):** `applyNavPins` (with `mode: 'replace' | 'addMissing'`), `getNavPinEligibility`, `getNavPins`, through `executeInPage` from `src/utils/executeInPage.js`. Throw with `error.status` on failed fetches (architecture.md). Inline copies of `pinKey`, Domo's dedupe, and `findStore()` (from `src/services/pageVariables.js`) inside the injected function.
3. **`src/utils/currentObject.js`:** add `listOpenDomoInstances()` next to `getValidTabForInstance`: `chrome.tabs.query({ url: DOMO_MATCH_PATTERNS })`, filtered by `isDomoUrl`, mapped to `{ instance, label }` and deduped. Actions then call `getValidTabForInstance(instance)`.
4. **`src/background.js`:**
   - Add `navPresetInFlight` (Map, the per-instance lock) and functions `applyNavPresetToInstance(instance, { mode, presetId })`, `getNavPresetOffer(instance)`, `seedKnownNavInstances({ exclude })`, `undoNavPreset(instance)`, placed per the module sort rule.
   - Add `APPLY_NAV_PRESET`, `GET_NAV_PRESET_OFFER`, `GET_NAV_PRESET_PREVIEW`, `NAV_PRESET_OFFER_DISMISSED`, and `UNDO_NAV_PRESET` to the `onMessage` switch, sorted.
   - Seed known instances when `navPinPresetIds` goes from empty to non-empty (in `chrome.storage.onChanged`), and in `onInstalled` when a preset exists. Nothing is added to `detectAndStoreContext`.
5. **`src/hooks/useNavPinPresets.js` (new):** reads and writes `navPinPresetIds` and the `navPinPreset:<id>` items (sync) and `navPinLog` (local), subscribing to `chrome.storage.onChanged` like `usePerInstanceSettings`. Exposes `capture`, `rename`, `remove`, and `restore`.
6. **`src/hooks/useNavPresetOffer.jsx` (new):** modeled on `useReleaseNotification.jsx`. Given the current context's instance, asks `GET_NAV_PRESET_OFFER` once per mount, shows the offer toast (Apply, or Choose Preset opening `#nav-pins?instance=<key>`), sends `NAV_PRESET_OFFER_DISMISSED` on close, and shows the applied toast with Undo (`UNDO_NAV_PRESET`). Call it from `src/sidepanel/App.jsx` and `src/popup/App.jsx` where the tab context is available.
7. **`src/components/options/NavPinSettings.jsx` (new):** the tab UI, from HeroUI `Card`, `ListBox`, `Select` (preset, Capture From, Into, Apply To, Preset), `Input` (name), `Disclosure` (Not Captured), `Chip` (type), `Button`, plus `HoldToConfirmButton` for Replace on a customized nav. It reads `instance` from the `#nav-pins?instance=` hash to preselect Apply To. Type labels reuse `ObjectTypeIcon` where a pin type maps to a `DomoObjectType`, with a generic icon for features.
8. **`src/options/App.jsx`:** add the `nav-pins` `Tabs.Tab` and `Tabs.Panel` after `per-instance-settings` (D10.5), with the same heading and muted subtitle pattern ("Capture your left nav and apply it on other instances."), and route the `#nav-pins` hash (with its query) to it.
9. **`docs/RELEASE_NOTES.md`:** add the WIP bullets below.
10. Run `npx eslint --no-warn-ignored` on every touched file.

`docs/CONTRIBUTING.md` needs no change: it lists no options tabs or per-feature storage keys. Shared with other issues: none found that touch the nav; `listOpenDomoInstances` and the `findStore()` refresh are general.

## Edge cases and risks

- **Server default unverified (highest risk).** If a brand-new user's `GET /pins` returns synthesized defaults without numeric `id`s, they cannot be moved or deleted. Mitigation: if any personal pin lacks a numeric `id`, Replace stops and logs `failed` with "Could not read your default pins on this instance." (Add Missing still works.) The fresh-user test settles it.
- **Nothing changes without a press** (D10.1). The worst a wrong offer can do is show a toast on an instance that didn't need it, and closing it dismisses it there for good.
- **Established instance on first sight.** Seeding plus the untouched check keep the offer off instances this browser already used. A long-used nav that is still exactly the defaults gets the offer, which is harmless.
- **New device or reinstall.** Synced presets arrive with an empty local log; first-run seeding marks every instance this browser already has cookies or tabs for as known.
- **Cookie seeding gaps.** Users who clear Domo cookies (the extension offers this) lose that seed source; the untouched check remains. Whether every instance host keeps a host-scoped cookie is INFERRED and checked in testing.
- **The offer only appears when a surface opens.** A user who never opens the side panel or popup on a new instance never sees it. Apply Now in options still covers that instance.
- **First-run Domo flows.** No reload is ever forced, and nothing runs until the user presses Apply, so invite acceptance, password set, and welcome tours are not interrupted.
- **Feature visibility beyond switches.** Authority-gated features (DataSets for a user without dataset rights) fail open and could leave a dead pin for a low-privilege user. Acceptable for this audience; the log lists what was applied.
- **Frontend drift.** Feature IDs, switch names, the reorder `order: null` meaning, and the `globalNavV2` slice come from Domo's bundle. An unknown feature ID is applied as-is, a renamed default ID yields a safe "customized" skip, a wrong reorder meaning shows as the out-of-order warning, and a missing slice falls back to "Reload the page."
- **Navigation Views.** `VIEW` pins are never moved or deleted, even unlocked ones, since deleting a view pin's ID could change the admin's view. With an unlocked view, the preset goes after the view's pins and pins the view already shows are skipped (D10.3).
- **Folders.** Same-label folders with different contents are replaced under Replace, and appended as a second folder under Add Missing (their keys differ). A folder whose children are all instance-specific is dropped at capture. Domo caps folders at 100 children (`navigation/folder-full`).
- **Navigation mid-apply.** An SPA route change does not stop the injected script; a full reload does. The `applying` entry keeps the first snapshot, and the log row offers Undo and a re-run, which converges from where it stopped.
- **Two tabs at once.** The offer is logged `offered` before the toast shows, so a second tab's surface gets no second offer. The in-flight Map serializes applies within one service worker.
- **Sync quota.** The 8 KB per-preset cap is checked at capture, and so is the 100 KB area total, which presets share with other synced settings; folders with many children are the likeliest overflow.
- **Deleted or renamed presets.** Log rows keep the preset's name from when it was applied, and Undo works from the stored snapshot, so neither depends on the preset still existing.
- **Same-instance links.** The ID heuristic (`\d{5,}` or a UUID) can skip a generic path with a long number; it never keeps a wrong one.
- **Internal instances (rigs, local).** Gated by `canActOnHost`; good throwaway targets.

## Testing and verification

- **Compile and lint:** `yarn dev` (usually already running on 31573), watch the Vite output, `npx eslint --no-warn-ignored` on each new or changed file.
- **Options UI:** CRXJS dev extension, `node scripts/ext-shot.js options` for the empty and populated states. Seed `navPinPresetIds`, two `navPinPreset:<id>` items, and `navPinLog` from the options page DevTools console to shoot each status row and the preset picker.
- **Capture (read-only, safe anywhere):** capture from domo.domo.com into a new preset and confirm 7 kept and 8 skipped, as listed in API findings. Capture again into a second name, recapture into the first, rename one, delete one and Restore it.
- **Seeding:** in the debug profile console, run `chrome.cookies.getAll({ domain: 'domo.com' })` from the service worker and confirm instance hosts appear; capture the first preset and confirm `navPinKnownInstances` lists them.
- **Offer, apply and undo (writes):** only on a rig, local instance, or trial, never on someone else's nav:
  1. Create a fresh test user there, sign in as that user in the debug profile, and record the first `GET /api/nav/v1/pins` (settles the default set and whether defaults have real `id`s; adjust `DOMO_DEFAULT_FEATURE_IDS`).
  2. Navigate around without opening the side panel or popup: confirm no pin call is made.
  3. Open the side panel: the offer shows once. With one preset, press Apply. Confirm the personal pins match the preset order, view pins are untouched, and the nav updated without a reload (`findStore()` reached `globalNavV2`). Open the popup: no second offer.
  4. Press Undo in the applied toast, confirm the snapshot returns.
  5. With two presets, reset `navPinLog` for the instance: the offer reads Choose Preset and opens the Nav Pins tab with the instance preselected. Close an offer instead and confirm it never returns there.
  6. Apply again, add one pin in Domo, press Undo, confirm "Can't Undo".
  7. Customize the nav: no offer on a fresh log entry. In options, Replace shows the hold; Add Missing appends only the missing preset pins at the end and removes nothing, and its Undo removes only those.
  8. Assign a locked Navigation View to the test user: no offer, and both Apply buttons are disabled. Assign an unlocked one: the preset lands after the view's pins and duplicates are skipped.
  9. Throttle the network, reload mid-apply, confirm the log row shows `applying` with the first snapshot, and that Replace again finishes the converge.
  10. With Task Center in the preset, turn off `hopper` on the rig and confirm it is listed as unavailable.
  11. Confirm `order: null` on `PATCH /pins/{id}` moves a pin last (watch the Network panel response order).
  12. Append a folder holding a feature, a link, and a smart folder inline, and confirm all three children come back.
- **Background lifecycle:** open the side panel on two tabs of the new instance at once and confirm one offer; restart the service worker mid-apply and confirm the log and Undo survive.

## Design decisions made

- **Capture instead of hand-building.** Domo's picker and drag reorder already make arranging easy, and capture stores real, valid pin objects. Evidence: chunk `28547`, CLAUDE.md Scope.
- **Use `POST /pins/append`, `PATCH /pins/{id}`, and `DELETE /pins/{id}`, not bulk `POST /pins` or `POST /pins/reset`.** These are the calls Domo's UI makes; the other two are spec-only and unused by Domo. Evidence: chunk `64501` module `367389`, live OPTIONS.
- **Reorder with PATCH, not delete and re-append.** Kept pins keep their IDs and never disappear mid-run. Evidence: Domo's reorder thunk `Rj` and helper `Wc`.
- **Cross-instance identity uses the id-free branch of Domo's own key.** Domo keys smart folders and folders by server ID, which never matches across instances. Evidence: chunk `64501` function `d`.
- **Append folders with children inline, falling back to `?folderId=`.** Domo's feature-section pin does exactly this in one POST. Evidence: chunk `4343` component `ew`; the critique's claim that Domo only ever creates one-child folders was checked and is wrong for that path.
- **Refresh the nav through Redux instead of reloading the tab.** A reload can throw away first-login flows, and Domo itself refreshes by dispatching `SET_NAVIGATION_PINS`. Evidence: chunk `64501` slice `globalNavV2`; `findStore()` in `src/services/pageVariables.js`. This settles the draft's reload question.
- **An offer, never an automatic apply** (D10.1). Nothing runs on detection, so the badge, the settle set, the retry counter, and the resume logic are gone. Untouched-nav and known-instance checks still decide when to offer.
- **Replace and Add Missing** (D10.2). Replace converges (hold on a customized nav); Add Missing only appends, so it needs no hold.
- **Unlocked Navigation Views don't block** (D10.3). The preset goes after the view's pins, minus duplicates.
- **Several named presets, one sync item each** (D10.6). Each keeps the 8 KB item cap; there is no default preset, so the offer applies the only one directly and otherwise sends the user to pick.
- **Read feature switches before every apply.** The background's cache can be cold, and `isFeatureSwitchEnabled` fails open on `null`. Evidence: `background.js` lines 316 and 508, `src/utils/featureSwitches.js`.
- **A re-run keeps the first snapshot.** A half-applied nav is no longer the nav Undo should restore. Evidence: the critique's ordering analysis.
- **Undo only while the nav still equals the applied result.** A converge-to-snapshot would otherwise delete pins added later. Evidence: critique UX review.
- **Known instances live in their own unrendered key, seeded from cookies, tabs, and settings.** `perInstance` and `instanceUsersBackup` alone miss most instances (`instanceUsersBackup` is session storage). Evidence: `background.js` line 258 and `persistInstanceUsers`, manifest `cookies` permission, `src/utils/clearCookies.js`.
- **Never touch `VIEW` pins, locked or not, and skip preset pins a view already shows.** Users cannot remove admin pins in Domo either, and Domo hides the personal copy on a collision. Evidence: views `56236e41-309c-4bdb-8191-8ea420ba12bf` and `b9217b4c-26a3-45bf-b0f0-e4f42ce25ed5`, chunk `11746` `unlockPins`, chunk `64501` dedupe.
- **An unassigned view named "Default" is not a default.** Evidence: `views/users/1813188617/view` returns 204 while that view exists.
- **Gate feature pins on the nav catalog's switches only.** Domo renders pinned items regardless of `show`; authority mirroring would be fragile. Evidence: chunks `4343`, `18900`.
- **Presets in `chrome.storage.sync`, log and snapshots in `chrome.storage.local`.** Presets should follow the user; snapshots and offer state are per-device history. Evidence: existing sync settings (`faviconRules`, `defaultDomoInstance`).
- **Reuse `getValidTabForInstance` and `DOMO_MATCH_PATTERNS` instead of a new tab hook.** Evidence: `src/utils/currentObject.js` line 748, `src/utils/constants.js` line 37.
- **The offer is a toast, not a new Alert.** Same pattern as release notes. Evidence: `src/hooks/useReleaseNotification.jsx`.
- **Delete Preset is a plain button with a Restore toast.** It touches no nav. Evidence: critique scope review.
- **A failed eligibility read means no offer and no log entry, never `leftnav-off`.** Domo's own wrapper hides the error as `false`, which would wrongly mark the instance; leaving it unlogged lets the next open ask again. Evidence: Domo's `isLeftNavEnabled` wrapper, as read in the draft investigation.
- **Use `instanceUser.user.id`, not `window.bootstrap`.** Already in hand. Evidence: `getInstanceUser`.
- **No new action button.** The feature is not object-scoped. Evidence: `ActionButtons.jsx` gating.

## Decisions

IDs are `D10.<n>`. Each entry opens with the **Decision** and what it changes in the plan; the options, the planning recommendation, and its reasoning follow for the record. Where the decision differs from the recommendation, the plan sections follow the decision.

### D10.1. What should qualify an instance for the automatic apply, beyond not being already known to this browser?

**Decision:** Option 3. Never automatic. The first time the side panel or popup opens on an instance that is new to this browser and whose nav is untouched, a toast offers a one-click apply that sends `APPLY_NAV_PRESET`. The background pin mutation on detection, the PIN badge, the `applying` resume logic, and the auto switch are all dropped. Seeding of known instances stays, so the offer never appears on instances this browser already used.

1. Untouched nav only: your personal pins there are Domo's defaults, or none
2. Untouched nav AND your account on that instance was created recently (for example within 30 days, from the user record's detail.created)
3. Never automatic: show a one-click Apply offer in the side panel and popup the first time instead

**Planning recommendation:** Untouched nav AND a recent account. Both signals are cheap, and the account-age check catches the case where an old instance's nav still happens to be the defaults while matching the issue's 'first time you login' wording most literally.

**Why it matters:** Option 2 adds one GET /api/content/v3/users/{id}?includeDetails=true to getNavPinEligibility plus a threshold constant. Option 3 removes the background mutation, the badge, and the resume logic, and replaces them with a prompt toast that calls APPLY_NAV_PRESET.

### D10.2. When you run Apply Now on an instance where you already customized your nav, should it replace your pins or keep them?

**Decision:** Option 3. Apply Now offers both **Replace** (converge, a hold when the nav is customized) and **Add Missing** (append the preset pins that are missing, no deletes, no reorder). Both keep a snapshot for Undo. The first-visit offer uses Replace, since that nav is still Domo's defaults.

1. Replace: remove your personal pins and converge to the preset (hold to confirm, with Undo)
2. Add Missing: keep your pins and append any preset pins that are missing
3. Offer both buttons, Replace and Add Missing

**Planning recommendation:** Offer both. Replace is what the issue describes for new instances, but on an established instance keeping instance-specific pins (apps, cards, workspaces) is often what you want.

**Why it matters:** Add Missing needs a mode flag in applyNavPins that skips step 5 (deletes) and the reorder, a second button, and its own copy. Replace-only keeps one code path.

### D10.3. When the user has an unlocked Navigation View assigned (admin pins shown, personalization allowed), what should the automatic apply do?

**Decision:** Option 2, for every apply now that none is automatic. With an unlocked view, the preset is applied as personal pins after the view's pins, skipping any preset pin the view already shows. A locked view still blocks apply and suppresses the offer.

1. Skip it like a locked view and log it, leaving Apply Now available
2. Apply the preset as personal pins after the view's pins, skipping any preset pin the view already shows
3. Apply only when the view has no pins

**Planning recommendation:** Apply after the view's pins, skipping duplicates. The view pins stay untouched either way, and the user still gets their own set.

**Why it matters:** It sets one branch in maybeApplyNavPreset's eligibility step and whether the 'already in your nav from a Navigation View' copy appears on automatic runs or only on manual ones.

### D10.4. Should automatic apply be on by default once a preset exists, and should the switch follow you across browsers?

**Decision:** Not applicable, since there is no automatic apply (D10.1). There is no `navPinPresetAuto` switch. Presets sync through `chrome.storage.sync`; the offer state and logs stay per device in `chrome.storage.local`.

1. On by default and synced (the preset and switch both in chrome.storage.sync, with first-run seeding on each device)
2. Off by default, and the switch is per device (chrome.storage.local)
3. Synced preset, with a per-device switch that defaults on

**Planning recommendation:** On by default and synced. First-run seeding marks every instance a new browser already has cookies or tabs for as known, and the untouched check backs that up, so a synced switch is safe.

**Why it matters:** It decides which storage area holds navPinPresetAuto, whether the options switch needs a 'this device only' note, and whether seeding has to run on first device run or only when the switch is turned on.

### D10.5. Where should the Nav Pins settings live in the options page?

**Decision:** Option 1. A new Nav Pins tab after Per-Instance Settings.

1. A new 'Nav Pins' tab after Per-Instance Settings
2. A section at the top of the existing Per-Instance Settings tab
3. A section in the General Settings tab

**Planning recommendation:** A new 'Nav Pins' tab. The preset is global with its own activity list and immediate actions, while Per-Instance Settings is built around per-instance dataset configs and General Settings saves through a form.

**Why it matters:** It decides whether the plan adds a Tabs.Tab and Tabs.Panel in src/options/App.jsx with a standalone component, or reshapes PerInstanceSettings.jsx or GeneralSettings.jsx around actions that do not fit their save model.

### D10.6. Should one preset cover every instance, or should you be able to keep several (for example 'Customer' and 'Internal rig')?

**Decision:** Option 2 without the default marker, since there is no automatic apply. You can keep several named presets, each its own sync item under the 8 KB cap. Capture, Apply Now, and the first-visit offer each name the preset they use: with one preset the offer applies it directly, and with several it opens the Nav Pins tab with that instance preselected so you pick one.

1. One preset for all instances
2. Several named presets, one marked as the default for automatic apply
3. One preset plus a list of instance patterns (such as rigs) that are never auto-applied

**Planning recommendation:** One preset. It matches the issue, fits in a single sync item, and Apply Now plus the activity list already handle exceptions.

**Why it matters:** Named presets change the storage shape (an array, with the 8 KB sync cap per preset item), add a picker to Capture and Apply, and need a default selector. An exclusion list adds a pattern check in maybeApplyNavPreset and a small editor.

## Release notes draft

- You can now save your left nav pins as named presets in Settings, and the extension offers to apply one the first time you open it on a new instance. ([#10](https://github.com/brycewc/domo-toolkit/issues/10))
- A nav pin preset can also replace your pins or add the missing ones on any open instance, with Undo to restore the pins you had before. ([#10](https://github.com/brycewc/domo-toolkit/issues/10))

## Appendix: writes made on domo.domo.com during planning

No writes were made for this issue; every call was read-only.

- Draft stage: none (read-only GET and OPTIONS calls against domo.domo.com; Domo frontend bundles downloaded to /tmp/open-issue-plans/10/).
- Critique stage: none (read-only GET and OPTIONS calls; three unknown nav paths probed with GET returned 404, 405 and 500; scratch files in /tmp/open-issue-plans/10-review/).
- Final stage: none. Only read-only GET calls against domo.domo.com: /api/nav/v1/pins, /api/nav/v1/views, /api/nav/v1/views/users/1813188617/view, /api/nav/v1/views/users/1084204596/view, /api/nav/v1/leftnav/enabled, /api/nav/v1/leftnav/user (404), /api/nav/v1/leftnav/customer-settings/enabled (404), /api/content/v3/users/1813188617?includeDetails=true, /api/content/v2/groups/1857899041/permissions, /api/content/v2/groups/1857899041/users, /api/domoweb/bootstrap (500). Scratch files only under /tmp/open-issue-plans/10-final/ (a token-reading curl wrapper that never stores the token, and plan.md). No repo files, Domo objects, pins, or settings were changed.
