---
published: false
---

# #80: Update Code Engine Functions in a Custom App to the Latest Version

Status: **decided**. This is the plan for [#80](https://github.com/brycewc/domo-toolkit/issues/80), written 2026-11-20 against branch `2.0.0`, with every open decision settled by the maintainer on 2026-11-23. Cross-issue decisions (`DX.*`), the shared infrastructure, the landing order across issues, and the pre-existing bugs found while planning live in [open-issues-plan.md](open-issues-plan.md).

API claims in this plan carry one of these tags: **VERIFIED-LIVE** (called on domo.domo.com and the response inspected), **VERIFIED-CODE** (already used the same way in `src/`), **SPEC-ONLY** (from the OpenAPI spec, not exercised), or **INFERRED**.

## Summary

A custom app (pro-code app or Brick) calls Code Engine functions through **aliases**. Each alias is bound to one package, one function, one exact package version, and a parameter and output wiring (`parameters[].alias -> name`, `output.alias -> name`, with nested `children`). The binding is stored in two places:

1. **The design version's manifest** (`packagesMapping`). The developer writes it and `domo publish` uploads it.
2. **Each app instance's context** (`context.packageMapping`). There is one instance behind each app card. Domo merges these **per alias**: for each alias in the instance's design version, the instance's own entry wins, and an alias the instance doesn't override uses the design's entry (VERIFIED in Domo bundle `48800-8cba4f7ec4bc66c6.js`, module `462145`). An empty `packageMapping: []` means "inherit everything" (VERIFIED-LIVE on Kanban Board instance `5fcfe527-b0a5-4eb3-bdbe-4635d845caae`).

When a package owner releases a new version, nothing moves either pin. A card keeps calling the old version until someone opens that card's editor and picks a new version on the Code Engine Packages tab, one alias at a time.

Read-only scan of domo.domo.com (re-run for this plan; numbers are VERIFIED-LIVE):

- 424 app designs bind Code Engine, with 553 instances. 341 instances are on a card you can see, and 212 are not.
- The 331 carded instances whose design version declares aliases have 1065 effective alias slots: 604 own pins and 461 inherited from the design. 101 instances pin every alias themselves, 34 inherit every alias, and 196 mix the two. That makes inheritance mostly per alias, not per instance.
- Of the slots whose package is readable and has a release, 360 are behind the latest release (344 own, 16 inherited), 244 are current, and 8 are ahead of it. 258 carded instances have at least one pin behind.
- 442 slots point at a package that no longer exists. Nearly all of them come from one generated-app template that binds deleted package `29b4fab8-f3b0-41d6-96d9-7efcdb67d472` (two aliases each, on about 220 designs). Two bindings have no package wired at all (`packageId: null`).
- 62 of 549 own bindings that were checked are **already miswired at their current pin**. Their bound parameter names, required inputs, or output name don't match the function at that exact version, because Domo's editor never re-syncs wiring when the version changes.
- 30 designs have more than one carded instance. The most cards on one design is 8.

Who benefits: owners of apps that call Code Engine, and owners of shared packages (DOMO AppDB Collections, DOMO Notifications, DOMO DataSets) whose consumers drift several versions behind.

Interpretations considered:

- **A. Update the instance (card) pins.** This changes what the card runs. **Planned**, for both one card and every card built from a design.
- **B. Rewrite the design manifest pins.** **Not planned.** The developer's next `domo publish` reverts it, and instance pins override it anyway. The view shows the design's pin read-only.
- **C. Start from a Code Engine package and update every app that uses it.** Deferred to a follow-up (D80.2). The service is shaped to take that scope later.
- **D. "Latest" means the newest version, unreleased included.** Rejected. The target is the newest **released** version, matching Update Action Versions. The user can pick any released version per package.

## Scope check

What Domo's UI offers today:

- **Per-card editor, Code Engine Packages tab** (VERIFIED, bundle `50907-69fc744daaa8f4aa.js`). It has one sub-tab per alias, each with a version `Select` built as `versions.map(v => ({ label: v.version, value: v.version }))`. There is no released marker and no latest marker, and the list is in API order, which is unsorted (Send ACE Emails `1d7a72e2-a497-4eed-9757-ba7c1cd28252` lists `... 1.0.11 2.0.0 1.0.12 2.0.1`, where 1.0.11 and 1.0.12 are unreleased). Changing the version sets only `version` (reducer `DOMOAPPS/UPDATE_PACKAGE_VERSION`). It never checks the wiring against the new contract. An app with 10 aliases takes 10 tab visits per card.
- **Asset Library, design Cards tab** (VERIFIED, bundle `42198-903eac8fa43d2fa7.js`). Domo already offers a bulk **Update version** menu: select cards, then pick a design version or "Latest". It calls `POST /domoapps/apps/v2/context/bulk` and then `PUT /domoapps/apps/v2/contexts/bulk` with `{ appContextIdList, updateDescription: { designVersion } }`. That moves which **design version** a card follows. It does not touch the card's own Code Engine pins, since the request carries only `designVersion` (server effect INFERRED). The toolkit does not duplicate this. Moving cards between design versions stays in Domo (cut).
- **Design manifest.** It is edited in the pro-code editor or in local source followed by `domo publish`. That is the developer's normal workflow (cut).

What remains in scope passes CLAUDE.md's tests ("batches an operation Domo only offers one-at-a-time" and "exposes hidden data"):

- Every alias on a card moves to the target in one action, and from the design, every card does.
- Which pins are behind, which are on unreleased versions, and which are inherited from the design all become visible.
- Each binding is checked against the target contract, which Domo never does. That flags deleted functions, inputs the wiring no longer fills, removed inputs, and output changes, and it surfaces cards that are already miswired today.

Overlap in this codebase:

- `src/components/views/UpdateWorkflowActionVersionsView.jsx` and `src/components/buttons/UpdateWorkflowActionVersions.jsx`. These are the closest precedent: package-grouped version `Select` defaulting to the newest released version (`enrichCodeEngineGroup`, `:1330`) and an Update Versions button. Its patterns are copied, but its Select is **not** extracted, because it is tied to that view's group model (`no-change`, the built-in latest-only collapse, subflows).
- `src/components/views/UpdateTriggerVersionsView.jsx`. Precedent for a list that preselects outdated rows.
- `src/utils/ceContractDiff.js` (`getFunctionContract` with its per-version cache, `classifyContractChanges`). Contract fetch reused; the diff is used only for rename hints.
- `src/utils/semver.js` (`compareSemver`). Reused behind a strict `x.y.z` guard, because `compareSemver('latest', ...)` treats `latest` as `0.0.0` (`[NaN]` then `NaN || 0`). It does not return NaN, so without the guard a `latest` pin would read as outdated.
- `src/services/codeEngine.js` (`getCodeEnginePackageVersions`, `getCodeEngineUsage`). Reused.
- `src/services/customApps.js` (`getAppInstance`, `getDesignInstances`, `getDesignCards`). Read patterns reused.
- `src/services/proCodeApps.js` (`swapAppColumns`, used by Remap Columns and Migrate Content). It uses the same POST context, PUT context, PUT instance save. **Pre-existing bug, shipped in v1.9.0** (`git show v1.9.0:src/services/proCodeApps.js` line 179). It seeds the new context with `instance.packageMapping || []` and `instance.workflowMapping || []`, but `GET /domoapps/apps/v2/{id}` carries those only under `instance.context` (VERIFIED-LIVE). Because `[]` is the inherit representation, the likely effect is a **silent revert to the design's pins and workflow wiring**, not empty wiring. On ACE Assistant that would move `sendEmail` from 2.0.1 back to 1.0.5, and the `generateQBRDraft` workflow from 2.0.14 with its own trigger to the design's older entry. The server effect is INFERRED. This gets fixed as its own change (step 1), not under #80.
- `src/services/enrichments.js` (`card-app-instance`, `:224`). Already fetches `/api/apps/v1/instances/{id}` for every domoapp card, so it can also supply the gate count.
- `src/services/appDb.js:536` (`mapLimit`) and `src/activityLog/ActivityLogTable.jsx:1846` (`promisePool`). Local pools only. No shared pool exists yet (see Implementation).

## API and platform findings

| #   | Method and path                                                                                                  | Purpose                                                                                                                                                                                                                                                                                                                   | Tag                                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `GET /api/apps/v1/designs/{designId}?parts=versions,apps,cards`                                                  | Design `name` and `latestVersion`. `versions[]` with `packagesMapping`. `instances[]` with `id`, `designVersion`, `packageMapping`, `temporary`, `disabled` (no context id). `referencingCards[]` with `id`, `title`, `domoapp.id`, `locked`, `ownerId` (no `fullpage`)                                                   | VERIFIED-LIVE                                                                                                                                                           |
| 2   | `POST /domoapps/apps/v2/context/bulk` with body `["<instanceId>", ...]`                                          | **Bulk read** (Domo route name `DomoApps.context_get_bulk`). Returns a map from instance id to its current context: `id` (the context id), `packageMapping`, `workflowMapping`, `mapping`, `collections`, `accountMapping`, `actionMapping`, `designId`, `designVersion`, `isDisabled`, `createdDate`, `lastModifiedDate` | VERIFIED-LIVE (3 instances); Domo bundle `42198` uses it                                                                                                                |
| 3   | `GET /domoapps/apps/v2/{instanceId}`                                                                             | One instance. The wiring is only under `context` (top-level keys are `id, context, createdDate, accountMapping, actionMapping, collections, designId, designVersion, mapping`)                                                                                                                                            | VERIFIED-LIVE; VERIFIED-CODE (`swapAppColumns`)                                                                                                                         |
| 4   | `GET /api/content/v1/cards?urns={ids}&parts=metadata,domoapp,owners&includeFiltered=true`                        | `title`, `metadata.fullpage` (string `"true"`/`"false"`), `domoapp.id`, `locked`, `isCurrentUserOwner`, `owners[]`                                                                                                                                                                                                        | VERIFIED-LIVE on `2141933500` and `1587118900`; VERIFIED-CODE (`resolveAppInstances`)                                                                                   |
| 5   | `GET /api/apps/v1/instances/{instanceId}`                                                                        | The instance's **own** pins under `packagesMapping` (plural). It is `null` when the instance inherits everything                                                                                                                                                                                                          | VERIFIED-LIVE; VERIFIED-CODE (`getAppInstance`)                                                                                                                         |
| 6   | `GET /api/codeengine/v2/packages/{packageId}?parts=versions,configuration`                                       | `name`, `availability`, `packageSource`, `versions[]` with `version` and `released` (ISO timestamp, or `null` when unreleased). Unsorted. `versions[].functions` comes back empty here, so contracts need #7. 404 for a deleted package                                                                                   | VERIFIED-LIVE; VERIFIED-CODE (`getCodeEnginePackageVersions`)                                                                                                           |
| 7   | `GET /api/codeengine/v2/packages/{packageId}/versions/{version}?parts=functions`                                 | `functions[]` with `name`, `inputs[]` (`name`, `type`, `nullable`, `isList`, `children`), `output`                                                                                                                                                                                                                        | VERIFIED-LIVE; VERIFIED-CODE (`getFunctionContract`)                                                                                                                    |
| 8   | `POST /domoapps/apps/v2/contexts`                                                                                | Create a context. Body: `{ accountMapping, actionMapping, collections, designId, designVersion, mapping, packageMapping, workflowMapping }`. Response: `[context, errors]`                                                                                                                                                | VERIFIED-CODE (`swapAppColumns`)                                                                                                                                        |
| 9   | `PUT /domoapps/apps/v2/contexts/{contextId}`                                                                     | Replace the new context's contents. Body: `{ ...createdContext, packageMapping }`                                                                                                                                                                                                                                         | VERIFIED-CODE (`swapAppColumns`, with `mapping`); SPEC-ONLY `updateAppContext`; Domo editor `updateContext` (bundle `48800`). With a changed `packageMapping`: INFERRED |
| 10  | `PUT /domoapps/apps/v2/{instanceId}?cardTitle={title}&fullpage={bool}` with body `{ contextId, id: instanceId }` | Commit the context to the card. Domo's editor then calls `reloadKpi(cardId)`                                                                                                                                                                                                                                              | VERIFIED-CODE (`swapAppColumns`); Domo bundle `48800` module `462145` fn `m`                                                                                            |
| 11  | `GET /api/codeengine/v2/packages/{packageId}/versions/{version}/usage?parts=items`                               | Which app instances (`type: RYUU_APP`, `assetId` = instance id, `url` = card) and workflows pin this exact version. Used for post-write verification and the deferred package-side entry                                                                                                                                  | VERIFIED-LIVE                                                                                                                                                           |
| 12  | `GET /api/apps/v1/instances/usage?entityId={packageId}&entityType=CODEENGINE_FUNCTION&parts=items`               | Reverse lookup from a package, for the deferred package-side entry                                                                                                                                                                                                                                                        | VERIFIED-CODE (`getCodeEngineUsage`)                                                                                                                                    |

Excerpts (trimmed, VERIFIED-LIVE):

```json
// #2 POST /domoapps/apps/v2/context/bulk  ["80ec5d16-2494-4dc5-85c8-521ade4e15af", ...]
{ "80ec5d16-2494-4dc5-85c8-521ade4e15af": {
    "id": "14f10268-cc2e-4f1a-8e71-141de195dc06", "designVersion": null, "isDisabled": false,
    "packageMapping": [
      { "alias": "sendExternalEmail", "packageId": "03ba6971-98d0-4654-9bfd-aa897816df33", "version": "2.1.13", "functionName": "sendExternalEmail", ... },
      { "alias": "listUserCredentialAccounts", "packageId": "1d7a72e2-a497-4eed-9757-ba7c1cd28252", "version": "1.0.5",
        "functionName": "list_user_credential_accounts", "parameters": [],
        "output": { "alias": "response", "name": "response", "type": "text", "children": [] } },
      { "alias": "sendEmail", "packageId": "1d7a72e2-a497-4eed-9757-ba7c1cd28252", "version": "2.0.1", "functionName": "send_email",
        "parameters": [ { "alias": "account", "name": "account", "type": "ACCOUNT", "nullable": false },
                        { "alias": "torecipients", "name": "to_recipients", "type": "text" },
                        { "alias": "domofileid", "name": "domo_file_id", "type": "text" }, ... ],
        "output": { "alias": "response", "name": "response", "type": "text" } },
      { "alias": "createAppDBDocument", "packageId": "63531352-593e-451a-8de5-406d9f4e9bd2", "version": "2.0.13", ... } ],
    "workflowMapping": [ { "alias": "generateQBRDraft", "version": "2.0.14", "triggerId": "36cf6ce1-2b8c-408f-a8dc-54d44efad6d8" } ] },
  "8c32555d-06f8-4eb4-9af2-3f30a456ef42": { "id": "d2ee65f2-8faf-4d28-9310-904d51b7ff03", "packageMapping": [ /* 9 own, no sendExternalEmail */ ] },
  "5fcfe527-b0a5-4eb3-bdbe-4635d845caae": { "id": "7cb49249-4260-4680-b4a8-8f4025f9f2c0", "packageMapping": [] } }
```

```text
// #7 Send ACE Emails 1d7a72e2-a497-4eed-9757-ba7c1cd28252 (PRIVATE, CUSTOM)
2.0.1  send_email(account*, to_recipients*, cc_recipients, subjectLine*, mailBody*, sender*, reply_to*) -> result: object
1.0.5  send_email(account*, to_recipients*, cc_recipients, subjectLine*, mailBody*, domo_file_id, domo_access_token_account, pdfBase64, pdfFilename) -> response: text
       list_user_credential_accounts(same inputs as 1.0.5 send_email) -> response: text
// (* = nullable false)  2.0.1 has no list_user_credential_accounts.
```

What this shows about ACE Assistant (card `2141933500`, instance `80ec5d16-2494-4dc5-85c8-521ade4e15af`, design `87ecfda4-c01f-4f7b-a545-69ecb7bd6b02`):

- `sendEmail` is pinned at 2.0.1, the latest release, but its wiring is still the 1.0.5 set. It binds `domo_file_id`, `pdfBase64` and `pdfFilename`, which 2.0.1 removed. It doesn't fill the required `sender` and `reply_to`. Its output is bound as `response`/text, where 2.0.1 returns `result`/object. An old-vs-new diff would call it "up to date".
- `listUserCredentialAccounts` binds no parameters, and its function doesn't exist in 2.0.1, so it is blocked.
- `deleteAppDBDocument` binds output `result`, but the function's output is `success` at both 2.0.13 and 2.1.1. That is a pre-existing mismatch, not one the bump introduces.
- The other 6 AppDB aliases and `sendExternalEmail` (2.1.13 -> 2.1.18) match the target contract cleanly.

Other platform facts:

- **Effective design version:** `context.designVersion ?? design.latestVersion` (VERIFIED, bundle `40202-76bfc06a3578dbdb.js`). That version's `packagesMapping` defines the alias set.
- **Merge detail** (VERIFIED, bundle `48800` fn `F`). For a shared alias, the merged parameter list is the design's parameter aliases, each replaced by the instance parameter with the same alias. Output `children` merge the same way. Own aliases absent from the design version are dropped when Domo's editor next saves (22 such own pins in the scan).
- **Domo's editor materializes inherited pins.** Opening a card in the editor (bundle `50907` `fetchDesign`) or quick-creating one (bundle `40202`) POSTs a context with the full merged `packageMapping`, so any editor save turns inherited aliases into own pins. Domo strips parameter `name`s from design entries during that merge, so they need wiring afterwards.
- **One card can pin one package at several versions.** pro-coder instance `6be65541-6556-4728-a048-065a430ff852` pins codeAI (`4f22be74-d478-43a4-bb62-a601fa8fe679`) at 1.1.31, 1.1.32, 1.1.35 (unreleased), 1.2.2 and 1.2.3 across its aliases.
- **`latest` pins exist.** Treasure Map Game design `4e40727e-0321-42c9-870e-f3b3c1785261` pins the literal `"latest"`. Its instance `c865e013-021f-40fb-891b-cb0824d50d25` pins `1.0.2`, which is unreleased; the latest release is `1.0.1`.
- **Instances without a visible card.** All 10 instances of RevRadar v4 (`32b73331-a00e-482d-98ca-fe1941ca0d70`) have none. Design `87ecfda4-c01f-4f7b-a545-69ecb7bd6b02` has one carded instance (`80ec5d16-2494-4dc5-85c8-521ade4e15af`, card `2141933500`) and one without (`8c32555d-06f8-4eb4-9af2-3f30a456ef42`). Whether `referencingCards` hides cards the caller can't see is INFERRED.
- **The context id changes on every save**, because each save creates a new context and commits it (VERIFIED-CODE flow; each instance carries a distinct, dated context). An unchanged `context.id` therefore means nobody saved in between.
- **Runtime resolution is INFERRED.** The instance context pin is very likely what runs. Domo's version selector writes only the instance context, and Code Engine's own usage index (#11) attributes version 2.0.1 of Send ACE Emails to instance `80ec5d16-2494-4dc5-85c8-521ade4e15af`, whose design pins 1.0.5. This can't be proven from curl: the app domain (`{instanceId}.domoapps.prod1.domo.com`) returns 403 to a developer token, and executing someone else's function would not be read-only anyway. It is a required pre-ship check (Testing).
- **Ownership check** (VERIFIED, bundle `48800` export `KW`). Domo's editor decides "card owner" as `card.isCurrentUserOwner`, falling back to `ownerId`/`owners` only when that is null. For the token user (a Super Admin who doesn't own the cards), `isCurrentUserOwner` is `false` on `2141933500` and `1587118900`, so it does not reflect admin rights. Whether it is true for a group co-owner is INFERRED: the token user belongs to no card-owning group, so it couldn't be tested read-only.

Permissions: editing an app card's wiring is a card edit. It needs card ownership (`isCurrentUserOwner`) or `content.admin`, and a locked card may refuse it. Reading designs needs `domoapps.read` or `app.admin`. A cross-customer design returns 404 on #1. Authority names come from dataset `073c76f1-c846-48fd-876c-34d98d89a07b`.

## Design

**Where it lives:** a side panel view, `UpdateAppCodeEngineVersionsView`, launched with `launchView({ type: 'updateAppCodeEngineVersions' })` from a new action button. It has two scopes:

| Context                                  | Scope                                                                                | Gate in `getAvailableActions()`                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `CARD` with `details.type === 'domoapp'` | that card's instance                                                                 | `metadata?.context?.codeEngineAliasCount > 0` (new enrichment field)      |
| `RYUU_APP`, `APP`                        | every non-temporary, non-disabled instance of the design that has a referencing card | any `metadata.details.versions[]` entry has a non-empty `packagesMapping` |

There is no feature-switch check. The data gate already implies Code Engine exists, and `availableActions.js` imports nothing from `featureSwitches.js` today.

**Enrichment** (`card-app-instance`): keep returning `designId` and `designVersion`, and add `codeEngineAliasCount`. That is `instance.packagesMapping?.length` when it is non-zero. Otherwise it is the length of the effective design version's `packagesMapping` from `GET /api/apps/v1/designs/{designId}?parts=versions`, an extra call made only for app cards with no own pins (34 instances in the scan). Map it with `storePath` `'context.codeEngineAliasCount': 'codeEngineAliasCount'`.

**Load** (side panel to page through `executeInPage`). `getAppCodeEngineBindings({ designId, instanceId, tabId })` runs in one page round trip:

1. Read #1. A 404 sets `design = null`. On the design scope that ends the view. On the card scope it continues with own pins only, and inherited aliases are reported as unknown.
2. Pick the instances. The card scope takes `[instanceId]`. The design scope takes `design.instances` filtered to `!temporary && !disabled` and present in `referencingCards[].domoapp.id`. The rest are counted into `skipped: { noVisibleCard, temporary, disabled }`.
3. Read #2 for those ids to get each `contextId` and the authoritative `packageMapping`. If #2 fails, fall back to #3 per instance (pool of 4).
4. Read #4 for the cards, in batches of up to 1000 urns as in `resolveAppInstances`, to get `title`, `fullpage` (parsed from its string form), `locked` and `isCurrentUserOwner`.
5. Return `{ design: { id, name, latestVersion, versionsByVersion } | null, instances: [{ instanceId, contextId, designVersion, card: { id, title, fullpage, locked, isCurrentUserOwner }, ownBindings }], skipped }`.

**Resolve on the extension side** (pure helpers in `src/utils/appCodeEngineVersions.js`):

- `buildEffectiveBindings({ designVersionMapping, ownBindings })`. Walks the design alias list and takes the own entry when present (`source: 'own'`), otherwise the design entry (`source: 'design'`). It appends own aliases that are absent from the design, flagged `notInDesign`. Bindings with `packageId: null` become `unwired`.
- Packages: `getCodeEnginePackageVersions` once per unique `packageId` (pool of 4). `releasedVersions` are the `released != null` entries that match `^\d+\.\d+\.\d+$`, sorted newest first with `compareSemver`. A 404 or 403 marks the package `unavailable`.
- Contracts: `getFunctionContract` for each unique `(packageId, version)` among current pins and selected targets, with one cache shared across instances.
- `checkWiring(binding, fn)` returns a list of problems for a binding against one function contract:
  - `functionMissing`
  - `inputRemoved` (a bound parameter `name` that isn't in `inputs[].name`)
  - `inputTypeChanged` (`type` or `isList` differs)
  - `requiredUnfilled` (an input with `nullable === false` that no parameter names)
  - `outputRenamed` or `outputTypeChanged`
  - `outputChildMissing` (a bound `output.children[].name` that isn't in the contract's output children)
  - `inputChildMissing` (the same check for `parameters[].children`)
- `classifyAppBinding({ binding, pinnedFn, targetFn, target, isEditable })` returns `{ status, problemsAtTarget, preExisting, renameHints }`. **New problems** are the ones at the target that aren't already present at the pinned version. `classifyContractChanges(pinnedFn, targetFn)` is used only for `renameHints` ("`x` was renamed to `y`").

**Row status:**

| Status        | Rule                                                                             | Selection                                                                                                                |
| ------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `current`     | effective pin equals target                                                      | not selectable. If `preExisting` is non-empty, warning chip "Wiring doesn't match v{pin}" with the problems in a tooltip |
| `outdated`    | own pin behind target, no new problems                                           | preselected. A `preExisting` mismatch shows as an info chip, since the bump doesn't make it worse                        |
| `review`      | own pin behind target, and the target adds problems                              | not preselected, warning chip plus reason (and rename hint)                                                              |
| `blocked`     | function missing at target                                                       | not selectable, reason says to rewire it in the card's editor                                                            |
| `downgrade`   | own pin newer than target, including unreleased pins ahead of the latest release | not preselected. Selectable, chip "Downgrade" or "Unreleased v{pin}"                                                     |
| `nonSemver`   | own pin isn't `x.y.z` (for example `latest`)                                     | not preselected. Selecting writes the concrete target                                                                    |
| `inherited`   | `source === 'design'`                                                            | not selectable, shown read-only with the design's pin (D80.1)                                                            |
| `unavailable` | package deleted or unreadable, or `unwired`                                      | not selectable                                                                                                           |

Two per-card flags apply on top of the row status. When neither `isCurrentUserOwner` nor `content.admin` holds, the card's rows lose their preselection and get the chip "You may not own this card". They stay selectable, because group co-ownership coverage is INFERRED. A `notInDesign` alias gets an info chip "Not in the app design" and is otherwise handled normally.

**Target versions:** one `Select` per package, listing released versions newest first and defaulting to the latest release. The choice applies to every alias of that package on every card in scope. Built-in Domo packages (`availability: GLOBAL`, `packageSource: DOMO`) get the same list. The workflow view's latest-only rule is not applied here, because Domo's app editor allows any version.

**Write** (per instance). `updateAppInstanceCodeEngineVersions({ instanceId, expectedContextId, updates, cardTitle, fullpage, tabId })` sits in `src/services/appCodeEngineVersions.js`, and the whole sequence runs inside one `executeInPage` call. `updates` is data computed on the extension side, `[{ alias, packageId, version }]`, so the injected function needs no imports. The steps:

1. Fresh read with #2 `[instanceId]`. If `context.id !== expectedContextId`, return `{ conflict: true }`.
2. Build `packageMapping` from **that fresh context**. For each update, set `version` on the entry with the same `alias` and `packageId`, and leave everything else alone, exactly as Domo's reducer does. If an alias is missing from the fresh context, fail that card with "changed since loading".
3. POST #8 seeded with the fresh context's fields, unchanged.
4. PUT #9 `{ ...created, packageMapping }`.
5. PUT #10 with `URLSearchParams({ cardTitle, fullpage })`.
6. Verify: read the committed response's `context.packageMapping`, or re-read #3 when it is absent, and confirm every updated alias carries its target `version`.

The function returns `{ success, conflict, status, error }`. This is the same three-step save `swapAppColumns` uses in production and that Domo's editor performs.

**Concurrency and failure:**

- Card writes run in a pool of 3 on the extension side.
- No automatic retry. When `withRetry` from `docs/plans/beta-phase-1-2-retries-concurrency.md` lands, wrap the per-instance call with it.
- A 403 marks that card "no permission". A 404 marks it "gone". A conflict marks it "edited elsewhere". A verify mismatch marks it "didn't save". Other cards continue.
- After the run, the bindings reload so the view shows saved state.
- The view registers its `isSubmitting` with the run lock from `docs/plans/beta-phase-1-6-run-lock.md` when that lands.

**Not touched:** the design and its manifest, design-version moves (Domo's Asset Library already does those), temporary and disabled instances, instances without a visible card, parameter and output wiring, and every other mapping (datasets, collections, workflows, accounts, actions).

**View state:** `{ scope, design, rows: Instance[], packages: Map<packageId, { name, releasedVersions, latest, target, unavailable }>, selected: Set<"instanceId:alias">, classifications: { [key]: result }, isLoading, isChecking, isSubmitting, results: { [instanceId]: { success, conflict, error } } }`.

## UX

**Entry point:** an action button with `IconPackage` labeled **Update Code Engine Versions**.

- Tooltip on a card: "Update the Code Engine function versions this app card uses".
- Tooltip on a design: "Update the Code Engine function versions used by this app's cards".

**Flow:**

1. Click the button. The side panel opens with a spinner and "Loading Code Engine functions...".
2. The view header shows the app name, with subtext counts and the Beta chip.
3. A **Target versions** block lists each package with its `Select`.
4. On a card, rows are grouped by package. On a design, cards are `DataList` items with their rows as `children` (DataList's built-in Disclosure sections). Cards with nothing to change start collapsed.
5. Outdated rows are preselected. Changing a target re-runs the wiring check, and the footer shows "Checking wiring..." with the button disabled.
6. Click **Update Versions**, or hold **Hold to Update Versions** when the selection spans more than one card (D80.3). A promise toast runs, and the view refreshes in place.

**Card scope mockup** (ACE Assistant, card `2141933500`, real data):

```
+---------------------------------------------------+
| [pkg] Update Code Engine Versions for             |
|       ACE Assistant                     [R][~][x] |
|       BETA . 10 functions . 3 packages            |
+---------------------------------------------------+
| Target versions                                   |
|  DOMO AppDB Collections         [Latest - 2.1.1 v]|
|  DOMO Notifications            [Latest - 2.1.18 v]|
|  Send ACE Emails                [Latest - 2.0.1 v]|
+---------------------------------------------------+
| DOMO AppDB Collections                            |
|  [x] createAppDBDocument       v2.0.13 -> v2.1.1  |
|  [x] deleteAppDBDocument       v2.0.13 -> v2.1.1  |
|      (i) Output already doesn't match: "result"   |
|  [x] getAppDBDocument          v2.0.13 -> v2.1.1  |
|  ... 4 more                                       |
| DOMO Notifications                                |
|  [x] sendExternalEmail        v2.1.13 -> v2.1.18  |
| Send ACE Emails                                   |
|  [-] listUserCredentialAccounts  v1.0.5  Blocked  |
|      list_user_credential_accounts doesn't exist  |
|      in v2.0.1. Rewire it in the card's editor.   |
|  [ ] sendEmail                 v2.0.1  Up to date |
|      ! Wiring doesn't match v2.0.1               |
+---------------------------------------------------+
| 8 functions will change . 1 blocked               |
| [               Update Versions               ]   |
+---------------------------------------------------+
```

**Design scope mockup** (pro-coder, design `a7982d5d-9e2c-4499-883a-6e71b1439da4`; row counts illustrative):

```
+---------------------------------------------------+
| [code] Update Code Engine Versions for            |
|        pro-coder                        [R][~][x] |
|        BETA . 3 cards . 2 packages                |
|        1 app instance isn't on a card you can     |
|        open, so it's skipped                      |
+---------------------------------------------------+
| Target versions                                   |
|  codeAI                         [Latest - 1.2.3 v]|
|  DOMO DataSets                  [Latest - 3.3.2 v]|
+---------------------------------------------------+
| v [x] App Generator (227363686)      9 to update |
|        createNewApp            v1.1.32 -> v1.2.3  |
|        ...                                        |
| > [x] Call Tracker (417634084)       9 to update |
| > [ ] Copy of App Generator (953338630)           |
|        You may not own this card                  |
+---------------------------------------------------+
| 18 functions on 2 cards will change               |
| [          Hold to Update Versions            ]   |
+---------------------------------------------------+
```

**States and copy** (toast titles in Title Case, descriptions end with a period):

| State                     | Behavior and copy                                                                                                                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading                   | Spinner, "Loading Code Engine functions..."                                                                                                                                                     |
| Nothing bound             | Warning toast "No Code Engine Functions", "This app doesn't call any Code Engine functions." Back to default view                                                                               |
| No cards (design scope)   | Warning toast "No App Cards", "None of this app's instances are on a card you can open." Back to default view                                                                                   |
| All current               | Rows muted, button disabled, footer "Every function is on the target version."                                                                                                                  |
| Inherited row             | Muted, chip "Uses the app design's version", tooltip "This card uses v{x} from the app design. Update the app design to change it."                                                             |
| Package unavailable       | Chip "Unavailable", tooltip "This Code Engine package was deleted or you can't read it."                                                                                                        |
| Not wired                 | Chip "Not Wired", tooltip "This function isn't connected to a package yet. Wire it in the card's editor."                                                                                       |
| Review                    | Warning chip "Needs Review", reason such as "Input \"sender\" is required in v2.0.1 and this card's wiring doesn't fill it."                                                                    |
| Blocked                   | Chip "Blocked", reason "{function} doesn't exist in v{target}. Rewire it in the card's editor."                                                                                                 |
| Downgrade                 | Chip "Downgrade" (or "Unreleased v{pin}"), tooltip "This card is on a newer version than the target."                                                                                           |
| Not owner                 | Chip "You may not own this card", tooltip "Domo may refuse this change unless you own the card or are an admin."                                                                                |
| Checking                  | Footer "Checking wiring...", button disabled                                                                                                                                                    |
| In progress               | Promise toast "Updating 2 cards..."                                                                                                                                                             |
| Success (card)            | Success toast "Versions Updated", "Updated 8 functions. Reload the page to run the new versions.", action button **Reload Page** (`showStatus` `actionProps`, then `chrome.tabs.reload(tabId)`) |
| Success (design)          | "Versions Updated", "Updated 18 functions on 2 cards."                                                                                                                                          |
| Partial failure           | "Some Updates Failed", "Updated 1 of 2 cards. Call Tracker: You don't have permission to edit this card." Failed cards get a danger chip with the reason                                        |
| Full failure              | "Update Failed", "No cards were updated. {first reason}"                                                                                                                                        |
| 403                       | "You don't have permission to edit this card."                                                                                                                                                  |
| Conflict                  | "This card was edited while updating. Refresh and try again."                                                                                                                                   |
| 404                       | "This card's app no longer exists."                                                                                                                                                             |
| Verify mismatch           | "Domo didn't save the new versions on this card."                                                                                                                                               |
| Design 404 (design scope) | Danger toast "App Design Unavailable", "This app design can't be read in this instance." Back to default view                                                                                   |
| Design 404 (card scope)   | Info alert "The app design can't be read, so only this card's own versions are shown."                                                                                                          |

## Implementation plan

1. **Separate bug fix first (not #80).** **Done**, see [Pre-existing bugs found by the plans](open-issues-plan.md#pre-existing-bugs-found-by-the-plans) item 2. `swapAppColumns` now reads and saves through `/api/apps/v1/instances/{instanceId}` alone. #80 should do the same rather than use rows 3, 8, 9 and 10 above, since the project is moving off endpoints outside `/api`. The save in step 4 and the "Save with POST context, PUT context, PUT instance" decision need revisiting on that basis.
2. **Pool helper.** Import `src/utils/promisePool.js` from #9's commit B. If neither #9 nor `docs/plans/beta-phase-1-2-retries-concurrency.md` step 2 has landed it, build it to 1.2 step 2's `promisePool(tasks, { concurrency, onSettled })` signature (see Shared infrastructure across issues), not the `promisePool(taskFns, concurrency)` form of `ActivityLogTable.jsx:1846`, and leave moving that call site to the 1.2 work.
3. **Pure helpers.** Add `src/utils/appCodeEngineVersions.js` with `isStrictSemver`, `releasedVersions(versions)`, `buildEffectiveBindings`, `checkWiring`, `classifyAppBinding` and `buildVersionUpdates(rows, selected, packages)`. Reuse `compareSemver` and `classifyContractChanges` (rename hints only).
4. **Services.** Add `src/services/appCodeEngineVersions.js` with:
   - `getAppCodeEngineBindings({ designId, instanceId, tabId })`, which makes calls #1, #2 (falling back to #3) and #4.
   - `updateAppInstanceCodeEngineVersions(...)`, which makes the fresh read #2, then #8, #9, #10 and the verify, all in one `executeInPage`.
     Keep the exports alphabetized. Reuse `executeInPage`, `getCodeEnginePackageVersions` and `getFunctionContract`.
5. **Enrichment.** In `src/services/enrichments.js` (`card-app-instance`), return `codeEngineAliasCount` as described in Design and add it to `storePath`.
6. **Gating.** In `src/utils/availableActions.js`, add `updateAppCodeEngineVersions` for the card gate (`metadata?.context?.codeEngineAliasCount > 0`) and the design gate (`metadata?.details?.versions?.some((v) => v.packagesMapping?.length)`).
7. **Button.** Add `src/components/buttons/UpdateAppCodeEngineVersions.jsx`, the same shape as `UpdateWorkflowActionVersions.jsx`, and render it in `src/components/ActionButtons.jsx` next to `updateWorkflowActionVersions`.
8. **View, card scope (phase 1).** Add `src/components/views/UpdateAppCodeEngineVersionsView.jsx`, reusing:
   - `ViewHeader` (with `beta`), `buildReloadAction`, `buildRefreshAction` (`src/utils/headerActions.jsx`)
   - `getSidepanelData`, `useViewReady` (`src/hooks/useViewReady.js`)
   - `useStatusBar` (`showPromiseStatus`, and `showStatus` with `actionProps` for Reload Page)
   - `Alert`, HeroUI `Select`, `Chip`, `Checkbox`, `Tooltip`
     A small app-specific `TargetVersionSelect` lives inside the view file, not extracted from the workflow view. Register the slot in `src/sidepanel/App.jsx` next to `updateWorkflowActionVersions`.
9. **View, design scope (phase 2).** Add the design scope: `DataList` (`src/components/views/DataList.jsx`) items per card with rows as `children`, the skipped-instance subtext, a pooled write, and the multi-card confirmation (D80.3): the footer swaps to `src/components/buttons/HoldToConfirmButton.jsx` (default `HOLD_DURATION_FULL`, label "Hold to Update Versions") whenever the selection spans more than one card, and stays a plain **Update Versions** button for one card.
10. **Docs and lint.** Run `npx eslint --no-warn-ignored` on every touched file. Tick or remove `docs/TODO.md` line 9 ("Update code engine functions in a custom app to the latest version"). Add the WIP bullets to `docs/RELEASE_NOTES.md`. Update `STORE_LISTING.txt` only if its feature list changes, keeping it under the cap.
11. **Follow-up (separate change, D80.2).** A package-side entry from `GetUsageView` on the `instances` group, reading instances from #12 (or #11 per version), feeding the same service with a `packageId` scope.

Shared work: the view does not journal at first (DX.4). When journaling is revisited after 1.3 ships, the entry per write would be `{ instanceId, cardId, alias, from, to, contextIdBefore, contextIdAfter }`, recorded from the pool's `onSettled`, so a bump can be rolled back. Until then a bump is reverted by re-running the view with the old version as the target. Retries come from 1.2 and the run lock from 1.6.

## Edge cases and risks

- **Runtime resolution is inferred.** It must be confirmed on a scratch app before shipping (Testing). If it turns out wrong, the feature changes nothing a user can observe.
- **Miswired-at-pin cards are common** (62 of 549 own bindings). Bumping them doesn't fix them. The view reports the mismatch and never rewires (D80.4); rewiring stays in Domo's editor.
- **Version-only change can break a call.** The target can require an input that the wiring doesn't fill, or remove one it binds. Those rows are review-only and never preselected. A deleted function is blocked.
- **Nested schemas.** Output and input `children` are checked by name, so a renamed nested field lands in review rather than being treated as safe.
- **Several versions of one package on one card.** The per-package target moves them all, and each alias is classified separately.
- **Unreleased and `latest` pins.** These are guarded by `isStrictSemver` and never preselected.
- **Deleted packages** are common (41% of slots on domo.domo.com, mostly one template). They are shown as unavailable and never written.
- **Inherited aliases.** Writing them would change "follows the design" into "pinned", so the view never writes them (D80.1).
- **Own aliases not in the design version.** Domo's editor drops them on its next save. The view keeps them and shows an info chip.
- **Concurrent edit.** The `context.id` check runs against a fresh read inside the same page call that writes. A window of a few hundred milliseconds remains.
- **A card open while updating** keeps the old iframe until reload. The card-scope toast offers Reload Page.
- **Card titles with special characters** are encoded with `URLSearchParams`, which Domo's own call does not do.
- **Non-owners and locked cards** may get a 403, reported per card. The chip warns in advance.
- **Cross-customer designs** return 404. On the card scope the view still works from own pins only.
- **Large designs.** At most 8 cards were seen on one design, and the 1000-urn card batches and pool of 3 cover far more.
- **The swapAppColumns fix** changes a shipped behavior (a revert to design pins). Confirmed on a scratch card and logged; see [Pre-existing bugs found by the plans](open-issues-plan.md#pre-existing-bugs-found-by-the-plans) item 2.

## Testing and verification

No `/dev-*` route covers this. Use the CRXJS dev extension under the running `yarn dev`, and capture with `node scripts/ext-shot.js sidepanel --live` with the debug Edge profile open on the target page.

**Read-only render checks on domo.domo.com** (do not press Update on cards you don't own):

| Target                                                                                           | What it exercises                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Card `2141933500` (ACE Assistant)                                                                | 8 outdated clean rows, a pre-existing output mismatch (`deleteAppDBDocument`), a blocked row (`listUserCredentialAccounts`), and a current-but-miswired row (`sendEmail`) |
| Design `87ecfda4-c01f-4f7b-a545-69ecb7bd6b02`                                                    | Design scope with 1 carded instance; `8c32555d-06f8-4eb4-9af2-3f30a456ef42` counted as skipped                                                                            |
| Design `a7982d5d-9e2c-4499-883a-6e71b1439da4` (pro-coder)                                        | 3 carded instances. Skipped instance `6be65541-6556-4728-a048-065a430ff852` has an unreleased pin and several versions of one package                                     |
| Design `32b73331-a00e-482d-98ca-fe1941ca0d70` (RevRadar v4)                                      | 10 instances and no cards, so the "No App Cards" toast                                                                                                                    |
| Design `4e40727e-0321-42c9-870e-f3b3c1785261` (Treasure Map Game)                                | `latest` design pin and an unreleased instance pin                                                                                                                        |
| Instance `97801249-3798-47a2-b6d2-6e5ebde8813c` on design `aa2bd9b3-6f69-4591-97f1-777eeea098e7` | Partial inheritance (1 own, 2 inherited) plus the deleted package `29b4fab8-f3b0-41d6-96d9-7efcdb67d472`                                                                  |
| Card `1587118900` (Dataflow Status)                                                              | Single alias, already current                                                                                                                                             |

**Write and runtime verification on a scratch app the maintainer owns** (done in the browser during implementation):

1. Publish a scratch Code Engine package `domo-toolkit-probe-80-runtime` with two released versions whose function returns its own version string. Publish a scratch pro-code app that calls it, pinned to the first version, and put it on a card.
2. Run the view and update to the second version. Confirm that `GET /domoapps/apps/v2/{instanceId}` shows the target under `context.packageMapping` with a new `context.id`, and that `/versions/{v}/usage?parts=items` lists the instance under the new version.
3. Reload the card and confirm the function now returns the new version string. This settles runtime resolution.
4. Confirm datasets, collections, `workflowMapping` and the parameter wiring are unchanged. Open the card in Domo's editor and confirm the Code Engine Packages tab shows the new version.
5. Add a third version that adds a required input and removes the function's second function. Confirm review and blocked rows.
6. Change the card in Domo's editor between load and Update, and confirm the conflict reason. As a non-owner, confirm the 403 reason.
7. For the separate fix, give the scratch card an own pin different from the design. Run Remap Columns before and after the fix, and confirm whether the pin reverts before the fix and survives after it. That result decides the fix's release note.
8. Delete every scratch object afterwards.

Run ESLint on every touched file.

## Design decisions made

- **Update instance pins only, never the manifest.** Instance pins override design pins per alias (bundle `48800` fn `F`), and `domo publish` reverts manifest edits.
- **Leave design-version moves to Domo.** Asset Library's Cards tab already bulk-moves cards between design versions (bundle `42198`), so that part is cut by the Scope rule.
- **Classify the binding against the target contract, not old against new.** `sendEmail@2.0.1` on `80ec5d16-2494-4dc5-85c8-521ade4e15af` is on the latest release but miswired (VERIFIED-LIVE), and an old-vs-new diff would call it up to date.
- **Separate new problems from pre-existing ones.** `deleteAppDBDocument`'s output mismatch exists at both 2.0.13 and 2.1.1 (VERIFIED-LIVE), so the bump shouldn't be blamed or blocked for it.
- **Change only `version`.** This mirrors Domo's reducer (`DOMOAPPS/UPDATE_PACKAGE_VERSION`). The rename auto-fix from the draft is dropped, because the live breakage is stale wiring and deleted functions, not clean renames. Renames appear as hints only.
- **Target is the newest released version, with a per-package Select of released versions.** This matches `enrichCodeEngineGroup`. Unreleased versions are mixed into the live lists.
- **Downgrades are allowed but never preselected.** Rolling back a bad release is a real use for a lower target, and the default must never move a card backwards.
- **Save with POST context, PUT context, PUT instance.** This is the path exercised in production by `swapAppColumns` and by Domo's editor, rather than creating straight with edited pins, which is INFERRED only.
- **Build the write from a fresh read inside the same page call, and pass updates as data.** Injected code can't import, and a load-time snapshot would overwrite edits made since loading.
- **Use the bulk context read for context ids.** `POST /domoapps/apps/v2/context/bulk` is a read (VERIFIED-LIVE, Domo route `context_get_bulk`) and is the only source of `contextId` for many instances in one call, since #1 carries none.
- **Gate the card button on own pins, falling back to design aliases.** The instance endpoint returns `packagesMapping: null` for a fully inheriting card (VERIFIED-LIVE), so an own-only gate would hide the button there.
- **No feature-switch gate.** A bound alias already implies Code Engine, and the data gate is exact.
- **Soft ownership hint, no hard pre-gate.** Domo's own owner check is `isCurrentUserOwner` (bundle `48800` `KW`), it excludes admin rights (VERIFIED-LIVE), and its group coverage couldn't be verified. So non-owner, non-admin cards are unchecked with a chip but still attemptable.
- **Skip temporary, disabled and cardless instances.** The commit needs a card title and fullpage flag, and nobody runs a cardless instance.
- **Don't extract the workflow view's Select.** It is bound to that view's group model, and extracting it would refactor a shipped view for no shared behavior.
- **Ship the swapAppColumns fix separately.** It is a v1.9.0 bug unrelated to #80, so it gets its own commit and note without the issue link, per `wip-release-notes.md`.
- **Phase it: card scope, then design scope.** The design scope adds only the DataList grouping, pooling and confirmation on top of the same services.
- **Maintainer decisions** (D80.1 to D80.4): inherited functions stay read-only, the package-side entry is a follow-up, a run spanning more than one card holds, and wiring mismatches are reported, never fixed.

## Decisions

IDs are `D80.<n>`. Each entry opens with the **Decision** and what it changes in the plan; the options, the planning recommendation, and its reasoning follow for the record. Where the decision differs from the recommendation, the plan sections follow the decision.

### D80.1. For a function a card inherits from the app design (no pin of its own), should Update write an explicit pin onto the card?

**Decision:** Option 1. Inherited functions are shown read-only with the design's version and a note to update the design. The write stays a pure version change on existing entries.

1. Show it read-only with the design's version and a note to update the design
2. Let the user opt in per row (never preselected); selecting it writes the design's entry with the target version onto the card
3. Pin it automatically whenever that card is updated

**Planning recommendation:** Show it read-only. Only 16 of the 360 behind pins on domo.domo.com are inherited. Writing one turns that function from following the design into pinned, so later design publishes stop reaching it. Domo also strips parameter names when it merges design entries, so it is unclear whether a copied design entry runs correctly without a runtime test.

**Why it matters:** Read-only keeps the write as a pure version change on existing entries. Opt-in or automatic pinning makes the write service append design-derived entries (deciding whether to keep the manifest's parameter names), adds an 'inherited' selection path, and needs its own runtime check that a materialized pin executes.

### D80.2. Should the first version also open from a Code Engine package (update every app card that uses this package)?

**Decision:** Option 1. App side only (card and design) now; the package-side entry from Get Usage is a follow-up.

1. App side only now (card and design), package side as a follow-up
2. Ship card, design and package entry points together
3. Package side only, from Get Usage

**Planning recommendation:** App side only now. The services take a packageId scope later. The package side reaches far more cards (DOMO DataSets alone has hundreds of instances), so it deserves its own confirmation and testing pass.

**Why it matters:** The package side adds a third load scope fed by the usage endpoints, a row action in GetUsageView, cross-design batching, and a larger blast radius that likely needs a stronger confirmation. It moves the work further into L.

### D80.3. How strong should the confirmation be when one run updates several cards from an app design?

**Decision:** Option 2. The footer is a `HoldToConfirmButton` (the default `HOLD_DURATION_FULL`) when the selection spans more than one card, and a plain Update Versions button for a single card.

1. Plain Update Versions button everywhere, matching Update Action Versions
2. HoldToConfirmButton when the run touches more than one card
3. HoldToConfirmButton for every run

**Planning recommendation:** HoldToConfirmButton when more than one card is selected, and a plain button for a single card. A multi-card run changes live behavior on other people's cards at once, while a single card matches the Update Action Versions precedent and can be reverted by re-running with the old version.

**Why it matters:** It decides whether the footer swaps between Button and HoldToConfirmButton based on the selected card count, and the label copy for each.

### D80.4. When a card's wiring doesn't match its target version, should the view offer to re-sync the wiring, or only report it?

**Decision:** Option 1. Report only, with chips and reasons. Rewiring stays in Domo's editor, and the write changes `version` alone.

1. Report only (chips and reasons), leave rewiring to Domo's editor
2. Offer an opt-in Fix Wiring that drops parameters for removed inputs and renames the output binding to the contract's name
3. Offer Fix Wiring plus filling new inputs by matching parameter aliases to input names

**Planning recommendation:** Report only for the first version. Re-syncing changes what the app's code receives (removed parameters, renamed outputs), the app code can't be inspected, and 62 of 549 own bindings are already miswired today, so silent fixes could change working-by-accident behavior.

**Why it matters:** Report only keeps the write to `version` alone. A re-sync adds a second edit path to the write service (parameter and output rewrites, nested children), new review copy, and a broader verification pass, roughly doubling the write-side testing.

## Release notes draft

- App cards and app designs now have an Update Code Engine Versions button that moves their Code Engine functions to the latest released package version and flags functions whose wiring no longer matches. ([#80](https://github.com/brycewc/domo-toolkit/issues/80))
- Remapping columns or migrating content on a pro-code app card no longer resets the card's Code Engine and workflow versions to the app design's. _(separate bug fix, not #80; confirm the reset on a scratch app before logging)_

## Appendix: writes made on domo.domo.com during planning

No writes were made for this issue; every call was read-only.

- none (draft stage)
- none (critique stage)
- none (final stage: only GETs and read-only POSTs, namely /api/search/v1/query and /domoapps/apps/v2/context/bulk; scratch files only under /tmp/open-issue-plans/80/)
