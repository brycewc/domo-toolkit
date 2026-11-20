---
published: false
---

# Open Issues: Design, UX, and Implementation Plans

Status: **proposed**, written 2026-11-20 against branch `2.0.0`. This doc plans every open GitHub issue: [#9](https://github.com/brycewc/domo-toolkit/issues/9), [#8](https://github.com/brycewc/domo-toolkit/issues/8), [#6](https://github.com/brycewc/domo-toolkit/issues/6), [#80](https://github.com/brycewc/domo-toolkit/issues/80), [#43](https://github.com/brycewc/domo-toolkit/issues/43), [#10](https://github.com/brycewc/domo-toolkit/issues/10).

Each plan went through three passes: an investigator that read the code, the Domo API spec and Domo's own frontend bundles, and checked behavior against domo.domo.com; an independent critic that re-ran the checks and attacked the draft; and a reviser that settled every critique point. A final reconciliation pass merged the shared card infrastructure for #8 and #9 (and the batch helper #6 and #8 both need) into one design.

API claims in the plans carry one of these tags: **VERIFIED-LIVE** (called on domo.domo.com and the response inspected), **VERIFIED-CODE** (already used the same way in `src/`), **SPEC-ONLY** (from the OpenAPI spec, not exercised), or **INFERRED**.

Everything that could be settled by investigation was settled, and is recorded in each plan's **Design decisions made** subsection. What remains in [Decisions for you](#decisions-for-you) are product, UX, and scope calls that are yours to make.

## At a glance

| Issue                                                                                                                       | Effort | Decisions | Recommendation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------- | ------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#9](https://github.com/brycewc/domo-toolkit/issues/9) Bulk Rename Cards                                                    | M      | 4         | Build a separate side panel Rename Cards view (find and replace with optional regex, add prefix, add suffix, live before/after preview, in-view undo) for pages, App Studio pages and apps, worksheets, Report Builder pages, datasets, and dataflows. It sends one PUT per card to /api/content/v1/cards/{id}/title, with a payload rule that keeps dynamic text intact, and shares a card loader and one new DataList prop with #8. Medium effort.                                                           |
| [#8](https://github.com/brycewc/domo-toolkit/issues/8) Bulk Select Delete Cards on Dashboard                                | L      | 3         | Build a "Delete Cards" side panel view for pages, App Studio pages, and worksheet pages that bulk deletes the selected cards (or removes them from the page), showing for each card where else it lives, its alerts, embeds and drills, on the card loader and list wrapper it shares with #9 (see Shared infrastructure); size L.                                                                                                                                                                             |
| [#6](https://github.com/brycewc/domo-toolkit/issues/6) Find and Replace Columns in Beast Modes Bulk                         | L      | 8         | Build a new side panel view, Replace Columns in Beast Modes, launched from datasets and Beast Modes. It finds every dataset and card Beast Mode that references a column (on picked datasets or across the instance) with a paged search that filters inside the page, then rewrites those references in bulk through the existing column rewriter and a minimal batchWithFallback built to the beta 1.2 spec. The three shipped Beast Mode save paths stay untouched. Effort is L.                            |
| [#80](https://github.com/brycewc/domo-toolkit/issues/80) Update Code Engine Functions in a Custom App to the Latest Version | L      | 4         | Build a beta side panel view called "Update Code Engine Versions". It opens from an app card (one instance) or its app design (every carded instance), moves each card's own Code Engine pins to a chosen released version (latest by default), and checks each card's wiring against the target contract. It saves with the same three-step save Domo's editor uses. Effort is L: card scope first, design scope second, with the separate swapAppColumns fix landing beforehand.                             |
| [#43](https://github.com/brycewc/domo-toolkit/issues/43) Move a Page                                                        | M      | 7         | Build a Move Page side panel view for dashboard pages. It moves a page and its subpages under a new parent or to the top level through Domo's own bulk move endpoint, checks the depth rules first, and previews who gains and loses access on the page and on every ancestor. Effort is medium: service functions, one picker adapter with two sources, one view, one button, a small EntityPicker Retry, and paginated child-page loading. Reordering, App Studio moves and Business-in-a-Box pages are cut. |
| [#10](https://github.com/brycewc/domo-toolkit/issues/10) Pin Preconfigured Set of Features to Left Nav for a New Instance   | L      | 6         | Build a Nav Pins options tab that captures the portable part of your left nav from one instance and, the first time the extension sees a new instance whose nav is still at Domo's defaults, converges that instance's personal pins to it (in place, with Undo); large: a pure pin utility, a nav service, background first-visit logic with seeding, an options tab, and a toast hook.                                                                                                                       |

Cross-issue decisions: 4. Suggested order of work and what each issue builds for the others: see [Landing order](#landing-order).

**Pre-existing bugs found along the way** are listed in [Pre-existing bugs found by the plans](#pre-existing-bugs-found-by-the-plans). The most serious is `swapAppColumns` (`src/services/proCodeApps.js:179-180`, shipped in v1.9.0): it reads `packageMapping` and `workflowMapping` from the top level of `GET /domoapps/apps/v2/{instanceId}`, but Domo returns them only under `context`, so Remap Columns and Migrate Content save both as `[]` (inherit the design) on every pro-code card they touch. Re-confirmed live on instance `80ec5d16-2494-4dc5-85c8-521ade4e15af`: top-level keys carry no `packageMapping`, while `context.packageMapping` holds 10 pins and `context.workflowMapping` holds 1 binding.

## Decisions for you

IDs are `D<issue>.<n>`, plus `DX.<n>` for decisions that span issues. Each lists the options, a recommendation, and what changes in the implementation depending on the answer.

### Cross-issue (#6, #8, #9, #80)

#### DX.1. How should the bulk card actions be organized: separate Delete Cards and Rename Cards views, or one view with modes?

1. Two views, Delete Cards (#8) and Rename Cards (#9), each with its own action button, both on the shared CardBatchList (as both plans are now written)
2. One Bulk Edit Cards view with Delete, Remove from Page, and Rename modes behind one button
3. Selection modes added to the existing Get Cards view, with Delete, Remove, and Rename in its footer
4. Delete Selected Cards inside the page's existing Delete view, with Rename Cards as its own view

**Recommendation:** Two views. Delete is a hold-to-confirm-then-close flow scoped to pages, while Rename is a stay-open, multi-pass flow with a transform panel, a live preview, and a wider set of sources. The shared loader, list wrapper, and DataList prop give the reuse without coupling their state, and Get Cards stays a read-only view with no destructive actions.

**Why it matters:** It sets how many action buttons appear in the page card block (two, or one), whether one view has to juggle three modes with different sources, selection defaults (none selected for delete, all editable for rename), and stay-open rules, and whether GetCardsView or DeleteObjectView gets retrofitted. The shared pieces (getCardsForContext, CardBatchList, renderItemDetail) are the same under every option.

#### DX.2. Which source contexts should each card tool support?

1. Different sets: Delete Cards on pages, App Studio pages, and worksheet pages, plus Report Builder pages in Delete mode only; Rename Cards on those plus datasets, dataflows, and app or worksheet parent scope; neither on Beast Modes
2. The same full set for both: Delete Cards also on datasets, dataflows, and parent scope, with Remove from Page only on single-page contexts
3. The same page-only set for both in v1: Rename Cards drops datasets, dataflows, and parent scope
4. Option 1, plus Rename Cards on Beast Modes (every card that uses the Beast Mode)

**Recommendation:** Option 1. Renaming a dataset's or an app's cards is the duplicate-cleanup case the rename issue names, while deleting every card built on a dataset is a much larger, cross-page blast radius than the dashboard cleanup the delete issue asks for, and Remove only has meaning on a single page. Report Builder pages get Delete only, because bulk delete is page-independent and getCardsForObject already loads them, while remove there is unverified. Beast Mode contexts have no shared naming context for a rename.

**Why it matters:** The shared getCardsForContext supports every source, so the answer is a gate change in availableActions.js (deleteCards inside the page card block versus its own block, plus the renameCards block), plus README and release-note wording. Under option 2, DeleteCardsView also needs parent-scope groups and a hydrate (the dataset source has no locked field), and its placement lookups would run across many pages. Under options 1 and 2, the Remove toggle hides on report pages.

#### DX.3. Who should see the new card write tools (Delete Cards, Rename Cards), given that Manage Card Locks and Manage Card Owners are content.admin only?

1. content.admin or content.card.edit for both (Domo's canManageCards, the people who can reach Admin > Cards bulk actions), with per-row canManageCard checks
2. content.admin only for both, matching Manage Card Locks and Manage Card Owners
3. Rename on content.admin or content.card.edit, Delete on content.admin only
4. Option 1 now, and widen Manage Card Locks and Manage Card Owners to the same gate as a follow-up

**Recommendation:** Option 1. It matches who Domo already lets do this in Admin > Cards and in its own card menu (canManageKpi). The shared canManageCard helper disables rows the user can't manage, so a wider button gate does not produce lists of failures. #6 recommends the same right for Replace Columns in Beast Modes, so all three new write tools would match.

**Why it matters:** It sets two availableActions.js gates. For #8, it decides whether the fast adminsummary placement path is the normal case (adminsummary likely refuses users without either right, leaving the 30-second per-card fallback). It also decides whether the page card block ends up with mixed gates, since Locks and Owners stay content.admin only unless option 4 is chosen, which would need its own release note.

#### DX.4. Should the new multi-item write tools record their runs in the beta 1.3 change journal once it lands, even though 1.3 calls journaling non-Beta features a later per-feature decision?

1. Yes for every new multi-item write tool: Delete Cards (#8), Rename Cards (#9), Replace Columns in Beast Modes (#6), Update Code Engine Versions (#80), and Move Page's Move Back (#43)
2. Only the tools that ship as Beta (#6 and #80 are planned as Beta)
3. None until 1.3 has shipped for Transfer Ownership and Duplicate User; revisit per feature afterward

**Recommendation:** Option 1. Each of these tools already holds before and after values in memory, and the hook points are uniform (batchWithFallback's onSend and onSettled, promisePool's onSettled, one entry for a page move), so the cost is a few lines per view. A permanent bulk card delete is the case where a durable record of what was deleted matters most.

**Why it matters:** It decides whether #8 keeps each deleted card's ID, title, and placements for the record, whether #9's and #6's in-view Undo banners ('Undo lasts until you leave this view') can go once 1.3 lands, and whether 1.3's Recent Runs page needs feature labels and Excel row mappers for five more features.

### #9: Bulk Rename Cards

#### D9.1. Should v1 include per-row inline title editing?

1. No: find and replace, prefix, suffix, and unselecting rows only; single-card edits stay in Domo's Edit Title modal
2. Yes: a pencil on each row opens an input (disabled on titles with dynamic text)
3. A per-row 'Override' field in an expandable row body

**Recommendation:** Option 1 for v1. It is the part closest to re-skinning Domo's own Edit Title modal, and it would be disabled on titles with dynamic text anyway.

**Why it matters:** With option 1, renderItemDetail only renders a read-only diff. The shared renderItemDetail slot is already specified to sit outside the row's press handling (so #6 can put an expandable formula there), so options 2 or 3 no longer need DataList work. They still need an overrides map in the view state, override-wins-over-transform logic in the preview, and per-row validation of the typed title.

#### D9.2. Should v1 also rename card descriptions, or only titles?

1. Titles only (dynamicDescription is always echoed back unchanged)
2. Add an 'Apply to: Title / Description' toggle using the same engine and endpoint
3. Titles in v1, descriptions as a quick follow-up

**Recommendation:** Titles only in v1. The engine, payload builder, and endpoint are field-agnostic, so adding descriptions later is small.

**Why it matters:** The issue asks only for titles, and CLAUDE.md says to confirm before broadening scope. Descriptions add a second diff line per row, a mode control in the panel, and pill handling on descriptions with dynamic text. The PUT already carries descriptions, so the API side costs nothing either way.

#### D9.3. Should a phase 2 add renaming across unrelated pages and datasets, and if so, how should cards be chosen?

1. No, keep it scoped to the current object or App Studio app
2. Instance-wide 'find cards by title' source over adminsummary title search, for content admins only, opened from the options page
3. An 'Add Cards From...' picker inside the view that merges more pages or datasets into the working set
4. Both of the last two

**Recommendation:** Ship v1 context-scoped, then add the instance-wide title search for content admins. adminsummary already does server-side title search (8,255 'Duplicate of' cards on domo.domo.com), which matches the real cross-object need.

**Why it matters:** It decides whether the view needs a context-free entry point (an options page tab or a side panel launcher with no object), a paginated search source (adminsummary caps at 100 per page and 429s under load), and content.admin gating separate from the per-object button. It also sets the blast radius, which feeds the confirmation question.

#### D9.4. How strong should the confirmation be before renaming?

1. Plain 'Rename N Cards' button, relying on the full preview, in-view Undo, and the audit log
2. HoldToConfirmButton for every run
3. Plain button, switching to HoldToConfirmButton above a threshold (for example 50 cards), in parent scope, or for the instance-wide source

**Recommendation:** Plain button for object scope. Use a hold above 50 cards, which covers most parent-scope runs, and always for a phase 2 instance-wide source.

**Why it matters:** Renames are reversible and fully previewed, so a hold mostly adds friction to the common 15-card cleanup. But a mistyped regex across hundreds of cards in an App Studio app is tedious to audit, and the in-view undo disappears if the panel closes. The answer changes the footer component, its copy, and whether threshold logic exists.

### #8: Bulk Select Delete Cards on Dashboard

#### D8.1. Should Remove from Page ship in #8?

1. Yes, both Delete and Remove from Page in one view
2. Delete only now, Remove later if asked for
3. Remove only for cards that also live on another page (never leaving a card on no page)

**Recommendation:** Ship both, as planned, if you see the batch remove plus the 'left on no page' warning as worth it. Otherwise Delete only. Domo's page editor already removes cards in place one at a time, so Remove is the weaker half of the scope case.

**Why it matters:** Remove adds removeCardsFromPage, getPageEditState, the mode toggle with selection pruning, its own quick select, a second confirm with its own copy, and the page-permission checks. Dropping it removes roughly a third of the view. The shared pieces (getCardsForContext, CardBatchList, batchWithFallback) are unaffected either way.

#### D8.2. In Delete mode, do system pages (Shared, Favorites, Overview) count as 'living elsewhere' for Only Live Here?

1. Count all of them, as the page delete's 'Cards that Only Live Here' does today
2. Count Shared and Favorites (other people lose the card) but not Overview
3. Count none of them

**Recommendation:** Count all of them for now, so 'only lives here' means the same thing across the extension, and name each system placement in the row detail line and confirm so the user sees why a card was left out. If you want a different rule, change cardIdsOnlyOnPages in pages.js at the same time.

**Why it matters:** On a real 52-card page this flips 31 cards in or out of the quick select. If the answer is not 'all', the shared page delete logic should change too, or the two features will disagree about the same card.

#### D8.3. How strong should the confirmations be?

1. Match single card delete exactly: 5 s hold only when a selected card has embeds, otherwise a click
2. Always hold for bulk Delete (5 s when embeds exist or a lookup failed, 2.5 s otherwise); Remove is a click unless it leaves cards on no page (2.5 s)
3. Always a 5 s hold for Delete and for Remove

**Recommendation:** Always hold for bulk Delete with the two tiers (HOLD_DURATION_FULL and HOLD_DURATION_SHORT), and Remove a click unless it leaves cards on no page. A bulk delete has no undo and multiplies the reach of one press. The single-card rule (hold only for embeds) was set for one card at a time.

**Why it matters:** It decides the holdDuration function in DeleteCardsView, and whether the dialog's confirm must wait on the embeds lookup (it always waits on placements for the copy either way). Rename Cards asks its own confirmation question, since a reversible rename may reasonably get a lighter answer.

### #6: Find and Replace Columns in Beast Modes Bulk

#### D6.1. Should #6 wait for beta phases 1.2 (batchWithFallback and withRetry), 1.3 (change journal) and 1.6 (useRunLock), or ship first with stand-ins?

1. Ship first: build a minimal batchWithFallback to the 1.2 spec, keep Undo and Change Log in-session, and use the reloadAction-based interim lock; adopt each phase as it lands
2. Wait for 1.2 step 6 only, and ship with in-session Undo and the interim lock
3. Wait for 1.2, 1.3 and 1.6 all to land, and build #6 on them directly

**Recommendation:** Option 1. The stand-ins are built to the planned signatures (batchWithFallback, createRunJournal, useRunLock), so adopting each phase is a small swap, and none of the three shipped save paths is touched.

**Why it matters:** Option 1 adds src/utils/batchWithFallback.js in #6 and a later one-line useRunLock call. Option 2 delays #6 behind the 1.2 retry work. Option 3 removes the in-session Undo and Change Log code entirely, since the journal provides both, but blocks #6 on three plans that have not started.

#### D6.2. How should Beast Modes on data models be handled?

1. Exclude in v1: list them disabled with a Data model chip, and give data model datasets no button
2. Include with table-qualified matching: Find picks a table plus a column from /schema/indexed, and the rewrite touches only refs qualified with that table
3. Include with unqualified matching and a warning chip

**Recommendation:** Option 1. Only 40 of 94,338 expressions on domo.domo.com are qualified, 38 of them on three data models. Their schemas/latest returns no columns, so target checks need a different read.

**Why it matters:** Option 2 adds a table picker to Find, a QUALIFIED_REF_RE-based rewrite (extending rewriteScopedExpressionString), and a /schema/indexed read for validation. Option 3 would rewrite the same column name on every table of the model, and any table alias that equals the Find text.

#### D6.3. How should locked (but editable), certified and certification-requested Beast Modes be treated by default?

1. Select them like any other editable Beast Mode
2. Show them unselected as an opt-in, with a hold to confirm whenever certified or certification-requested rows are included
3. Exclude certified and certification-requested Beast Modes entirely, with locked ones opt-in

**Recommendation:** Option 2. Any edit sets EXPIRED (tried three ways live), which drops a certification or cancels an open request. Locked rows follow DeleteUnusedBeastModesView's convention.

**Why it matters:** This sets the initial selection logic and whether the confirm step is an AlertDialog or a HoldToConfirmButton. Option 3 removes both certification chips and the hold path. On domo.domo.com, 11,989 Beast Modes have an open request.

#### D6.4. Which rights should gate the button, given that Remap Columns and Migrate Beast Mode Usage have none?

1. Gate this button on content.card.edit or content.admin, and leave the two siblings as they are
2. Gate all three Beast Mode write tools on the same content.card.edit or content.admin check
3. No gate on any of them; rely on per-row editability and server errors

**Recommendation:** Option 1 now, with option 2 as a follow-up. content.card.edit is the authority Domo names for Beast Mode edits, and the new tool can scan the whole instance, so showing it to someone who can edit nothing is costly.

**Why it matters:** It is one line in availableActions.js for #6, but option 2 also changes who sees two shipped buttons, which would need a release note.

#### D6.5. Should archived Beast Modes that reference the column be editable?

1. Count and list them read-only (v1 as planned)
2. Include them as an opt-in group, unselected by default
3. Ignore them completely, with the notarchived filter and no count

**Recommendation:** Option 1. The count tells someone retiring a column that a restore would bring the old reference back, without editing content nobody uses. Saving an archived template was not tested.

**Why it matters:** Option 2 needs a scratch probe that an archived template accepts a bulk update, plus an Archived group in Review. Option 3 saves one banner but hides a real risk for the retire-a-column workflow.

#### D6.6. Should the results screen offer an in-session Undo, or only a downloadable change log?

1. Undo Changes plus Download Change Log
2. Download Change Log only
3. Neither until the change journal (beta 1.3) lands

**Recommendation:** Option 1. The before expressions are already in hand, the revert reuses the same fresh-read and batch path, and the 1.3 journal plans no Restore action, so this would be the only rollback.

**Why it matters:** Option 1 adds revertColumnReplacement, an Undo confirm and a progress state. Option 3 leaves users with no recovery path in v1 apart from editing each Beast Mode by hand.

#### D6.7. Should this be a standalone action, or a mode inside Remap Columns?

1. New standalone view and button next to Remap Columns
2. A 'Replace a column' mode inside Remap Columns (dataset only, but also covers cards and dataflows)
3. Standalone view, plus a link from Remap Columns' 'Nothing to Remap' toast

**Recommendation:** Option 3. The standalone view is needed to span datasets and the instance. A link from the bail toast catches users who reach for the wrong tool.

**Why it matters:** Option 2 reworks RemapColumnsView's orphan-based detection and drops the cross-dataset scope. Option 3 also touches the toast at RemapColumnsView.jsx:421.

#### D6.8. Should the tool stay Beast Modes only, or also cover other content that references the column across datasets?

1. Beast Modes only (the issue as written)
2. Beast Modes, plus a read-only list of cards, dataflows and views that reference the column, each linking to Remap Columns on its dataset
3. Also rewrite card column references (chart bindings, filters, sorts) across datasets through the existing card rewrite

**Recommendation:** Option 1 for v1, with option 2 as a follow-up. Option 3 turns this into a cross-dataset Remap Columns with a much larger scan and write surface.

**Why it matters:** Option 2 adds per-dataset downstream scans to the review. Option 3 roughly doubles the work and moves the effort to XL, since it brings in the card rewrite executor and its drop and reshape rules.

### #80: Update Code Engine Functions in a Custom App to the Latest Version

#### D80.1. For a function a card inherits from the app design (no pin of its own), should Update write an explicit pin onto the card?

1. Show it read-only with the design's version and a note to update the design
2. Let the user opt in per row (never preselected); selecting it writes the design's entry with the target version onto the card
3. Pin it automatically whenever that card is updated

**Recommendation:** Show it read-only. Only 16 of the 360 behind pins on domo.domo.com are inherited. Writing one turns that function from following the design into pinned, so later design publishes stop reaching it. Domo also strips parameter names when it merges design entries, so it is unclear whether a copied design entry runs correctly without a runtime test.

**Why it matters:** Read-only keeps the write as a pure version change on existing entries. Opt-in or automatic pinning makes the write service append design-derived entries (deciding whether to keep the manifest's parameter names), adds an 'inherited' selection path, and needs its own runtime check that a materialized pin executes.

#### D80.2. Should the first version also open from a Code Engine package (update every app card that uses this package)?

1. App side only now (card and design), package side as a follow-up
2. Ship card, design and package entry points together
3. Package side only, from Get Usage

**Recommendation:** App side only now. The services take a packageId scope later. The package side reaches far more cards (DOMO DataSets alone has hundreds of instances), so it deserves its own confirmation and testing pass.

**Why it matters:** The package side adds a third load scope fed by the usage endpoints, a row action in GetUsageView, cross-design batching, and a larger blast radius that likely needs a stronger confirmation. It moves the work further into L.

#### D80.3. How strong should the confirmation be when one run updates several cards from an app design?

1. Plain Update Versions button everywhere, matching Update Action Versions
2. HoldToConfirmButton when the run touches more than one card
3. HoldToConfirmButton for every run

**Recommendation:** HoldToConfirmButton when more than one card is selected, and a plain button for a single card. A multi-card run changes live behavior on other people's cards at once, while a single card matches the Update Action Versions precedent and can be reverted by re-running with the old version.

**Why it matters:** It decides whether the footer swaps between Button and HoldToConfirmButton based on the selected card count, and the label copy for each.

#### D80.4. When a card's wiring doesn't match its target version, should the view offer to re-sync the wiring, or only report it?

1. Report only (chips and reasons), leave rewiring to Domo's editor
2. Offer an opt-in Fix Wiring that drops parameters for removed inputs and renames the output binding to the contract's name
3. Offer Fix Wiring plus filling new inputs by matching parameter aliases to input names

**Recommendation:** Report only for the first version. Re-syncing changes what the app's code receives (removed parameters, renamed outputs), the app code can't be inspected, and 62 of 549 own bindings are already miswired today, so silent fixes could change working-by-accident behavior.

**Why it matters:** Report only keeps the write to `version` alone. A re-sync adds a second edit path to the write service (parameter and output rewrites, nested children), new review copy, and a broader verification pass, roughly doubling the write-side testing.

### #43: Move a Page

#### D43.1. Should Move Page also cover moving an App Studio page to another App Studio App (or a dashboard into an app), by chaining Domo's App Studio import with a delete of the source?

1. No: reparent dashboard pages only
2. Add a later "Move to App" phase: import with the original cards referenced, then delete the source page
3. Include "Move to App" in the first version

**Recommendation:** No for now. Domo's import already does the copy, and deleting the source is one more easy step. A chained version creates new IDs, breaks links, and loses shares, subscriptions and scheduled reports, and each of those needs its own warning.

**Why it matters:** Including it adds a second service path (PUT /content/v1/dataapps/{appId}/views/import with its progress events, then a view delete), DATA_APP_VIEW and WORKSHEET_VIEW gating, and a much larger risk section and UX for what gets lost. That roughly doubles the effort, to L.

#### D43.2. Who should see the Move Page button?

1. Content admins, plus owners who hold content.page.edit (mirrors Domo's canUpdateOwnership)
2. Anyone Domo's own picker treats as able to change the page: content.page.edit and (page unlocked or owner)
3. content.admin only

**Recommendation:** Content admins plus owners with content.page.edit. Domo's admin Move turned out not to check ownership at all, so the server rule is unknown. Owners are the group most likely to succeed and least likely to cause surprise.

**Why it matters:** It changes the getAvailableActions condition and how often the 403 copy appears. The second option would show the button on many unlocked pages the user doesn't own, so a server rule that requires ownership would make the button fail often. Only a non-admin token can settle the server rule.

#### D43.3. When should the submit control require a hold instead of a plain press?

1. Whenever the preview shows anyone gaining or losing access on the page or any ancestor (or a needed list failed to load)
2. Only when someone loses access (the draft's rule)
3. Always hold, for every move
4. Never hold

**Recommendation:** Hold whenever anyone gains or loses access anywhere. Widening a parent and its top page is the main risk, and it is verified, so a rule that holds only on losses would leave the riskiest Keep moves at one press. Moves are rare, so the extra friction costs little.

**Why it matters:** It decides whether the control comes from previewAccess's gains plus ancestorGains plus losses, or from losses alone. In practice the first option holds almost every move under a parent, and the second leaves Keep and Combine at one press.

#### D43.4. Should the toolkit offer to clean up the access the moved page leaves behind on its old parent and old top page?

1. Inform only: name every old ancestor on the result screen
2. Offer an opt-in checklist that removes chosen users and groups from the old ancestors, using DELETE /api/content/v1/share/bulk/page/{user|group}/{id}?resourceIds=, behind its own hold
3. Neither inform nor clean up

**Recommendation:** Inform only in v1. The access list can't tell a deliberate share on the parent from one propagated by the moved page, so even a curated checklist can revoke something on purpose. The revoke endpoint is also unexercised.

**Why it matters:** The checklist adds a second write path, a revoke service, a confirmation screen, and a live probe of the revoke endpoint. That moves the effort toward L and adds a way for the feature to remove access.

#### D43.5. Should pages inside Business-in-a-Box folders (negative parentPageId, 20 on this instance) be movable?

1. Block them in v1 with an inline note (current plan)
2. Allow moving them out to a real parent or the top level, but never back in, with Move Back hidden
3. Support them fully, including Move Back into the folder

**Recommendation:** Block them in v1. Whether bulk move accepts or clears a negative parent couldn't be tested without moving pre-existing content, and adminsummary reports wrong titles for them.

**Why it matters:** Allowing them requires a maintainer-approved probe on a real BIB page, breadcrumb code that reads folder names from the nav tree instead of adminsummary, and special handling for Move Back.

#### D43.6. Which access option should be preselected when the view opens?

1. Preselect "Keep its current access" (ORIGINAL)
2. No default: force an explicit choice, as Domo's dialog does
3. Preselect "Combine both" (MERGE)

**Recommendation:** No default. Keep never removes anyone from the page, but it is also the option that widens the new parent and top page. Forcing a choice makes the user read the ancestor lines once.

**Why it matters:** It sets the initial mode state and whether submit starts disabled, and decides how many moves widen parent access without the user reading the preview.

#### D43.7. Should the first version also move several pages at once (for example, selected rows in Get Child Pages)?

1. One page per run
2. Also add a "Move Selected" action to the Get Child Pages list
3. One page now, with multi-select planned as a follow-up

**Recommendation:** One page now, with multi-select as a follow-up. Batches fail as a whole, and per-page access previews don't combine cleanly across several sources and their ancestors.

**Why it matters:** Multi-select needs a DataList row action, per-page depth checks against the shared destination, a combined preview, and a rule for a batch where one page is blocked (split it or refuse).

### #10: Pin Preconfigured Set of Features to Left Nav for a New Instance

#### D10.1. What should qualify an instance for the automatic apply, beyond not being already known to this browser?

1. Untouched nav only: your personal pins there are Domo's defaults, or none
2. Untouched nav AND your account on that instance was created recently (for example within 30 days, from the user record's detail.created)
3. Never automatic: show a one-click Apply offer in the side panel and popup the first time instead

**Recommendation:** Untouched nav AND a recent account. Both signals are cheap, and the account-age check catches the case where an old instance's nav still happens to be the defaults while matching the issue's 'first time you login' wording most literally.

**Why it matters:** Option 2 adds one GET /api/content/v3/users/{id}?includeDetails=true to getNavPinEligibility plus a threshold constant. Option 3 removes the background mutation, the badge, and the resume logic, and replaces them with a prompt toast that calls APPLY_NAV_PRESET.

#### D10.2. When you run Apply Now on an instance where you already customized your nav, should it replace your pins or keep them?

1. Replace: remove your personal pins and converge to the preset (hold to confirm, with Undo)
2. Add Missing: keep your pins and append any preset pins that are missing
3. Offer both buttons, Replace and Add Missing

**Recommendation:** Offer both. Replace is what the issue describes for new instances, but on an established instance keeping instance-specific pins (apps, cards, workspaces) is often what you want.

**Why it matters:** Add Missing needs a mode flag in applyNavPins that skips step 5 (deletes) and the reorder, a second button, and its own copy. Replace-only keeps one code path.

#### D10.3. When the user has an unlocked Navigation View assigned (admin pins shown, personalization allowed), what should the automatic apply do?

1. Skip it like a locked view and log it, leaving Apply Now available
2. Apply the preset as personal pins after the view's pins, skipping any preset pin the view already shows
3. Apply only when the view has no pins

**Recommendation:** Apply after the view's pins, skipping duplicates. The view pins stay untouched either way, and the user still gets their own set.

**Why it matters:** It sets one branch in maybeApplyNavPreset's eligibility step and whether the 'already in your nav from a Navigation View' copy appears on automatic runs or only on manual ones.

#### D10.4. Should automatic apply be on by default once a preset exists, and should the switch follow you across browsers?

1. On by default and synced (the preset and switch both in chrome.storage.sync, with first-run seeding on each device)
2. Off by default, and the switch is per device (chrome.storage.local)
3. Synced preset, with a per-device switch that defaults on

**Recommendation:** On by default and synced. First-run seeding marks every instance a new browser already has cookies or tabs for as known, and the untouched check backs that up, so a synced switch is safe.

**Why it matters:** It decides which storage area holds navPinPresetAuto, whether the options switch needs a 'this device only' note, and whether seeding has to run on first device run or only when the switch is turned on.

#### D10.5. Where should the Nav Pins settings live in the options page?

1. A new 'Nav Pins' tab after Per-Instance Settings
2. A section at the top of the existing Per-Instance Settings tab
3. A section in the General Settings tab

**Recommendation:** A new 'Nav Pins' tab. The preset is global with its own activity list and immediate actions, while Per-Instance Settings is built around per-instance dataset configs and General Settings saves through a form.

**Why it matters:** It decides whether the plan adds a Tabs.Tab and Tabs.Panel in src/options/App.jsx with a standalone component, or reshapes PerInstanceSettings.jsx or GeneralSettings.jsx around actions that do not fit their save model.

#### D10.6. Should one preset cover every instance, or should you be able to keep several (for example 'Customer' and 'Internal rig')?

1. One preset for all instances
2. Several named presets, one marked as the default for automatic apply
3. One preset plus a list of instance patterns (such as rigs) that are never auto-applied

**Recommendation:** One preset. It matches the issue, fits in a single sync item, and Apply Now plus the activity list already handle exceptions.

**Why it matters:** Named presets change the storage shape (an array, with the 8 KB sync cap per preset item), add a picker to Capture and Apply, and need a default selector. An exclusion list adds a pattern check in maybeApplyNavPreset and a small editor.

## Shared infrastructure across issues

This section settles the pieces that #8 (Bulk Select Delete Cards on Dashboard) and #9 (Bulk Rename Cards) were meant to share, plus the overlaps found across all six plans (#6, #8, #9, #10, #43, #80). It is based on the plans and on the code they reference (`DataList.jsx`, `GetCardsView.jsx`, `ManageCardLocksView.jsx`, `DeleteObjectView.jsx`, `src/services/cards.js`, `src/utils/cardHelpers.js`, `src/hooks/*`, `src/utils/executeInPage.js`, and the beta-phase plans).

### What is shared, and who builds it

| Piece                                                                                | File                                     | Built by                            | Adopted by                                                                                                               |
| ------------------------------------------------------------------------------------ | ---------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `getCardsForContext`, plus `cardsOnly` and `parts` options on `getCardsForParent`    | `src/services/cards.js`                  | #9                                  | #8                                                                                                                       |
| `cardUrlOnPage`, `canManageCard`                                                     | `src/utils/cardHelpers.js`               | #9                                  | #8; `GetCardsView` adopts `cardUrlOnPage` in the same commit                                                             |
| `renderItemDetail` prop (the only DataList extension)                                | `src/components/views/DataList.jsx`      | #9                                  | #8 (row detail line), #6 (expandable before and after formula)                                                           |
| `CardBatchList` (the only card list wrapper)                                         | `src/components/views/CardBatchList.jsx` | #9                                  | #8                                                                                                                       |
| `promisePool`, to beta 1.2 step 2's signature                                        | `src/utils/promisePool.js`               | #9                                  | #80                                                                                                                      |
| `retryAfter` on the `executeInPage` error envelope (the envelope half of 1.2 step 1) | `src/utils/executeInPage.js`             | #9                                  | #8's placement fast path, then 1.2                                                                                       |
| `batchWithFallback`, to 1.2 section 6 as amended below                               | `src/utils/batchWithFallback.js`         | whichever of #6 and #8 starts first | the other one                                                                                                            |
| `HOLD_DURATION_FULL` (5000) and `HOLD_DURATION_SHORT` (2500)                         | `src/utils/constants.js`                 | #8                                  | `HoldToConfirmButton`'s default and `DeleteObjectView`, so every hold in #6, #10, #43 and #80 picks them up with no edit |
| `cardHostUrlForTab` (moved from `DeleteObjectView.jsx`)                              | `src/utils/cardHelpers.js`               | #8                                  | `DeleteObjectView`                                                                                                       |
| `computeIsOwner` covers `WORKSHEET_VIEW`                                             | `src/background.js`                      | #8, as its own bug-fix commit       | every worksheet page gate                                                                                                |
| A shared card-batch hook                                                             | none                                     | not built (see below)               |                                                                                                                          |

`src/hooks/useCardBatch.js` (#8's proposal), `renderItemTrailing` (#8's hand-off to #9), and #9's view-local apply pool are all dropped.

### Landing order

1. **#9, commit A: shared card plumbing.** `cardUrlOnPage` and `canManageCard` (with `GetCardsView.transformCardsToItems` switched to `cardUrlOnPage`), the `getCardsForParent` options, `getCardsForContext`, DataList `renderItemDetail`, and `CardBatchList`. No user-visible change, so no release note.
2. **#9, commit B: executors.** `src/utils/promisePool.js` and the envelope `retryAfter` field. Record both in `docs/plans/beta-phase-1-2-retries-concurrency.md` (amendments below). Moving `ActivityLogTable.jsx`'s local `promisePool` stays with 1.2, as #80 also proposes.
3. **#9 feature commits.**
4. **`batchWithFallback` in its own commit**, by whichever of #6 and #8 starts first, together with the 1.2 doc amendment. The signature is fixed here, so the order between #6 and #8 no longer matters.
5. **#8:** first the `computeIsOwner` fix as its own commit (it is a shipped bug, see below). Then the hold constants and `cardHostUrlForTab`, then the feature, adopting everything from commit A.
6. **#80** imports `promisePool` from step 2. If #80 lands before #9, it builds `promisePool` to the 1.2 step 2 signature, not the `promisePool(taskFns, concurrency)` form #80's plan proposes.

**Why #9 goes first.** It is the smaller issue (M against L). It is also the harder consumer of the shared list: grouped parent scope, one card under several views, row order pinned across renames, and live per-row status at concurrency 4. Shaping `CardBatchList` and `getCardsForContext` against that case first means #8 adopts them with no rework. And #9 does not need `batchWithFallback`, so the #6/#8 overlap cannot hold it up. If the maintainer would rather ship #8 first, #8 builds commit A exactly as specified here (it needs all of it except `promisePool` and the envelope field), and #9 adopts it and builds commit B.

### Card loading: `getCardsForContext`

```js
export async function getCardsForContext({ context, hydrateParts = null, parentId = null, parts = null, scope = 'object', tabId = null })
// -> { cards, failedViews: [{ error, viewId, viewName }], groups: [{ cardIds, viewId, viewName }], missingIds: string[], parentName: string | null }
```

It goes between `getCardsByIds` and `getCardsForObject` (exports stay alphabetical).

- **Object scope:** `getCardsForObject({ metadata: context.domoObject.metadata, objectId, objectType, parts, tabId })`.
  - Pages, App Studio pages, worksheet pages, and Report Builder pages read stacks with `parts`, and keep the existing v1 page fallback on a 404.
  - Datasets read `datasources/{id}/cards`, which carries no `metadata` and no `locked`.
  - **Dataflows need nothing lifted from GetCardsView.** `getCardsForObject`'s `DATAFLOW_TYPE` branch already pools the outputs at `DEPENDENCY_FETCH_CONCURRENCY` and dedupes by card ID (`cards.js:361-389`, VERIFIED-CODE). `fetchCardsForOutputDatasets` stays in `GetCardsView`, because Get Cards groups cards by output.
- **Parent scope** (`scope: 'parent'`, `parentId` defaulting to `context.domoObject.parent?.id`): calls `getCardsForParent({ cardsOnly: true, parentId, parts, tabId })`.
  - Each view becomes `groups[]` (`cardIds` in load order).
  - A view whose card read failed goes to `failedViews` instead of disappearing.
  - `transformParentScopeItems` stays in `GetCardsView`. It builds DataListItems and mixes in forms, queues, and workflows, so it is a UI transform, not loader logic.
- **Hydrate** (only when `hydrateParts` is set): one `getCardsByIds({ cardIds, parts: hydrateParts })` call, merged onto the source card as `{ ...sourceCard, ...hydrated }`.
  - The merge keeps source-only fields, such as stacks' per-card `access` flag on App Studio views, which a v1 card read does not return.
  - IDs the hydrate does not return go to `missingIds` and drop out of `cards`.
- **Normalized output:**
  - `cards` holds each card once, with `id` as a string so Map and Set keys agree across sources.
  - Sorted by trimmed title, each card carries a `loadIndex`.
  - The raw `title` is kept untrimmed, since #9 needs the exact stored text.
- **Errors:** an object-scope source failure throws, with `status`. In parent scope, only a failed app read throws.
- **`getCardsForParent` options:** `cardsOnly` already exists (pre-existing bug 4): it skips `fetchViewDetails` and the forms, queues, and workflows reads and returns `{ cards: [], error, viewId, viewName }` for a failed view. #9 adds `parts = null`, passed to each view's card read.

| Consumer        | `parts`                              | `hydrateParts`                                                                                                                   | Scope            |
| --------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| #8 Delete Cards | `'datasources,owners,drillPathURNs'` | `null` (stacks already carries every row field, `access` included)                                                               | object           |
| #9 Rename Cards | `null`                               | `'metadata,owners'` (the dataset source has no `locked` or `metadata`, and the payload rule needs `metadata.dynamicDescription`) | object or parent |

Follow-up, in neither issue: `GetCardsView`, `ManageCardLocksView` and `ManageCardOwnersView` can move onto this loader later. Manage Card Locks already works around the dataset source's missing `locked` (VERIFIED-CODE).

### Card list: `CardBatchList` and one DataList prop

**One DataList extension: `renderItemDetail: (item) => ReactNode | null`.** `renderItemTrailing` is dropped. Both features need a visible second line on a row, and DataList has none:

- DataList never renders `item.metadata`, although `DataListItem` documents it as display text.
- `annotation` is only an info icon plus hover text (VERIFIED-CODE, `DataList.jsx` around line 1450).

So #8's "Opportunities. Also on Q3 Review and 1 more, 1 alert, 2 drills" needs the same slot as #9's before and after diff. #6's review rows (an expandable before and after formula under each Beast Mode) fit the same slot, so DataList gains one prop instead of three. A trailing editor slot was only for per-row inline editing, which #9 recommends against for v1. If the maintainer chooses it anyway, the detail slot hosts the input.

The prop's contract:

- It renders on leaf rows at any depth, under the label, in a plain block outside any `Disclosure.Trigger` or pressable element, so interactive content there works.
- It is threaded through `childRenderProps` and both `VirtualizedItems` call sites.
- `arePropsEqualForRow` compares it by function identity, so consumers memoize it on the data it reads.
- When it is set, `VirtualizedItems` passes a taller `estimateSize` than `ROW_HEIGHT` (36), to avoid scroll jumps before rows are measured.
- It is documented in the props JSDoc. Fix the `DataListItem.metadata` JSDoc in the same edit, since nothing renders it.

**One list wrapper: `src/components/views/CardBatchList.jsx`.** It is a thin, stateless wrapper over `DataList` in selection mode. It loads nothing, sends nothing, and holds no run state.

| Prop                                                                                                   | Purpose                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cards`, `groups`                                                                                      | Rows come from the loader output. With `groups`, each view is a virtual parent (linking to the view) with its cards as leaf children.                                                                                  |
| `context`                                                                                              | Origin, object type and ID, and parent ID, for `cardUrlOnPage` row links.                                                                                                                                              |
| `selectedCardIds`, `onSelectedCardIdsChange`                                                           | Selection keyed by card ID.                                                                                                                                                                                            |
| `isSelectable(card)`, `unselectableReason(card)`                                                       | Mapped to DataList's `isSelectable` and `getUnselectableTooltip`.                                                                                                                                                      |
| `rowStatus: Map<cardId, { status: 'queued' \| 'running' \| 'done' \| 'failed' \| 'skipped', error? }>` | Per-card run state, owned by the view.                                                                                                                                                                                 |
| `statusLabels: { done, failed, running }`                                                              | Verb-specific tooltip text, for example `Deleting...` / `Deleted` / `Failed`.                                                                                                                                          |
| `renderDetail(card)`                                                                                   | Passed to `renderItemDetail`.                                                                                                                                                                                          |
| `chipFor(card)`, `mutedFor(card)`                                                                      | Map to the item's `chip` and `muted` fields.                                                                                                                                                                           |
| `isRunning`                                                                                            | Makes selection read-only and drops `reload` and `refresh` from the header actions (the interim run lock, see below).                                                                                                  |
| DataList pass-through                                                                                  | `banner`, `beta`, `currentContext`, `customHeaderActions`, `feature`, `featureIcon`, `footer`, `headerActions`, `isActive`, `isRefreshing`, `onClose`, `onRefresh`, `onStatusUpdate`, `subject`, `subtext`, `viewType` |

What it does internally:

- **Row IDs.** A row's ID is the card ID in object scope, and `${viewId}:${cardId}` with `originalId = cardId` in grouped scope. It translates between row IDs and card IDs in both directions. On a change, it diffs the new row ID set against the previous one: an added row adds its card, and a removed row removes its card. That way unchecking one instance of a card that appears under two views unselects the card everywhere, instead of the other instance re-adding it.
- **Order.** Each card gets `sortWeight` from `loadIndex`, pinned by card ID in a ref across refreshes, with new cards appended. Renames and post-run reloads therefore never reshuffle rows.
- **Select all.** It builds `selectAll` over the selectable unique card IDs.
- **Badges.** Run status wins over the lock badge:
  - `running` shows a `Spinner`.
  - `done` shows an `AnimatedCheck`.
  - `failed` shows an `AnimatedX` with the tooltip `${statusLabels.failed}: ${error}`.
  - `queued` and `skipped` show no badge (a consumer chip carries skip reasons).
  - With no status, a locked card shows the lock icon with the tooltip `Locked`.
  - Every state's tooltip is distinct, because `arePropsEqualForRow` compares badges by tooltip.
- **Fixed DataList settings.** Leaf rows use `typeId: 'CARD'`, with `itemActions={['copy']}`, `fillHeight`, `selectionMode`, and `showActivityLogAll={false}`.

### No shared card-batch hook

`useCardBatch` is not built. It was meant to own loading, selection, per-row status, and a `runBatch` around `batchWithFallback`, and that shape fits only #8:

- **The executors differ.** #8 writes through all-or-nothing bulk endpoints in serial chunks of 50 with per-item fallback. #9 has no bulk title endpoint (the only `cards/bulk*` routes are delete, duplicate, lock, and pages, VERIFIED-LIVE in #9). Its natural executor is one PUT per card in a pool of 4 with retries, preceded by a fresh re-read that skips changed or deleted cards. A `runBatch` that wraps `batchWithFallback` would force #9 into serial chunks of 1. A hook loose enough for both executors is just a `Map` in `useState`.
- **The selection rules differ.** #8's selectability depends on its Delete / Remove mode and on async decorations. #9's depends on a live preview and on per-row validity, and it carries an undo stack. Neither belongs in a shared hook.
- **Loading is one service call.** Every view already does the `getSidepanelData` type check, `useViewReady`, and `mountedRef` in the same way. Wrapping `getCardsForContext` in a hook would hide the per-view type check and save a few lines.
- **What is actually shared** already has a home. Source resolution lives in `getCardsForContext`. Row IDs, selection mapping, pinned order, and the status badges live in `CardBatchList`. The run machinery lives in `batchWithFallback` and `promisePool`. The 1.6 run lock is a one-line `useRunLock` per view by design.

Each view keeps `selectedCardIds`, a `statusByCardId` Map in the `CardBatchList` vocabulary, `isRunning`, and its own progress count.

### Batch executors

**`batchWithFallback`**, the one signature for #6 and #8. It is 1.2 section 6 plus three options and one result field:

```js
batchWithFallback(items, { canFallBack, chunkSize, onSend, onSettled, profile, sendBatch, sendOne, signal });
// -> Promise<Array<{ error, item, ok, notSent?, partial? }>> in input order
// onSend(items, { phase: 'chunk' | 'single' })                  just before each request
// onSettled(results, { doneCount, phase: 'chunk' | 'single', total })  after each request whose results are final
```

- `sendBatch(chunk)` and `sendOne(item)` are caller closures. #6 re-resolves the tab with `getValidTabForInstance` inside them, as its tab-change handling requires.
- **Chunks run serially.** The default `canFallBack` is a definite 4xx other than 429, which covers #8's one-bad-ID 404 and #6's atomic 400. A 5xx or an exhausted 429 marks the chunk failed without firing single calls.
- **`onSettled` firing rules.** It fires for a chunk that succeeded, for a chunk that failed and will not fall back, and for each single call. It does not fire for a chunk that falls back, because its results are not final yet. `doneCount` counts items with final results.
- **What the callbacks drive:**
  - #8's rows: `onSend` sets `running`, and `onSettled` sets `done` or `failed`.
  - #6's progress, "Saved 50 of 80": `doneCount` of `total`.
  - The 1.3 journal later: `onSend` calls `run.start(keys)`, and `onSettled` calls `run.record()`.
  - This replaces #8's `onProgress({ items, phase, results })`, which had no hook before a request and so could not show a chunk as running or start a journal entry.
- **`signal` is an AbortSignal**, checked before each request. Unsent items come back `{ ok: false, notSent: true, error }`. That covers #6's stop when no Domo tab for the instance is left, and an unmounted view (each view aborts its controller on unmount).
- **`profile`** is passed to `withRetry` once `src/utils/retry.js` exists. Until then each send is called directly.
- **`partial`** stays reserved for the add-plus-remove callers in 1.2's table. #6 and #8 never set it.

| Caller                                                                                | Executor                     | Chunk | Profile                                                                                 |
| ------------------------------------------------------------------------------------- | ---------------------------- | ----- | --------------------------------------------------------------------------------------- |
| #6 Beast Mode save (`updateDatasetFunctions`, falling back to `saveFunctionTemplate`) | `batchWithFallback`          | 50    | `RETRY_SAFE`                                                                            |
| #8 Delete (`deleteCards`)                                                             | `batchWithFallback`          | 50    | none (1.2: deletes are not retried)                                                     |
| #8 Remove from Page (`removeCardsFromPage`)                                           | `batchWithFallback`          | 50    | `RETRY_SAFE` (removing a card that is not on the page returns 200, VERIFIED-LIVE in #8) |
| #9 rename (`renameCard`)                                                              | `promisePool`, concurrency 4 | none  | `RETRY_SAFE` (idempotent title PUT)                                                     |
| #80 card writes                                                                       | `promisePool`, concurrency 3 | none  | `RETRY_REJECTED` (pro-code context POST, per 1.2's table)                               |

**`promisePool`** is built by #9 to 1.2 step 2's signature, `promisePool(tasks, { concurrency = 6, onSettled })`. It returns `PromiseSettledResult[]` in input order, and `onSettled(result, index, doneCount)` drives #9's footer count. Tasks check the view's AbortSignal themselves before sending.

**`withRetry` is built by none of the six.** #9 wraps each task in a small local transient-retry function. It retries 429, 502, 503, and 504 twice, waiting `Retry-After` when present (failing past 60 s, as 1.2 specifies), otherwise 1 s and then 3 s. That makes the later swap to `withRetry(fn, { profile: RETRY_SAFE })` a one-line change. #6 passes `profile` and gets retries for free once 1.2 step 3 lands. #80 keeps "no automatic retry".

**The envelope `retryAfter` field** is pulled forward from 1.2 step 1 into #9's commit B:

- `runInPage` adds `retryAfter: error?.retryAfter`, and `toError` copies it back.
- It is documented next to `status` in `.claude/rules/architecture.md`.
- New page-side throws in #8 and #9 set `e.retryAfter = r.headers.get('Retry-After')`.
- The rest of step 1 (the roughly 44 status-less sites, `updateDatasetFunctions`, `shareContent`) stays with 1.2. #6's planned `status` fix on `updateDatasetFunctions` is the one exception, because `canFallBack` needs it.

### Amendments to `docs/plans/beta-phase-1-2-retries-concurrency.md`

Make these in the commit that lands each piece:

1. **Section 6 signature.** Add `onSend`, `onSettled`, and `signal`, and the `notSent` result field, with the firing rules above.
2. **Section 6 callers table.** Add #6 Replace Columns in Beast Modes, #8 Delete Cards, and #8 Remove from Page, with the chunks and profiles above.
3. **Write classification table.** Add `PUT content/v1/cards/{id}/title` as `RETRY_SAFE` (idempotent, VERIFIED-LIVE in #9) and `DELETE content/v1/cards/bulk/pages` as `RETRY_SAFE` (VERIFIED-LIVE in #8).
4. **Context and Order.** Note that `batchWithFallback` (from #6 or #8), `promisePool` (from #9), and the envelope `retryAfter` field (from #9) may land before steps 1 to 3. They call sends directly until `retry.js` exists. The `ActivityLogTable.jsx` call-site move and the step 2 loop replacements stay with 1.2.
5. **Section 8 tests.** Add `onSend` and `onSettled` order (no `onSettled` for a chunk that falls back), `doneCount`, and abort producing `notSent`.

### Run lock, change journal, and fresh reads

- **Run lock (1.6).** Every new view with a multi-step write adds a row to the "Which views lock" table in `docs/plans/beta-phase-1-6-run-lock.md` in its own commit:

  | View                                   | Flag                                     |
  | -------------------------------------- | ---------------------------------------- |
  | `DeleteCardsView.jsx` (#8)             | `isRunning`                              |
  | `RenameCardsView.jsx` (#9)             | `isRunning` (`run.phase === 'applying'`) |
  | `ReplaceBeastModeColumnsView.jsx` (#6) | scanning, applying, or undoing           |
  | Update Code Engine Versions (#80)      | `isSubmitting`                           |

  #43's Move Page is a single bulk move request, so it falls under 1.6's single-request exception.

  Until 1.6 lands, the interim locks are:
  - `CardBatchList`'s `isRunning` for #8 and #9: read-only selection, with Reload and Refresh removed.
  - `buildReloadAction`'s `unsupportedReason` for #6.

  After a run, #8 closes the view through `onBackToDefault` once no cards are left. Guard that call with `mountedRef` until 1.6's `viewKey`-scoped close lands.

- **Change journal (1.3).** The hook points are uniform:
  - `batchWithFallback`'s `onSend` and `onSettled` (#6, #8).
  - `promisePool`'s `onSettled` (#9, #80).
  - Move Back's single entry (#43).

  The feature keys are `replaceBeastModeColumns`, `deleteCards`, `renameCards`, `updateCodeEngineVersions`, and `movePage`. 1.3 calls journaling non-Beta features a later per-feature decision, so whether these tools journal is a cross-issue question.

- **Fresh reads (1.4 and D2).** #6 and #9 both re-read before writing, and skip changed or already-done items. #8's deletes rewrite nothing, so they need no fresh read. Its post-run refresh, which counts a card that vanished as done, plays the same role for a chunk's 404.

### Permissions and confirmations

- **`canManageCard({ card, userRights })`** in `src/utils/cardHelpers.js` is Domo's own `canManageKpi` rule (bundle, VERIFIED-LIVE in #9): `content.admin || card.isCurrentUserOwner === true || (content.card.edit && !card.locked)`. `isCurrentUserOwner` counts group ownership.
  - #9 uses it for rename editability.
  - #8 uses it for Delete-mode selectability, instead of letting every row through and failing locked non-owned cards per row.
  - Both need `owners` in the card read: stacks `parts` for #8, `hydrateParts` for #9. The server stays authoritative either way.
- **Button gates** for #6, #8, and #9 all recommend `content.card.edit || content.admin`, while Manage Card Locks and Manage Card Owners are `content.admin` only. Which one to use is a cross-issue question.
- **Holds.** `HOLD_DURATION_FULL` and `HOLD_DURATION_SHORT` replace the three duplicated literals: `DEFAULT_HOLD_DURATION` in `HoldToConfirmButton.jsx`, and `FULL_HOLD_DURATION` and `SHORT_HOLD_DURATION` in `DeleteObjectView.jsx`. When each feature holds stays per issue (#8, #9, #43, and #80 each have an open question), since a permanent delete and a reversible rename deserve different answers.

### Other overlaps among the six plans

- **Admin summary endpoints.** #8 (card placements), #9 phase 2 (title search) and #43 (page search, `getChildPages`) all page through `adminsummary`. The plans found:
  - `limit` above 100 returns 400 (#9).
  - It returns 429 under concurrent load (#8, #9).
  - `getChildPages` never paginates (#43).

  Rule for every new loop: page at 100 using the total count, and retry a 429 once, honoring `Retry-After`. Retry inside the injected function, where the header is readable, or extension-side once the envelope field from #9 exists.

- **`src/utils/currentObject.js`.** #8 uses `redirectTabIfViewingObject` and `reloadTabIfViewingObject`, #6 calls `getValidTabForInstance` per chunk, and #10 adds `listOpenDomoInstances()` next to it. These are additive and do not conflict.
- **#10 (Nav Pins)** is otherwise independent. It shares only `HoldToConfirmButton` (and through it the hold constants) and the `findStore()` pattern from `pageVariables.js`.
- **#6's `searchFunctionsPage`** consolidates four copies of the paged Beast Mode search. #8 rejected counting card Beast Modes through that search on cost grounds (about 250 s on a 52-card page), so nothing is shared there.
- **DataList consumers:**
  - #80's design scope uses DataList children (cards with rows nested under them) and needs no new prop.
  - #6's grouped review uses virtual parents, plus `renderItemDetail` for the expandable formulas. Its plan names no mechanism for those formulas today, so this is the one change #6 adopts from this section.
  - Every status badge in any of these views needs a distinct tooltip per state, because of `arePropsEqualForRow`.

### Pre-existing bugs found by the plans

Each of these lands as its own commit with its own release-note check, not under the feature's issue link:

1. **`computeIsOwner` skips `WORKSHEET_VIEW`** (`src/background.js:53`, found by #8). **Done.** Worksheet pages never got `metadata.isOwner`, so `DeleteObject.jsx`'s `isDeleteForbidden` (`!isOwner && !content.admin`) blocked a worksheet's owner without `content.admin` from deleting its pages. A worksheet page has no owner of its own, so the fix reads the parent worksheet's `owners` (from `/content/v1/dataapps/{id}`) rather than the page's stacks `page.isOwner`, and computes ownership after the parent loads. Logged under Bug Fixes (worksheet pages shipped in v1.9.0). The duplicated, unreachable second `TEMPLATE` branch was removed in the same change.
2. **`swapAppColumns` seeds the new context from the wrong level** (`src/services/proCodeApps.js`, shipped in v1.9.0, found by #80). **Done.** It likely reverted a pro-code card's Code Engine and workflow pins to the design's. Rather than reading `context` off the deprecated `GET /domoapps/apps/v2/{instanceId}`, `proCodeApps.js` now uses only `/api/apps/v1/instances/{instanceId}`, which carries all the wiring at the top level under plural names (`datasetsMapping`, `packagesMapping`, `workflowsMapping`, `collectionsMapping`, `accountsMapping`, `actionsMapping`; empty ones come back `null`). VERIFIED-LIVE on instance `80ec5d16-2494-4dc5-85c8-521ade4e15af`: each v1 array is identical to its v2 counterpart (`mapping`, `context.packageMapping`, `context.workflowMapping`, `collections`). The save is a single `PUT /api/apps/v1/instances/{instanceId}` with the full instance as read and `datasetsMapping` swapped, replacing POST context, PUT context, PUT instance. Verified on a temporary instance (created with `POST /api/apps/v1/instances?temporary=true`, then deleted):
   - The PUT is a full replace. A body that omits `packagesMapping` clears it, so sending only the changed mapping would recreate this same bug.
   - A full-body PUT keeps every other mapping and answers `{ instance, cardProperties }`.
   - It edits the instance's current context in place (same context id, new `lastModifiedDate`), so `GET /domoapps/apps/v2/{id}` and Domo's editor see the change. It creates no new context, unlike Domo's card editor, which still uses the v2 three-step save. Domo's own frontend only calls this PUT on temporary preview instances.

   VERIFIED-LIVE end to end on a scratch card (since deleted) bound to dataset `da91386d-779f-4fcc-b841-0b0814a3d8fc` with 2 Code Engine pins and 1 workflow, running the real `getDownstreamApps` and `swapAppColumns` against domo.domo.com:
   - The new code renamed the column with one GET and one PUT. Pins and workflow were unchanged, the context id stayed the same, and the v2 context showed the same wiring.
   - The v1.9.0 code, run the same way, renamed the column but left `packagesMapping` and `workflowsMapping` `null` (the v2 context showed `[]`). This confirms the shipped bug: the card falls back to the design's wiring.

   The `appDb.js` card lookups (`getCollectionsByIds`, `getCollectionConnectedApps`, `resolveAppInstanceCollections`) were compared against `POST /domoapps/apps/v2/card` on ACE Assistant's collections and returned the same owner cards. Logged under Bug Fixes.

3. **`getChildPages` truncates at 100 rows per request** (found by #43; page `942894016` has 107 children). **Done.** Both adminsummary loops (children, and each 10-parent grandchild batch) now page at 100 off `totalPageCount` and retry a 429 once with `Retry-After`. The `getSubpageIds` JSDoc now says direct children only. Logged under Bug Fixes without the #43 link.
4. **`getCardsForParent` turns a failed view into an empty one and then drops it** (found by #9), so Get App Cards silently omits a view it could not read. **Done.** Every read (cards, view details, forms, queues, workflows) now settles on its own, and a view with any failed read stays in `viewGroups` with what did load plus an `error` naming what did not ("Could not load this page's forms, workflows, and queues."). `fetchViewDetails` throws instead of returning null. `cardsOnly` landed with it (without `parts`, which stays with #9), returning `{ cards, error, viewId, viewName }`. Get App Cards marks a failed view with a "Failed to load" chip and the error as its annotation, counts it in the subtext, and shows a retryable error when nothing loaded. Get App Card Pages and Get App Beast Modes moved to `cardsOnly` and warn by toast, naming up to three pages (`describeFailedViews` in `cardHelpers.js`). There is no separate `failedViews` list: #9's `getCardsForContext` derives one from `vg.error`. Logged under Bug Fixes (both scopes shipped in v1.9.0).
5. **Errors that lose information.** **Done**, except `getCardsByIds`. None of these change what a user sees, so none is logged.
   - The envelope drops `Retry-After` (#8, #9, 1.2). **Done.** `runInPage` carries `retryAfter` and `toError` copies it back, documented next to `status` in `.claude/rules/architecture.md`. This is the envelope half of 1.2 step 1 that #9's commit B planned to land, so #9 no longer needs it.
   - `updateDatasetFunctions` throws without `status` (#6, 1.2). **Done.** Its error now carries `status` and `retryAfter`, and so does `getFunctionTemplate`'s. Messages are unchanged.
   - `hydrateFunctionTemplates` drops failed reads silently (#6). **Done.** It returns `{ failures, templates }`, with `failures` a map of id to the read's error (carrying `status`). The seven existing callers destructure `templates` and keep treating a missing template as before. #6's fresh read can now use it, reporting `failures` as "Couldn't read the current formula.".
   - `getCardsByIds` drops unresolved IDs (documented behavior, which #8 and #9 both work around through their missing-card handling). **Left as is.** Absence is the documented contract and its eight callers rely on the array shape; a caller that needs the misses diffs the requested IDs against the result, as #9's `getCardsForContext` does with `missingIds`.
6. **`DataListItem.metadata` is never rendered** (found in this reconciliation). **Deferred to #9 commit A.** It is documented as display text, and two shipped views write status text into it that users never see:
   - `ManageTagsView.jsx` sets "Tags unavailable" on unreadable objects (shipped in v1.5.0).
   - `ManageCardOwnersView.jsx` sets "N owners" or "Owners unavailable" on each card (shipped in v1.6.0). Unreadable cards are muted, so that case is partly signaled.

   The `fromDomoObject` (`ID: 123`) and `createGroup` (`N items`) defaults are never shown either. Once commit A adds `renderItemDetail`, both views pass it to render their status line, and the `DataListItem.metadata` and DataList `props.item.metadata` JSDoc is corrected in the same change. Unlike the rest of commit A this is user-visible, so it gets its own commit and a Bug Fixes note.

## #9: Bulk Rename Cards

### Summary

**Problem.** Domo renames cards one at a time: open the card, open Edit Title, save, then repeat for the next card. This hurts most after Domo's own duplicate flows. Duplicating an App Studio app, a page, or a card adds "Duplicate of " (or "Copy of ", or a localized prefix such as "次の複製：") to every card title, and the cleanup is manual. On domo.domo.com, `POST /api/content/v2/cards/adminsummary` with `cardTitleSearchText: "Duplicate of"` returns `totalCardCount: 8255` (VERIFIED-LIVE). Real example: App Studio view `2095795725` ("Certification", in app `324258972`) has 16 cards, and 15 of them start with "Duplicate of " (VERIFIED-LIVE). Period rollovers ("FY25" to "FY26") and naming-convention fixes across a whole dashboard hit the same wall.

**Who benefits.** Builders who duplicate apps or pages as templates, admins cleaning up after a migration, and anyone doing a rollover or terminology change across a dashboard, app, or dataset's cards.

**Interpretations considered.**

1. Rename the cards on the current page or App Studio page in bulk. This is the core ask. **Planned.**
2. The same for a dataset's cards ("Could also add that ability to datasets"). **Planned.** It is the same view with a different card source, and dataflows (cards on every output) come free from `getCardsForObject`.
3. Rename across a whole App Studio app or worksheet (every view). **Planned**, through the long-press parent scope that Get Cards already has.
4. Rename across many unrelated datasets and pages at once, from the side panel or options page ("across multiple datasets/pages"). **Deferred to phase 2**, as an open question. It is designed below as an instance-wide "find cards by title" source for the same view.
5. Also rewrite card descriptions. **Not planned for v1** (open question). The engine and endpoint already handle descriptions, so this is a small follow-up.
6. Also rewrite chart-level titles (axis titles, legend title). **Out of scope.** They are chart properties (`title_x`, `title_y`, `legend_title_text` in the chart-type options), not card titles, and only a full definition rewrite can change them.
7. Per-row inline title editing. **Not planned for v1** (open question). Domo's Edit Title modal already does single-card edits well.

### Scope check

**Can a user already do this easily in Domo's UI?** No, with one narrow exception.

- The only card-title write in Domo's frontend is per card. The Edit Title modal (bundle chunk `47252-74903fdf9114224c`) calls `dmCardService.updateTitle(urn, { dynamicTitle, dynamicDescription, title, description })`. The legacy `editKpiTitle` (chunk `98736-1b8ed1506751a95a`) sends `{ title }` only. The service (chunk `68072-2892a61ec3c48142`) is `updateTitle: (e, n) => t.put('/api/content/v1/cards/${e}/title', n)`. Analyzer saves the title inside the full card definition. No bulk title route exists in the bundles: the only `cards/bulk*` routes are `bulk` (delete), `bulk/duplicate`, `bulk/lock`, and `bulk/pages` (all VERIFIED-LIVE in the bundles).
- Admin > Content > Cards offers bulk owner, lock, and delete style operations, but no bulk rename.
- **The exception:** Domo's "Import options" dialog (importing a dashboard into an App Studio app with "Duplicate Cards" on) has a "Choose card prefix" input bound to `cardTitlePrefix` (chunk `48425-c2dd82cd37688216`, i18n keys `page/choose-card-prefix` and `page/add-prefix`, VERIFIED-LIVE). So on that one path a user can set the prefix at duplicate time. It only applies before the copy exists, and only on that path. Duplicating an app, a page, or a card still produces "Duplicate of " titles, and nothing in Domo renames existing cards in bulk.
- So the feature batches an operation Domo only offers one at a time, which CLAUDE.md lists as a good sign. The duplicate cleanup is a strong use case but not the only one: rollovers and find and replace across a dashboard stand on their own.

**What is cut because Domo already does it.**

- Single-card rename: Domo's Edit Title modal handles it, so there is no Rename button on a `CARD` context. Per-row inline editing is also left out of v1 for this reason (open question).
- Chart axis and legend titles: these are not card titles and need a definition rewrite.

**What already exists in this codebase that overlaps.**

- `src/services/cards.js`:
  - `getCardsForObject` (page, App Studio view, worksheet view, Report Builder page, dataset, dataflow, Beast Mode). Its `DATAFLOW_TYPE` branch already pools the outputs and dedupes by card ID (VERIFIED-CODE).
  - `getCardsForParent` (every view of an App Studio app or worksheet). It also fetches forms, queues, and workflows unless `cardsOnly` is set, and keeps a failed view with an `error`.
  - `getCardsByIds` (batched hydrate with `parts`, which silently drops IDs that do not resolve).
  - `setCardsLocked` / `updateCardOwners` (the batched bulk-write and partial-failure pattern).
  - No title write exists today (VERIFIED-CODE).
- `src/components/views/ManageCardLocksView.jsx` and `ManageCardOwnersView.jsx`: the closest pattern, a selection-mode `DataList` over a context's cards, with select-all, disabled rows with tooltips, a banner, and a footer action.
- `src/components/views/GetCardsView.jsx`: parent-scope grouping into DataListItems (`transformParentScopeItems`), the page-scoped card URL rule (`transformCardsToItems`), and a per-output dataflow loop kept for its grouped display (`fetchCardsForOutputDatasets`). `src/components/buttons/GetCards.jsx` has the long-press "Get App Cards" / "Get Worksheet Cards" menu.
- `src/components/views/DataList.jsx`: selection, `selectAll`, `isSelectable`, `getUnselectableTooltip`, `getItemBadge`, per-item `chip`, `banner`, `footer`, `sortWeight`, and virtualization (rows are measured, so taller rows work). It has **no** per-row secondary line, which the before/after diff needs. `item.metadata` is documented on `DataListItem` but never rendered, and `annotation` is hover-only.
- `src/models/DataListItem.js`: `originalId` for namespaced row IDs, and `status` / `error` / `errorDetail`. DataList only renders the error body for virtual parents (`isErrorState = item.isVirtualParent && ...`, `DataList.jsx:1006`), so leaf-row errors go through `getItemBadge`.
- `src/activityLog/ActivityLogTable.jsx:1846` has a local `promisePool(taskFns, concurrency)`. `docs/plans/beta-phase-1-2-retries-concurrency.md` step 2 specifies the shared one.
- #8 (Bulk Select Delete Cards on Dashboard) is built on the same card loader, card list, and DataList prop. This issue builds them first (see Shared infrastructure across issues).

### API and platform findings

**1. Rename a card: `PUT /api/content/v1/cards/{cardId}/title`.** VERIFIED-LIVE on scratch cards. It is not in the OpenAPI spec. It is the call behind Domo's Edit Title modal.

The body accepts `title`, `dynamicTitle`, `description`, and `dynamicDescription`. `dynamicTitle` and `dynamicDescription` are sent as **objects**, while `metadata` stores them as JSON strings. The response is `200` with an empty body.

How the server treats each field (all VERIFIED-LIVE on scratch cards `2066953017` and `1586037476`):

| Sent                                                           | Stored                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{ title }` only, on a card with dynamic text                  | Title updated. **`metadata.dynamicTitle` and `metadata.dynamicDescription` are both deleted**: the date-range pill is lost and `displayOnCardDetails` reverts to its default. A static `description` with no dynamic description is kept.               |
| `{ title, dynamicTitle }`                                      | **`title` is ignored and re-derived** from `dynamicTitle` (TEXT parts joined, pills contributing nothing, then trimmed). A static `description` is kept, but an existing `dynamicDescription` is deleted.                                               |
| `{ ..., description, dynamicDescription }`                     | **`description` is ignored and re-derived** from `dynamicDescription`. Sending static `description: "probe static desc"` with `dynamicDescription: { text: [] }` stored no description. Sending a mismatched static description stored the dynamic one. |
| `title` with outer and inner extra spaces, with `dynamicTitle` | Outer spaces trimmed, inner runs kept (`"  probe9   spaced   title  "` stored as `"probe9   spaced   title"`).                                                                                                                                          |
| `title` with extra spaces, title only                          | Stored exactly as sent, untrimmed.                                                                                                                                                                                                                      |
| `dynamicTitle` with 51 segments                                | Accepted with `200`, but **silently truncated to 50 segments** (the trailing pill was dropped).                                                                                                                                                         |
| `title: ""`                                                    | Accepted. Server stores the title `"Title"`.                                                                                                                                                                                                            |
| 1,026-character title                                          | Accepted. Server truncates `title` to 255 characters but keeps the full `dynamicTitle` text.                                                                                                                                                            |
| Locked card, caller is owner                                   | Accepted.                                                                                                                                                                                                                                               |
| Locked card, caller is a content admin but not an owner        | Accepted.                                                                                                                                                                                                                                               |
| Card deleted before the PUT                                    | `404`.                                                                                                                                                                                                                                                  |
| Notebook (`type: "Text"`) card `1501266072`, `{ title }`       | Works.                                                                                                                                                                                                                                                  |

Domo's own client limits match: the modal enables Save only when `convertToStaticText(title).trim().length > 0` and `text.length <= 50` for both title and description (chunk `47252-74903fdf9114224c`, VERIFIED-LIVE).

`convertToStaticText` (chunk `48800-8cba4f7ec4bc66c6`, VERIFIED-LIVE):

```js
static convertToStaticText(e){return(e?.text||[]).reduce((e,t)=>{let a="";return"text"in t?a=(t.prefix||"")+t.text+(t.suffix||""):"defaultText"in t&&(a=t.defaultText),e+a},"")}
```

So a segment with a `text` key contributes `prefix + text + suffix`, and a pill with `defaultText` (FILTER and VARIABLE_VALUE pills can carry one) contributes that `defaultText`. The draft's claim that pills never add to the static title was wrong for those pills, and the server's own derivation matched this function in every probe.

How Domo's modal seeds the fields when a card has none (chunk `48800-8cba4f7ec4bc66c6`, VERIFIED-LIVE): `getDynamicTitle()` returns the parsed `dynamicTitle` when its `text` is non-empty, else `{ text: [{ type: 'TEXT', text: title }] }`. `getDynamicDescription()` returns the parsed `dynamicDescription` when present, else `{ text: [{ type: 'TEXT', text: description }] }` or `{ text: [] }`. The modal therefore always sends all four fields, which creates dynamic fields on cards that had none. This plan does not copy that, because it would add a `dynamicDescription` to every plain card it touches.

**Payload rule this sets** (settled by the probes above). The service reads the card fresh, then:

| Fresh card has                                        | Send                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No `dynamicTitle` and no `dynamicDescription`         | `{ title }`, with `title` already trimmed client-side (the server does not trim on this path).                                                                                                                                                                                                                                                                                                                                    |
| `dynamicTitle`, no `dynamicDescription`               | `{ title, dynamicTitle }`.                                                                                                                                                                                                                                                                                                                                                                                                        |
| `dynamicDescription` (with or without `dynamicTitle`) | `{ title, dynamicTitle, description, dynamicDescription }`. `dynamicTitle` is the edited one, or is synthesized as `{ text: [{ type: 'TEXT', text: newTitle }] }` when the card had none (as Domo's `getDynamicTitle` does). `dynamicDescription` is the parsed stored object echoed back byte for byte, `displayOnCardDetails` included or absent exactly as stored. `description` is `convertToStaticText(dynamicDescription)`. |

In every case `title = convertToStaticText(dynamicTitle).trim()` when a `dynamicTitle` is sent, which is what the server stores anyway.

**How often each shape occurs** (VERIFIED-LIVE survey of 595 cards from adminsummary pages and title searches, hydrated with `parts=metadata`):

| Static description | `dynamicDescription`                                                                   | `dynamicTitle` | Cards |
| ------------------ | -------------------------------------------------------------------------------------- | -------------- | ----- |
| none               | present, empty text                                                                    | present        | 260   |
| none               | absent                                                                                 | absent         | 122   |
| present            | absent                                                                                 | absent         | 90    |
| present            | present, with text                                                                     | present        | 69    |
| none               | present, with text (for example `{"text":[{"text":"","type":"TEXT"}]}` on `102709301`) | present        | 27    |
| none               | absent                                                                                 | present        | 27    |

No card had a static description alongside an empty `dynamicDescription`. That fits the server behavior above, since the server derives `description` from `dynamicDescription` whenever both are sent. So the critique's worry about wiping a static description in that state does not arise for cards saved through Domo. The rule still handles it: such a card has a `dynamicDescription`, so it is echoed back unchanged and the server keeps what it already derives. `description` may be absent (no key), `""` (card `1930279349`), or text. `dynamicDescription` may lack `displayOnCardDetails` (card `1612304386`). The builder never assumes any of those keys exist.

Other side effects (VERIFIED-LIVE in the draft stage): `badgeUpdated` and the definition's `modified` move. No card version is created. The audit log records the rename (`GET /api/audit/v1/user-audits?objectType=CARD&objectId=2066953017`):

```
actionType: UPDATED, additionalComment: "Bryce Cindrich updated card domo-toolkit-probe-9-kpi Renamed C. domo-toolkit-probe-9-kpi Renamed C previous display name domo-toolkit-probe-9-kpi Renamed B."
```

**Permissions.** The authority names come from dataset `073c76f1-c846-48fd-876c-34d98d89a07b` (VERIFIED-LIVE): `content.card.edit` ("Create, edit and delete Cards, Drill views, and Beast Modes to which you have access") and `content.admin`. Domo's client rule (chunk `48800-8cba4f7ec4bc66c6`, VERIFIED-LIVE):

```js
canManageKpi(){var e=this.locked(),t=E.default.on("content.card.edit"),a=this.isCurrentUserOwner()||E.default.isContentAdmin;return t&&!e||a}
```

`isCurrentUserOwner` **counts group ownership** (VERIFIED-LIVE). On a scratch card owned only by scratch group `163222655`, it was `true` while the token user was a member and `false` after the user left the group. It is also `false` for a content admin who is not an owner, so it is pure ownership. It is only present when `owners` is in `parts`.

**2. Hydrate cards: `GET /api/content/v1/cards?urns=...&parts=metadata,owners&includeFiltered=true`.** VERIFIED-CODE as `getCardsByIds`. Fields VERIFIED-LIVE. `description` comes back with `parts=metadata` only when the card has one, and the key is absent otherwise.

```json
{
  "id": 1011747248,
  "type": "kpi",
  "title": "Duplicate of Issued Credly Badges",
  "locked": false,
  "isCurrentUserOwner": false,
  "owners": [],
  "metadata": {
    "dynamicTitle": "{\"text\":[{\"text\":\"Duplicate of \",\"type\":\"TEXT\"},{\"text\":\"Issued Credly Badges \",\"type\":\"TEXT\"},{\"type\":\"DATE_RANGE_FILTER_DATE_TIME_RANGE\"},{\"text\":\" \",\"type\":\"TEXT\"}]}",
    "dynamicDescription": "{\"text\":[],\"displayOnCardDetails\":true}"
  }
}
```

Card `1011747248` really has `owners: []`. Ownerless cards exist, and for them only the rights check applies.

**3. Card sources.** All are VERIFIED-CODE in `getCardsForObject` / `getCardsForParent`, and their shapes are VERIFIED-LIVE.

- `GET /api/content/v3/stacks/{id}/cards`: `cards[]` with `title`, `locked`, `metadata.dynamicTitle`. View `2095795725` returned 16 cards.
- `GET /api/content/v1/datasources/{id}/cards`: only `id, urn, type, chartType, title, ownerId, owners, access, datasourceId`. It has **no `metadata` and no `locked`**, so every source is re-hydrated through call 2.
- `GET /api/content/v1/dataapps/{id}` lists the views of an App Studio app or worksheet. `getCardsForParent` then calls `fetchViewDetails` plus the forms, queues, and workflows lookups for every view (skipped with `cardsOnly`), and it keeps a failed view with an `error`.

**4. Pill types.** Domo's insert menu (chunk `47252-74903fdf9114224c`, VERIFIED-LIVE) offers `DATE_RANGE_FILTER_DATE_TIME_RANGE`, `DATE_RANGE_FILTER_PERIODS`, `DATE_RANGE_FILTER_COLUMN`, `DATE_GRAIN`, `FILTER`, `DATA_SOURCE_NAME`, `DATA_SOURCE_OWNER`, `DATA_SOURCE_DATA_LAST_UPDATED` (these three carry `dataSourceId`), `SEGMENT_NAME`, `SEGMENT_DESCRIPTION`, and `VARIABLE_VALUE` (carries `variables`). Pills can also carry `prefix`, `suffix`, and `defaultText`. In a draft-stage survey of 1,326 real cards (VERIFIED-LIVE), 948 had a `dynamicTitle` and 85 of those had pills (`DATE_RANGE_FILTER_DATE_TIME_RANGE` 85, `FILTER` 4, `DATE_GRAIN` 3, `DATE_RANGE_FILTER_PERIODS` 2). Pills are therefore stored and restored as **whole opaque objects**, never rebuilt from `type`.

**5. Document cards.** The displayed title is the card `title`. `metadata.title` holds the file name and already differs from the title on 9 real cards (for example `1023751247`: title `"次の複製：Reseller partner survey.pptx"`, `metadata.title` `"Reseller partner survey.pptx"`, VERIFIED-LIVE). So `/title` is the right call for them too (INFERRED). The spec's `PUT /content/v1/cards/{id}` with `{ metadata: { title } }` is not used (SPEC-ONLY).

**6. Drill views are left alone.** Across 174 sampled root cards with drill paths, duplicated roots carry the "次の複製：" prefix while their drill views keep the original title (for example `1057834066`, VERIFIED-LIVE). The card sources return root cards only.

**7. Certification.** Analyzer expires certification on the client: on save, if the card is `CERTIFIED` it opens the "You've edited a certified Card" modal (i18n `badges/youve-edited-a-certified-card`) and calls `setCertificationState("EXPIRED")` on the definition it saves (chunk `3666-8d3fa44fd8aaf2b7`, VERIFIED-LIVE). The draft's quoted "expires the certification" string does not exist, and that claim is dropped. The Edit Title modal sends no certification field, so a title PUT most likely leaves certification alone (INFERRED). Probing it would need a certification process, which a scratch run cannot set up safely, so it becomes a live verification step.

**8. Phase 2 only: `POST /api/content/v2/cards/adminsummary?limit=&skip=`.** Body `{ cardTitleSearchText, includeCardTitleClause: true, ascending, orderBy: "cardTitle" }` (VERIFIED-LIVE). It returns `cardAdminSummaries[] { id, type, title, locked, owners[], pageHierarchy[], badgeUpdated, active }` and `totalCardCount`. **`limit` above 100 returns 400** (VERIFIED-LIVE: 100 works, 200 fails), and the endpoint 429s under concurrent load. Content admin is required (INFERRED from the endpoint family).

### Design

**Where it lives.** A side panel view, `RenameCardsView`, launched from a new `Rename Cards` action button in the shared `ActionButtons` grid. That grid works from both the popup and the side panel through `useLaunchView`. On an App Studio view or worksheet view, a long-press menu offers "Rename App Cards" or "Rename Worksheet Cards", which switch to parent scope, as Get Cards does. It is a separate view from #8's delete flow. Whether bulk card actions should instead be one view with modes is a cross-issue question, and this plan is written for separate views on a shared list.

**Contexts that enable it.** `getAvailableActions()` gets its own `renameCards` block for every dataset type (`isDatasetTypeId`), `DATA_APP_VIEW`, `DATAFLOW_TYPE`, `PAGE`, `REPORT_BUILDER_PAGE`, and `WORKSHEET_VIEW`, but only when `USER_RIGHTS` includes `content.card.edit` or `content.admin`. `BEAST_MODE_FORMULA` is excluded. The context set and the gate are both cross-issue questions shared with #8. Users who own cards but lack both rights do not get the button. Domo's role defaults rarely produce such users, and showing the button to every viewer would mostly produce lists of disabled rows.

**Per-row editability** uses the shared `canManageCard({ card, userRights })` in `src/utils/cardHelpers.js`, a port of `canManageKpi`, so it agrees with the button gate (and with #8's Delete-mode selectability):

```js
export function canManageCard({ card, userRights }) {
  return (
    userRights.includes('content.admin') ||
    card.isCurrentUserOwner === true ||
    (userRights.includes('content.card.edit') && !card.locked)
  );
}
```

Group owners are covered, because `isCurrentUserOwner` includes group membership (VERIFIED-LIVE).

**Data flow.**

1. The button calls `launch({ currentContext, onStatusUpdate, type: 'renameCards', scope?, parentId? })`, which writes sidepanel session storage like the other views.
2. The view reads `getSidepanelData(instance)`, then calls the shared loader `getCardsForContext({ context, hydrateParts: 'metadata,owners', parentId, scope, tabId })` in `src/services/cards.js` (full contract in Shared infrastructure across issues):
   - **Object scope** uses `getCardsForObject` with the context's metadata. Its existing `DATAFLOW_TYPE` branch already pools the outputs and dedupes by card ID, so nothing is lifted from `GetCardsView`.
   - **Parent scope** uses `getCardsForParent({ cardsOnly: true, parentId })`. The `cardsOnly` option skips `fetchViewDetails` and the forms, queues, and workflows lookups, and reports per-view card errors.
   - **Hydrate:** every card ID goes through one `getCardsByIds({ cardIds, parts: 'metadata,owners' })` call, merged onto the source card.
   - The loader returns `{ cards, failedViews, groups, missingIds, parentName }`. Cards have string IDs and a `loadIndex`. `missingIds` lists source IDs the hydrate did not return.
3. **Rows come from the shared `CardBatchList`.**
   - It owns the row IDs (`${viewId}:${cardId}` with `originalId = cardId` in parent scope, the card ID otherwise) and maps the selection to card IDs, so every instance of a card toggles together.
   - It pins `sortWeight` from `loadIndex` by card ID across reloads, so DataList's label sort does not reshuffle rows when titles change.
   - The view derives per-card data keyed by card ID: editability from `canManageCard`, and the parsed editable title from `toEditable`.
4. **Preview** is pure and runs extension-side. It is recomputed (debounced 150 ms) whenever the transform or the selection changes. No requests are made.
5. **Apply:**
   1. Dedupe the selected rows to unique card IDs. (The selection is already keyed by card ID.)
   2. Re-read those cards with one `getCardsByIds` call. A card missing from the result is skipped as "No longer exists". A card whose `title` or raw `metadata.dynamicTitle` string differs from the snapshot is skipped as "Changed in Domo".
   3. Rebuild each payload from the fresh card with `buildTitlePayload`, so a description edited in Domo since the load is never overwritten.
   4. Run the shared `promisePool` (`src/utils/promisePool.js`, built here to beta 1.2 step 2's signature `promisePool(tasks, { concurrency, onSettled })`) at concurrency 4. Each task first checks the view's AbortSignal, then marks its row `running` and makes one `renameCard()` call (one `executeInPage`), so rows update live. `onSettled` drives the footer count.
   5. A small local transient-retry wrapper retries 429, 502, 503, or 504 up to twice. It waits `Retry-After` when the error carries one, and fails the row naming the wait past 60 s, as 1.2 specifies. Otherwise it waits a fixed 1 s, then 3 s. The PUT is idempotent, which matches the `RETRY_SAFE` class in `docs/plans/beta-phase-1-2-retries-concurrency.md`. `Retry-After` reaches the extension because this issue lands the envelope half of 1.2 step 1: `retryAfter` in the `executeInPage` error envelope (`src/utils/executeInPage.js:227-240`). Once 1.2 step 3 lands, the wrapper becomes `withRetry(fn, { profile: RETRY_SAFE })`.
   6. Any other failure is recorded on the row, with `error.status`, and the run continues.
   7. After the run, reload the rows from Domo through the same loader. `CardBatchList` keeps each card's pinned order.
6. **Undo** is a stack of passes held in view state: `undoStack = [{ passId, entries: [{ cardId, before: { title, dynamicTitle }, after: { title, dynamicTitle } }] }]`. "Undo Rename" pops the latest pass, re-reads those cards, skips any whose current title no longer equals `after.title` ("Changed in Domo"), and rebuilds each payload from the fresh card plus the stored `before` title text. The fresh card's `dynamicDescription` is echoed back unchanged. It uses the same pool and retry.
7. **Run safety while applying.** The view passes `isRunning` to `CardBatchList`, which makes the selection read-only and drops Reload and Refresh from the header. The view also disables the transform panel until the run settles. The view's close button and closing the side panel cannot be blocked today: requests already in flight finish, the abort keeps the rest from starting, and `mountedRef` drops state updates. When `docs/plans/beta-phase-1-6-run-lock.md` lands, the view calls `useRunLock(isRunning, 'Rename Cards')`, and this issue adds `RenameCardsView.jsx` / `isRunning` to that plan's "Which views lock" table. When `docs/plans/beta-phase-1-3-change-journal.md` lands, and if the cross-issue journal question says yes, each pass also records a journal run (one entry per card, with `before` and `after`) from the pool's `onSettled`, so a rename can be reverted from Recent Runs after the view is gone. Until then the banner says undo lasts only as long as the view.

**New service functions** (`src/services/cards.js`, alphabetical per `sort-modules`):

```js
export async function getCardsForContext({ context, hydrateParts = null, parentId = null, parts = null, scope = 'object', tabId = null })
// Between getCardsByIds and getCardsForObject. Returns { cards, failedViews, groups, missingIds, parentName }.
// Shared with #8, which calls it with stacks parts and no hydrate.

export async function renameCard({ cardId, payload, tabId = null })
// After getPageCards (and after #8's removeCardsFromPage once it exists), before setCardsLocked.
// executeInPage: PUT /api/content/v1/cards/${cardId}/title with JSON payload.
// Inside the injected function: on !response.ok, build an Error whose message includes the response text,
// set error.status = response.status and error.retryAfter = response.headers.get('Retry-After'), and throw.
// Returns undefined on success.
```

`getCardsForParent` gains `parts = null`. Its existing `cardsOnly` (pre-existing bug 4) already returns each view group as `{ cards, error, viewId, viewName }` and fetches nothing else.

**New pure module** `src/utils/cardTitles.js`. It has no imports, so a throwaway node script can exercise it.

- `parseDynamicText(jsonString)` returns the parsed object or null. A `dynamicTitle` whose `text` is empty counts as null. A `dynamicDescription` is kept even when empty, because it is present for the payload rule.
- `convertToStaticText(dynamicText)` is an exact port of Domo's function above.
- `isEditableSegment(seg)` is true when `seg.type === 'TEXT'` and the segment has no `prefix` and no `suffix`. Every other segment is an opaque pill.
- `toEditable(card)` returns `{ lead, display, trail, pills, segmentsBefore }`. `display` joins editable TEXT segments and puts a sentinel from the Unicode private-use range (U+E000 + pill index) in place of each pill. `lead` and `trail` are the outer whitespace, split off so that `^` and `$` patterns match what the user sees (`" (Q4) ACV..."` matches `^\(Q4\)`). A card without a dynamic title uses `display = title`. If the title already contains a private-use character, the row is marked unsafe.
- `fromEditable({ lead, display, trail, pills })` splits on the sentinels, re-attaches `lead` and `trail`, merges adjacent TEXT runs, drops empty TEXT runs, and returns `{ dynamicTitle, title }`, with `title = convertToStaticText(dynamicTitle).trim()`.
- `compileFind(transform)` returns `{ regex }` or `{ error }`. Literal mode escapes the find text and uses a function replacer, so `$1` stays literal.
- `applyTransform(display, transform)` handles the modes `replace` (literal or regex, match case, all matches), `prefix`, and `suffix` (each with `skipIfPresent`).
- `validateResult({ before, after, pills, segmentCount })` returns one of `ok`, `unchanged`, `empty` (trimmed static text is empty), `tooLong` (static title over 255), `tooManyParts` (over 50 segments, which the server would silently cut), `removesDynamicText` (a sentinel is missing, duplicated, or reordered), or `unsafe`.
- `buildTitlePayload(freshCard, nextEditable)` implements the payload rule table above.
- `diffSpans(before, after)` does a common prefix and suffix diff for highlighting, sentinel-aware, so a conflicting pill is marked in place.
- `pillLabel(seg)` returns `Date Range`, `Comparison Period`, `Date Column`, `Date Grain`, `Filter`, `DataSet Name`, `DataSet Owner`, `DataSet Last Updated`, `Segment Name`, `Segment Description`, `Variable`, or `Dynamic Text` as the fallback.
- Constants: `MAX_CARD_TITLE_LENGTH = 255`, `MAX_DYNAMIC_TEXT_SEGMENTS = 50`, `DUPLICATE_PREFIX_PATTERN = '^(?:(?:Duplicate|Copy) of )+'`.

**State shape** (in the view):

```js
cards: Array<Card>                    // from getCardsForContext: string id, loadIndex, title, locked, isCurrentUserOwner, metadata
groups: Array<{ cardIds, viewId, viewName }>                        // parent scope only; CardBatchList builds the rows
editableById: Map<cardId, { editable, uneditableReason }>           // derived from cards and USER_RIGHTS via canManageCard
parsedById: Map<cardId, { lead, display, trail, pills, rawDynamicTitle, dynamicDescription }>   // derived once per load
selectedCardIds: Set<string>          // keyed by card ID, so every instance of a card toggles together
transform: { find, matchCase, mode: 'prefix' | 'replace' | 'suffix', prefix, replace, skipIfPresent, suffix, useRegex }
preview: Map<cardId, { next, nextEditable, validity }>   // derived, memoized
run: { phase: 'idle' | 'applying' | 'done', statusByCardId: Map<cardId, { error, reason, status: 'queued' | 'running' | 'done' | 'failed' | 'skipped' }> }
undoStack: Array<{ passId, entries }>
loadIssues: { failedViews, missingIds }
```

`statusByCardId` uses `CardBatchList`'s status vocabulary. `CardBatchList` renders the badges (spinner, check, or X with `Failed: {message}`). The view's `chipFor` renders the `skipped` reasons and invalid states as chips.

**Shared with #8.** This issue builds the shared card pieces first, and #8 adopts them. The full contract is in Shared infrastructure across issues.

1. **`getCardsForContext`**, plus `cardsOnly` and `parts` on `getCardsForParent` (above).
2. **`cardUrlOnPage({ cardId, objectId, objectType, origin, parentId })`** and **`canManageCard`** in `src/utils/cardHelpers.js`. `cardUrlOnPage` is lifted from `GetCardsView.transformCardsToItems`, which uses it from then on.
3. **One new DataList prop, `renderItemDetail: (item) => ReactNode | null`.**
   - It renders a secondary block under the label of a leaf row at any depth, outside the disclosure trigger and any pressable element.
   - It is threaded through `childRenderProps`, compared by function identity in `arePropsEqualForRow`, and paired with a taller virtualizer `estimateSize`.
   - It is documented in the DataList JSDoc block, and the never-rendered `DataListItem.metadata` doc is fixed at the same time.
   - #9 uses it for the before/after diff, #8 for its placements and alerts line, and #6 for its expandable formulas. Row labels stay plain strings, because `sortItemsByLabel` calls `.toString()` on them.
4. **`CardBatchList`** (`src/components/views/CardBatchList.jsx`): the one selectable card list wrapper. It handles row IDs, card-ID selection mapping (diffing row sets so unchecking one instance unselects the card), pinned order, group virtual parents, select-all, status and lock badges, and the `isRunning` interim lock.
5. **`promisePool`** (1.2 step 2 signature) and the envelope `retryAfter` field, in their own commit, recorded in the 1.2 plan. #80 adopts `promisePool`.

#9 does not use `batchWithFallback`. There is no bulk title endpoint, so a per-card pool is the right executor. There is also no shared hook: #9's selection depends on the live preview, and its run includes a fresh re-read and an undo stack, so a hook built around #8's bulk chunks would not fit.

Everything else #9 needs already exists in DataList: controlled selection with `selectAll`, `isSelectable`, `getUnselectableTooltip`, `getItemBadge` for per-row status, item `chip` for row states, `banner`, `footer`, `sortWeight`, and virtualization. "Only show cards that change" filters the `cards` passed to `CardBatchList`, so no filter prop is needed. If the maintainer opts into inline editing (open question), `renderItemDetail` already sits outside the row's press handling, so it can host an interactive `Input`.

Find and replace, prefix and suffix, and the diff stay in #9's `TitleTransformPanel`, `TitleDiff`, and `cardTitles.js`. #8 has no use for them.

**Feature switches.** None. The `dynamic-text` switch only changes how Domo renders and edits titles, and the payload rule is correct with it on or off.

### UX

**Entry point.** The action button is `Rename Cards`, with icon `@icons/datatype-text.svg` (currently unused, VERIFIED-CODE). `pencil.svg` is already used by Update Details and Update Owner, and both would sit in the same grid on a dataflow. Tooltip: "Rename cards on this object in bulk. Titles change everywhere the cards appear." On an App Studio view or worksheet view the tooltip adds the italic line "Hold for more options", and long-press offers "Rename App Cards" or "Rename Worksheet Cards". The copy is the same in the popup and the side panel: from the popup, `useLaunchView` opens the side panel on this view.

**Flow.**

1. Open: a spinner, then the view titled `Rename Cards for <object name>`. Every editable card is selected, and the mode is Replace with an empty Find field.
2. Type in Find (and optionally Replace), or switch to Add Prefix or Add Suffix. Each row shows its current title and, under it, the new title with the changed span highlighted.
3. Optionally uncheck rows, or turn on "Only show cards that change".
4. Press `Rename N Cards`. Rows tick over live, and the footer counts progress.
5. When done, a toast with an Undo action appears. The view stays open on the fresh titles, so another pass is possible, and the footer offers `Undo Rename`.

**Key screen (side panel), object scope:**

```
+------------------------------------------------+
| [Aa] Rename Cards for                          |
|      [app] Certification            (R) (x)    |
|      **15** of **16** cards will change        |
+------------------------------------------------+
| ( Replace | Add Prefix | Add Suffix )          |
| Find     [Duplicate of             ] [.*] [Aa] |
| Replace  [                         ]           |
| (Remove "Duplicate of" / "Copy of")            |
| (i) Titles change everywhere these cards       |
|     appear. Undo lasts until you leave this    |
|     view.                                      |
| [x] Only show cards that change                |
| [-] Select all (15 / 16)                       |
+------------------------------------------------+
| [x] Duplicate of All Certifications            |
|     All Certifications                         |
| [x] Duplicate of Issued Credly Badges [Date Ra.|
|     Issued Credly Badges [Date Range]          |
| [ ] Domo Certifications           (No Change)  |
| [~] Duplicate of Badge Acceptance Rate  (lock) |
+------------------------------------------------+
| [            Rename 15 Cards             ]     |
+------------------------------------------------+
```

The current title (the row label) renders as usual. The detail line, through `renderItemDetail`, renders the new title, with inserted text in an accent tint and removed text struck through in a muted tint. Pills render as small inline chips labeled by `pillLabel` (with the pill's `defaultText` in the chip tooltip when it has one), in place in both lines. When a regex would swallow a pill, the detail line shows the pill chip with a danger outline at its position.

**Parent scope** groups rows by view (virtual parents labeled with the view name, with group-level select). The subtext reads "**42** of **118** cards will change across **9** pages". The footer reads `Rename 42 Cards on 9 Pages`, so the size of the run is visible on the button.

**Applying and results:**

```
| [*] Duplicate of All Certifications    (spin)  |
| [v] All Certifications                 (check) |
| [!] Duplicate of Certifications        (X)     |
+------------------------------------------------+
| [         Renaming 6 of 15...          ]       |    while running
| [ Retry 1 Failed ] [ Undo Rename ]             |    after a partial failure
| [            Undo Rename             ]         |    after a clean run
```

**States and copy.** Toasts use `showStatus(title, description, status, timeout, { actionProps })` directly, because `showPromiseStatus` has no `actionProps` and always uses the 3 s success timeout (`src/hooks/useStatusBar.jsx`, VERIFIED-CODE). Toast descriptions end with a period per code-style.md.

| State                                    | Behavior and copy                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading                                  | Centered `Spinner`, as in Manage Card Locks.                                                                                                                                                                                                                                                                                                                                                                                                |
| Empty                                    | Subtext "No cards found on this object." The footer button is disabled.                                                                                                                                                                                                                                                                                                                                                                     |
| Nothing entered                          | Subtext "**16** cards. Enter text to find, or add a prefix or suffix."                                                                                                                                                                                                                                                                                                                                                                      |
| Preview                                  | Subtext "**15** of **16** cards will change". Footer "Rename 15 Cards" (singular "Rename 1 Card").                                                                                                                                                                                                                                                                                                                                          |
| No matches                               | Subtext "No titles match." The footer is disabled.                                                                                                                                                                                                                                                                                                                                                                                          |
| Invalid regex                            | Inline error under Find: "Invalid regular expression: {message}". Previews are cleared.                                                                                                                                                                                                                                                                                                                                                     |
| Some views failed to load (parent scope) | Warning `Alert` in the banner: "**2** pages couldn't be loaded, so their cards aren't listed." Hovering the count lists the page names and errors.                                                                                                                                                                                                                                                                                          |
| Some cards failed to hydrate             | Warning `Alert`: "**3** cards couldn't be read and aren't listed."                                                                                                                                                                                                                                                                                                                                                                          |
| Row can't be renamed (locked)            | Disabled checkbox with the tooltip "This card is locked. Only its owners and content admins can rename it."                                                                                                                                                                                                                                                                                                                                 |
| Row can't be renamed (rights)            | Tooltip "You don't have permission to edit this card."                                                                                                                                                                                                                                                                                                                                                                                      |
| Row result invalid                       | Unselectable row with a chip and tooltip: "Empty Title" ("Domo would save this card as \"Title\"."), "Over 255 Characters" ("Domo would cut this title at 255 characters."), "Too Many Parts" ("Domo allows at most 50 text and dynamic parts in a title."), "Removes Dynamic Text" ("This change would delete or move the title's dynamic text."), or "Can't Edit Safely" ("This title contains characters Rename Cards can't preserve."). |
| No change                                | Row chip "No Change", unselected.                                                                                                                                                                                                                                                                                                                                                                                                           |
| Add Prefix / Add Suffix                  | Input placeholders "Text to add before each title" / "Text to add after each title". Checkbox "Skip cards that already start with it" / "Skip cards that already end with it" (on by default).                                                                                                                                                                                                                                              |
| Applying                                 | Footer "Renaming 6 of 15..." (disabled). Transform panel, selection, Reload, and Refresh are disabled. No loading toast.                                                                                                                                                                                                                                                                                                                    |
| Success                                  | Toast title "Cards Renamed", description "Renamed **15** cards.", `success`, 15000 ms, with an `Undo` action. Rows reload from Domo and the transform resets. Footer "Undo Rename".                                                                                                                                                                                                                                                         |
| Partial failure                          | Toast title "Rename Partially Failed", description "Renamed **12** cards. **3** failed.", `warning`, 15000 ms, with an `Undo` action. Failed rows get an X badge whose tooltip shows "Failed: {message}". Footer "Retry 3 Failed" plus "Undo Rename".                                                                                                                                                                                       |
| Skipped                                  | Row chip "Changed in Domo" (tooltip "This title changed after the list loaded, so it was skipped. Refresh to try again.") or "No Longer Exists" (tooltip "This card was deleted after the list loaded."). Skipped rows count toward neither renamed nor failed, and the toast description appends " **1** skipped."                                                                                                                         |
| Full failure                             | Toast title "Rename Failed", description "Failed to rename cards: {message}.", `danger`. The view stays open with every row's error.                                                                                                                                                                                                                                                                                                        |
| Permission denied (every row 403)        | Same as full failure, with the row tooltip "You don't have permission to edit this card."                                                                                                                                                                                                                                                                                                                                                   |
| Undo                                     | Footer "Restoring 6 of 15...". Success toast "Rename Undone" / "Restored **15** card titles.". Partial "Undo Partially Failed" / "Restored **12** card titles. **3** failed.".                                                                                                                                                                                                                                                              |

**Confirmation style.** A plain primary button, not `HoldToConfirmButton`, pending the open question. Renaming is reversible (in-view Undo, plus the audit log's "previous display name"), every exact change is previewed, and nothing is deleted. In parent scope, the run size is in the button label. If a hold is chosen, it uses the shared `HOLD_DURATION_FULL` from `src/utils/constants.js` (#8) through `HoldToConfirmButton`'s default.

**Quick fill.** The chip `Remove "Duplicate of" / "Copy of"` switches to Replace with regex on, Find `^(?:(?:Duplicate|Copy) of )+`, and Replace empty. It also removes stacked prefixes such as "Duplicate of Duplicate of " (dataset card `627918209`). It covers Domo's English strings only (i18n keys `duplicate-of` and `copy-of`). Localized prefixes such as "次の複製：" use plain Find.

### Implementation plan

1. **Pure helpers.** Add `src/utils/cardTitles.js` with `applyTransform`, `buildTitlePayload`, `compileFind`, `convertToStaticText`, `diffSpans`, `fromEditable`, `isEditableSegment`, `parseDynamicText`, `pillLabel`, `toEditable`, `validateResult`, and the constants `DUPLICATE_PREFIX_PATTERN`, `MAX_CARD_TITLE_LENGTH`, `MAX_DYNAMIC_TEXT_SEGMENTS`. No imports. Exports alphabetical.
2. **Shared card plumbing, one commit with no user-visible change** (the contract in Shared infrastructure across issues; #8 adopts all of it):
   - `src/utils/cardHelpers.js`: add `canManageCard` and `cardUrlOnPage`. Switch `GetCardsView.transformCardsToItems` to `cardUrlOnPage`.
   - `src/services/cards.js`: add `cardsOnly` and `parts` to `getCardsForParent`, and add `getCardsForContext` between `getCardsByIds` and `getCardsForObject`. Nothing is lifted from `GetCardsView`: the dataflow dedupe already lives in `getCardsForObject`, and `transformParentScopeItems` stays as the Get Cards UI transform.
   - `src/components/views/DataList.jsx`: add `renderItemDetail` (leaf rows at any depth, through `childRenderProps` and both `VirtualizedItems` call sites, compared by identity in `arePropsEqualForRow`, taller `estimateSize` when set). Document it in the props JSDoc, and fix the `DataListItem.metadata` doc in `src/models/DataListItem.js`.
   - `src/components/views/CardBatchList.jsx`: the wrapper, with the props listed in Shared infrastructure across issues.
3. **Executors, one commit.**
   - Add `src/utils/promisePool.js` to 1.2 step 2's signature (`promisePool(tasks, { concurrency = 6, onSettled })`, settled results in input order). Leave `ActivityLogTable.jsx`'s local copy to 1.2.
   - The envelope `retryAfter` field has already landed (pre-existing bug 5), so this step needs no `executeInPage.js` change.
   - Record both, plus the title PUT as `RETRY_SAFE`, in `docs/plans/beta-phase-1-2-retries-concurrency.md` (amendments in Shared infrastructure across issues).
4. **Services** in `src/services/cards.js`: add `renameCard({ cardId, payload, tabId })` after `getPageCards` (and after #8's `removeCardsFromPage` if it exists), before `setCardsLocked`. Its JSDoc notes that leaving out `dynamicTitle` or `dynamicDescription` deletes them, and that the server derives `title` and `description` from them. It sets `error.status` and `error.retryAfter`.
5. **Transform panel and diff.** Add `src/components/views/renameCards/TitleTransformPanel.jsx`: HeroUI `ToggleButtonGroup` for the mode, `Input`s, `ToggleButton`s for regex and match case, the quick-fill `Chip`, the scope note, and the "Only show cards that change" checkbox. Add `src/components/views/renameCards/TitleDiff.jsx`, which renders the new title with highlighted spans and pill chips.
6. **View.** Add `src/components/views/RenameCardsView.jsx`, modeled on `ManageCardLocksView.jsx`:
   - `getSidepanelData` with a `'renameCards'` type check, `useViewReady`, and `mountedRef`.
   - Loading through `getCardsForContext({ context, hydrateParts: 'metadata,owners', parentId, scope, tabId })`.
   - `useStatusBar().showStatus` with `actionProps` for Undo at a 15000 ms timeout (model: `GetPagesView.jsx:449`).
   - `CardBatchList` with `headerActions={['reload', 'refresh']}`, `isRunning`, `viewType='renameCards'`, `feature='Rename Cards for'`, `featureIcon` from `datatype-text.svg`, `renderDetail` (memoized `TitleDiff`), `chipFor` for the skip and invalid states, `isSelectable` / `unselectableReason` from `canManageCard` plus preview validity, `rowStatus` from `run.statusByCardId`, and `statusLabels` of `Renaming...` / `Renamed` / `Failed`.
   - The view owns the apply run through `promisePool` (concurrency 4) and the local transient-retry wrapper, the conflict re-read, Retry Failed, the undo stack, and an AbortController aborted on unmount.
7. **Button.** Add `src/components/buttons/RenameCards.jsx`, modeled on `GetCards.jsx`: long-press `Dropdown` with "Rename App Cards" / "Rename Worksheet Cards", `useLongPress`, and `useLaunchView`.
8. **Wiring.**
   - `src/utils/availableActions.js`: a new `renameCards` block (dataset types, `DATA_APP_VIEW`, `DATAFLOW_TYPE`, `PAGE`, `REPORT_BUILDER_PAGE`, `WORKSHEET_VIEW`), behind the gate the cross-issue question settles (recommended: `content.card.edit` or `content.admin`). It cannot ride inside the `getCards` block because that block includes `BEAST_MODE_FORMULA`.
   - `src/components/ActionButtons.jsx`: render `RenameCards` next to `ManageCardLocks` and `ManageCardOwners`.
   - `src/sidepanel/App.jsx`: add the `slot.type === 'renameCards'` route, with the same props as `ManageCardLocksView`.
   - `docs/plans/beta-phase-1-6-run-lock.md`: add `RenameCardsView.jsx` / `isRunning` to "Which views lock".
   - `docs/CONTRIBUTING.md` has no per-action list (VERIFIED-CODE), so it needs no change. The actions-catalog registry is not built yet, so `availableActions.js` stays the only gate.
9. **Docs.** In `docs/README.md`, add a line next to "Lock Cards": "**Rename Cards** - Find and replace, add a prefix, or add a suffix across every card on a page, App Studio page or app, worksheet, Report Builder report, dataset, or dataflow, with a live preview and undo." Add the WIP bullets to `docs/RELEASE_NOTES.md` under "New Features and Improvements".
10. **Lint.** Run `npx eslint --no-warn-ignored` on every touched `.js` / `.jsx` file.
11. **Later hooks (not blockers).**
    - When beta 1.2 step 3 lands, swap the local transient-retry wrapper for `withRetry(fn, { profile: RETRY_SAFE })`.
    - When 1.3 lands, and if the cross-issue journal question says yes, record each pass and each undo in the change journal from the pool's `onSettled`.
    - When 1.6 lands, call `useRunLock(isRunning, 'Rename Cards')`.
12. **Phase 2 (only if the open question says yes).** Add `searchCardsByTitle({ offset, text, tabId })` over adminsummary (pages of 100, retrying a 429 once with `Retry-After`) to `src/services/cards.js`. Add a `source: 'titleSearch'` mode to `RenameCardsView`, with a search box in place of the object header. The entry point is decided by the open question.

### Edge cases and risks

- **Dynamic text loss.** This is the largest correctness risk, and the live probes settle it: a title-only PUT deletes both dynamic fields, and `{ title, dynamicTitle }` deletes `dynamicDescription`. `buildTitlePayload` sends exactly the fields the fresh card has, echoes `dynamicDescription` unchanged, and never creates dynamic fields on a plain card.
- **The server re-derives `title` and `description`.** The plan never relies on a sent `title` when `dynamicTitle` is present, and always computes `title` with the ported `convertToStaticText` plus trim. The preview therefore shows exactly what Domo will store.
- **Silent server truncation.** Titles over 255 characters and dynamic text over 50 segments are cut without an error. Both are blocked client-side. Prefix and suffix next to a pill add a TEXT segment, so a title at 50 parts can be pushed over the limit.
- **Empty result.** The server would store "Title", so empty results are blocked.
- **Pills inside a match.** A regex such as `.*` can swallow a sentinel. `validateResult` rejects that row as "Removes Dynamic Text", and the diff marks the pill, so pills are never deleted or reordered. Pill `prefix`, `suffix`, and `defaultText` are not editable by the transform.
- **Leading or trailing spaces in stored text.** These are split off as `lead` / `trail` before matching, so anchored patterns match the visible title.
- **Titles are global.** A card on several pages or apps is renamed everywhere. The banner and the button tooltip say so. Per-row placement counts are not fetched.
- **Parent-scope duplicates.** The same card under several views toggles as one (`CardBatchList` diffs row sets, so unchecking one instance unselects every instance), is renamed once, and gets one result shown on every instance.
- **Locked cards.** Rows are disabled unless the user is a content admin or an owner (group ownership included). A 403 is still possible where server rules differ from `canManageKpi`, and it shows per row.
- **Concurrent edits.** The pre-apply re-read skips changed or deleted cards. Undo skips cards whose title moved again, and rebuilds payloads from a fresh read so it does not clobber a description edited in Domo meanwhile.
- **Side panel closed mid-run.** In-flight requests finish and the rest are not sent. Reopening shows current titles, and the audit log shows what changed. The in-memory undo stack is lost on close, on another launch, or on Reload/Refresh after the run. The banner states this, and the 1.3 journal removes the limitation later.
- **Rate limits.** One PUT per card at concurrency 4, with retries that honor `Retry-After`. adminsummary was observed returning 429 under concurrent load during this research, so phase 2 needs the same handling.
- **Certified cards.** A title PUT most likely does not expire certification, because Analyzer expires it client-side and the title path sends no certification field (INFERRED). This is verified live before release. If it does expire, add a "Certified" chip and a banner note.
- **Card types.** `kpi` and `Text` are VERIFIED-LIVE. `document`, `domoapp`, `rooster`, and `supertable` are INFERRED, since Domo's card details use the same call for every type. Verify a `domoapp` and a document card live.
- **Private-use characters already in a title** (very unlikely): the row is marked "Can't Edit Safely".
- **Regex cost.** Titles are short (255 characters, dynamic text about 1 KB at most), and the preview is debounced.
- **Drill views** keep their titles, which matches what duplication does.
- **Domo's import prefix option** means some imported apps already have clean titles. The feature is still needed for every other duplicate path and for non-duplicate renames.
- **Shared-piece regressions.** `renderItemDetail` and the `getCardsForParent` options are additive, and every existing consumer keeps its current path. The envelope's new `retryAfter` field is `undefined` wherever nothing sets it.

### Testing and verification

- **Pure helpers.** Write a throwaway script under `/tmp` that imports `src/utils/cardTitles.js` and asserts:
  - "Duplicate of " removal on the real view `2095795725` titles, including the stacked `Duplicate of Duplicate of` case from dataset card `627918209`.
  - Pill preservation for `[TEXT, DATE_RANGE_FILTER_DATE_TIME_RANGE, TEXT]`, plus a `FILTER` pill with `defaultText` and a `VARIABLE_VALUE` pill with `variables` (the whole object round-trips).
  - `convertToStaticText` parity on `prefix` / `suffix` / `defaultText` segments.
  - Rejection when a regex eats a sentinel.
  - `^` anchoring past leading whitespace.
  - Prefix and suffix with skip-if-present.
  - Literal `$1` in non-regex mode.
  - The 255-character, 50-segment, and empty guards.
  - The payload rule for all six shapes in the survey table.
- **Compile and HMR.** `yarn dev` is usually already running on 31573, so check `lsof -nP -iTCP:31573 -sTCP:LISTEN` first and watch its output for compile errors. There is no `/dev-*` route for this view.
- **CRXJS dev extension.** In the debug profile, build a scratch dashboard named `domo-toolkit-test-rename-...` with a few duplicated cards (one with a date-range pill, one with a dynamic description and `displayOnCardDetails: false`, one plain card with a static description, one locked). Open the side panel and run Rename Cards. Exercise:
  - Replace, regex, match case, quick fill, prefix, suffix, and the "Removes Dynamic Text" block.
  - Select-all and "Only show cards that change".
  - Apply, then Undo, then a second pass and Undo again (only the latest pass reverts).
  - Conflict skip (rename one card in Domo after loading) and "No Longer Exists" (delete one card in another tab after loading).
  - Retry Failed.
  - Parent scope from an App Studio view with the same card on two views: unchecking it under one view unchecks it under the other, and row order holds after the rename.
  - That Reload and Refresh disappear while applying.
- **Screenshots.** Run `node scripts/ext-shot.js sidepanel --live` with the view open, in light and dark, for the preview, applying, and results states. Also run `node scripts/ext-shot.js popup --live` to check the button and tooltip.
- **Live checks after a run** (scratch cards only):
  - `GET /api/content/v1/cards?urns=...&parts=metadata,owners` shows `metadata.dynamicTitle` still containing the pill object unchanged, and `dynamicDescription` byte-identical, `displayOnCardDetails` included.
  - The plain card's static `description` survives.
  - The audit log shows "previous display name" for each card.
  - Card details in Domo show the new title with the date range still rendering, and Domo's Edit Title modal opens with the pill intact.
  - A `domoapp` card and a document card rename correctly.
  - On a certified card the tester owns, `certificationState` is unchanged after a rename.
  - A locked card shows a disabled row for a non-admin, non-owner test user, and an enabled row for a member of an owning group.
- **Gating.** A user without `content.card.edit` does not see the button. A content admin sees locked cards enabled. A Beast Mode context shows no button.
- **Regression for the shared commits.** Get Cards' card URLs are unchanged after `cardUrlOnPage` moves. Get App Cards still lists forms, queues, and workflows (default `getCardsForParent` path). Manage Card Locks, Get Cards, and the Delete view's dependency list render as before (no `renderItemDetail`). The activity log is unaffected (its local `promisePool` is not moved).
- Run ESLint on every touched file.

### Design decisions made

- **Endpoint: `PUT /api/content/v1/cards/{id}/title`, not the full definition PUT.** It is Domo's Edit Title call, touches nothing else on the card, and works on non-`kpi` cards. Evidence: frontend bundle and live probes.
- **Payload rule: send exactly the dynamic fields the fresh card has, echo `dynamicDescription` unchanged, never synthesize a description.** Live probes showed title-only deletes both dynamic fields, `{ title, dynamicTitle }` deletes `dynamicDescription` but keeps a static description, and the server derives `title`/`description` from the dynamic fields. Mirroring Domo's modal exactly would add a `dynamicDescription` to every plain card.
- **The critique's static-description-with-empty-dynamic-description case is not a real stored state.** It was absent in a 595-card survey, and the server makes it impossible by deriving `description` from `dynamicDescription`. The rule still handles it safely.
- **Static title computed as `convertToStaticText(...).trim()`, client-side.** This is Domo's function ported verbatim. The server trims only when deriving from `dynamicTitle`, keeps inner spaces, and stores a title-only `title` untrimmed (live). The draft's "collapses doubled spaces" inference was wrong and is dropped.
- **Enforce 255 characters, 50 segments, and non-empty client-side.** The server silently truncates the first two and turns empty into "Title" (live), and Domo's modal enforces the 50-segment and non-empty rules itself (bundle).
- **Pills are opaque whole objects behind private-use sentinels, and results that drop or move them are rejected.** The full pill catalog includes types carrying `dataSourceId`, `variables`, and `defaultText` (bundle), and a "Duplicate of " match spans TEXT segments on real cards.
- **Button gate `content.card.edit || content.admin`, with per-row editability from the shared `canManageCard`.** Domo's own rule (bundle). `isCurrentUserOwner` covers group owners (live probe with scratch group `163222655`), so group owners of locked cards are correctly enabled. Users who own cards without either right are excluded on purpose, as stated in Design. #8 uses the same helper for Delete-mode selectability. The gate itself is a cross-issue question.
- **Separate Rename Cards button and view rather than a mode in #8's view.** #8 is a delete flow (hold-to-confirm, then close) scoped to pages and App Studio pages. Rename needs a transform panel, multi-pass stay-open behavior, and dataset and dataflow sources. Sharing the loader, the list, and one DataList prop gets the reuse without coupling the two views' state. The maintainer's call on this is a cross-issue question.
- **#9 builds the shared card pieces, and #8 adopts them.** #9 is the smaller issue and the harder consumer (grouped parent scope, duplicate instances, pinned order, live per-card status), so the shared list is shaped against it first. A fixed order replaces the earlier whichever-lands-first rule, which is how the two plans diverged.
- **Shared loader `getCardsForContext` over `getCardsForObject` and `getCardsForParent`, with an optional merged hydrate.** The dataflow dedupe already lives in `getCardsForObject` (code), so nothing is lifted from GetCardsView except the card URL rule (`cardUrlOnPage`). Merging instead of replacing keeps source-only fields #8 needs.
- **One DataList prop, `renderItemDetail`.** #8's visible placements line and #6's expandable formulas need the same slot as this diff, so DataList gains one prop instead of three. The row filter stays in the view because DataList needs no new prop for it.
- **No shared hook.** The run here is a per-card pool with a fresh re-read and an undo stack, and selection follows the live preview, so a hook built around bulk chunks would not fit. `CardBatchList` carries the shared list behavior.
- **`cardsOnly` option on `getCardsForParent`.** Rename only needs cards, and the default call fetches view details, forms, queues, and workflows for every view (code). It landed with pre-existing bug 4.
- **Row IDs `${viewId}:${cardId}` with `originalId`, and `sortWeight` pinned from the first load, both owned by `CardBatchList`.** DataList IDs must be unique, and its label sort would reshuffle rows after every rename (code). Owning them in the shared list means #8 gets the same behavior.
- **Leaf-row status through `getItemBadge` and `chip`, not `status`/`error`.** DataList renders the error body only for virtual parents (`DataList.jsx:1006`).
- **Manual `showStatus` toasts with a 15000 ms Undo action, and no loading toast.** `showPromiseStatus` has no `actionProps` and a 3 s success timeout (code). Progress lives in the footer.
- **`promisePool` built to beta 1.2 step 2's signature rather than a view-local pool.** The shared helper is already specified, and #80 needs one too, so building it once to the spec avoids a third copy.
- **Retries honor `Retry-After`, falling back to a fixed 1 s / 3 s, on 429/502/503/504.** This issue lands the envelope field that carries `Retry-After` (1.2 step 1's envelope half, three lines). The PUT is idempotent. The wrapper swaps for `withRetry` when 1.2 step 3 lands.
- **Pre-apply re-read, dedupe, and conflict or missing skip.** `getCardsByIds` silently drops deleted cards (code), so "No Longer Exists" is reported from the re-read rather than by expecting a 404.
- **In-memory undo stack (latest pass first), payloads rebuilt from a fresh read, with a stated lifetime, and a journal hook when 1.3 lands.** It is cheap now, honest about its limits, and the durable version is already planned infrastructure.
- **Reload and Refresh removed while applying, through `CardBatchList`'s `isRunning`; 1.6 run lock adopted later.** Parent-scope runs are long enough that an accidental reload is plausible, and #8 gets the same interim lock from the shared list.
- **Icon `datatype-text.svg`.** It is unused, and `pencil.svg` would collide with Update Details on dataflows (code).
- **Card titles only; drill views, axis titles, and legend titles excluded.** Duplication does not prefix drill views (live sample of 174 roots), and axis and legend titles need a definition rewrite.
- **The view stays open after success.** Multi-pass edits are common (strip a prefix, then add a suffix), unlike lock/unlock, which closes.
- **Quick-fill regex for Domo's English duplicate prefixes.** Domo's i18n has `duplicate-of` / `copy-of`, and 8,255 "Duplicate of" cards exist on domo.domo.com.

### Release notes draft

- Pages, App Studio pages, worksheets, Report Builder pages, datasets, and dataflows now have a Rename Cards button that renames their cards in bulk with find and replace, a prefix, or a suffix. ([#9](https://github.com/brycewc/domo-toolkit/issues/9))
- Rename Cards previews every new title before it runs and can undo the rename afterward. ([#9](https://github.com/brycewc/domo-toolkit/issues/9))

## #8: Bulk Select Delete Cards on Dashboard

### Summary

**Problem.** Right now, cleaning up a dashboard or App Studio page means deleting or removing cards one at a time: open the card menu, confirm, repeat. A power user retiring half a page can't pick a set of cards in place and act on them together. Nothing warns them what each delete takes with it either: alerts, embeds, drills, or the other pages and people's Shared pages the card also shows up on.

**Who benefits.** Content admins and card editors cleaning up dashboards and apps. The request came from a customer, OneMagnify. #9 (Bulk Rename Cards) is built on the same card loader and selectable card list (see Shared infrastructure across issues).

**Interpretations considered.**

1. _Bulk delete selected cards on the current page._ This is the literal ask. Planned.
2. _Bulk remove selected cards from the page without deleting them._ Domo treats these as separate actions, and "clean up a page" often means remove. Planned as a second mode of the same view. Whether it ships in #8 is an open question (see Scope check).
3. _A general "cards on this page" table that shows datasets and opens cards in tabs in bulk._ This already exists. Get Cards lists the page's cards and has Open All, and Get DataSets lists the page's datasets. Not planned. The only part kept is the dataset name as row detail, because it comes free with the same request and tells apart cards with the same title.
4. _A modal_, as the issue suggests. This project puts work views in the side panel and keeps modals for read-only drill-ins (`BeastModeCardsModal`, `OwnerCardsModal`). So this is a side panel view.

### Scope check

**What Domo's UI already offers** (verified in Domo's frontend bundles and live):

- **Admin > Content > Cards** (`/admin/cards`) can filter by "Dashboards & Apps" (`pageIds` on `POST /api/content/v2/cards/adminsummary`).
  - Its bulk action menu calls `delete` (`DELETE /api/content/v1/cards/bulk`) and `remove_from_pages` (`DELETE /api/content/v1/cards/bulk/pages`). It also offers add to pages, owners, lock, and duplicate.
  - The nav entry shows for `content.card.edit` or `content.admin`. Bulk actions are allowed when `canManageCards || every selected card isCurrentUserOwner` (admin chunk `admin-f0a6ba0eab00a3cb`).
- **The page editor** removes cards in place, one at a time, then saves. The save calls `Page.moveDeleteCards`, which is `DELETE /api/content/v1/cards/bulk/pages?cardIds=:cardIds&destinationPageIds=:destinationPageIds` (chunk `48800-8cba4f7ec4bc66c6`). App Studio's layout save does the same with `contextType: DATA_APP` (chunk `50902-cd55aca14a489500`).

**Delete is in scope.** Admin > Cards can bulk delete a page's cards, but it is not easy. You leave the page, open Admin > Cards, find the page by title in a picker (titles are often duplicated), apply the filter, select cards, pick an action, and confirm. That is about eight steps. Nothing on that path shows alerts, embeds, or drills. Domo's bulk endpoints are also all-or-nothing (verified below), so one bad card fails the whole action there. This view starts already scoped to the page and shows what goes with each card before anything is deleted. It also reports results per row when part of a batch fails.

**Remove from Page is weaker on scope.** A user already on the page can remove cards in Domo's editor with little friction. What this view adds for Remove:

- doing many cards in one action
- warning before a card is left on no page at all
- Remove and Delete working from the same selection

That is real but modest value, so whether Remove ships in #8 is put to the maintainer as an open question. The design below includes it, and dropping it removes one toggle, one service, and one confirm.

**Cut:**

- A standalone card viewer and a dataset viewer: Get Cards and Get DataSets cover them.
- Open Selected: Get Cards' Open All covers opening in bulk. Adding it here would also force a DataList refactor of the Open All confirm.
- Deleting the whole page with its cards: this stays in the existing Delete view (`deletersByType.PAGE`, including "Delete Page and Cards that Only Live Here").

**Overlap in this codebase:**

- `src/components/views/DataList.jsx`: selection mode, `selectAll`, `isSelectable`, `getUnselectableTooltip`, `getItemBadge` (leaf rows only), `banner`, `footer`, `fillHeight`, and virtualization. It renders neither `item.metadata` nor a visible annotation (an `annotation` is an info icon plus hover text, VERIFIED-CODE), so a visible second line on a row needs the shared `renderItemDetail` prop.
- `src/components/views/ManageCardLocksView.jsx` and `ManageCardOwnersView.jsx`: the closest pattern. Each is a page-scoped card list with a mode toggle that re-derives the selection, a footer submit, and `showPromiseStatus`.
- `src/services/cards.js`: `deleteCards` (bulk DELETE, throws with `error.status`) and `getCardsForObject` (stacks with `parts`, plus a v1 fallback on 404). Note that it returns only `page.cards` and drops the `page` object.
- `src/services/pages.js`: `getCardLocations` (kind-keyed `${kind}:${id}` placements, with parent names for views and report pages), `getPagesForCards`, `getOnlyHereCardIds`, `cardIdsOnlyOnPages` (compares by ID only, not by kind), and `fetchCardPlacements` (one request per card, 50 in flight).
- `src/services/dependencies.js`: the source of truth for what a delete takes with it. The `CARD` fetcher (around line 773) lists Alerts, Card Beast Modes, Drills, Embeds, Pages, and Workspaces. `fetchAppPageDependencies` loads page cards, only-here IDs, and card embeds in parallel. `withWorkspaceCardUsage` drops workspace cards from "only here".
- `src/services/alerts.js` `getCardAlerts`, `src/services/embeds.js` `getCardEmbeds`, `src/services/workspaces.js` `getWorkspacesForCards` and `groupCardsByWorkspace`, `src/services/functions.js` `getBeastModesSavedOnCard`.
- `src/hooks/useParallelFetches.js`: independent fetches with per-key loading, loaded, or error state.
- `src/components/views/DeleteObjectView.jsx`: `AlertDialog` plus `HoldToConfirmButton` (with `isOpen` gated on `isActive`), `cardHostUrl`, the `cardWorkspacesCheck` on-demand pattern, and `FULL_HOLD_DURATION` / `SHORT_HOLD_DURATION`. These duplicate `DEFAULT_HOLD_DURATION` in `HoldToConfirmButton.jsx`.
- `src/components/views/DeleteUnusedBeastModesView.jsx`: chunked bulk delete that falls back to per-item calls (around line 221), with a progress counter and `isActive`-gated dialog.
- `src/utils/currentObject.js`: `redirectTabIfViewingObject` and `reloadTabIfViewingObject`.
- `docs/plans/beta-phase-1-2-retries-concurrency.md`: specifies `src/utils/batchWithFallback.js`. It is not built yet. #6 also builds it, to the same amended signature (see Shared infrastructure across issues).

### API and platform findings

All live calls went to domo.domo.com with a token whose user has `content.admin`.

| #   | Purpose                                                                            | Method and path                                                                     | Tag                                                                     |
| --- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | Cards on a page, App Studio page, or worksheet page, with datasets, owners, drills | `GET /api/content/v3/stacks/{pageId}/cards?parts=datasources,owners,drillPathURNs`  | VERIFIED-LIVE, VERIFIED-CODE                                            |
| 2   | Fallback when stacks 404s on a dashboard                                           | `GET /api/content/v1/pages/{pageId}/cards?parts=datasources,owners,drillPathURNs`   | VERIFIED-LIVE, VERIFIED-CODE                                            |
| 3   | Page owner and lock state when the v1 fallback is used                             | `GET /api/content/v1/pages/{pageId}`                                                | VERIFIED-LIVE, VERIFIED-CODE                                            |
| 4   | Where each card lives, one request per 100 cards                                   | `POST /api/content/v2/cards/adminsummary?limit=100&skip={n}`                        | VERIFIED-LIVE                                                           |
| 5   | Where each card lives, one request per card (fallback)                             | `GET /api/content/v1/cards?urns={id}&parts=adminAllPages`                           | VERIFIED-LIVE, VERIFIED-CODE                                            |
| 6   | Alerts on the cards                                                                | `POST /api/social/v4/alerts/ids?type=card&fields=all`                               | VERIFIED-LIVE, VERIFIED-CODE                                            |
| 7   | Embeds of the cards                                                                | `POST /api/content/v1/cards/kpi/embed/summary?limit=50&offset={n}`                  | VERIFIED-LIVE, VERIFIED-CODE                                            |
| 8   | Workspaces of the cards (on demand)                                                | through `getWorkspacesForCards`                                                     | VERIFIED-CODE                                                           |
| 9   | Bulk delete                                                                        | `DELETE /api/content/v1/cards/bulk?cardIds={csv}`                                   | VERIFIED-LIVE, VERIFIED-CODE                                            |
| 10  | Bulk remove from a page                                                            | `DELETE /api/content/v1/cards/bulk/pages?cardIds={csv}&destinationPageIds={pageId}` | VERIFIED-LIVE (not in the bundled OpenAPI spec, which has only the PUT) |
| 11  | Authority names                                                                    | dataset `073c76f1-c846-48fd-876c-34d98d89a07b`                                      | VERIFIED-LIVE                                                           |
| 12  | Card Beast Mode search over the page's datasets (rejected)                         | `POST /api/query/v1/functions/search`                                               | VERIFIED-LIVE                                                           |

**1. Stacks cards.** One call returns everything a row needs.

- **Card keys** with these parts: `active, allowTableDrill, badgeUpdated, created, creatorId, datasources, description?, drillPathURNs, id, isCurrentUserOwner, locked, metadata, ownerId, owners, title, type, urn`.
- **No `certification` key** unless `parts=certification` is added. The plan does not rely on it.
- **`drillPathURNs`** is accepted on stacks (verified this run). It lists every drill as `dr:{drillId}:{rootCardId}`, so drill counts cost no extra request.
- **The `page` object** has `isOwner`, `locked`, and `type` (`page`, `dataappview`).
- **App Studio views** (`type: 'dav'`) also carry a per-card `access` flag. All 7 cards on view `1870561888` had `access: true`. The meaning of `false` is INFERRED.
- **`parts=permissions`** returns 400, so there is no per-card permission mask.

```json
{
  "id": 1609903184,
  "title": "Account Lookup",
  "type": "kpi",
  "locked": false,
  "isCurrentUserOwner": false,
  "drillPathURNs": ["dr:974098998:1609903184"],
  "owners": [{ "id": "1522882878", "type": "USER", "displayName": "Ben Schein" }],
  "datasources": [
    {
      "dataSourceId": "eac44ae6-6463-44ab-ad5a-6294977873ff",
      "dataSourceName": "GOLD | RevOps | Salesforce Opportunities Master"
    }
  ]
}
```

Page `888329385` returned 52 cards in 0.86 s, with `page: { isOwner: true, locked: false, type: 'page' }`.

**2 and 3. Pages where stacks 404s.** On page `106095392`:

- Bare `GET /api/content/v3/stacks/106095392` returns 404.
- The v1 cards route answered with all three parts (7 cards, `drillPathURNs` present). It has no page object.
- `GET /api/content/v1/pages/106095392` returns `isOwner: false, locked: false`.
- The detected context's fallback (`/content/v1/pages/{id}/access`) has only `pageId, ownerId, pageName, owners, pageAccess`, so `metadata.isOwner` is null on such pages.

**Worksheet pages.** A worksheet page has no owner of its own; the worksheet's owners own it. `computeIsOwner` in `src/background.js` only handled `PAGE` and `DATA_APP_VIEW`, so `metadata.isOwner` was never set for `WORKSHEET_VIEW` (VERIFIED-CODE, now fixed by reading the parent worksheet's `owners`). This is a shipped bug beyond this feature: `DeleteObject.jsx`'s `isDeleteForbidden` gates `WORKSHEET_VIEW` on `!isOwner && !content.admin`, so a worksheet page's owner without `content.admin` cannot delete it today (VERIFIED-CODE).

**4. Card admin summary.**

- **Request:** `{ "pageIds": [pageId], "includePageTitleClause": true }`. A `cardIds` field in the body is ignored and returns unrelated cards, so it must not be used.
- **Response:** `{ cardAdminSummaries: [{ id, title, type, locked, active, owners[], pageHierarchy: [{ pageId, title, parentPageId?, parentPageTitle? }] }], totalCardCount }`.
- **Speed:** page `888329385` (52 cards) took 0.47 to 0.55 s.
- **Report pages:** the filter returns `totalCardCount: 0` for report page `1535023132`.
- **App Studio views:** the filter works on view `1355224510`, but returned 0 for a freshly created scratch view whose card was placed through the bulk PUT. It is not reliable for views.
- **Classic pages:** it worked on the scratch classic page (2 of 2 cards).
- **No page kind:** `pageHierarchy` entries say nothing about the kind of page and carry no app or report ID. Page, view, and report page IDs are separate ID spaces (see the `getCardLocations` comment), so a fast-path placement can be named but not linked or typed.
- **Rate limiting:** it returned **429** twice in a row during this run (other agents were hitting the instance at the same time), then 200 ten seconds later.
- **Permissions:** whether it answers for a user without `content.admin` or `content.card.edit` is INFERRED. Domo only shows Admin > Cards to those grants, so other users likely get a 403.

**5. Per-card placements.** Same answer as #4 for page `888329385` (13 cards only here, 8 also on other real pages, 31 elsewhere only through system pages). It took **32 s at the code's 50 in flight**, against 0.47 s for #4. Report placements come back under `adminAllReportPages` (card `407736811`).

**System placements.** Both sources list `-100000` (Overview), `-100002` (Shared), and `-100003` (Favorites). On page `888329385` there were 35 cards on Shared, 4 on Favorites, and 4 on Overview. Card `889676853` lists `[-100002 Shared, 386665203 Data Curiosity Team]`.

The card access list (`GET /api/content/v1/share/accesslist/badge/{id}`) looked the same for `889676853` and for a page-mate that is not on Shared: 6 users, 5 with `invitorUserId`, 1 group. So a Shared placement cannot be tied to particular people from the client. The UI names it by its own title ("Shared") rather than reading meaning into it.

**6 and 7.** Both returned 200 with empty results for page `386665203`'s cards (`[]` and `{"total":0,"summaries":[]}`). The shapes are the ones `getCardAlerts` and `getCardEmbeds` already parse.

**9. Bulk delete.**

- **All-or-nothing:** `DELETE ...bulk?cardIds={real},1` returned **404**, and the real card was **not** deleted (previous run, scratch cards).
- **A clean batch** returned 200 with an empty body.
- **Deleting an already deleted card** returned 404 `{"status":404,"statusReason":"Not Found"}` (this run, card `1200764577`). Reading it back with `GET /api/content/v1/cards?urns=1200764577` returned 200 `[]`.
- **A card the user cannot delete:** whether that returns 403 or 404 is INFERRED. Testing it would need a write to someone else's card.

**10. Bulk remove.** All verified on scratch objects.

- **Layout dashboard** (previous run):
  - Removing cards A and B returned 200. A then lived on no page and still existed; B stayed on page B.
  - The layout's `content` dropped both cards, but `standard.template` **kept their slots**. Domo Admin's own remove does the same, since it is the same call.
- **Classic page** (this run, page `1365898974`, no `pageLayoutV4`): removing card `1200764577` returned 200. The card left both `cards` and `sizes`, nothing else changed, and it still existed on no page.
- **App Studio view** (this run, view `503426363` of scratch app `917641970`):
  - The card had been added with `PUT bulk/pages`, giving layout `content: [null, 1917125635]` and 3 template entries.
  - The remove returned 200. Afterwards `cards: []`, `content: []`, and both templates were `[]`, so no leftover slot.
  - The card still existed on its other page.
  - This upgrades the draft's INFERRED tag to VERIFIED-LIVE. The earlier run's view probe (view `1317878821`) was ambiguous, because its snapshot could not be placed in the write order.
- **Edge cases:** removing a card that is not on the page returned 200. A batch with one nonexistent card ID returned **404 for the whole batch**.

**11. Authorities** (from the dataset):

- `content.admin`: "View, create, edit, share and delete any Card, Page, App..."
- `content.card.edit`: "Create, edit and delete Cards, Drill views, and Beast Modes to which you have access." Depends on `ui.admin`.
- `content.page.edit`: pages, styles, templates, and layouts.
- `content.dataapp.edit`: depends on `content.page.edit`.
- `content.worksheet.edit`: edit worksheets.

Domo's admin UI computes `canManageCards = content.card.edit || content.admin` and `canManagePages = content.page.edit || content.admin`. For a single card, Domo's client rule is `canManageKpi` (#9's bundle finding): `content.card.edit && !locked || isCurrentUserOwner || isContentAdmin`.

**12. Card Beast Modes cannot be counted cheaply.** The batched search over the 31 datasets of page `888329385` returned `totalHits: 14679` at 1.7 s per 100 results, about 250 s to page through. There is no card filter on that endpoint: the bundles only use `dataset` and `owner` filters. Per-card search (`getBeastModesSavedOnCard`) costs one search per card. So the view names Card Beast Modes as going with the cards but does not count them (see decisions).

**Not used:**

- `/kpis/removefrompage` (`Kpis.removeFromPage`): the legacy one-card route.
- `POST /kpis/{id}/remove?pageid=` from the spec: also legacy.
- The card access list: it doesn't say who gets a card through Shared.

### Design

**Where it lives.** A new side panel view, `DeleteCardsView`, launched by a new `DeleteCards` action button through `useLaunchView` with `type: 'deleteCards'`. It works from the popup too, because `launchView` hands off to the side panel. Whether bulk card actions should instead be one view with modes shared with Rename Cards is a cross-issue question. This plan is written for separate views on a shared list.

**Enabled for:** `PAGE` with ID ≥ 0 (not system pages), `DATA_APP_VIEW`, and `WORKSHEET_VIEW`. Whether `REPORT_BUILDER_PAGE` joins (Delete mode only) is part of the cross-issue question on source contexts. The gate in `getAvailableActions()` is also a cross-issue question. The recommendation is `content.admin || content.card.edit`, matching Rename Cards. It sits in the existing page card block next to `manageCardLocks`.

**Shared pieces adopted from #9** (full contract in Shared infrastructure across issues). If #8 lands first, it builds them to that contract unchanged.

1. **`getCardsForContext`** in `src/services/cards.js`, called as `getCardsForContext({ context, parts: 'datasources,owners,drillPathURNs', tabId })` with no `hydrateParts`. Stacks (or its v1 fallback) already carries every field a row needs, including the per-card `access` flag that a v1 re-read would not return. Cards come back with string IDs and a `loadIndex`.
2. **`CardBatchList`** (`src/components/views/CardBatchList.jsx`). DeleteCardsView passes:
   - `renderDetail(card)` for the row's detail line (dataset name, then placements, alerts, embeds, and drills)
   - `chipFor(card)` returning an `App` chip on `domoapp` cards
   - `statusLabels` of `Deleting...` / `Deleted` / `Failed` (Remove: `Removing...` / `Removed` / `Failed`)
   - `rowStatus`, `isSelectable`, `unselectableReason`, `isRunning`, `banner`, and `footer`

   Each card is a leaf row: badges render only on leaf rows, and Open All would otherwise walk child rows. Locked cards show the lock badge while idle.

3. **DataList `renderItemDetail`**, through `CardBatchList`. This is the only DataList change. #8's earlier `renderItemTrailing` hand-off is dropped.
4. **`cardUrlOnPage`** (the row link to the card on this page) and **`canManageCard`** in `src/utils/cardHelpers.js`.

**No shared hook.** The earlier `useCardBatch` is dropped, because #9's per-card pool and preview-driven selection do not fit a `runBatch` built around bulk chunks (see Shared infrastructure across issues). DeleteCardsView owns its run state directly:

```js
mode: 'delete' | 'remove'
selectedCardIds: Set<string>
statusByCardId: Map<cardId, { error?: string, status: 'queued'|'running'|'done'|'failed' }>
progress: null | { done, total }
isRunning: boolean
```

**Built here** (unless already landed):

1. **`src/utils/batchWithFallback.js`**, to the amended beta 1.2 section 6 signature. #6 builds the same helper, so whichever of #6 and #8 starts first builds it, and the other imports it:
   ```js
   batchWithFallback(items, { canFallBack, chunkSize, onSend, onSettled, profile, sendBatch, sendOne, signal });
   // -> [{ error, item, ok, notSent?, partial? }] in input order
   ```
   - Chunks run serially. A chunk that fails with a definite 4xx other than 429 is retried one item at a time. A 429 or 5xx chunk is not split: its items are marked failed with the error, and the run continues with the next chunk.
   - `onSend(items, { phase })` fires just before each request, and the view marks those rows `running`.
   - `onSettled(results, { doneCount, phase, total })` fires once per request whose results are final, and the view marks those rows `done` or `failed` and sets `progress`. It does not fire for a chunk that falls back.
   - `signal` comes from an AbortController the view aborts on unmount. Unsent chunks are never sent and come back `notSent`.
   - The commit that builds it also records the amendments in `docs/plans/beta-phase-1-2-retries-concurrency.md` (signature, the Delete Cards and Remove from Page callers, and `DELETE content/v1/cards/bulk/pages` as `RETRY_SAFE`).
2. **Hold constants** `HOLD_DURATION_FULL = 5000` and `HOLD_DURATION_SHORT = 2500` in `src/utils/constants.js`.
3. **`cardHostUrlForTab({ origin, tabId })`** in `src/utils/cardHelpers.js`, moved from `DeleteObjectView.jsx`'s `cardHostUrl`.

**New and changed services:**

- **`cards.js` `removeCardsFromPage({ cardIds, pageId, tabId })`.** Calls `DELETE /api/content/v1/cards/bulk/pages?cardIds={csv}&destinationPageIds={pageId}` (the CSV form `Page.moveDeleteCards` uses) and throws with `error.status`, like `deleteCards`. It goes before `renameCard` (#9) and `setCardsLocked` in export order.
- **`pages.js` `getPageEditState({ details, pageId, typeId, tabId })`.** Returns `{ isOwner, locked }`. It reads `details.page` when present, otherwise falls back to `GET /api/content/v1/pages/{pageId}`.
- **`pages.js` `getCardLocationsOnPage({ cardIds, onProgress, pageId, pageTypeId, tabId })`.** Returns the same shape as `getCardLocations` (`{ locationIdsByCardId, locations }`), with this page left out and each location carrying `system: Number(id) < 0`.
  - **Fast path:** page through `adminsummary` filtered by `pageIds: [pageId]`, at 100 per page using `totalCardCount`. Use it only when it returns every card on the page (so never on report pages, and not on views where it misses cards). Its locations have `kind: null` (unknown), or `'system'` for negative IDs. This page is left out by ID, since the source has no kind.
  - **Retry:** on a 429, wait 2 s, or `Retry-After` when present, and try once more. The retry runs inside the injected function, where the header is readable. The thrown error also sets `e.retryAfter` for the shared envelope field.
  - **Fallback:** call `getCardLocations` in chunks of 50 card IDs from the side panel, calling `onProgress(done, total)` after each chunk. This page is left out by its exact key (`${LOCATION_KIND_BY_TYPE[pageTypeId]}:${pageId}`).
- **`background.js` `computeIsOwner`.** Done: `WORKSHEET_VIEW` ownership now comes from the parent worksheet's `owners`, since worksheet pages have no owner of their own. The duplicated `TEMPLATE` branch is gone.
- **`DeleteObjectView.jsx`.** Switches to `cardHostUrlForTab` and the hold constants.

**Data flow** (all Domo calls go through `executeInPage` on the Domo tab, from the side panel):

1. On mount, `getSidepanelData(instance)` checks `type === 'deleteCards'` and builds the `DomoContext`.
2. `getCardsForContext` loads the cards, and `CardBatchList` renders as soon as they arrive. `getPageEditState` runs alongside.
3. `DeleteCardsView` runs its decorations through `useParallelFetches`, with specs memoized on the card ID list. Each one fills in its part of the rows' detail line as it lands.
   - `placements`: `getCardLocationsOnPage`
   - `alerts`: `getCardAlerts(ids)`, grouped by `resourceId`
   - `embeds`: `getCardEmbeds({ cardIds, fallbackToOwnEmbed: true })`

   A failed spec leaves that decoration unknown and disables the quick select that depends on it. The actions stay available.

4. Workspaces are only checked on demand, with a banner prompt as in `cardWorkspacesCheck`, through `getWorkspacesForCards` and `groupCardsByWorkspace`. Afterwards, cards in a workspace gain a `workspace` location.
5. On confirm, the view calls `batchWithFallback` over the selected card IDs, with `chunkSize: 50` and `sendBatch` / `sendOne` closing over `deleteCards` (no `profile`, since 1.2 does not retry deletes) or `removeCardsFromPage` (`profile: RETRY_SAFE`). The `onSend` and `onSettled` callbacks move rows through `running`, `done`, and `failed`.
6. Afterwards:
   - The view reloads through `getCardsForContext`. A failed card that is missing from the refreshed list counts as done, whatever error it got. That covers an "already deleted" 404 without guessing at what a 404 means for a card the user can't see.
   - Succeeded rows drop out. Failed rows stay selected with their X badge.
   - For the Domo tab: if it is on one of the deleted or removed cards (`/kpis/details/{cardId}`), `redirectTabIfViewingObject` sends it to `cardHostUrlForTab`. Otherwise `reloadTabIfViewingObject({ ids: [pageId] })` reloads the page.
   - The view closes when no cards are left, guarded by `mountedRef` until 1.6's view-scoped close lands.

**Selection rules.**

- Rows with `access === false` are never selectable ("You don't have access to this card.").
- **Delete mode:** a row is selectable when the shared `canManageCard({ card, userRights })` is true. That is Domo's own `canManageKpi` rule: `content.admin`, an owner (group ownership counts through `isCurrentUserOwner`), or `content.card.edit` on an unlocked card. Other rows are disabled with "This card is locked. Only its owners and content admins can delete it." The server stays authoritative, and anything it rejects shows as a per-row failure.
- **Remove mode:** offered when `content.admin`, or the page's edit grant (`content.page.edit` for pages and App Studio pages, `content.worksheet.edit` for worksheet pages), or `isOwner`. On a locked page, only owners and `content.admin` qualify. Otherwise the toggle option is disabled with a reason. Since Admin > Cards allows `remove_from_pages` for `canManageCards`, the server may accept more than this. Anything it rejects shows as a per-row failure.
- **Switching modes** prunes the selection to IDs that are selectable in the new mode, as ManageCardLocksView re-derives its selection.

**What "lives elsewhere" means.** Each row knows its other locations: real pages, App Studio and worksheet pages, report pages, system pages (Shared, Favorites, Overview), and workspaces once checked.

- **Delete mode:** the **Only Live Here** quick select picks cards with no other location. Whether system pages count is an open question. The default counts them, matching `cardIdsOnlyOnPages` today.
- **Remove mode:** a card is "left on no page" when it has no other location that is not a system page. Shared, Favorites, and Overview are other people's personal pages, not a place the user can find or manage the card. The quick select there is **Also on Other Pages**, its inverse.

**Concurrency.** Write chunks run serially, and so does the per-card fallback. Reads keep their existing pools: 50 in flight inside each `getCardLocations` chunk, 500-ID alert batches, and the embed summary's own chunking.

**Run safety.** While a run is active, `CardBatchList`'s `isRunning` makes the selection read-only and drops Reload and Refresh from the header. Closing the view or the panel cannot be blocked yet: in-flight chunks finish, and the abort keeps the rest from being sent. When `docs/plans/beta-phase-1-6-run-lock.md` lands, the view calls `useRunLock(isRunning, 'Delete Cards')`, and this commit adds `DeleteCardsView.jsx` / `isRunning` to that plan's "Which views lock" table. Whether Delete Cards records into the 1.3 change journal is a cross-issue question. The hook points would be `onSend` and `onSettled`.

**Feature switches.** None needed. `WORKSHEET_VIEW` is already gated by `app-studio-worksheets`.

### UX

**Entry point.** In the expandable action section, after Manage Card Locks and Manage Card Owners:

- Button: **Delete Cards**, with the existing `row-remove.svg` icon. The page's always-visible Delete button uses the trash icon, and a second trash icon invites deleting the page by mistake.
- Tooltip: "Delete the cards you pick on this page, or remove them from it"

**Flow:**

1. Click **Delete Cards**. The side panel opens "Delete Cards on {page name}" with a spinner ("Loading cards...").
2. The list renders with nothing selected. Each row's detail line fills in as lookups land. While placements load, the banner shows "Checking where these cards live..." with a spinner, or "Checking where these cards live (100 / 240)..." on the per-card path.
3. Pick a mode in the banner toggle: **Delete** | **Remove from Page**.
4. Select cards by hand, with Select All, or with a quick select.
5. Press the footer button. A confirm dialog summarizes what happens. Its confirm stays disabled, with "Checking what goes with these cards...", until the placements, alerts, and embeds lookups have each settled.
6. Confirm, by hold or click depending on the tier (open question on confirmation strength).
7. Rows show a spinner per chunk, then a check or an X. The toast resolves. Failed rows stay selected with the reason on hover, and the Domo tab is redirected or reloaded.

**Mockup: list (Delete mode)**

```
+-------------------------------------------------------+
| [x-row] Delete Cards on Sales Overview      [open][x] |
|         24 cards                                      |
|-------------------------------------------------------|
|  [ Delete | Remove from Page ]                        |
|  Quick Select: [Only Live Here] [Owned by Me]         |
|  Workspaces aren't checked automatically.             |
|                                  [Check Workspaces]   |
|  [-] Select all (3 / 24)                              |
|-------------------------------------------------------|
|  [x] Pipeline by Region                          [L]  |
|      Opportunities. Also on Q3 Review and 1 more,     |
|      1 alert, 2 drills                                |
|  [ ] Win Rate                                         |
|      Opportunities. Also on Shared                    |
|  [x] Bookings QTD                                     |
|      Bookings                                         |
|  [/] Region Map  (no access)                          |
|      Territories                                      |
|  ...                                                  |
|-------------------------------------------------------|
|  [          Delete 3 Cards          ] (danger)        |
+-------------------------------------------------------+
```

**Mockup: Delete confirm**

```
+--------------------------------------------------+
| Delete 3 Cards?                                  |
|                                                  |
| This permanently deletes 3 cards, along with     |
| their drills, card-level Beast Modes, 1 alert,   |
| and 2 embeds.                                    |
|                                                  |
| 2 of them also appear elsewhere (Q3 Review,      |
| Shared, and 1 more) and will disappear from      |
| there too.                                       |
|                                                  |
|            [Cancel]  [ Hold to Delete ]          |
+--------------------------------------------------+
```

**Mockup: during and after a run**

```
|  [x] (spin) Pipeline by Region                         |
|  [x] (ok)   Bookings QTD                               |
|  [x] (X)    Region Map  <- "Failed: You don't have permission to delete this card." |
```

**States and copy:**

| State                                           | What shows                                                                                                                                                                                                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading                                         | Spinner card, "Loading cards..." (after 200 ms, like Get Cards)                                                                                                                                                                                          |
| Empty                                           | Status "No cards found on this page.", then back to default                                                                                                                                                                                              |
| Load failure                                    | Warning Alert with the error text and a **Retry** button (GetCardsView pattern)                                                                                                                                                                          |
| Placements failed                               | Banner: "Couldn't check where these cards live, so Only Live Here is unavailable." The quick select is disabled and the actions still work                                                                                                               |
| Alerts or embeds failed                         | Banner: "Couldn't check these cards' alerts." / "...embeds." The confirm then says "may also have alerts" (or embeds) and uses the full hold                                                                                                             |
| Nothing selected                                | Footer button disabled                                                                                                                                                                                                                                   |
| No access row                                   | Disabled checkbox, tooltip "You don't have access to this card."                                                                                                                                                                                         |
| Locked card the user can't manage (Delete mode) | Disabled checkbox, tooltip "This card is locked. Only its owners and content admins can delete it."                                                                                                                                                      |
| Remove mode unavailable                         | Toggle option disabled, tooltip "You need edit access to this page to remove cards from it."                                                                                                                                                             |
| Loading toast                                   | "Deleting **N** cards..." / "Removing **N** cards from **{page}**..."                                                                                                                                                                                    |
| Success                                         | "Deleted **N** cards." / "Removed **N** cards from **{page}**." (singular "card")                                                                                                                                                                        |
| Partial failure                                 | "Deleted **12** cards, **2** failed." / "Removed **12** cards, **2** failed." The view stays open on the failed rows                                                                                                                                     |
| Full failure                                    | Danger toast "No cards were deleted. {reason}" / "No cards were removed. {reason}"                                                                                                                                                                       |
| Per-row errors                                  | 403: "You don't have permission to delete this card." (remove: "...to remove this card from this page."). 404 when the card is still listed: "Domo couldn't find this card." 429 or 5xx: "Domo was busy, try again." Other: "Failed with HTTP {status}." |

**Other copy:**

- **Footer:** **Delete {N} Card(s)** / **Remove {N} Card(s) from Page**
- **Quick selects:** Delete mode **Only Live Here**, **Owned by Me**. Remove mode **Also on Other Pages**, **Owned by Me**.
- **Detail line** (through `renderItemDetail`): the dataset name, or "N datasets", followed by a comma-separated list of "Also on {name} and {n} more", "{n} alert(s)", "{n} embed(s)", "{n} drill(s)", and "Also in a workspace". System pages are named by their own title ("Also on Shared").
- **Delete confirm:**
  - "This permanently deletes **N** cards, along with their drills, card-level Beast Modes, **A** alerts, and **E** embeds." Zero counts drop out of that sentence.
  - When K > 0, add: "**K** of them also appear elsewhere ({first two names}, and {n} more) and will disappear from there too."
  - When placements failed, add: "Couldn't check where these cards live, so some may also appear elsewhere."
- **Remove confirm:**
  - "Remove **N** cards from **{page}**?"
  - When K > 0, add: "**K** of them aren't on any other page, app, or report, so they'll be left on no page. They still exist and can be found in Admin > Cards."
  - Button: **Remove**, or **Hold to Remove** when K > 0.

### Implementation plan

0. **Bug fix, its own commit.** Done: `computeIsOwner` derives `WORKSHEET_VIEW` ownership from the parent worksheet's `owners`, the duplicated `TEMPLATE` branch is removed, and the Bug Fixes note is in.
1. **Adopt the shared card pieces.** Import `getCardsForContext` (`src/services/cards.js`), `CardBatchList` (`src/components/views/CardBatchList.jsx`), and `cardUrlOnPage` / `canManageCard` (`src/utils/cardHelpers.js`). DataList's `renderItemDetail` comes through `CardBatchList`. If #9 has not landed, build them first in one commit, exactly to the contract in Shared infrastructure across issues.
2. **Services.**
   - In `src/services/cards.js`, add `removeCardsFromPage` (alphabetical position).
   - In `src/services/pages.js`, add `getCardLocationsOnPage` and `getPageEditState`. Mark `system` on the location entries returned by `getCardLocations`.
3. **Batch helper.** Import `src/utils/batchWithFallback.js` if #6 has landed it. Otherwise add it to the amended signature above in its own commit, and record the amendments in `docs/plans/beta-phase-1-2-retries-concurrency.md`.
4. **Card helpers.** Move `cardHostUrl` from `DeleteObjectView.jsx` to `src/utils/cardHelpers.js` as `cardHostUrlForTab`.
5. **Hold constants.** In `src/utils/constants.js`, add `HOLD_DURATION_FULL = 5000` and `HOLD_DURATION_SHORT = 2500`. Replace `DEFAULT_HOLD_DURATION` in `HoldToConfirmButton.jsx` and `FULL_HOLD_DURATION` / `SHORT_HOLD_DURATION` in `DeleteObjectView.jsx` with them.
6. **View.** Add `src/components/views/DeleteCardsView.jsx`:
   - `getSidepanelData` with a `'deleteCards'` check, `useViewReady`, and `mountedRef`
   - loading through `getCardsForContext({ context, parts: 'datasources,owners,drillPathURNs', tabId })`
   - the run state above (`selectedCardIds`, `statusByCardId`, `progress`, `isRunning`) and an AbortController aborted on unmount
   - the mode `ToggleButtonGroup` (ManageCardLocksView pattern), with selection pruning on mode change
   - quick selects, and the Check Workspaces prompt
   - decorations through `useParallelFetches`, feeding a memoized `renderDetail`
   - `CardBatchList` with `isSelectable` (`access` plus `canManageCard` in Delete mode, the page rule in Remove mode), `unselectableReason`, `chipFor`, `statusLabels`, `rowStatus`, and `isRunning`
   - the footer button
   - an `AlertDialog` with `isOpen={pending && isActive}`, whose confirm is a `HoldToConfirmButton` or a danger `Button` per tier
   - the run through `batchWithFallback` with `onSend` / `onSettled`, then the reload-and-reconcile step described in Data flow, step 6
   - toasts through `useStatusBar().showPromiseStatus`. The promise rejects only when every card failed.
   - the tab redirect or reload described in Data flow, step 6
7. **Button and wiring.**
   - Add `src/components/buttons/DeleteCards.jsx` (the ManageCardLocks pattern, `useLaunchView`, `@icons/row-remove.svg?react`).
   - Add the `deleteCards` key in `src/utils/availableActions.js` inside the page card block, for `PAGE` (ID ≥ 0), `DATA_APP_VIEW`, and `WORKSHEET_VIEW`, behind the gate the cross-issue question settles.
   - Render it in `src/components/ActionButtons.jsx` after `ManageCardOwners`.
   - Add a `slot.type === 'deleteCards'` case to `src/sidepanel/App.jsx`, passing `instance`, `isActive`, `liveContext`, `onBackToDefault`, and `onStatusUpdate`.
8. **Docs.**
   - Add a **Delete Cards** line to `docs/README.md` next to Lock Cards.
   - Add a short mention to `store-listing/STORE_LISTING.txt` and check it stays under 10,000 characters (`.claude/rules/store-listing.md`).
   - Add `DeleteCardsView.jsx` / `isRunning` to the "Which views lock" table in `docs/plans/beta-phase-1-6-run-lock.md`.
   - Add the release note bullets below to `docs/RELEASE_NOTES.md`: the feature under New Features and Improvements, and the worksheet fix under Bug Fixes.
9. **Lint.** Run `npx eslint --no-warn-ignored` on every touched file.

### Edge cases and risks

- **System placements are common.** 31 of 52 cards on one real page were "elsewhere" only through Shared, Favorites, or Overview. How they count changes Only Live Here a lot (open question on system pages). Detail lines always name them.
- **Placement speed depends on the fast path.** Without `adminsummary` (report pages, some views, users it refuses, or a repeated 429), the per-card path took 32 s for 52 cards. The list and actions stay usable during that time. Only the quick select, detail lines, and the confirm dialog wait, and the banner shows a counter.
- **Fast-path placements have no kind**, so they are named but not linked. In theory a different-kind page could share this page's numeric ID and be dropped from the list. The per-card path is exact.
- **Layout template leftovers on layout dashboards.** Bulk remove cleans `content` but leaves `template` slots there, the same as Domo Admin. Classic pages and App Studio views came out clean. This needs a visual check on a layout dashboard. If it leaves gaps, a follow-up could tidy the template through the layout writelock and `PUT /api/content/v4/pages/layouts/{id}`. That is out of scope unless the check fails.
- **Concurrent edit mode.** Someone saving a stale layout in Domo's editor could put removed cards back. No warning is shown, because there is no evidence this happens.
- **All-or-nothing endpoints.** One bad ID fails a whole chunk (verified). The per-card fallback isolates it. Cards that vanished count as done after the refresh.
- **404 for a card the user can't access.** It is unknown whether this is 403 or 404. The refresh rule only counts a 404 as done when the card is gone from the page, so a hidden card is never reported as deleted.
- **Custom app (`domoapp`) cards.** Deleting one removes that app instance from the page. Shown with an "App" chip.
- **Locked cards.** Shown with a lock badge. In Delete mode, a locked card the user can't manage (`canManageCard` false) is disabled up front. The server may still refuse others, which shows as a row error.
- **Large pages.** Chunks of 50 keep the `cardIds` query string short. `adminsummary` pages at 100, and alerts batch at 500.
- **No undo.** Delete through these endpoints is permanent, and the copy says "permanently".
- **Cards left on no page by Remove** still exist but are hard to find. The copy warns and points to Admin > Cards.
- **Panel closed mid-run.** Until 1.6 lands this cannot be blocked. In-flight chunks finish, the abort stops the rest, and reopening the view shows the current cards.

### Testing and verification

- **Baseline.** `yarn dev` is usually already running (`lsof -nP -iTCP:31573 -sTCP:LISTEN`). Watch the HMR output and run ESLint on each touched file. There is no `/dev-*` route for the side panel, so use the CRXJS dev extension loaded from `dist/`.
- **Visual.** Run `node scripts/ext-shot.js sidepanel --live` with a Domo dashboard open and Delete Cards showing. Check the toggle, quick selects, detail lines, disabled rows, footer, the confirm dialog's waiting state, and the run badges, in light and dark.
- **Read-only live checks:**
  - **Page `888329385`:** fast-path placements and detail-line counts (13 only here, 31 through system pages only).
  - **Page `106095392`:** the stacks 404 fallback builds rows through `getCardsForContext`, and `getPageEditState` reads `isOwner: false`.
  - **A worksheet page:** the button gate, and `isOwner` after the `computeIsOwner` fix. As a worksheet page owner without `content.admin`, the page's Delete button is now enabled.
  - **Report page `1535023132`:** the per-card path is used if report pages are approved.
- **Write checks, on scratch objects only:**
  1. Create a layout dashboard, a classic page, and a scratch App Studio app. Create four cards on a dataset you own. Put one card on two of the pages.
  2. Only Live Here picks the exclusive cards. Also on Other Pages picks the shared one.
  3. Remove on each surface. The card leaves the page and still exists, the tab reloads, and a layout dashboard shows no blank gap (this is the template check).
  4. Delete the rest. Check the toasts and row badges (spinner on the chunk being sent, then check or X). The shared card should be gone from its other page too.
  5. Open one card's details in the Domo tab, delete it from the view, and confirm the tab is redirected to the page.
  6. Delete a selected card from another tab first. The chunk 404s, the fallback runs, and the vanished card counts as deleted.
  7. Delete everything you created and confirm each object reads back as 404 or `[]`.
- **Permissions.** On a non-production instance, sign in as a `content.card.edit` user without `content.admin`. Check the button gate, that a locked card they don't own is disabled in Delete mode, whether `adminsummary` answers (fast path or fallback), and what Remove does on a page they don't own.
- **Regression.** Single card delete and page delete still redirect correctly after `cardHostUrl` moves. Hold durations are unchanged after the constants move. Rename Cards still works if #9 landed first (shared `CardBatchList` and `getCardsForContext` unchanged by this issue).

### Design decisions made

- **Side panel view, not a modal.** Every action view lives there. The `*Modal.jsx` files are read-only drill-ins.
- **One view with a Delete / Remove toggle.** Same list and selection, a different endpoint. This follows the ManageCardLocksView Lock/Unlock pattern. Whether Rename joins as a third mode is a cross-issue question.
- **Use `DELETE /api/content/v1/cards/bulk/pages` for remove.** It is Domo's own `Page.moveDeleteCards` and Admin `remove_from_pages`, and it was verified on layout, classic, and App Studio pages.
- **No child rows. Placements live in the detail line.** DataList renders badges only on leaf rows, and Open All walks child rows. Fast-path placements can't be linked anyway, because they have no kind.
- **The detail line uses the shared `renderItemDetail` prop.** DataList renders neither `item.metadata` nor a visible annotation, and #9's diff needs the same slot, so DataList gains one prop instead of two.
- **Cut Open Selected and the per-card viewer.** Get Cards' Open All and Get DataSets already cover them.
- **Count drills, but only name Card Beast Modes.** Drills are free through `drillPathURNs` (verified). The batched Beast Mode search hit 14,679 results, about 250 s, on a real 52-card page.
- **No shared hook. Run state and decorations live in DeleteCardsView.** #9's executor is a per-card pool with a pre-run re-read, so a hook built around bulk chunks would not fit it. The shared loader and list carry the real reuse.
- **Load through `getCardsForContext` with stacks `parts` and no hydrate.** Stacks returns every row field, and a v1 re-read would drop the per-card `access` flag.
- **Placements: `adminsummary` first, per-card fallback, same shape as `getCardLocations`.** 0.47 s against 32 s at the code's real concurrency, with identical results on `888329385`. The fallback is required: it returns 0 on report pages, missed a fresh view, and can 429.
- **After a run, a card missing from the refreshed list counts as done.** A second delete of a gone card returns 404 (verified). Whether a 404 can also mean "no access" is unknown, so the 404 alone proves nothing.
- **Nothing selected by default.** Delete is destructive, unlike Lock, which selects all.
- **Chunks of 50, run serially, with per-card fallback only on a 4xx other than 429.** Both endpoints are all-or-nothing (verified). This follows phase 1.2's rule about not splitting under throttling.
- **Row progress through `batchWithFallback`'s `onSend` and `onSettled`, not an `onProgress` callback.** A chunk needs a "sending" signal to show its spinner, and the same two hooks serve #6's progress count and the 1.3 journal's `start` and `record`.
- **Delete-mode selectability uses `canManageCard`.** It is Domo's own `canManageKpi` rule, the same one Rename Cards uses, so locked cards the user can't manage are disabled up front instead of failing per row.
- **Confirm waits for placements, alerts, and embeds to settle.** Its copy and hold tier depend on them. When a lookup failed, it says so and takes the full hold.
- **Remove's "left on no page" ignores system pages.** Shared, Favorites, and Overview are other users' personal pages. Remove does not touch them, and the user cannot manage the card from there.
- **`access: false` rows can't be selected.** Stacks marks them per card on App Studio views. Better to block them up front than let them fail per row.
- **Redirect the tab off a deleted card's details, otherwise reload the page.** `reloadTabIfViewingObject` alone would reload into a dead card. Single card delete already does this redirect through `cardHostUrl`.
- **Distinct icon (`row-remove.svg`).** The always-visible page Delete already uses the trash icon.
- **Dropped the "edit mode anywhere" warning.** The race it warned about is only inferred, and the warning would add noise to every confirm.
- **The `computeIsOwner` fix ships on its own.** It fixes a shipped Delete gate on worksheet pages, separate from this feature.
- **Corrected from the draft:** single card and page deletes hold (5 s) only when embeds exist, and `SHORT_HOLD_DURATION` is used only for dataset and dataflow downstream impact. Nothing scales holds by placements or alerts today, so the hold strength is posed as an open question rather than as matching existing tiers. "Report Builder deliveries no longer support Delete" refers to scheduled report deliveries, not report pages, so it is no reason to exclude report pages.

### Release notes draft

- Pages, App Studio pages, and worksheet pages have a new Delete Cards button that deletes the cards you select, or removes them from the page, in bulk. ([#8](https://github.com/brycewc/domo-toolkit/issues/8))
- Owners of a worksheet page can now delete it without being a content admin. _(separate bug fix commit, no issue link; confirm worksheet pages shipped in the last release before logging)_

## #6: Find and Replace Columns in Beast Modes Bulk

### Summary

**Problem.** When a column is renamed, retired or superseded (`Region` replaced by `Sales Region`, `Amount` by `Net Amount`), someone has to open and edit every Beast Mode formula that names the old column. A widely used column can sit in dozens of Beast Modes across many datasets and cards. On domo.domo.com a read-only scan found **84 Beast Modes on 24 datasets** that reference `Region`. **47 of the 84 are saved to a card** rather than to the dataset, and two spellings appear, `Region` (52) and `region` (32).

**Who benefits.** Dataset owners and admins who restructure schemas, people consolidating duplicate datasets, and anyone getting ready for an upstream column rename.

**Interpretations considered.**

1. **Replace the column reference in Beast Mode formulas, on one or many datasets or across the instance (chosen).** The user finds a column by name, optionally scoped to one or more datasets, and replaces every reference to it with another column name in the formulas of the Beast Modes that use it. Both dataset Beast Modes and card Beast Modes are covered.
2. **Rename the column on the dataset, then repair everything.** Not planned. Domo's UI already renames columns, and Remap Columns already repairs a dataset's downstream content once a rename leaves broken references.
3. **General text find and replace inside formulas** (function names, literals). Not planned. That is a different and riskier tool. The matcher stays token-based, so it could be added later.
4. **Also rewrite cards, dataflows and views across many datasets.** Not planned for v1 (open question). The issue names Beast Modes, and the per-dataset cross-type rewrite already exists in Remap Columns.

The issue says "a sidepanel function instead of in the floating button". The floating button is the popup: `ActionButtons` renders in both `src/popup/App.jsx:74` and `src/sidepanel/App.jsx:597`. The new button therefore shows in both, and a popup press opens the side panel through `launchView` (`src/utils/sidepanel.js`, which calls `openSidepanel()` right away to keep the user gesture). The view itself lives only in the side panel, as the issue asks.

### Scope check

**Can a user already do this easily in Domo's UI? No.** Confirmed from Domo's frontend bundle (`datacenter-dae408ae508144b9.chunk.built.js`, the Data Center Beast Mode Manager):

- **Search filters:** name, dataset, card, owner, type (dataset or card), active or inactive, locked, archived, invalid, nested, and "using calculation" (`templateDependencies`). None of them filters by the columns a formula references, and the bundle never sends the API's `column` filter.
- **Bulk actions** (`dcBeastModeBulkService`, gated on the `beast-mode-bulk-update` switch and Content Admin, capped at 100 selected): lock, unlock, change owner, duplicate to dataset, archive, unarchive, delete. None of them edits a formula.
- **Formula edits** happen one Beast Mode at a time, in the Beast Mode Manager editor or in Analyzer.

Both halves are new: finding the Beast Modes that use a column, and editing them all at once. Nothing is cut.

**What already exists in this codebase that overlaps** (re-checked for this pass):

| File                                                                                                                                                                 | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Gap or reuse                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/services/columnRewriter.js` `rewriteBeastModeColumns(template, columnMap)`                                                                                      | Deep-clones and walks the template. `expression` goes through `rewriteExpressionString` (BACKTICK_REF_RE via `replaceExpressionRefs`, so comments and string literals are skipped). `columnPositions[].columnName` is rewritten by the plain COLUMN_VALUE_FIELDS branch (case 3 of `walkAndRewriteColumns`), since `columnPositions` is not in COLUMN_LIST_FIELDS. `rewriteColumnName` handles the backticked form. The template's own top-level `name` is never touched (only `name` under a column-list parent). | Reused as is. Lookup is `columnMap[colName]`, an exact match, so the caller builds the map from the spellings it actually found.                                   |
| `src/services/columnFields.js` `eachExpressionRef`, `BACKTICK_REF_RE`, `QUALIFIED_REF_RE` (line 149)                                                                 | Comment- and string-aware reference iteration; the qualified pattern captures `` `table`.`col` ``.                                                                                                                                                                                                                                                                                                                                                                                                                 | Reused for matching. The qualified pattern detects data model refs.                                                                                                |
| `src/services/columnRewriter.js` `rewriteScopedExpressionString` (line 767, private)                                                                                 | Rewrites `` `alias`.`col` `` refs only for known aliases.                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Not used in v1, since data model Beast Modes are left out (see Design). It is the starting point if they come in later.                                            |
| `src/services/columnReferences.js` `fetchDatasetSchemaColumns`                                                                                                       | Reads `schemas/latest`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Reused to check targets. Returns 0 columns for a data model (VERIFIED-LIVE), one more reason data models are excluded.                                             |
| `src/utils/datasetTypes.js` `isDataModelType(details)`                                                                                                               | `dataProviderType === 'data-model'` on a datasources response.                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Reused to flag data model datasets from the bulk details read.                                                                                                     |
| `src/utils/columnOrphans.js` `indexColumnNames`, `resolveColumnName`                                                                                                 | Case-insensitive column resolution.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Reused for target checks.                                                                                                                                          |
| `src/utils/columnMatching.js` `suggestReplacement`                                                                                                                   | Remap Columns' best-guess replacement.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Reused to pin a suggested Replace option at the top of the list.                                                                                                   |
| `src/utils/beastModeLinks.js` `beastModeSaveTarget`, `datasetIdFromBeastModeLinks`                                                                                   | Card or drill save target; owning dataset.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Reused for grouping and the starting scope.                                                                                                                        |
| `src/services/remapDatasetColumns.js` `remapBeastModes`, private `buildBeastModeUpdateEntry` (line 124)                                                              | Remap Columns' Beast Mode phase: one dataset, orphaned columns only, a single `updateDatasetFunctions` call (line 249).                                                                                                                                                                                                                                                                                                                                                                                            | Single dataset, repair only. Its save path is **not** changed by #6 (that is beta 1.2 step 6). Only its private four-field strip is swapped for the shared helper. |
| `src/services/migrateBeastModeUsage.js` `buildNestingUpdateEntry` (line 135), private `describeBeastModeUpdateError` (line 204), `updateDatasetFunctions` (line 351) | Repoints one Beast Mode's usage. Holds a second copy of the four-field strip, and translates `ILLEGAL_DEPTH` and "Function links cannot be updated" into user copy.                                                                                                                                                                                                                                                                                                                                                | The error translator moves to `functions.js` and is exported for reuse. Save path not changed.                                                                     |
| `src/services/migrateDownstreamContent.js` (line 2299)                                                                                                               | Writes Beast Modes in one `updateDatasetFunctions` call inside a try/catch that already pushes one error per write. Entries come from `buildBeastModeEntry(..., { overwriteOf })`.                                                                                                                                                                                                                                                                                                                                 | Not touched. Its fallback is beta 1.2's job.                                                                                                                       |
| `src/services/functions.js`                                                                                                                                          | `getDatasetFunctionsForDatasets` (dataset Beast Modes only), `getCardBeastModes` (line 372) and `getBeastModesSavedOnCard` (line 306) (card Beast Modes), `findUnusedFunctions`, `hydrateFunctionTemplates` (drops failed reads silently), `transferFunctions` (page-side chunks of 100), `updateDatasetFunctions` (throws for the whole batch, no `status`).                                                                                                                                                      | Four copies of the same paged `functions/search` loop already exist. #6 adds one general page function rather than a fifth copy (see Design).                      |
| `src/components/views/RemapColumnsView.jsx`, `src/components/buttons/RemapColumns.jsx`                                                                               | Dataset action that maps broken references. Uses `src/assets/icons/column-edit.svg`.                                                                                                                                                                                                                                                                                                                                                                                                                               | Cannot replace a column that still exists, cannot span datasets. The new button needs a different icon.                                                            |
| `GetBeastModesView.jsx`, `ColumnUsagesModal.jsx`                                                                                                                     | Read-only Beast Mode and column-usage lists.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | List patterns reused.                                                                                                                                              |
| `DeleteUnusedBeastModesView.jsx` (line 221)                                                                                                                          | Batches of 50, a failed batch retried one id at a time; locked rows start unselected.                                                                                                                                                                                                                                                                                                                                                                                                                              | The pattern beta 1.2 generalizes into `batchWithFallback`.                                                                                                         |
| `src/components/SqlBlock.jsx`                                                                                                                                        | Prism-highlighted SQL with a case-insensitive substring `query` highlight.                                                                                                                                                                                                                                                                                                                                                                                                                                         | Gets a small whole-identifier highlight prop (see Design).                                                                                                         |

### API and platform findings

All live calls went to domo.domo.com. Tags: VERIFIED-LIVE (called and saw the response), VERIFIED-CODE (already used in `src/` the same way), SPEC-ONLY, INFERRED.

**1. Search Beast Modes:** `POST /api/query/v1/functions/search`. VERIFIED-LIVE and VERIFIED-CODE.

```json
{
  "filters": [{ "field": "dataset", "idList": ["<uuid>"] }, { "field": "notvariable" }],
  "limit": 1000,
  "offset": 0,
  "sort": { "ascending": true, "field": "created" }
}
```

- Leave out `dataset` to search the whole instance: `totalHits: 94338`, `hasMore`, `degraded: false`. `limit: 1000` pages through all of it in 95 pages. The search returns nothing without a `sort` (documented in `findUnusedFunctions`, VERIFIED-CODE).
- Result keys (VERIFIED-LIVE): `activeLinks, archived, certificationStatus, created, dataType, global, id, lastModified, legacyId, links, locked, name, owner, status`. **No `expression`.** Each link carries `resource {type, id}`, `visible`, `active`, `valid`.
- Exactly one `DATA_SOURCE` link per result (5,000 sampled). On a card Beast Mode that link is `visible: false`, and the card or drill is the visible link (`beastModeSaveTarget`, VERIFIED-CODE).
- **No server-side column filter works.** Valid filter types (from a 400): `active, archived, beastmode, card, column, created, dataset, datatype, function, global, inactive, legacyid, legacyidList, link, locked, modified, name, nested, noowner, notNested, notarchived, notglobal, notvariable, owner, status, templateDependencies, unlocked, variable`. Sixteen payload shapes for `column` (`value`, `idList`, `name`, `columnList`, `resources[]`, `<dsid>:<col>`, wildcard and others) left `totalHits` unchanged. VERIFIED-LIVE. Matching has to happen on the client.
- `certificationStatus` instance distribution (full scan, VERIFIED-LIVE): absent 70,986, `PENDING` 11,989, `EXPIRED` 11,363, `CERTIFIED` 0. Domo's datacenter bundle builds `certification = e.certification || { state: e.certificationStatus }` and branches on `NOT_CERTIFIED`, `EXPIRED`, `CERTIFIED`, `PENDING` and `REQUESTED`, so all five are real states. 6 of the 84 `Region` hits are `PENDING`.
- `locked`: 116 Beast Modes instance-wide, 0 of the 84 `Region` hits.

**2. Bulk expression read:** `POST /api/query/v1/functions/template/expressions`, body `[177, 182, 183]`, response `[{ "id": 182, "expression": "case\n    when `last_touch_channel` = 'Organic Search' then '..." }]`. VERIFIED-LIVE: 1,000 ids in about 220 ms. Domo's datacenter bundle calls it. Not in the OpenAPI spec, not yet used in `src/`.

**Scan cost.** A serial run of 95 pages (search plus expressions, all expressions shipped to the caller) took 98 s in one measurement and 186 s in another that included process overhead. Plan for **one to three minutes** instance-wide. Filtering inside the page (Design) cuts the transfer to only the candidates.

**3. Full template:** `GET /api/query/v1/functions/template/{id}?hidden=true`. VERIFIED-CODE (`getFunctionTemplate`) and VERIFIED-LIVE. Keys: `aggregated, analytic, archived, cacheWindow, certificationStatus, checkSum, columnPositions, created, dataType, expression, functionTemplateDependencies, functions, global, hidden, id, lastModified, legacyId, links, locked, name, nonAggregatedColumns, owner, status, variable`.

**4. Save:** `POST /api/query/v1/functions/bulk/template`, body `{ "update": [template, ...], "links": {}, "strict": false }`. VERIFIED-CODE (`updateDatasetFunctions`) and VERIFIED-LIVE on scratch Beast Modes.

- Response: `{ "created": [], "updated": [<full template>], "deleted": [], "archived": [], "links": {} }`.
- **The server recomputes derived fields from the expression.** `columnPositions`: a stale array came back corrected (``[{columnName: '`New Col`', columnPosition: 7}]``), and a ref inside a `--` comment got no position. `nonAggregatedColumns`: a scratch ``SUM(`Amount`) * IFNULL(`Old Col`, 1)`` was created with `['Old Col']`, updated to `New Col` with the stale `['Old Col']` still in the body, and came back and re-read as `['New Col']`. The field is derived from the parse: template 551602 lists `ca_name`, which appears only in the Beast Mode it nests (551580). `nonAggregatedExpressions` shows up only in create and update responses (echoed stale there) and is absent from GET, so a template read through `getFunctionTemplate` never carries it. All VERIFIED-LIVE. The client maintains none of these.
- **The batch is atomic.** One bad entry (nonexistent id) failed the whole call with `400 "Templates being updated, archived, or deleted must have a valid ID"`, and the valid entry beside it was not saved. VERIFIED-LIVE.
- **Links go back unchanged**, and `functionTemplateDependencies` is dropped. Otherwise Domo rejects the update ("Function links cannot be updated using the update template endpoint") or a nested Beast Mode. VERIFIED-CODE (`migrateBeastModeUsage.js` comments; both builders strip `checkSum`, `created`, `lastModified`, `functionTemplateDependencies`).
- **A missing target column is saved, not rejected.** `` `Ghost Column` `` saved with `status: "VALID"`, and the `DATA_SOURCE` link came back `valid: "ILLEGAL_REFERENCE"`. VERIFIED-LIVE.
- **Every edit sets `certificationStatus: "EXPIRED"`**, even on a Beast Mode that was never certified. This was tested with no certification field, with `certification: { state: 'NOT_CERTIFIED' }`, and with `certificationStatus: 'NOT_CERTIFIED'`. EXPIRED came back every time. VERIFIED-LIVE. Domo's own editor does the same: a save sets `certification = { state: 'EXPIRED' }` whenever the current state is not `NOT_CERTIFIED`. So editing a `CERTIFIED` Beast Mode drops its certification, and editing a `PENDING` or `REQUESTED` one cancels the open request. The client cannot prevent either.
- **`checkSum` is not enforced.** A PUT with a made-up `checkSum` succeeded. VERIFIED-LIVE. There is no optimistic concurrency.
- **Error copy.** `ILLEGAL_DEPTH` and the links rejection are already translated by `describeBeastModeUpdateError` (VERIFIED-CODE).

**5. Single update (fallback):** `PUT /api/query/v1/functions/template/{id}`, full template as body. SPEC-ONLY (`updateFunction`) and VERIFIED-LIVE on a scratch Beast Mode. Returns the updated template.

**6. Dataset schema:** `GET /api/data/v2/datasources/{id}/schemas/latest`, reading `schema.columns[].name/type`. VERIFIED-CODE (`fetchDatasetSchemaColumns`). No bulk form: `part=schema` on `/data/v3/datasources/bulk` returns 400 (VERIFIED-LIVE). One call per affected dataset (24 in the `Region` example), pooled.

**7. Dataset details:** `POST /api/data/v3/datasources/bulk?includePrivate=true&includeAllDetails=true`, body `[ids]`. VERIFIED-CODE (`getDatasetDetailsForList`). Gives `name` and `dataProviderType`. The three data model datasets (below) report `data-model` (VERIFIED-LIVE). **Card titles:** `getCardsByIds` (VERIFIED-CODE).

**8. Data model Beast Modes.** A full scan found 40 expressions with `` `table`.`column` `` refs. 38 of them sit on three data model datasets: `0bce01d1-f575-4922-923c-5ce93461917c`, `7ac75807-84dc-4b53-a976-ffa54a963886` and `77641ae4-6c61-48ea-a197-875b0564c64d`. Example, template 546295: ``DATEDIFF( `DateTrends_MultipleCalendars`.`COMMON_DATE`, `ProductKeyMetrics_Enriched_Final`.`Consumption Close Date` )``. A data model's `schemas/latest` returns **0 columns**. Its `GET /api/query/v1/datasources/{id}/schema/indexed` returns `tables[].columns[].name` in the qualified form `` `DateTrends_MultipleCalendars`.`COMMON_DATE` ``. All VERIFIED-LIVE. Two consequences: BACKTICK_REF_RE splits a qualified ref into two tokens, so whole-token matching would rewrite `` `orders`.`Region` `` and `` `customers`.`Region` `` alike, and a table named like the Find text too. And target validation through `schemas/latest` would flag every row as missing.

**9. Dataset search to narrow an instance-wide scan: rejected.** The free-text `query` on `/api/data/ui/v3/datasources/search` matches column names only loosely: for `Region`, 3 of the top 25 of 3,062 hits had the column. No column filter exists. VERIFIED-LIVE.

**10. Card Beast Modes update through the template endpoint.** INFERRED, strongly:

- A card's `kpi/definition` `formulas[]` entry carries `templateId` and a `formula` identical to the template `expression` (card `791190909`, template `391920`; VERIFIED-LIVE).
- The same entries carry `referenceCount` and `usedByOtherCards`, which aggregate across cards and cannot be stored per card. So the list is assembled from the template store when it is read. VERIFIED-LIVE observation, INFERRED conclusion.
- Five card Beast Modes (templates 551763, 552286, 552270, 551858 and 551738) have a template `lastModified` about seven months after their card's `modified`, and their card formulas still equal the template expressions. VERIFIED-LIVE, though `lastModified` may have moved for a non-formula change.
- Domo's Beast Mode Manager save `N(e)` routes a card Beast Mode (`!persistedOnDataSource`) into `saveUpdateBeastMode`, a template update with `{description, expression, id: templateId||id, name, owner, status, persistedOnDataSource, archived, certification}` (bundle).
- A scratch card to settle this beyond doubt could not be created in this pass. `PUT /api/content/v3/cards/kpi?pageId=-100000` (SPEC-ONLY `createCard`) returned an unexplained 400 three times against a scratch dataset that had a schema but no data. The dataset reported `cardCount: 0` before deletion, so nothing was created. That check moves to implementation step 0.

**11. Permissions.**

- Authority `content.card.edit`: "Create, edit and delete Cards, Drill views, and Beast Modes to which you have access" (authority dataset `073c76f1-c846-48fd-876c-34d98d89a07b`, VERIFIED-LIVE).
- Domo's Beast Mode Manager enables "Edit formula" via `disabled: !(p() || !g())`, with `p() = tb.default.on("dataset.admin") || r.data.owner === n` and `g()` returning `locked` (bundle). So a locked Beast Mode is editable only by its owner or a `dataset.admin` holder. The plan mirrors this, and the per-item save reports the server's verdict either way. Server enforcement for a non-owner was not testable with an admin token (INFERRED).
- `userRights` in `availableActions.js` is `currentContext.user.metadata.USER_RIGHTS` (VERIFIED-CODE).

**12. Matching semantics.** Domo resolves formula refs case-insensitively (`src/utils/columnOrphans.js` documents a `` `next step date` `` ref valid against `Next Step Date`; VERIFIED-CODE). A reference is one whole backticked token. Refs inside comments and strings are not references: `eachExpressionRef` masks them, and the server ignored a commented ref in `columnPositions` (VERIFIED-LIVE).

**13. Prism tokenization.** Prism's SQL grammar tokenizes `` `Region` `` as an `identifier` whose backticks are separate `punctuation` children (`node_modules/prismjs/components/prism-sql.js:18-24`, VERIFIED-CODE). So in `SqlBlock` the inner name is its own segment, while comments and strings are whole `comment`/`string` segments.

### Design

**Where it lives.** A new side panel view, `replaceBeastModeColumns`, launched by a new action button in the expandable action bar. The button renders in both the popup and the side panel, and both launch into the side panel.

**Enabled contexts** (`src/utils/availableActions.js`):

- Every dataset type except data models, inside the existing `if (isDataset)` block after `remapColumns`, skipped when `typeId === 'DATA_MODEL'`. Scope starts as that dataset.
- `BEAST_MODE_FORMULA`, next to `migrateBeastModeUsage`. Scope starts as the Beast Mode's dataset (`datasetIdFromBeastModeLinks`), and its referenced columns (`extractBeastModeColumnRefs`) are the first Find suggestions.
- Rights gate: pending open question (recommendation: `content.card.edit` or `content.admin`).
- No feature switch: `beast-mode-bulk-update` gates only Domo's own bulk UI, not the API.

**Data flow.** Everything runs in the side panel document and reaches the page through `executeInPage`, so the page's session authenticates each request. The background only does the usual `launchView` and `getSidepanelData` handoff.

```
Side panel view
  1. scan:   one executeInPage per search page: search (limit 1000) + template/expressions
             for that page + an in-page prefilter; returns candidates only. Pool of 2 pages.
             Exact match on the side panel with eachExpressionRef.
  2. enrich: dataset details (bulk: name, dataProviderType), schemas of affected datasets
             (pool 5), card titles (bulk)
  3. plan:   per match -> rewrite preview via rewriteBeastModeColumns, flags, default selection
  4. apply:  fresh read of each selected template (pool 5), skip changed or done ones,
             rewrite from the fresh copy, save through batchWithFallback (chunks of 50)
  5. result: per-item outcome, change log, Undo, Find Again
```

**In-page prefilter.** The injected page function receives the lowercased Find text and keeps an expression only when `expression.toLowerCase().includes('`' + find + '`')`. This needs no imports. It is a strict superset of the exact match, because every true ref (any case, qualified or not) contains that substring. Only candidates (`id`, `expression` and the search metadata) cross the `chrome.scripting` bridge. The side panel then runs the exact check: comment- and string-aware `eachExpressionRef`, case-insensitive whole-token comparison, and data model detection. This settles the earlier contradiction: one injected call per page, with a pool of 2 pages in flight. Offsets are known once page 1 returns `totalHits`.

**Shared search page function (in `src/services/functions.js`).**

```js
export async function searchFunctionsPage({ expressionFilter = null, filters, limit = 1000, offset, tabId })
// -> { degraded, hasMore, results: Array<searchResult & { expression? }>, scanned, totalHits }
```

With `expressionFilter` (a lowercased needle) it also reads `template/expressions` for the page and returns only the results whose expression contains it. Without it, it returns the plain search page. This is the general form of the loop that `getDatasetFunctionsForDatasets`, `getCardBeastModes`, `getBeastModesSavedOnCard` and `findUnusedFunctions` each copy. #6 does not migrate those four (follow-up), but it adds no fifth copy.

**New service: `src/services/beastModeColumnReplace.js`**

```js
export async function applyColumnReplacement({ column, onProgress, replacement, rows, tabId })
// -> { changedSinceScan: [{ id }], failed: [{ error, id }], log: [{ after, before, datasetId, id, name }],
//      skippedDone: [{ id }], succeeded: [{ id }] }

export function planColumnReplacement({ column, currentUser, detailsByDatasetId, matches, replacement, schemasByDatasetId, userRights })
// -> PlanRow[] = Match & { canEdit, certification, defaultSelected, isCardBeastMode, isDataModel,
//                         newExpression, targetMissing, typeChange }

export async function revertColumnReplacement({ log, onProgress, tabId })
// -> same shape as applyColumnReplacement; writes `before` back where the current expression still equals `after`

export async function scanBeastModesForColumn({ column, datasetIds = null, isCancelled, onProgress, tabId })
// -> { archivedCount, degraded, matches: Match[], scanned, stoppedEarly, total }
// Match = { activeLinkCount, certificationStatus, datasetId, expression, hasQualifiedRef, id, legacyId,
//           locked, name, owner, refCount, saveTarget, spellings: string[] }
```

- **Matching.** `eachExpressionRef(expression, BACKTICK_REF_RE, ...)`, keeping refs where `match[1].toLowerCase() === column.toLowerCase()`. Every distinct spelling goes into `spellings`. A second pass with `QUALIFIED_REF_RE` sets `hasQualifiedRef` when a match has a second group.
- **Rewrite.** `columnMap = Object.fromEntries(spellings.map((s) => [s, replacement]))`, then `rewriteBeastModeColumns`. Mapping each real spelling makes the exact-match rewriter case-insensitive in effect. No new rewriter.
- **Data models excluded in v1** (pending open question): a row is `isDataModel` when `isDataModelType(details)` is true for its dataset, or when `hasQualifiedRef` is set. Such rows are listed but disabled.
- **`canEdit`.** `!locked || String(owner) === String(currentUser.id) || userRights.includes('dataset.admin')`.
- **`certification`.** `'certified'` for `CERTIFIED`, `'requested'` for `PENDING` or `REQUESTED`, otherwise null.
- **`targetMissing`.** `resolveColumnName(replacement, indexColumnNames(schemaNames))` is null on the row's dataset. A failed schema read gives `null` ("Couldn't check").
- **`typeChange`.** Both columns are on the schema and their `type` differs.
- **`defaultSelected`.** `canEdit && !isDataModel` and no warning flag (`certification`, `locked`, `targetMissing !== false`, `typeChange`). Informational chips (Card Beast Mode) do not deselect.
- **Archived.** The scan leaves out `notarchived`, so archived matches are counted in `archivedCount` and listed read-only (pending open question).

**Changes in `src/services/functions.js`** (exports kept alphabetical per `code-style.md`):

- `searchFunctionsPage` (above).
- `saveFunctionTemplate({ tabId, template })`: the single `PUT /template/{id}`, throwing with `error.status`.
- `updateDatasetFunctions` already attaches `status` to its thrown error (pre-existing bug 5), so `canFallBack` can branch on it.
- `toBeastModeUpdateEntry(template)`: deep clone, delete `checkSum`, `created`, `lastModified`, `functionTemplateDependencies`. `remapDatasetColumns.js`'s `buildBeastModeUpdateEntry` is identical and is replaced by it. `migrateBeastModeUsage.js`'s `buildNestingUpdateEntry` starts from it. This is a pure refactor and does not touch either save path.
- `describeBeastModeUpdateError(err)`: moved from `migrateBeastModeUsage.js`, exported, imported back there.

**Batch save: `src/utils/batchWithFallback.js`**, built to the signature and semantics of `docs/plans/beta-phase-1-2-retries-concurrency.md` section 6, if 1.2 step 6 has not landed yet:

```js
batchWithFallback(items, { canFallBack, chunkSize, profile, sendBatch, sendOne });
// -> [{ error, item, ok, partial? }] in input order
```

- The default `canFallBack` falls back only on a definite 4xx other than 429. A 5xx or an exhausted 429 marks the whole chunk failed without firing single calls.
- Chunks run serially. `profile` is accepted, and each send goes through `withRetry(fn, { profile })` once `src/utils/retry.js` (1.2 step 3) exists. Until then it calls `fn` directly. The view passes `RETRY_SAFE`, since 1.2 classes Beast Mode bulk `{update}` as safe to repeat.
- `sendBatch` is `updateDatasetFunctions`, `sendOne` is `saveFunctionTemplate`, and `chunkSize` is 50.
- Only the new view uses it in #6. Moving Remap Columns, Migrate Beast Mode Usage, Migrate Downstream Content and `transferFunctions` onto it stays with 1.2 step 6, whose caller table already lists them.

**`src/components/SqlBlock.jsx`: whole-identifier highlight.** Add an optional `identifiers` prop (an array of names). A segment is marked when its className contains `token identifier` but not `punctuation`, and its text matches a name case-insensitively. Comments and strings are separate token types, so they are never marked, and `Region Code` is a different identifier. The existing `query` substring behavior stays as it is for `DataflowInspector`.

**State shape (view):**

```js
{
  applyProgress: { done: 0, total: 0 },
  column: '',
  page: 'find' | 'scanning' | 'review' | 'applying' | 'results',
  replacement: '',
  results: null | { changedSinceScan, failed, log, skippedDone, succeeded },
  rows: [],                        // PlanRow[]
  runKind: null | 'apply' | 'undo',
  scan: { archivedCount: 0, degraded: false, scanned: 0, stoppedEarly: false, total: 0 },
  scope: { datasets: [{ id, name }], mode: 'datasets' | 'all' },
  selectedIds: new Set()
}
```

**Concurrency and failure handling.**

- **Scan.** Pool of 2 page calls. A cancel flag is checked before each page is issued. A failed page is retried once, after re-resolving the tab with `getValidTabForInstance(instance)`, which covers a tab that navigated or reloaded. Then the scan stops and shows partial results. A `degraded: true` page raises a banner.
- **Enrich.** Schema reads in a pool of 5. A failed read leaves `targetMissing: null`.
- **Apply, fresh read (per beta 1.4 and D2).** Re-read each selected template with `getFunctionTemplate` in a pool of 5, recording a per-row failure "Couldn't read the current formula." for a failed read. `hydrateFunctionTemplates` does exactly this and now returns its `failures` (pre-existing bug 5), so it can be used here.
  - The fresh template has no ref to the Find column: record `skippedDone` ("Already up to date").
  - The fresh `expression` differs from the scanned one: skip as `changedSinceScan`. This is a strict equality check, so an edit that touched only a comment or whitespace is also skipped. That is acceptable, since it errs toward not writing an unreviewed change.
  - Otherwise rewrite the **fresh** template through `toBeastModeUpdateEntry` and `rewriteBeastModeColumns`, then hand it to `batchWithFallback`. The fresh `before` goes into the log.
- **Tab changes mid-run.** Before each chunk, `getValidTabForInstance(instance)` re-resolves the tab. If no tab on the instance is left, the run stops, the unsent rows are reported as "Not attempted: no Domo tab for this instance is open.", and Results lists them.
- **Panel closes mid-run.** Unsent chunks are never sent. Each item is atomic, so nothing is half-written. Until beta 1.3 lands nothing records the run. Download Change Log is only offered afterward.
- **Run lock.** While scanning, applying or undoing, the view passes `unsupportedReason: 'Wait for the run to finish'` to `buildReloadAction` (an existing parameter, VERIFIED-CODE), and its own Back and Cancel buttons are disabled except the scan's Cancel. Once beta 1.6 lands the view calls `useRunLock(isRunning, 'Replace Columns in Beast Modes')`, which also covers close, popup launches and action bar launches. The view is added to 1.6's "Which views lock" table.
- **Validation.** Find is non-empty after trimming and differs from Replace (case-insensitive). Neither may contain a backtick. Replace may contain spaces and punctuation, since the rewriter re-wraps it in backticks.

**Undo and the change journal.** Undo reuses `applyColumnReplacement`'s machinery in reverse: fresh read, write `before` only where the current expression still equals `after`, and save through `batchWithFallback`. Beta 1.3's journal (`docs/plans/beta-phase-1-3-change-journal.md`) has no Restore action (it is listed as out of scope there). So Undo is not a second copy of a planned rollback. When 1.3 lands, the view records each item through `createRunJournal({ feature: 'replaceBeastModeColumns', subject })` with `before`/`after` expressions, Download Change Log becomes the journal download, and Undo reads its `log` from the run's entries. The in-session log array then goes away.

### UX

**Entry point.** Button **Replace Columns in Beast Modes**, icon `src/assets/icons/column-arrows-in.svg` (present and unused in `src/`, so it doesn't clash with Remap Columns' `column-edit.svg` or Migrate Content's `swap-horizontal.svg` on the same bar). It sits right after Remap Columns in `ActionButtons.jsx`.

- Tooltip, with no trailing period to match Remap Columns: "Find a column in Beast Mode formulas and replace it with another column, on this dataset or across the instance"
- Remap Columns' tooltip stays as is, so the two read as repair versus replace.

**View title.** `DataList` feature string **Replace Columns in Beast Modes on**. The subject is the dataset name, "3 DataSets" with several, or "All DataSets" instance-wide. The view carries the `beta` chip.

**Flow.**

1. **Find.** Pick the scope, a Find column and a Replace column, then press **Find Beast Modes**.
2. **Scanning.** Progress bar and **Cancel**.
3. **Review.** Beast Modes grouped by dataset, with card Beast Modes nested under their card. Each row shows chips and an expandable before and after formula. Select rows, then press **Replace in N Beast Modes**.
4. **Confirm.** AlertDialog with **Replace**. It becomes a HoldToConfirmButton **Hold to Replace** when the selection includes a certified or certification-requested Beast Mode.
5. **Applying.** Progress bar, no cancel.
6. **Results.** Outcome per Beast Mode, plus **Download Change Log**, **Undo Changes**, **Retry Failed** (when any failed), **Find Again** and **Done**.

**Find screen**

```
+----------------------------------------------------------+
| [icon] Replace Columns in Beast Modes on                 |
|        Sales Pipeline                     [Beta]   [x]   |
|----------------------------------------------------------|
| Search in                                                |
|  (o) These datasets                                      |
|      [Sales Pipeline  x] [Sales Pipeline (EMEA)  x]      |
|      [ Add a DataSet...                       v ]        |
|  ( ) All Beast Modes in this instance                    |
|      Scans every Beast Mode. This can take one to three  |
|      minutes on a large instance.                        |
|                                                          |
| Find column                                              |
|  [ Region                                     v ]        |
|  Matches any capitalization, like Domo does.             |
| Replace with                                             |
|  [ Sales Region                               v ]        |
|  Checked against each dataset's columns after the scan.  |
|                                                          |
|                         [ Find Beast Modes ]             |
+----------------------------------------------------------+
```

Both radio labels are sentence case. Find and Replace are Autocompletes over the sorted union of the scoped datasets' columns, with free text allowed. Replace pins `suggestReplacement(find, columns)` at the top when it returns one. In instance-wide mode both fields are free text.

**Scanning**

```
| Scanning Beast Modes...                                  |
| [###########...............]  41,000 of 94,338          |
| 37 Beast Modes found so far                   [ Cancel ] |
```

**Review**

```
+----------------------------------------------------------+
| 84 Beast Modes on 24 DataSets use `Region`               |
| (i) `Sales Region` is missing on 3 of these datasets.    |
| (i) 2 archived Beast Modes also use `Region` and were    |
|     left alone.                                          |
|----------------------------------------------------------|
| [v] [db] Sales Pipeline                           12     |
|    [x] Region Rollup                                     |
|    [ ] Win Rate by Region       [Locked]                 |
|    [ ] Quota Region   [Certification requested]          |
|    [ ] Region Code    [Target missing]                   |
|    [v] [card] Pipeline by Region   [Card Beast Mode] 2   |
|        [x] Region Label                                  |
|  > Before  CASE WHEN `Region` = 'West' THEN ...          |
|    After   CASE WHEN `Sales Region` = 'West' THEN ...    |
| [>] [db] Date Trends Product Metrics   [Data model]  1   |
|----------------------------------------------------------|
| [ Back ]          [ Replace in 80 Beast Modes ]          |
+----------------------------------------------------------+
```

**Chips (exact copy, with tooltips):**

- `Card Beast Mode`: "Saved to this card, not to the dataset." Informational, the row stays selected.
- `Locked`: "Locked. You can edit it because you own it or manage datasets." When the user cannot edit it, the row is disabled and the tooltip reads "Locked by its owner. Only the owner or someone who can manage datasets can edit it."
- `Certified`: "Editing a certified Beast Mode expires its certification."
- `Certification requested`: "This Beast Mode has an open certification request. Editing it cancels the request."
- `Target missing`: "`Sales Region` isn't a column on this dataset. The Beast Mode will show an invalid reference until it is added."
- `Couldn't check`: "This dataset's columns couldn't be read, so the replacement column wasn't checked."
- `Type changes`: "`Region` is text and `Sales Region` is a number on this dataset. Check that the formula still makes sense."
- `Data model`: "Formulas on a data model name a table as well as a column. Edit this one in Domo." The row is disabled.

**Default selection.** One rule: an editable row starts selected unless it carries a warning chip (Locked, Certified, Certification requested, Target missing, Couldn't check, Type changes). Rows the user cannot edit and data model rows are disabled. Before and after formulas render in `SqlBlock` with `identifiers={[...row.spellings]}` (before) and `identifiers={[replacement]}` (after).

**Confirm dialog**

- Title: **Replace `Region` in 80 Beast Modes?**
- Body: "Each selected Beast Mode's formula will reference `Sales Region` instead. Cards using these Beast Modes pick up the change right away."
- Added when any certified rows are selected: "**2** certified Beast Modes will lose their certification."
- Added when any certification-requested rows are selected: "**1** open certification request will be canceled."
- Buttons: **Cancel** and **Replace**, or **Cancel** and HoldToConfirmButton **Hold to Replace** when either line above applies.

**Applying**

```
| Replacing `Region` in Beast Modes...                     |
| [#############.............]  Saved 50 of 80            |
```

**Results**

```
| Replaced `Region` in 77 of 80 Beast Modes                |
| [ok] Sales Pipeline            11 replaced               |
| [!]  Sales Pipeline (EMEA)     8 replaced, 1 failed      |
|        Region Filter: You don't have permission to edit  |
|        this Beast Mode.                                  |
| [-]  Marketing Leads           1 skipped (edited after   |
|                                the scan), 1 already up   |
|                                to date                   |
|----------------------------------------------------------|
| [ Download Change Log ] [ Undo Changes ] [ Retry Failed ]|
| [ Find Again ]                                 [ Done ]  |
```

- **Retry Failed** re-runs apply on the failed rows only (fresh read again). Succeeded rows drop out of the selection, following beta 1.5.
- **Find Again** returns to Find with the same scope and fields, so a fresh scan shows what is left.
- Failure text goes through `describeBeastModeUpdateError`. A 403 maps to "You don't have permission to edit this Beast Mode." Any other error shows Domo's message.

**Undo confirm**

- Title: **Undo Changes to 77 Beast Modes?**
- Body: "Each Beast Mode's formula goes back to referencing `Region`. Beast Modes edited since the replacement are skipped. Certification and certification requests don't come back, and this counts as another edit to each Beast Mode."
- Buttons: **Cancel** and **Undo Changes** (plain AlertDialog, no hold: it restores reviewed text and cannot cost a certification that has not already gone).
- Progress: "Restoring 50 of 77...". Results reuse the Results layout with the title "Restored the original formula of 75 of 77 Beast Modes".

**States and copy.** Toast titles are Title Case. Descriptions end with a period.

- **Loading context:** the standard view spinner.
- **Empty result:** toast **No Beast Modes Found**, "No Beast Modes on **Sales Pipeline** reference `Region`." Instance-wide: "No Beast Modes in this instance reference `Region`." The view stays on Find.
- **Only archived matches:** toast **No Beast Modes Found**, "Only archived Beast Modes reference `Region`, and they were left alone."
- **Validation:** inline field errors "Enter the column to find.", "Choose a different column to replace it with." and "Column names can't contain backticks."
- **Scan cancelled:** Review shows what was found so far, with the banner "The scan was stopped after 41,000 of 94,338 Beast Modes. Results may be incomplete."
- **Scan failed:** ErrorAlert "Couldn't search Beast Modes: <message>." with **Try Again**.
- **Degraded search:** banner "Domo reported partial search results. Some Beast Modes may be missing."
- **Permission denied:** without the gating right the button does not render. Rows the user cannot edit are disabled. A 403 on save shows as that row's failure.
- **Partial failure:** toast **Some Beast Modes Not Updated**, "Replaced `Region` in 77 Beast Modes; 3 couldn't be updated.", warning.
- **Full failure:** toast **Beast Modes Not Updated**, "None of the selected Beast Modes could be updated.", danger.
- **Success:** toast **Beast Modes Updated**, "Replaced `Region` with `Sales Region` in 80 Beast Modes.", success.
- **Tab lost mid-run:** toast **Replacement Stopped**, "No Domo tab for this instance is open, so the remaining Beast Modes weren't updated.", warning.
- **Row notes:** "Skipped: edited after the scan.", "Already up to date.", "Couldn't read the current formula.", "Not attempted: no Domo tab for this instance is open."
- **Undo success:** toast **Changes Undone**, "Restored the original formula of 77 Beast Modes."

### Implementation plan

0. **Live check before UI work: card Beast Mode propagation (finding 10).** On a scratch dataset with a data version (create it with `POST /api/data/v1/streams` (`createStreamAndDataset`, SPEC-ONLY) and upload one CSV row, since a schema-only dataset rejected card create), create a scratch card through `PUT /api/content/v3/cards/kpi?pageId=-100000` with one card-level formula. Update that template through `bulk/template`, re-read `kpi/definition`, and confirm `formulas[].formula` changed. Then save the card once through the same PUT with the formulas it returned, and confirm the template keeps the new expression. Delete the card (`DELETE /api/content/v1/cards/bulk?cardIds=`, VERIFIED-CODE), the template and the dataset. If the card holds its own copy, card Beast Modes drop out of v1.
1. **`src/utils/batchWithFallback.js` (new, unless 1.2 step 6 landed).** Implemented to 1.2 section 6 (default `canFallBack`, serial chunks, input-order results). `withRetry` is used when `src/utils/retry.js` exists.
2. **`src/services/functions.js`.** Add `searchFunctionsPage`, `saveFunctionTemplate`, `toBeastModeUpdateEntry`, and `describeBeastModeUpdateError` (moved). Swap the private strips in `src/services/remapDatasetColumns.js` (`buildBeastModeUpdateEntry`, removed) and `src/services/migrateBeastModeUsage.js` (`buildNestingUpdateEntry`'s first five lines) for `toBeastModeUpdateEntry`, and import `describeBeastModeUpdateError` in `migrateBeastModeUsage.js`. No save-path change in either.
3. **`src/components/SqlBlock.jsx`.** Add the `identifiers` prop.
4. **`src/services/beastModeColumnReplace.js` (new).** `applyColumnReplacement`, `planColumnReplacement`, `revertColumnReplacement`, `scanBeastModesForColumn`. Reuses `eachExpressionRef`, `BACKTICK_REF_RE`, `QUALIFIED_REF_RE` (`columnFields.js`), `rewriteBeastModeColumns` (`columnRewriter.js`), `fetchDatasetSchemaColumns` (`columnReferences.js`), `isDataModelType` (`utils/datasetTypes.js`), `indexColumnNames`/`resolveColumnName` (`utils/columnOrphans.js`), `beastModeSaveTarget`/`datasetIdFromBeastModeLinks` (`utils/beastModeLinks.js`), `getFunctionTemplate`, `getDatasetDetailsForList`, `getCardsByIds`, `getValidTabForInstance` (`utils/currentObject.js`) and `batchWithFallback`.
5. **`src/components/buttons/ReplaceBeastModeColumns.jsx` (new).** Same shape as `RemapColumns.jsx`: `useLaunchView`, `type: 'replaceBeastModeColumns'`, the label, the tooltip and `IconColumnArrowsIn` from `@icons/column-arrows-in.svg?react`.
6. **`src/utils/availableActions.js`.** Add `replaceBeastModeColumns` in the `isDataset` block (skipped for `DATA_MODEL`) and in the `BEAST_MODE_FORMULA` branch, behind the rights gate the open question settles.
7. **`src/components/ActionButtons.jsx`.** Render the button right after the `remapColumns` block (lines 288-289) behind `availableActions.has('replaceBeastModeColumns')`.
8. **`src/components/views/ReplaceBeastModeColumnsView.jsx` (new).**
   - Find: RadioGroup, `DatasetComboBox` adding entries shown with `FittedTagGroup`, and one Autocomplete per column following `RemapColumnsView`'s virtualized `BrokenColumnRow` pattern.
   - Scanning and Applying: ProgressBar.
   - Review and Results: `DataList` with `selectionMode`, `beta`, `itemActions={['copy']}`, groups by dataset and card, `DataListItem`, `AlertStatusIcon`, and the `ViewHeader` banner.
   - Formulas: `SqlBlock` with `identifiers`.
   - Confirm: `AlertDialog`, with `HoldToConfirmButton` (`src/components/buttons/HoldToConfirmButton.jsx`) when certification is at stake.
   - Change Log: `exportToExcel` and `generateExportFilename` (`utils/exportData.js`), with columns DataSet, Card, Beast Mode, ID, Before, After and Outcome.
   - Plumbing: `useStatusBar`, `useViewReady`, and `getSidepanelData` checking `data.type === 'replaceBeastModeColumns'` (as `RemapColumnsView` does).
   - Reload: `buildReloadAction({ viewType: 'replaceBeastModeColumns', unsupportedReason: isRunning ? 'Wait for the run to finish' : undefined, ... })`. No `headerActions.jsx` change, since it resolves `viewType` through `getAvailableActions`.
9. **`src/sidepanel/App.jsx`.** Import the view and add `slot.type === 'replaceBeastModeColumns'` next to `remapColumns` (line 562). A grep for the sibling `deleteUnusedBeastModes` shows views are enumerated only in `App.jsx`, `availableActions.js`, `ActionButtons.jsx` and the button, so that list is complete.
10. **Docs.**
    - `docs/RELEASE_NOTES.md` WIP bullet (below).
    - `store-listing/STORE_LISTING.txt` at release time, per `store-listing.md`.
    - Add the view to the lock table in `docs/plans/beta-phase-1-6-run-lock.md`, and note `batchWithFallback`'s first consumer in `docs/plans/beta-phase-1-2-retries-concurrency.md` section 6.
    - `docs/CONTRIBUTING.md` does not list views, so it needs no change.
11. **Lint.** `npx eslint --no-warn-ignored` on every touched file.

**Shared with other work.** `batchWithFallback` belongs to beta 1.2 step 6, and #6 is just its first consumer. Undo and Change Log move onto the 1.3 journal when it lands. Run-lock behavior moves to 1.6's `useRunLock`. The fresh-read and changed-since-scan rules follow 1.4/D2, and Retry Failed follows 1.5. `searchFunctionsPage` is the shared paged search the four existing loops can adopt later.

### Edge cases and risks

- **Case variants.** `` `region` `` and `` `Region` `` both match (32 and 52 in the real example). Each spelling is mapped explicitly.
- **Comments and string literals.** A `-- Region` comment or a `'Region'` literal is left alone, consistent with Domo's `columnPositions`. The prefilter may pass such an expression through, and the exact matcher drops it.
- **Partial-name collisions.** `` `Region Code` `` does not match `Region`, in the matcher or in the highlight.
- **Beast Mode named like the column.** It keeps its name, since the rewriter only touches `name` under column-list parents (VERIFIED-CODE).
- **Nested Beast Modes.** `DOMO_BEAST_MODE(<id>)` calls are untouched. A nested child that references the column is its own match. The parent's `nonAggregatedColumns` is recomputed by the server.
- **Data model Beast Modes** (40 expressions instance-wide) are listed but disabled in v1. A data model dataset never gets the button.
- **Variables** are excluded (`notvariable`). **Archived** matches are counted, not edited.
- **Card Beast Modes** are 56% of real hits, and their propagation is settled in step 0 before UI work.
- **Drill Beast Modes** (saved to `dr:<drillId>:<rootId>`) take the same template path and group under their root card.
- **Target already in the formula.** Fine, the formula references it twice.
- **Type change** (STRING to LONG) can break a formula at query time while the server still saves it VALID. The chip warns and the row starts unselected.
- **Large instances.** One to three minutes for about 94k Beast Modes. The scan is cancellable with progress, and only candidates are held in memory.
- **Concurrent edits.** No `checkSum` enforcement, so the fresh read is the only guard. A short window between re-read and write remains, which is acceptable.
- **Certification.** Any edit sets EXPIRED. This was tried three ways and cannot be avoided from the client. Certified and requested rows are opt-in with a hold.
- **Undo after another edit.** Revert skips Beast Modes whose current expression is not the `after` text. Undo is another `lastModified` bump and does not restore certification.
- **Owner and lastModified.** `owner` survives because the full template goes back. `lastModified` shows the editor.
- **No change to shipped save paths.** Remap Columns, Migrate Beast Mode Usage and Migrate Downstream Content keep their atomic save until 1.2 step 6. #6 touches them only through the identical field-strip swap and the moved error translator.
- **Panel close mid-run** before 1.6 and 1.3 cannot be prevented, and leaves no record. Writes are per item, so nothing is half-written.

### Testing and verification

- **No `/dev-*` route.** Use the CRXJS dev extension while `yarn dev` runs, and `node scripts/ext-shot.js sidepanel --live` with a dataset page open to capture Find, Review, Results and the Undo confirm in light and dark themes. Check the popup button with `node scripts/ext-shot.js popup --live`.
- **Step 0 card check** (above), before any UI work.
- **Live checks on a scratch dataset** named `domo-toolkit-probe-6-<purpose>`, created and deleted for the purpose:
  1. Beast Modes referencing `` `Old Col ``, one with a commented ref, one lowercase `` `old col` ``, one `` `Old Col Code` ``. Replace with `New Col`. The first two update, the comment stays, `Old Col Code` is untouched, and `columnPositions` and `nonAggregatedColumns` come back right.
  2. Replace with a missing column. The row shows Target missing and starts unselected. Opted in, it saves with `links[].valid === 'ILLEGAL_REFERENCE'`.
  3. Edit a Beast Mode in Domo between scan and apply: it is reported as edited after the scan.
  4. Delete one selected Beast Mode in Domo before apply: its chunk falls back on the 400, and the rest save.
  5. Undo restores the originals and skips one edited in between.
  6. Navigate the Domo tab to another page mid-apply: the run continues on the re-resolved tab. Close the tab: the run stops with the tab-lost toast.
- **Read-only instance-wide check** on domo.domo.com: progress reaches `totalHits`, Cancel stops between pages, and `Region` finds about 84 Beast Modes on about 24 datasets, with 6 showing Certification requested and the data model dataset rows disabled.
- **Highlight:** `Region Code`, a `'Region'` literal and a commented ref are not highlighted in the before formula.
- **Permission:** with a non-admin test user, the button follows the chosen gate, and a Beast Mode locked by someone else is disabled (or, when forced, fails with the permission row note).
- **Regression** for the refactor: Remap Columns on a dataset with orphaned Beast Mode refs, and Migrate Beast Mode Usage on a nesting parent, behave as before, including the `ILLEGAL_DEPTH` message.
- **Lint:** ESLint on every touched file.

### Design decisions made

- **Client-side matching with an in-page prefilter.** No server column filter works (16 shapes tried live). The superset prefilter needs no imports and keeps the bridge to candidates only.
- **One injected call per page, pool of 2.** This resolves the draft's overlap contradiction. Offsets are known after page 1.
- **Dataset search does not narrow an instance-wide scan.** Measured precision was 3 in 25 with unknown recall.
- **Card Beast Modes are included,** subject to step 0. They are 47 of 84 real hits, and three read-only signals plus Domo's own editor point to the template endpoint.
- **Whole-token, case-insensitive matching that ignores comments and strings,** which is how Domo resolves refs (`columnOrphans.js`). The server ignored commented refs in `columnPositions`.
- **Reuse `rewriteBeastModeColumns` with a spelling map.** No new rewriter, and scanner and rewriter stay in lockstep through `columnFields.js`.
- **Do not maintain `columnPositions` or `nonAggregatedColumns`.** Both were recomputed server-side from a stale body (VERIFIED-LIVE). `nonAggregatedExpressions` never appears on a GET template. So `toBeastModeUpdateEntry` strips only the four existing fields.
- **Build `batchWithFallback` to the 1.2 spec and wire only the new view.** This avoids a duplicate helper and keeps #6 off the shipped save paths, whose retrofit 1.2's caller table already owns. It also drops the draft's mistaken claim that `migrateDownstreamContent.js:2299` callers expect a throw (they don't).
- **Fall back only on a definite 4xx.** That is 1.2's `canFallBack` default. Firing single calls at a 5xx makes a struggling instance worse.
- **Fresh read, strict changed-since-scan, and "already up to date" skip,** per 1.4/D2. `getFunctionTemplate` is used directly so a failed read becomes a row failure.
- **Certification-requested rows are treated like certified ones** (own chip, unselected, hold). An edit cancels the request, and on domo.domo.com requests outnumber certifications 11,989 to 0.
- **One default-selection rule:** a warning chip means unselected. That covers the draft's unspecified Couldn't check, Type changes and Review chips.
- **Detect data models with `isDataModelType(details)` plus `QUALIFIED_REF_RE`,** not `isDataModelDefinition`, which needs a view definition the plan never fetches.
- **Whole-identifier highlight in `SqlBlock`.** The existing substring `query` would mark `Region Code`, literals and comments, and Prism splits backticks off identifiers, so a backticked query would match nothing.
- **Distinct icon `column-arrows-in.svg`.** `column-edit.svg` is Remap Columns' icon, and `swap-horizontal.svg` is Migrate Content's.
- **Tooltip without a trailing period** to match Remap Columns. Radio labels in sentence case.
- **Interim run lock through `buildReloadAction`'s `unsupportedReason`,** then `useRunLock` when 1.6 lands.
- **Undo stays in-session and moves onto the 1.3 journal later.** The journal plan has no Restore action, so Undo is not a duplicate rollback.
- **Error copy through `describeBeastModeUpdateError`,** moved to `functions.js` and exported.
- **One find and replace pair per run in the UI,** though the service takes a map. It keeps the review readable.
- **The button shows in the popup too.** `ActionButtons` is shared, and a popup press opens the side panel through `launchView`.
- **No Remap Columns release note in #6.** The atomic save did ship in v1.9.0 (`git show refs/tags/v1.9.0:src/services/remapDatasetColumns.js`, line 249). But #6 no longer changes it, so that bullet belongs to 1.2.

### Release notes draft

- Added Replace Columns in Beast Modes, which finds every Beast Mode that uses a column on one or more datasets, or across the whole instance, and replaces it with another column in bulk. ([#6](https://github.com/brycewc/domo-toolkit/issues/6))

## #80: Update Code Engine Functions in a Custom App to the Latest Version

### Summary

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
- **C. Start from a Code Engine package and update every app that uses it.** Deferred to a follow-up (Open Questions). The service is shaped to take that scope later.
- **D. "Latest" means the newest version, unreleased included.** Rejected. The target is the newest **released** version, matching Update Action Versions. The user can pick any released version per package.

### Scope check

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

### API and platform findings

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

### Design

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
| `inherited`   | `source === 'design'`                                                            | per Open Question 1 (recommended: shown read-only with the design's pin)                                                 |
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

### UX

**Entry point:** an action button with `IconPackage` labeled **Update Code Engine Versions**.

- Tooltip on a card: "Update the Code Engine function versions this app card uses".
- Tooltip on a design: "Update the Code Engine function versions used by this app's cards".

**Flow:**

1. Click the button. The side panel opens with a spinner and "Loading Code Engine functions...".
2. The view header shows the app name, with subtext counts and the Beta chip.
3. A **Target versions** block lists each package with its `Select`.
4. On a card, rows are grouped by package. On a design, cards are `DataList` items with their rows as `children` (DataList's built-in Disclosure sections). Cards with nothing to change start collapsed.
5. Outdated rows are preselected. Changing a target re-runs the wiring check, and the footer shows "Checking wiring..." with the button disabled.
6. Click **Update Versions**. A promise toast runs, and the view refreshes in place.

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
| [          (Hold to) Update Versions          ]   |
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

### Implementation plan

1. **Separate bug fix first (not #80).** **Done**, see [Pre-existing bugs found by the plans](#pre-existing-bugs-found-by-the-plans) item 2. `swapAppColumns` now reads and saves through `/api/apps/v1/instances/{instanceId}` alone. #80 should do the same rather than use rows 3, 8, 9 and 10 above, since the project is moving off endpoints outside `/api`. The save in step 4 and the "Save with POST context, PUT context, PUT instance" decision need revisiting on that basis.
2. **Pool helper.** If `docs/plans/beta-phase-1-2-retries-concurrency.md` step 2 hasn't landed, add `src/utils/promisePool.js` with the same `promisePool(taskFns, concurrency)` signature as `ActivityLogTable.jsx:1846`, and leave moving that call site to the 1.2 work.
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
9. **View, design scope (phase 2).** Add the design scope: `DataList` (`src/components/views/DataList.jsx`) items per card with rows as `children`, the skipped-instance subtext, a pooled write, and the multi-card confirmation per Open Question 3 (`src/components/buttons/HoldToConfirmButton.jsx` if chosen).
10. **Docs and lint.** Run `npx eslint --no-warn-ignored` on every touched file. Tick or remove `docs/TODO.md` line 9 ("Update code engine functions in a custom app to the latest version"). Add the WIP bullets to `docs/RELEASE_NOTES.md`. Update `STORE_LISTING.txt` only if its feature list changes, keeping it under the cap.
11. **Follow-up (separate change, Open Question 2).** A package-side entry from `GetUsageView` on the `instances` group, reading instances from #12 (or #11 per version), feeding the same service with a `packageId` scope.

Shared work: the change journal (`docs/plans/beta-phase-1-3-change-journal.md`) should record `{ instanceId, cardId, alias, from, to, contextIdBefore, contextIdAfter }` per write when it lands, so a bump can be rolled back. Retries come from 1.2 and the run lock from 1.6.

### Edge cases and risks

- **Runtime resolution is inferred.** It must be confirmed on a scratch app before shipping (Testing). If it turns out wrong, the feature changes nothing a user can observe.
- **Miswired-at-pin cards are common** (62 of 549 own bindings). Bumping them doesn't fix them. The view shows the mismatch, and whether to offer a re-sync is Open Question 4.
- **Version-only change can break a call.** The target can require an input that the wiring doesn't fill, or remove one it binds. Those rows are review-only and never preselected. A deleted function is blocked.
- **Nested schemas.** Output and input `children` are checked by name, so a renamed nested field lands in review rather than being treated as safe.
- **Several versions of one package on one card.** The per-package target moves them all, and each alias is classified separately.
- **Unreleased and `latest` pins.** These are guarded by `isStrictSemver` and never preselected.
- **Deleted packages** are common (41% of slots on domo.domo.com, mostly one template). They are shown as unavailable and never written.
- **Inherited aliases.** Writing them would change "follows the design" into "pinned" (Open Question 1). The recommended default never writes them.
- **Own aliases not in the design version.** Domo's editor drops them on its next save. The view keeps them and shows an info chip.
- **Concurrent edit.** The `context.id` check runs against a fresh read inside the same page call that writes. A window of a few hundred milliseconds remains.
- **A card open while updating** keeps the old iframe until reload. The card-scope toast offers Reload Page.
- **Card titles with special characters** are encoded with `URLSearchParams`, which Domo's own call does not do.
- **Non-owners and locked cards** may get a 403, reported per card. The chip warns in advance.
- **Cross-customer designs** return 404. On the card scope the view still works from own pins only.
- **Large designs.** At most 8 cards were seen on one design, and the 1000-urn card batches and pool of 3 cover far more.
- **The swapAppColumns fix** changes a shipped behavior (a revert to design pins). Confirmed on a scratch card and logged; see [Pre-existing bugs found by the plans](#pre-existing-bugs-found-by-the-plans) item 2.

### Testing and verification

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

### Design decisions made

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

### Release notes draft

- App cards and app designs now have an Update Code Engine Versions button that moves their Code Engine functions to the latest released package version and flags functions whose wiring no longer matches. ([#80](https://github.com/brycewc/domo-toolkit/issues/80))
- Remapping columns or migrating content on a pro-code app card no longer resets the card's Code Engine and workflow versions to the app design's. _(separate bug fix, not #80; confirm the reset on a scratch app before logging)_

## #43: Move a Page

### Summary

The issue has a title and no body. I listed every plausible reading and checked each one against Domo's UI (frontend bundles fetched from `cdndomo.com`) and against the live instance:

| #   | Interpretation                                                                                                                      | What Domo offers today                                                                                                        | Planned?           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| A   | Change a dashboard page's parent: make a top-level page a subpage, make a subpage top level, or move a subpage under another parent | Only a bulk **Move dashboard** action in Admin > Dashboards, which many users can't reach. Nothing on the dashboard itself.   | **Yes**            |
| B   | Reorder pages within one level of the nav                                                                                           | The **Manage dashboards** dialog: drag reorder per user, plus a company default order for admins                              | No, already easy   |
| C   | Move an App Studio page from one App Studio App to another                                                                          | App Studio **Add page > Import app content** copies pages into the current app. Deleting the source is a separate, easy step. | No (open question) |
| D   | Turn a dashboard into an App Studio page                                                                                            | App Studio **Import dashboard content**, a copy with an option to reference the original cards                                | No, already easy   |
| E   | Turn an App Studio page into a dashboard                                                                                            | Nothing in Domo. App-only cards and layouts don't carry over.                                                                 | No, out of scope   |
| F   | Move a page between collections                                                                                                     | Collections hold cards, not pages                                                                                             | N/A                |
| G   | Move a page to another instance                                                                                                     | Sandbox and content migration, which are separate products                                                                    | No, out of scope   |

The plan covers **interpretation A**. It is for page owners and content admins who reorganize nav trees. Today they have to:

1. reach Admin > Dashboards, which needs an admin-area authority;
2. search for the page and tick it;
3. open Move and pick a parent from a dropdown that either ignores the depth rules (admins) or offers only top-level pages (everyone else);
4. choose a permission mode whose labels are misleading.

The toolkit does all of that from the page itself. It also shows three things Domo hides:

- the subpages move with the page;
- the permission mode changes who can see the page **and every page above its new location**;
- people who could see only a subpage can lose access to the moved page.

### Scope check

**Can a user already do this easily in Domo?** Only partly, and only from the admin area.

**Admin > Dashboards, bulk action "Move dashboard"** (bundle `admin-f0a6ba0eab00a3cb`, factory `pageActions`, key `ACTION_MOVE`, icon `icon-arrows-fourway`):

- **Reaching it is gated twice** (bundle `21226-04cf2b988d5838a0`). The `/admin/pages` route is registered only inside `ee.default.canSeeAdmin ? (...) : e.when("/admin", { title: "admin/not-authorized" })`. `canSeeAdmin` is true when the user holds any of 20 admin-area authorities: `developer.token.manage`, `developer.token.create`, `gateway.oauth.client.create`, `customer.edit`, `user.session.edit`, `user.edit`, `group.edit`, `authorization.roles`, `user.invite`, `audit`, `profile.achieve.assign`, `saasaas.edit`, `group.admin`, `ui.admin`, `tasks.admin`, `buzz.admin`, `approvalcenter.admin`, `content.admin`, `certifiedcontent.admin`, `entity.attribute.admin`. On top of that, the Pages tab shows only with `content.page.edit` or `content.admin`.
  - Whether a given owner gets in depends on role configuration. On domo.domo.com the default Editor and Participant roles both hold `gateway.oauth.client.create` (VERIFIED-LIVE, `GET /api/authorization/v1/roles/{3,4}/authorities`), so most users here can get in.
  - On an instance whose roles hold none of the 20, a page owner has **no move path in Domo at all**.
- **The modal** ("Confirm move dashboards") offers "Top level dashboard" or "Make subpage", and a required "Who should see this dashboard?" dropdown:
  - "Use permissions for this dashboard" (`ORIGINAL`)
  - "Inherit permissions from top dashboard" (`INHERIT`)
  - "Merge permissions" (`MERGE`)
  - "Remove permissions" (`OWNER_ONLY`)

  INHERIT and MERGE are disabled for a top-level move.

- **The draft got the ownership rule wrong. Move is not ownership-gated in the UI.**
  - The rule that applies is `e.disabled = e.disableForReadOnly ? r.isReadOnlySelected : !p && !!e.checkforPermission && ...`.
  - Move sets `disableForReadOnly: true`, so it is disabled only when a selected row has `subType === "container"`.
  - The owner check `r` (`ownerId !== USER_ID`) is never reached.
  - So the server alone decides who may move what.
- **The parent picker behaves differently for admins and everyone else** (`commonPageSelect`, bundle `62565-0bf011f93d8be6a0`):
  - **Content admins** get admin search (`getAllPagesForAdmin`, which is adminsummary). It lists any page and ignores `max-page-level`, so admins can pick parents the server then rejects with a bare "Bad Request".
  - **Everyone else** gets `getPagesForSearch(false, false, 1, true)`. Because its first argument is `false`, the level cap is 0, so the function keeps only **top-level** pages from the cached nav tree where `pageVisible && sharedView && pageId > 0`, `type !== 'dav'`, and `canMakeChanges()` is true. `canMakeChanges` is `content.page.edit` (or `content.admin`) and (`!locked` or owner). Non-admins therefore can never put a page at level 3 through Domo's UI, even though the server allows a leaf there.

**The dashboard has no move.**

- The page-menu i18n namespace still holds `move-page-title: "Move Page"` and `move-page-description`.
- No code in any of the 1,270 non-locale chunks references those keys.
- The admin chunk is the only caller of `/api/content/v1/pages/bulk/move`.

**Manage dashboards** (`managePagesTree`, a jQuery sortable with `axis: 'y'`) only reorders siblings, through `PUT /api/content/v1/pages/pageorder` (per user) or `/defaultpageorder` (admin). That is interpretation B, which is **cut**.

**App Studio import** (`PUT /api/content/v1/dataapps/{appId}/views/import`) already covers C and D as copies, so they are **cut**. Chaining copy and delete into "Move to App" is an open question.

What the toolkit adds for A, which Domo does not provide:

- an entry point on the page, for anyone the server lets move it, admin-area access or not;
- a destination picker that offers only legal parents, including level-2 parents for non-admins, which Domo's UI never offers;
- the subpages that move along with it;
- an access preview for each mode, covering the moved page, the new parent and the new top page;
- correct labels (Domo's "Inherit permissions from top dashboard" actually copies the **immediate** new parent's list);
- Move Back, plus a written record of the old location.

**Overlap in this codebase** (all paths confirmed present):

- `src/services/pages.js`:
  - `getPageParentPageId` (`GET /content/v1/pages/{id}`, also the `pageParentPage` fetcher in `src/models/DomoObject.js:254`)
  - `getSubpageIds` (`/subpages`)
  - `getChildPages` (adminsummary, with grandchildren in batches of 10 parents, each a single `limit=100` page with no pagination)
  - `getOwnedPages` (paginated adminsummary)
  - `sharePages`
- `src/services/enrichments.js` entry `page-child-pages` fills `metadata.context.childPages`. `src/utils/pageHelpers.js` `waitForChildPages` reads it.
- `src/components/EntityPicker.jsx` is a master/detail picker, static or paginated. Its error state renders only `{error}` in red, with no retry. `src/components/pickers/accountPickerAdapter.jsx` is the only adapter.
- View templates:
  - `src/components/views/SwapAccountView.jsx` pairs a picker with one write and calls `chrome.tabs.reload`.
  - `UpdateDetailsView.jsx` is the write-then-reload template.
  - Side panel slots live in `instanceViews` in `src/sidepanel/App.jsx`, so a result screen survives a tab reload.
- `src/components/buttons/HoldToConfirmButton.jsx` and `src/components/buttons/GetChildPages.jsx` provide the hold control and the button shape (`useLaunchView` plus `preCheck`).
- `src/background.js` `computeIsOwner` sets PAGE `metadata.isOwner` from `details.page.isOwner` (the stacks response).
- The error pattern to copy is `src/services/alerts.js:861` (return `{ ok: false, error }`, with `toe` parsed out of the body).
- These don't help:
  - `Duplicate.jsx` and `duplicate.js` handle users and dataset color rules, not pages.
  - `deletePageAndAllCards` doesn't touch parents.
  - No code in `src/` calls `share/accesslist`, `share/bulk`, `bulk/move`, `pageorder` or `pages/navigation` (grep).

### API and platform findings

All calls went to domo.domo.com. Writes touched only scratch pages and groups created during this work, and all were deleted (see writesPerformed). Tags: VERIFIED-LIVE, VERIFIED-CODE, SPEC-ONLY or INFERRED. UI behavior read from Domo's bundles is cited as "bundle", and server behavior inferred from it is INFERRED.

**1. Move: `PUT /api/content/v1/pages/bulk/move`.** VERIFIED-LIVE.

```json
{ "pageIds": [961358916], "parentPageId": 773211338, "pagePermission": "ORIGINAL" }
```

- **To make a page top level, omit `parentPageId`.** Domo's UI sends `undefined`. Afterward the key is **absent** from `GET /pages/{id}`, not null (VERIFIED-LIVE).
- **`pagePermission`** is `ORIGINAL | INHERIT | MERGE | OWNER_ONLY`. Leaving it out also returns 200 and moves the page (VERIFIED-LIVE), but the toolkit always sends it.
- **Success** is `200` with an empty body.
- **Failure** is `400 {"status":400,"statusReason":"Bad Request","message":"Bad Request","toe":"81K9YG1000-FG227-45Z9E"}`, with no reason under a developer token. Domo's UI looks for `PG-MV0015` ("already a top-level dashboard") and `PG-MV0011` ("already contains a subpage") in `e.data.message`. Whether those codes appear under session auth is INFERRED.
- **Behavior seen live:**
  - The subtree moves with the page.
  - Depth is capped at 3 levels. A leaf can go under a level-2 page. A page with children under a level-2 page returns 400.
  - A top-level page sent to top level returns 400.
  - Moving a page under its own descendant returns 400.
  - A batch with one invalid page fails as a whole.
  - A subpage sent to top level with `INHERIT` returns 200.
- **The moved page lands last among its new siblings.** In the token user's nav, T's children went from `[x, y]` to `[x, y, src]` after the move, and a page moved to top level landed at the last top-level index, 231 of 232 (VERIFIED-LIVE, probe 6). Other users' saved orders are not checked (INFERRED same).
- **`PUT /content/v1/pages/{id}` is not a move path.** With a real parent ID it returns 200 and leaves the parent unset (VERIFIED-LIVE, critique probe).
- **Negative parent IDs are untested.** Whether bulk move accepts or clears a Business-in-a-Box parent (see 4) couldn't be tested without moving a pre-existing page. Not tested, so the view blocks those pages.
- **Permissions:**
  - A content admin moved their own scratch pages (VERIFIED-LIVE).
  - The server rule for non-admins is INFERRED to match Domo's `canMakeChanges`: `content.page.edit` and (unlocked or owner) on the moved page and the destination. It needs a non-admin token to confirm.

**2. What `pagePermission` does.** VERIFIED-LIVE unless marked otherwise. Each probe shared a memberless scratch group to each page.

| Mode         | Moved page S after the move                                                                    | Destination D        | D's top page (level-2 destination)                                                 | Old ancestors     |
| ------------ | ---------------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------- | ----------------- |
| `ORIGINAL`   | unchanged                                                                                      | gains S minus D      | **gains S minus top** (critique probe: TT went from `[rv-gt]` to `[rv-gs, rv-gt]`) | keep S's audience |
| `MERGE`      | S union D                                                                                      | gains S minus D      | gains S minus top (INFERRED, same propagation)                                     | keep S's audience |
| `INHERIT`    | **replaced by D's whole list**, which includes audiences propagated up from D's other subpages | unchanged            | unchanged                                                                          | keep S's audience |
| `OWNER_ONLY` | owners only                                                                                    | unchanged (INFERRED) | unchanged (INFERRED)                                                               | keep S's audience |

Supporting facts:

- **INHERIT copies the immediate parent's list, not the top page's.** In probe 4, S under level-2 page M got `[gb]`, not TT's `[ga, gb]`.
- **INHERIT pulls in audiences from D's other subpages.** In probe 6, T was `[gt, gx]`, where gx came up from T's child X. After S moved under T with INHERIT, S was `[gt, gx]`: it gained gx and lost its own gs. T stayed `[gt, gx]`.
- **INHERIT strips subpage-only audiences from the moved page.** P `[rv-gc, rv-gs]` became `[rv-gs, rv-gt]`, while its child C kept `[rv-gc]` (critique probe). People who could see only C can still see C but no longer P. OWNER_ONLY should do the same by definition (INFERRED).
- **Subpages keep their own lists in every mode.**
- **Sharing a subpage adds its audience to every ancestor's list, and moving it away removes nothing.** So the old parent and old top page keep the moved page's audience.
- **Move Back doesn't restore access.** After the INHERIT move, moving S back to top level with ORIGINAL left S at `[gt, gx]` (probe 6).
- **What propagated access lets people do is INFERRED.** Whether it also shows the ancestor in those people's navigation is uncertain. `sharePages` in `src/services/pages.js` notes that a share alone leaves a page hidden from the recipient's nav until it is marked visible. So "gets access" is the safe wording, not "appears in their nav".

**3. Read a page: `GET /api/content/v1/pages/{id}`.** VERIFIED-LIVE, and VERIFIED-CODE in `getPageParentPageId`.

```json
{
  "pageId": 2102826799,
  "parentPageId": 710730161,
  "owners": [{ "id": 484942694, "type": "USER", "displayName": "Tsuyoshi Fujii" }],
  "type": "page",
  "title": "[JP] Man-Hour Tracking",
  "locked": false,
  "sharedViewPage": true,
  "virtualPage": false,
  "isOwner": false,
  "customPermission": false
}
```

- `parentPageId` is absent on a top-level page.
- `isOwner` is top level here.
- It returned 200 for a page the token user can't open (`pageAccess: false`).

**4. `virtualPage` and Business-in-a-Box (BIB).** VERIFIED-LIVE. **`virtualPage: true` does not mean a Domo Everywhere subscriber page**, so the draft's claim is dropped.

- Of the 16 extra unique rows that `includeVirtual: true` adds to adminsummary, 7 are system or BIB folders (`-100001` Alerts, `-100002` Shared, `-100003` Favorites, `-100012`, `-100015`, `-100016`, `-100017`).
- The other 9 are personal positive-ID pages with `sharedViewPage: false`, for example `214595718` "Adam Favorites", `410252202` "Home" and `856901931` "Copy of Favorites". All return `virtualPage: true` from `GET /pages/{id}`.
- BIB folders (`-100006` "Business-in-a-Box", `-100018` to `-100025`) are `virtualPage: true` in the nav tree.
- Real pages sit under them with **negative parents**. `659772072` "SaaS CEO" has `parentPageId: -100018` and `virtualPage: false`, and adminsummary gives it `parentPageTitle: "SaaS CEO"` (wrong; the folder is "CEO"), `topPageId: -100006` and `topPageTitle: "Start"`. There are 20 such pages on this instance.

**5. Admin destination search: `POST /api/content/v1/pages/adminsummary?limit=50&skip=0`.** VERIFIED-LIVE, and VERIFIED-CODE in `getChildPages` and `getOwnedPages`.

```json
{
  "includePageTitleClause": true,
  "pageTitleSearchText": "Japan Support",
  "orderBy": "parentPageTitlePageTitle",
  "ascending": true,
  "includeDataAppViews": false,
  "includeVirtual": false
}
```

- **Response:** `{ pageAdminSummaries: [{ pageId, pageTitle, pageType, subType, parentPageId, parentPageTitle, topPageId, topPageTitle, owners, locked, cardCount, ... }], totalPageCount, nextOffset }`.
- **Level** is `topPageId ? 3 : parentPageId ? 2 : 1`. This held for all 6,682 rows: 3,422 level 1, 2,427 level 2, 833 level 3, with zero violations.
- **Limits:** `limit` above 100 returns 400.
- **`orderBy`** accepts only `pageTitle`, `parentPageTitlePageTitle`, `parentPageTitle`, `lastModified`, `cardCount` and `ownerName` of those probed; anything else (`pageId`, `id`, `created`, `pageType`, ...) returns a bare 400. Ties are broken by `pageId` ascending, so `parentPageTitle` with one parent yields pure `pageId` order (VERIFIED-LIVE on `942894016`). `getChildPages` uses that for stable pagination.
- **Pagination works with `parentPageIds`.** `limit=10&skip=30` on `[2042050119]` returned the last 6 of `totalPageCount: 36`.
- **Non-admin results are INFERRED.** Domo's UI never sends this search for non-admins.

**6. Non-admin destination source: `GET /api/content/v2/pages/navigation?includeStartPage=true&elevateSharedPage=true`.** VERIFIED-LIVE. This is the tree Domo's non-admin page select reads.

- It returned 231 top-level nodes and 542 in all.
- Each node carries `id`, `title`, `type`, `locked`, `sharedView`, `pageVisible`, `virtualPage`, `owners`, `isOwner`, `childCount`, `hasAccess`, `hierarchy` (0 to 2, so level = `hierarchy + 1`) and `children`.

```json
{ "id": "647407590", "title": "MajorDomo", "type": "page", "locked": true, "sharedView": true, "pageVisible": true,
  "owners": [{ "id": 1813188617, "type": "USER", "displayName": "Bryce Cindrich" }], "isOwner": true,
  "childCount": 2, "hasAccess": true, "hierarchy": 0, "children": [ ... ] }
```

- `children` holds only pages in the caller's nav, while `childCount` is the true total: `2042050119` has `childCount: 36` and `children: []` for the token user.
- Called from Node's `fetch` it returned 400. curl returned 200. The extension calls it with `fetch` from inside the Domo tab, as Domo does, so this only matters for probe scripts.

**7. Subtree.**

- **`GET /api/content/v1/pages/{id}/subpages` returns direct children only, complete.** All 36 for `2042050119` (VERIFIED-LIVE). The `getSubpageIds` JSDoc says "child and grandchild", which is wrong.
- **`getChildPages` truncates at 100 rows per request** (VERIFIED-CODE). Page `942894016` has 107 children on this instance (VERIFIED-LIVE), so Get Child Pages already drops 7 of them today. Paginating with `totalPageCount` fixes both Get Child Pages and the height check.

**8. Access lists: `GET /api/content/v1/share/accesslist/page/{id}?expandUsers=false`.** VERIFIED-LIVE, not yet used in `src/`.

- Response: `{ users: [{ id, displayName, ... }], groups: [{ id, name, userIds, ... }], resource: { id: "2042050119", type: "page" }, totalUserCount: 23 }` (17 user entries and 4 groups for that page).
- The list includes owners and audiences propagated up from subpages, and doesn't mark which entries came from where.
- Non-admin access to it is INFERRED.

**9. Ownership signals.**

- **`GET /api/content/v3/stacks/{id}`** returns `page.isOwner`, which was `true` on owned page `647407590` (VERIFIED-LIVE). The toolkit already reads it (VERIFIED-CODE).
- **The 404 the critique saw from stacks happens on pages the caller can't open.** `2102826799` returned 404 there, and `GET /pages/{id}/access` reported `pageAccess: false`. Owners always have access, so an owner never hits that fallback.
- **`GET /api/content/v1/pages/{id}/access`** returns `{ pageId, ownerId, pageName, owners, pageAccess }` (VERIFIED-LIVE). It is the PAGE detection fallback in `src/models/DomoObjectType.js:1366`, and it has no `isOwner`.

**10. Revoking access: `DELETE /api/content/v1/share/bulk/page/user/{userId}?resourceIds={id,id}` and `.../group/{groupId}?resourceIds=...`.** These are what Domo's admin "Remove access" calls (bundle, function `v` in `pageActions`). INFERRED and not exercised. Needed only if the cleanup open question is answered yes.

**11. Authorities.** VERIFIED-LIVE, from dataset `073c76f1-c846-48fd-876c-34d98d89a07b`, plus bundle.

- `content.admin`: "Manage all Cards, Pages, Apps...".
- `content.page.edit`: "Edit Pages". Domo's `canManagePages` is `["content.page.edit", "content.admin"]`, and its `canUpdateOwnership` is owner plus `canManagePages`, or content admin.
- There is no dedicated move authority.

**Side finding, for the delete flow:** `DELETE /api/content/v1/pages/{id}` cascades to subpages (VERIFIED-LIVE).

### Design

**Where it lives:**

- A **Move Page** button in `ActionButtons`, gated by a new `movePage` key in `getAvailableActions`.
- It launches the side panel view `movePage` from the popup or the side panel.
- No content script work and no options page.

**Enabled when** all of these hold:

- `typeId === 'PAGE'`.
- `Number(id) > 0`, the same check as the existing `getWorkspaces` and `migrateDownstreamContent` gates.
- `userRights.includes('content.admin')`, or (`metadata.isOwner === true` and `userRights.includes('content.page.edit')`). This mirrors Domo's `canUpdateOwnership`; who should see the button is still an open question.

When `isOwner` is `null` the button stays hidden. That only happens when no user is hydrated yet or the caller can't open the page, and neither case is an owner (see API 9).

DATA_APP_VIEW, WORKSHEET_VIEW and REPORT_BUILDER_PAGE never get the action. No feature-switch gating is needed.

**The view refuses two kinds of page with an inline alert:**

- `virtualPage: true` (system, BIB folder and personal pages);
- `parentPageId < 0` (pages inside a Business-in-a-Box folder; see the open question).

**Data flow.** Every API call runs through `executeInPage()` in the Domo tab (session auth).

1. **Button `preCheck`.** `waitForChildPages(currentContext)` gives `subtreeHeight`. A top-level page with grandchildren can't move anywhere, so it returns an `{ empty: true }` toast instead of opening the view.
2. **View mount**, in parallel:
   - `getPageForMove(pageId)` for the parent ID, owners, `virtualPage`, title and `isOwner`;
   - `getPageAccessList(pageId)`;
   - the breadcrumb: `getPageForMove(parentId)`, and its parent when present, giving real titles (adminsummary's BIB titles are wrong, see API 4);
   - the subtree from context.
3. **Destination source.**
   - Content admins get a paginated adminsummary search.
   - Everyone else gets a static list built once from `GET /content/v2/pages/navigation`, flattened and filtered with Domo's own rule: `pageVisible && sharedView && id > 0 && type === 'page' && !virtualPage && hasAccess && (isOwner || !locked)`. Levels come from `hierarchy + 1`.
   - In either mode, a query of only digits also looks the page up by ID through `getPageForMove`.
4. **Picking a row** loads `getPageAccessList` for the destination and, for a level-2 destination, its top page. The top page's ID is the row's `parentPageId`. Results are cached per page ID in a `Map`.
5. **Move.**
   - Call `movePage(...)`. It returns an envelope and never throws.
   - Check with `GET /pages/{id}` that `String(parentPageId ?? '') === String(targetId ?? '')`, where absent means top level. A 200 without the change counts as a failure.
   - Refetch the page's access list for the result screen.
   - Call `chrome.tabs.reload(tabId)`.
6. **Move Back** repeats the call with the original parent (or none) and `ORIGINAL`.

**Error envelope (fixes the draft).** `executeInPage` carries back only `{ message, name, status }` (`src/utils/executeInPage.js:226-240`), so a thrown `toe` never arrives. On origins that block eval, a throw even reads as `null`. `movePage` therefore returns `{ ok: true }` or `{ ok: false, status, toe, message }`, built inside the injected function as in `alerts.js:861`. The read helpers keep the codebase's throw-with-status style.

**New pure helpers (`src/utils/pageMove.js`):**

- `pageLevel(row)`: `topPageId ? 3 : parentPageId ? 2 : 1` for adminsummary rows, `hierarchy + 1` for nav nodes.
- `subtreeHeight(pageId, childPages)`: 1, 2 or 3.
- `destinationVerdict(dest, { height, blockedIds, currentParentId })` returns `{ ok }` or `{ ok: false, reason }`, where `reason` is one of:
  - `self`: the page itself or one of its descendants;
  - `current`: the current parent;
  - `tooDeep`: `level + height > 3`;
  - `notPage`;
  - `special`: a negative ID, `virtualPage`, or a negative parent or top page.
- `PERMISSION_MODES`: an ordered array of `{ key, label, describe(names), availableAtTop }`.
- `previewAccess(mode, { source, ancestors, owners })`. `ancestors` is `[{ id, title, list }]` for D, plus the top page when D is level 2. It returns `{ pageAfter, gains, losses, ancestorGains: [{ id, title, added }], subpageOnlyWarning }`. Entries are keyed `user:<id>` and `group:<id>`.
  - **Keep:** `pageAfter = S`, and each ancestor A gains `S minus A`.
  - **Combine:** `pageAfter = S union D`, `gains = D minus S`, and each ancestor gains `S minus A`.
  - **Use parent's access:** `pageAfter = D`, `gains = D minus S`, `losses = S minus D minus owners`, no ancestor gains, and `subpageOnlyWarning` set.
  - **Owners only:** `pageAfter = owners`, `losses = S minus owners`, and `subpageOnlyWarning` set.
  - **Top-level target:** no ancestors. Keep changes nothing, and Owners only is the other option.
- `mapMoveError(envelope)`: maps status, `PG-MV` codes and `toe` to copy.

**State shape (MovePageView):**

```js
{
  page: { id, title, parentId, path: [{ id, title }], owners, height, subpages: [{ id, title, parentPageId }], blocked: null | 'special' | 'bib' },
  accessByPage: Map<pageId, { status: 'loading' | 'loaded' | 'error', users, groups }>,
  target: null | { kind: 'top' } | { kind: 'page', id, title, path, level, topId },
  mode: 'ORIGINAL' | 'INHERIT' | 'MERGE' | 'OWNER_ONLY',
  screen: 'form' | 'picker' | 'result',
  run: null | { status: 'running' | 'done' | 'failed', error, previous: { parentId, path }, accessAfter }
}
```

**Concurrency and failure handling:**

- Each move is one write, and submit is disabled while it runs.
- The picker's `detailGenRef` and `searchGenRef` guards already drop stale responses.
- **An access-list failure** never blocks the move. Its preview line shows the error with Retry. While any needed list is missing, the submit control requires the hold.
- **A 400 that gets past pre-validation** shows the mapped `PG-MV` copy, or else a generic message with `toe`.
- **A 401 or 403** maps to the permission copy.
- **The result screen survives the tab reload**, because the slot lives in `instanceViews`. It is lost only when the panel closes.

### UX

**Entry point:**

- **Move Page** (icon `src/assets/icons/folder-move.svg`), placed after **Update Details** in the mutating half of the grid.
- Tooltip: "Move this page and its subpages under another page, or make it a top-level page".

**Flow:**

1. Press Move Page. The view opens with a Beta chip.
2. The view shows the current location and the subpages that move with the page.
3. Pick **New location**: "Make it a top-level page", or "Put it under another page" then **Choose Page**.
4. Pick **Access**. Each option shows a live preview.
5. Press or hold **Move Page**.
6. The result screen shows the new location, the access that resulted, the old location in writing, **Move Back** and **Open Parent Page**.

**Main screen, with a level-2 destination:**

```
+--------------------------------------------+
| [folder] Move  Q3 Pipeline            [x]  |
|          Beta  ID: 1234567890              |
|--------------------------------------------|
| Current location                           |
|   Sales > Q3 Pipeline                      |
|   Moves with it: 2 subpages            [v] |
|                                            |
| New location                               |
|   ( ) Make it a top-level page             |
|   (o) Put it under another page            |
|       Marketing > Campaigns     [Change]   |
|                                            |
| Access                                     |
|   (o) Keep its current access              |
|       12 users and 3 groups keep access.   |
|       Also gets access: Campaigns (5 users |
|       and 1 group), Marketing (3 users).   |
|   ( ) Use Campaigns' access                |
|       7 users and 2 groups lose access.    |
|       4 users and 1 group gain access.     |
|   ( ) Combine both                         |
|       4 users and 1 group gain access.     |
|       Also gets access: Campaigns, Marketing|
|   ( ) Owners only                          |
|       11 users and 3 groups lose access.   |
|                                            |
| [          Hold to Move Page             ] |
+--------------------------------------------+
```

**Picker** ("Choose Parent Page"):

```
+--------------------------------------------+
| <  Choose Parent Page                      |
| [ Search pages by name or ID...         ]  |
|--------------------------------------------|
| Campaigns                         Level 2  |
|   Marketing > Campaigns                    |
| Campaign Ops            Too deep  Level 3  |
|   Marketing > Campaigns > Ops              |
| Sales                   Current   Level 1  |
+--------------------------------------------+
```

- The page and its subpages are hidden (`excludeIds`).
- The current parent, too-deep pages and special pages render muted with a chip, through `renderRow`.
- Their detail panel shows the reason in place of Select, through the view's `renderDetailActions`.

**Every state, with exact copy:**

- **Loading:** a skeleton for the location block, and "Loading access..." on each preview line.
- **Pre-check dead end** (toast): title "Can't Move This Page", body "This page is already top level, and its two levels of subpages mean it can't go under another page."
- **Special page:** "This is a system or personal page, so it can't be moved." The submit button is hidden.
- **Business-in-a-Box page:** "This page sits in a Business-in-a-Box folder, so it can't be moved here." The submit button is hidden.
- **No subpages:** the "Moves with it" line is left out.
- **Has grandchildren:** "Put it under another page" is disabled, with "This page has two levels of subpages, so it can only be a top-level page."
- **Has children only:** the note under the picker title reads "This page has subpages, so it can only go under a top-level page."
- **Picker empty:** "No pages match your search". In non-admin mode, add: "Only pages you can edit are listed."
- **Picker error:** "Couldn't search pages", with a **Retry** button. This needs the EntityPicker change.
- **Detail reasons:**
  - `current`: "This is already the page's parent."
  - `tooDeep`, level-3 destination: "Level-3 pages can't have subpages."
  - `tooDeep`, otherwise: "This page has subpages, so it can only go under a top-level page."
  - `special`: "System, personal and Business-in-a-Box pages can't hold moved pages."
- **Access options** (label, then the description under it):
  - **Keep its current access**: "Keeps who can see this page. Everyone who can see it also gets access to {Ancestors}." `{Ancestors}` is "Campaigns" or "Campaigns and Marketing".
  - **Use {Parent}'s access**: "Replaces who can see this page with everyone who can see {Parent}." Page destinations only.
  - **Combine both**: "Adds {Parent}'s access to this page, and gives everyone who can see this page access to {Ancestors}." Page destinations only.
  - **Owners only**: "Removes everyone except the page's owners."
- **Under Use {Parent}'s access and Owners only:** "People who can see only its subpages keep those subpages but lose access to {Page}."
- **Under all options:** "Subpages keep their own access."
- **Preview error:** "Couldn't load access for {Page}", with Retry.
- **Submit:**
  - No destination: disabled, with the tooltip "Choose where to move this page".
  - When the hold rule applies (open question): `HoldToConfirmButton` (5 s), labeled "Hold to Move Page".
  - Otherwise: a primary "Move Page".
- **Running:** "Moving {Page}..."
- **Success:**
  - Status bar: "Moved {Page} under {Parent}" or "Made {Page} a top-level page".
  - Result screen: "Now at: Marketing > Campaigns > Q3 Pipeline", "Access now: 12 users and 4 groups", and "Was at: Sales > Q3 Pipeline", with each crumb linked.
  - When the page had ancestors: "{Old Ancestors} still list the people who could see this page. Remove them there if they shouldn't have it."
  - **Move Back** tooltip: "Move it back under {Old Parent}. Access changes aren't undone." When the page started top level: "Make it top level again. Access changes aren't undone."
  - **Open Parent Page**.
- **Verify mismatch:** "Domo accepted the move but the page didn't change location. Try again, or move it from Admin > Dashboards."
- **400:**
  - `PG-MV0015`: "{Page} is already a top-level page."
  - `PG-MV0011`: "{Page} has subpages, so it can't go that deep."
  - Otherwise: "Domo rejected the move (Domo trace {toe})."
- **401/403:** "You don't have permission to move this page, or to add subpages to {Parent}."
- **Partial failure** can't happen: one request moves one subtree atomically.

### Implementation plan

1. **`src/services/pages.js`**
   - `getPageForMove({ pageId, tabId })` returns `{ id, title, parentId, owners, isOwner, virtualPage, locked }`.
   - `getPageAccessList({ pageId, tabId })` returns `{ users: [{ id, displayName }], groups: [{ id, name }], totalUserCount }`.
   - `searchPagesForMove({ query, offset, tabId })`: adminsummary with the body from API 5, `limit=50`, mapped to rows and returned as `{ items, totalCount: totalPageCount }`.
   - `getEditableNavPages({ tabId })`: the navigation tree, flattened and filtered as in Design step 3.
   - `movePage({ pageId, parentPageId, pagePermission, tabId })` returns the envelope.
   - Paginate both adminsummary loops in `getChildPages` with `totalPageCount`.
   - Fix the `getSubpageIds` JSDoc ("direct children only").
2. **`src/utils/pageMove.js`** (new): the pure helpers from the Design section.
3. **`src/components/EntityPicker.jsx`**
   - Add a `retryNonce` state to the paginated search effect's dependencies.
   - Render a Retry button under the error text.
   - Document it in the JSDoc.
   - Account Swap gets the Retry too, which is harmless.
4. **`src/components/pickers/pagePickerAdapter.jsx`** (new):
   - `createPagePickerAdapter({ source: 'admin' | 'nav', navItems, verdict, baseUrl })`, following `accountPickerAdapter.jsx`.
   - Admin is `paginated: true`. Nav is static, with a `matchesQuery` on the title path and the ID.
   - `renderRow` shows the breadcrumb, a level chip and a reason chip. `renderDetail` shows the path, owners and card count. `getHref` points at `/page/{id}`.
5. **`src/components/views/MovePageView.jsx`** (new):
   - Follows `SwapAccountView`: `ViewHeader` with `beta`, `useViewReady`, `getSidepanelData`, `buildReloadAction`.
   - Reuses `EntityPicker`, `HoldToConfirmButton`, HeroUI `RadioGroup`, `useStatusBar().showPromiseStatus` and `waitForChildPages`.
   - Reloads like `UpdateDetailsView`.
6. **`src/components/buttons/MovePage.jsx`** (new): the `GetChildPages.jsx` shape, with `type: 'movePage'`.
7. **`src/utils/availableActions.js`**: add the gate from the Design section next to the `updateDetails` blocks.
8. **`src/components/ActionButtons.jsx`**: render `MovePage` right after `UpdateDetails`.
9. **`src/sidepanel/App.jsx`**: add a `slot.type === 'movePage'` branch with the same props as `swapAccount`.
10. **Lint:** `npx eslint --no-warn-ignored` on every touched file.
11. **`docs/RELEASE_NOTES.md`**: the bullets below. The feature goes under "New Features and Improvements", and the child-page fix under "Bug Fixes".
12. **Optional:** one line in `STORE_LISTING.txt`, staying under the 10,000-character cap.

**Shared work:**

- The pagination fix in step 1 is shared with Get Child Pages and every other `page-child-pages` consumer.
- `pagePickerAdapter`, `getPageAccessList` and the EntityPicker Retry are generic.
- Move Back would be a natural first client of the planned change journal (`docs/plans/beta-phase-1-3-change-journal.md`), which hasn't started.

### Edge cases and risks

- **Access widening is the main risk.** Keep and Combine add the page's audience to the new parent **and** its top page. Moving a broadly shared page under a sensitive section opens the parent and the top page to those people (VERIFIED-LIVE for ORIGINAL; whether they can also see the cards is INFERRED). The preview names every ancestor and counts what it gains.
- **Stale access on old ancestors.** Domo leaves the audience on the old parent and the old top page. The access list doesn't mark where entries came from, so v1 only informs (see the cleanup open question).
- **Preview accuracy.**
  - The preview uses verified rules on current lists. Ancestor gains under MERGE, and OWNER_ONLY's side effects, are INFERRED.
  - Counts are of entries, so a user who is also in a listed group counts in both.
  - The result screen shows the refetched list, so the user sees what actually happened.
- **The height check can come out low for non-admins.**
  - If adminsummary omits subpages a non-admin can't see (INFERRED), the client lets through a move the server rejects with a bare 400. The generic copy covers it.
  - `/subpages` is complete, so it serves as a cross-check that children exist.
- **Error opacity.** Pre-validation covers every rejection seen live, and anything else shows the `toe`.
- **Silent 200.** The follow-up GET catches it.
- **Nav position.** The page lands last among its new siblings in the caller's nav (VERIFIED-LIVE). Reordering stays in Domo's Manage dashboards.
- **Group-owned pages.** Whether `page.isOwner` is true for members of an owning group is INFERRED. A content admin can still move those pages.
- **Locked pages.** Locked destinations are excluded for non-owners in nav mode, matching `canMakeChanges`. Locking the moved page itself doesn't block a move (INFERRED).
- **Concurrent edits.** The GET check catches a move someone else made, and the result screen survives the reload.
- **Move Back is lost when the panel closes.** The "Was at" text and links remain until then, and after that the user moves the page back by hand.

### Testing and verification

**Where:** there is no `/dev-*` route for this. Use the CRXJS dev extension (`yarn dev`), then:

- `node scripts/ext-shot.js sidepanel --live` with a page open in the debug Edge profile;
- `node scripts/ext-shot.js popup --live` to check that the button renders after Update Details.

**Live matrix**, on scratch pages and memberless scratch groups (delete them afterward):

1. A leaf moves to top level. Only Keep and Owners only show, and Current Context loses the parent after the reload.
2. A top-level leaf moves under a level-1 page in each of the four modes. Compare the result screen and the preview with `accesslist` for the page and the destination.
3. **A level-2 destination with Keep.** The preview names both the parent and the top page, and both gain the page's audience.
4. **A source whose subpage has its own audience, under Use parent's access.** The warning shows, the page loses the subpage-only group, and the subpage keeps it.
5. **A destination with another shared subpage, under Use parent's access.** The preview counts the gain, and the page ends up with the sibling's group.
6. A page with children: level-2 rows show "Too deep", and a move under a level-1 page keeps the children.
7. A page with grandchildren: "Put it under another page" is disabled, and at top level the toast appears.
8. Picker: the page's own subpages are hidden, the current parent shows Current, an ID search works, and Retry works after cutting the network in DevTools.
9. Move Back restores the parent, and the "Was at" text matches the old location.
10. A virtual page and a BIB page (read-only, for example `659772072`) show the blocked alerts.
11. As a non-admin owner: the button shows, the nav-mode picker lists level-1 and level-2 pages they can edit, and the move works. As a non-owner, the button is hidden. This needs a non-admin user.
12. Under session auth, record whether a 400 carries `PG-MV0011` or `PG-MV0015`.
13. Get Child Pages on `942894016` lists all 107 children.

Run ESLint on every touched file.

### Design decisions made

- **Use `PUT /content/v1/pages/bulk/move`.** The page PUT ignores `parentPageId`, even with a real ID (VERIFIED-LIVE), and bulk move is what Domo calls (bundle).
- **Check depth, cycles and top-to-top on the client.** All three come back as a bare 400 (VERIFIED-LIVE).
- **Depth rule `level + height <= 3`.** Set by the leaf-under-level-2 and child-under-level-2 probes (VERIFIED-LIVE). The level formula held for all 6,682 rows.
- **Two destination sources.**
  - Admins get adminsummary, the same as Domo's admin select.
  - Everyone else gets the navigation tree with Domo's own `canMakeChanges` filter. Domo's non-admin picker reads that tree (bundle), it carries `isOwner`, `locked`, `hierarchy` and `childCount` (VERIFIED-LIVE), and adminsummary for non-admins is unverified.
  - Unlike Domo, the toolkit offers level-2 parents to non-admins. The server accepts a leaf at level 3 (VERIFIED-LIVE as admin; INFERRED for non-admins).
- **Label INHERIT "Use {Parent}'s access", and say it can add people.** It copies the immediate parent's whole list, including sibling-propagated entries (VERIFIED-LIVE, probe 6).
- **The preview covers every ancestor of the destination.** The top page gains under ORIGINAL (VERIFIED-LIVE).
- **Return an envelope from `movePage`.** `executeInPage` drops every error field except message, name and status (VERIFIED-CODE).
- **Gate the button on `isOwner` and `content.page.edit`, or `content.admin`. Drop the draft's isOwner-fallback fetch.** This mirrors Domo's `canUpdateOwnership` (bundle). `isOwner` is null only for callers who can't open the page (VERIFIED-LIVE: stacks 404 with `pageAccess: false`).
- **Drop the draft's Domo Everywhere alert.** `virtualPage: true` marks system, BIB folder and personal pages (VERIFIED-LIVE). The view blocks those pages with neutral copy.
- **Block BIB pages in v1.** Negative parents give wrong titles in adminsummary (VERIFIED-LIVE), and a move into or out of a BIB folder can't be probed without touching pre-existing content.
- **The subtree always moves, and one page per run.** There is no API mode for anything else, and batches fail as a whole (VERIFIED-LIVE).
- **Show the actual access, refetched, after the move.** Some preview rules are INFERRED.
- **Move Back restores location only, and the result screen writes the old location out.** Access is not restored (VERIFIED-LIVE, probe 6), and the state is in memory only.
- **Reload the tab after success.** This is the existing pattern (VERIFIED-CODE), and the side panel slot survives it (VERIFIED-CODE, `instanceViews`).
- **Place the button after Update Details.** `ActionButtons` renders read-only actions first and mutating ones after `Navigate` (VERIFIED-CODE).
- **Add Retry to EntityPicker rather than drop it.** The component has no retry today (VERIFIED-CODE), and it is a small generic gain.
- **Paginate `getChildPages`.** Pagination works (VERIFIED-LIVE), and the current code truncates real trees (`942894016`, 107 children).
- **Ship with the Beta chip.** This is a choice, not a convention: SwapAccount, UpdateDetails and Delete have none. It fits a new write path that changes access on pages the user didn't pick.
- **Exclude App Studio, worksheet and report pages.** They live in other containers, and Domo's admin move is dashboards only (bundle).
- **Dropped critique point:** "non-admin owners can't reach Admin > Dashboards" holds only on instances whose roles lack all 20 admin-area authorities. On domo.domo.com, Editor and Participant can reach it (VERIFIED-LIVE roles). The scope case therefore rests on friction, the missing level-2 option for non-admins, and hidden access effects, not on impossibility.

### Release notes draft

New Features and Improvements:

- Pages now have a Move Page button that moves a page and its subpages under another page or to the top level, previewing who gains or loses access. ([#43](https://github.com/brycewc/domo-toolkit/issues/43))

Bug Fixes:

- Get Child Pages now lists every subpage of pages with more than 100 of them. ([#43](https://github.com/brycewc/domo-toolkit/issues/43)) _(TODO: confirm with the maintainer that this fix should carry the issue link, since it came out of planning #43.)_

## #10: Pin Preconfigured Set of Features to Left Nav for a New Instance

### Summary

Power users (consultants, CSMs, SEs, admins, Domo staff) land on a lot of instances: customer instances, trials, sandboxes, rigs. Each new instance opens with Domo's default left-nav pins, so the user rebuilds the same nav by hand every time (unpin the defaults, then pin Workspaces, Apps, DataSets, DataFlows, Workflows, Code Engine, and so on). The issue asks for a preset, kept in the extension, that replaces the default pins the first time you sign in to a new instance.

Interpretations considered:

1. **Hand-built preset in options**: a picker over Domo's feature catalog where you add pins one at a time. This duplicates Domo's own Add Pin picker (see Scope check), so it is not planned.
2. **Captured preset (planned)**: you arrange your nav in Domo the way you like, then click **Capture from Instance** in options. The extension keeps the pins that mean the same thing on any instance (feature pins, smart folders, external links, generic same-instance links, and folders of those) and applies that list elsewhere.
3. **Admin Navigation Views**: pushing a nav to _other_ users on one instance. Domo already does this (Admin > Company Settings > Navigation Views), so it is out of scope.

"The first time you login to a new instance" is read as: the first time the extension sees you signed in on an instance it has no record of, that instance was not already in this browser before the feature was turned on, **and** your personal pins there are still Domo's untouched defaults. The last two conditions keep an instance you have used for years from being overwritten. A manual **Apply Now** covers every other case.

### Scope check

**What Domo's UI already does, per instance only:**

- Pin, unpin, rename, recolor, and drag to reorder your own pins (the left nav's Edit Pins mode). The add-pin picker greys out a feature that is already pinned (`navigation/feature-already-pinned`, a client-side tooltip and `aria-disabled` state in chunk `28547-08a35b12fdd13e74`; nothing shows the server rejecting a duplicate).
- Pin a whole feature section as a folder in one click (chunk `4343-8566eb7aa4e62752`, component `ew`).
- Admins can build Navigation Views (`/admin/companysettings/navigationConfigs`) with a pin list, a "personalization disabled" lock, per-pin unlocking (`unlockPins`), and group or user assignments. These belong to one instance and target other people.

**What Domo cannot do:** carry your own nav from one instance to another, or apply it on first sign-in. That is a repeated multi-step chore, the "batches an operation Domo only offers one at a time" case in CLAUDE.md, so the feature belongs. The only "import" entry in the nav bundle (`showImportJson`, `data_etl_import_json`) is the dataset connector, not a pin import, so there is no competing Domo feature.

**Cut because Domo already does it well:** editing pin icons, colors, labels, and order inside the extension. Arrange the nav in Domo, then capture it. The options list only lets you drop an item from the preset or recapture.

**What already exists in this codebase:**

- `src/background.js` `getInstanceUser()` (line 475) and `detectAndStoreContext()` (line 1559, calls `getInstanceUser` at line 1612): the per-detection hook point. `getInstanceUser` returns the cached entry on every detection, so its `.then` runs on every navigation of every tab; the plan adds its own per-instance settle set (Design).
- `src/services/features.js` `getFeatureSwitches(tabId)` and `src/utils/featureSwitches.js` `isFeatureSwitchEnabled(requirement, context)`: switch reading and fail-open checks, reused for feature-pin availability.
- `src/utils/currentObject.js` `getValidTabForInstance(instance)` (line 748): prefers the active tab, matches by `instanceKeyFromUrl` authority (local ports included), and throws "No open tab found for X". Reused for every options-page action on a chosen instance.
- `src/utils/constants.js` `DOMO_MATCH_PATTERNS`: tab query patterns for hosted plus internal hosts. Reused for the instance picker.
- `src/utils/instance.js`: `instanceKeyFromUrl`, `instanceLabel`, `instanceOriginFromKey`.
- `src/services/governanceToolkit.js` (line 344) and `src/services/pageVariables.js` (line 69) `findStore()`: reaching Domo's Redux store from page context. Reused to refresh the nav in place.
- `src/hooks/useReleaseNotification.jsx`: a one-time toast with an action button, mounted in both `src/sidepanel/App.jsx` and `src/popup/App.jsx`. The applied notice copies this pattern.
- `src/utils/clearCookies.js`: `chrome.cookies.getAll` over Domo hosts (the manifest already grants `cookies`). Reused as one source of "instances this browser already uses".
- `src/hooks/usePerInstanceSettings.js`: the `chrome.storage.local.perInstance` map. Not reused for nav state, because `PerInstanceSettings.jsx` draws a card for every key in that map (`Object.entries(settings)`, line 47), so a marker per visited instance would fill that tab with empty cards. Its keys are read as a seeding source.
- `src/components/buttons/HoldToConfirmButton.jsx`: for the manual replace of a customized nav.
- Nothing in `src/services/` touches `/api/nav/` today.

### API and platform findings

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
| User created date        | `GET /api/content/v3/users/{id}?includeDetails=true`                            | VERIFIED-LIVE                                                                                                                                                                                            | `detail.created` in epoch seconds (`1748879739` for `1813188617`). Same endpoint as `getUserDetails` in `src/services/users.js` (VERIFIED-CODE). Only used if the account-age guard is chosen.                                                          |
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

Captured from the token user's live nav, the preset would keep 7 of 15 pins (Workspaces, Apps, Dashboards, DataSets, DataFlows, Workflows, Code Engine) and skip 8 with a reason: MajorDomo Home (App Studio App `1644570665`), Object Exploration (App Studio App `699403591`), Product Release Training (App Studio App `1316297611`), MajorDomo (workspace `be58b33f-da07-43d3-b874-00c0496b508b`), Feature Owners (card `1404268240`), and Activity Log, Product Feedback Intake, and Snowflake Progress (links with object IDs).

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

### Design

**Where it lives**

- **Options page, new "Nav Pins" tab** (`src/components/options/NavPinSettings.jsx`): the preset list, Capture, Apply Now, Clear, the auto-apply switch, and the per-instance activity list with Undo and Apply Now.
- **Background** (`src/background.js`): the automatic first-visit check, a per-instance lock and settle set, seeding of known instances, and the apply and undo message handlers.
- **Side panel and popup**: a one-time toast with Undo on the instance where a preset was just applied, plus a per-tab action badge so the change is visible even if neither surface is opened. No new action button: the feature is not tied to an object type, so `getAvailableActions()` is untouched.

**Storage**

```js
// chrome.storage.sync (follows the user to new browsers)
navPinPreset = {
  capturedAt: 1795219200000,
  capturedFrom: 'domo',                         // instance key
  pins: [                                       // array order is nav order
    { action: { id: 'teams_workspaces', newTab: false, type: 'feature' },
      icon: 'workspace', iconBackgroundColor: '#9E3C15FF', iconColor: '#FFFFFFCC', label: 'Workspaces' },
    { action: { newTab: true, path: '/admin/companysettings', type: 'link' }, icon: 'gear', label: 'Admin' }
  ]
};
navPinPresetAuto = true;

// chrome.storage.local (per device)
navPinKnownInstances = { acme: 1795219000000 };   // instances that were here before; never rendered
navPinLog = {
  globex: {
    appliedKeys: ['feature:teams_workspaces', ...],  // personal keys right after the apply, gates Undo
    at: 1795219300000,
    counts: { added: 4, moved: 3, removed: 2 },
    desired: [/* resolved pins this run converges to, kept so a resume ignores later preset edits */],
    dropped: [],                     // pins the server accepted but did not keep
    error: null,
    navRefreshed: true,
    reason: null,                    // 'customized' | 'locked-view' | 'leftnav-off' | 'changed'
    seen: false,                     // notice dismissed
    skippedView: ['DataSets'],       // preset pins already shown by a Navigation View
    snapshot: [/* personal pins as they were, for Undo */],
    status: 'applied',               // applying | applied | failed | skipped | undone
    unavailable: ['Task Center'],    // preset pins whose switch is off here
    unchecked: false                 // true when switches were unreadable and gates failed open
  }
};
```

A stored pin drops `id`, `sourceId`, `userId`, `order`, `source`, and `locked` (children too), keeping a 30-pin preset near 5 KB, under `chrome.storage.sync`'s 8,192-byte per-item cap. Capture measures the serialized size and refuses above 8,000 bytes.

**New modules**

- `src/utils/navPins.js` (pure, no page access):
  - `pinKey(pin)`: the id-free branch of Domo's key, `feature:teams_workspaces`, `link:<url>`, `smart_folder:WORKSPACES:<query json>`, `<type>:<action.id>`. A folder's key is `folder:label:<label>` plus its children's keys, so a same-named folder with different contents counts as a different pin.
  - `toPresetPin(pin, sourceOrigin)` returns `{ pin, skipReason }` from the portability table. A same-instance link is kept as `path` only when the path matches neither `/\d{5,}/` nor a UUID.
  - `resolvePresetPin(presetPin, targetOrigin)` turns a `path` link back into a full `url`.
  - `NAV_FEATURE_SWITCHES` (the table above, with a one-line note that it mirrors the nav catalog, not `DomoObjectType`) and `isPresetPinAvailable(pin, context)`, wrapping `isFeatureSwitchEnabled` and recursing into folder children.
  - `DOMO_DEFAULT_FEATURE_IDS` (the six seed IDs plus `automate_workflow` and `automate_code_engine_projects`) and `isUntouchedNav(personalPins)`: true when there are none, or every personal pin is a `feature` pin whose ID is in that set. It is a subset test, so a default the server leaves out does not matter; an unknown extra default only yields a safe false "customized" skip.
  - `buildDesiredPins(preset, { context, currentPins, origin })` returns `{ desired, skippedView, unavailable }`: resolves links, drops unavailable pins, and drops any pin whose `pinKey` matches a `VIEW` pin already in the nav.
- `src/services/navPins.js`, each function taking `tabId`, all through `executeInPage`:
  - `getNavPins(tabId)`: `GET /api/nav/v1/pins`.
  - `getNavPinEligibility({ userId }, tabId)`: one injected call returning `{ leftNavEnabled, view, pins }` (`leftnav/enabled`, then `views/users/{id}/view` with 204 as `null`, then `pins`). A failed fetch throws with `error.status`.
  - `applyNavPins({ desired, userId }, tabId)`: one injected call that runs the converge below sequentially, then refreshes Domo's nav in place, and returns `{ counts, dropped, finalPins, navRefreshed, orderMatches }`. The injected function cannot import, so it carries inlined copies of `pinKey`, Domo's dedupe `d`, and `findStore()` (the same pattern as `detectCurrentObject` and `pageVariables.js`); its JSDoc says so.

**Converge algorithm** (idempotent; uses only the three calls Domo's UI uses)

1. `P` = current pins with `source === 'PERSONAL'` and not `locked`. `VIEW` pins are never touched, whatever their `locked` flag.
2. `D` = the desired list (from `buildDesiredPins`, or the snapshot for Undo).
3. `i` = length of the common prefix of `pinKey`s of `P` and `D`. Those pins stay put.
4. For each `d` in `D[i..]`, in order: if an unconsumed pin `p` in `P` has the same key, `PATCH /pins/{p.id}` with `{...p, order: null, parentPinId: undefined}` (move to last, keeps its ID); otherwise `POST /pins/append` with `d` (`id: 0, order: 0, userId`). A folder is appended in one POST with children inline; if the response folder is missing children, each missing child is appended with `?folderId=<new folder id>`.
5. `DELETE` every pin in `P` that was not consumed (extras and duplicates).
6. Read the last response (every call returns the full list) and compare personal keys to `D`. A pin that was posted but is absent goes to `dropped` (reported, not a failure). `orderMatches: false` is reported as a warning.
7. Refresh in place: `findStore()`; if `getState().globalNavV2` exists, dispatch `{ type: 'globalNavV2/SET_NAVIGATION_PINS', payload: { pins: d(finalPins) } }` and set `navRefreshed: true`.

Moving and appending before deleting means the nav is never empty mid-run, kept pins keep their IDs, and re-running from any interruption converges.

**Automatic flow (background)**

1. In `detectAndStoreContext`, inside the existing `getInstanceUser(...).then`, call `maybeApplyNavPreset(context.instance, instanceUser, tabId)` without awaiting it.
2. `maybeApplyNavPreset` returns at once when the instance is in the in-memory `navPresetSettled` Set or `navPresetInFlight` Map. This keeps the per-navigation cost to a Set lookup. `chrome.storage.onChanged` on `navPinPreset` or `navPinPresetAuto` clears the Set.
3. It reads `navPinPreset`, `navPinPresetAuto` (sync) and `navPinLog`, `navPinKnownInstances` (local). If `navPinKnownInstances` is absent entirely (first run on this device, for example a synced preset arriving on a new browser), it runs `seedKnownNavInstances({ exclude: instance })` first.
4. Settle and return when auto is off, there is no preset, the instance is known, or a log entry exists with any status other than `applying`. If the entry is `applied` and not `seen`, re-set the per-tab badge on the way out.
5. Under the per-instance lock: if switches are `null`, `await getFeatureSwitches(tabId)` (it polls up to 7.5 s); if still `null`, continue fail-open and mark `unchecked`. Then `getNavPinEligibility({ userId: instanceUser.user.id })`:
   - left nav `false`: log `skipped`, reason `leftnav-off`
   - a view with `locked: true`: log `skipped`, reason `locked-view`
   - an unlocked view: per open question 3
   - `!isUntouchedNav(P)`: log `skipped`, reason `customized`
6. **Resume:** when the entry is `applying`, skip step 5's untouched check, keep the stored `snapshot` and `desired`, and converge again.
7. Otherwise write `{ status: 'applying', snapshot: P, desired }` **before** mutating, call `applyNavPins`, then write `applied` (with `appliedKeys`) or `failed`.
8. On `applied`, set the per-tab badge (`chrome.action.setBadgeText({ tabId, text: 'PIN' })`) and broadcast `NAV_PRESET_APPLIED { instance, tabId }`. No tab reload (Design decisions).

**Transient versus final failures.** A network error, a 5xx, a 401 (session not ready), or a failed `leftnav/enabled` read writes nothing permanent: the instance is not settled and the next detection retries, capped at 3 attempts per instance per service worker lifetime (in-memory counter). A 4xx other than 401 on a pin write, or the third transient failure mid-apply, logs `failed` with the error; the `snapshot` is kept so Undo and Apply Now stay available.

**Seeding known instances** (`seedKnownNavInstances`). Runs when `navPinPresetAuto` turns on, on `chrome.runtime.onInstalled` when a preset exists, and on first run on a device (step 3). Sources, each mapped through `instanceKeyFromUrl`: hosts of `chrome.cookies.getAll({ domain: 'domo.com' })`, open tabs on `DOMO_MATCH_PATTERNS`, `perInstance` keys, `instanceUsersBackup` (session), and `defaultDomoInstance` (sync). Seeding triggered by a detection excludes that detection's own instance, whose sign-in cookie is already set, and that instance then goes through the normal untouched check.

**Manual flows (messages to background, sharing the lock)**

- `APPLY_NAV_PRESET { instance }`: resolves the tab with `getValidTabForInstance`, the user with `getInstanceUser`, and always reads switches with `getFeatureSwitches(tabId)` (the cache can be cold after a service worker restart). No untouched check; the UI confirms with a hold when `isUntouchedNav` is false. A locked view still blocks it.
- `UNDO_NAV_PRESET { instance }`: re-reads pins and refuses with reason `changed` unless the personal keys still equal `appliedKeys`; otherwise converges to `snapshot` and logs `undone`.
- `GET_NAV_PRESET_PREVIEW { instance }`: read-only, returns `{ customized, personalCount, view }` so the options row knows whether to show the hold.
- Capture is read-only, so the options page calls `getNavPins(tabId)` and `toPresetPin` directly and writes `navPinPreset`.

Every page call goes through `executeInPage`, so `canActOnHost()` already gates internal instances.

### UX

**Entry point:** options page, new tab **Nav Pins**, after Per-Instance Settings.

**Flow:**

1. The user arranges their nav in Domo on a familiar instance.
2. Options > Nav Pins > pick that instance in **Capture From** > **Capture from Instance**.
3. The preset renders. Pins left out are listed under "Not Captured" with a reason.
4. **Apply to New Instances Automatically** turns on once a preset exists, and every instance this browser already knows is recorded as known.
5. On a new instance the preset is applied right after sign-in. The nav updates in place, the toolbar icon shows a PIN badge on that tab, and opening the side panel or popup there shows a toast with Undo.

**Options tab mockup:**

```
 Favicon Preferences   Per-Instance Settings   [Nav Pins]   General Settings

 Nav Pin Preset
 Captured from domo.domo.com on Nov 19, 2026 (7 pins)
 [on] Apply to New Instances Automatically
      Replaces Domo's default pins the first time you sign in to an instance.

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

 Capture From [domo.domo.com v]  [Capture from Instance]
 Apply To     [acme.domo.com v]  [Apply Now]
                                 [Clear Preset]

 Instances
 globex.domo.com    Applied Nov 19, 2026 (4 added, 3 moved, 2 removed)  [Undo]
 initech.domo.com   Skipped: your nav was already customized. Use Apply Now to replace it.  [Apply Now]
 umbrella.domo.com  Skipped: an admin locked the nav on this instance.
```

**Applied toast in the side panel and popup** (shown once per applied instance, `timeout: 0`, `onClose` marks it seen and clears the tab badge):

```
 +----------------------------------------------------------+
 | (i) Nav Pins Applied                                      |
 |     Your 7 preset pins replaced the default pins on       |
 |     globex.domo.com.                               [Undo] |
 +----------------------------------------------------------+
```

**States and copy** (toast titles in Title Case, descriptions end with a period):

| State                             | Where                       | Copy                                                                                                                                                |
| --------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| No preset                         | Options                     | Empty state: "No nav pin preset yet. Arrange your left nav in Domo, then capture it from that instance."                                            |
| No Domo tab open                  | Options pickers             | Disabled select, tooltip "Open a Domo instance in a tab to capture or apply."                                                                       |
| Signed out on that tab (401)      | Toast (danger)              | "Signed Out" / "Sign in to acme.domo.com, then try again."                                                                                          |
| Capturing, applying, undoing      | Button                      | `isPending` on the pressed button.                                                                                                                  |
| Capture success                   | Toast                       | "Preset Captured" / "Saved 7 pins from domo.domo.com. 8 instance-specific pins were left out."                                                      |
| Capture, nothing portable         | Toast (warning)             | "Nothing to Capture" / "None of your pins on domo.domo.com can be used on other instances."                                                         |
| Capture too large                 | Toast (danger)              | "Preset Too Large" / "Remove some pins or folders and capture again."                                                                               |
| Apply on an untouched nav         | Options                     | Plain **Apply Now** button.                                                                                                                         |
| Apply on a customized nav         | Options                     | **Apply Now** becomes a `HoldToConfirmButton`, helper text "Replaces the 12 pins you added on acme.domo.com. You can undo this."                    |
| Apply success                     | Toast                       | "Nav Pins Applied" / "Added 4, moved 3, and removed 2 pins on acme.domo.com."                                                                       |
| Apply success, nav not refreshed  | Toast suffix                | " Reload the page to see them."                                                                                                                     |
| Some pins unavailable             | Toast suffix and log row    | "Task Center isn't available on this instance and was skipped."                                                                                     |
| Pins already in a Navigation View | Toast suffix and log row    | "DataSets is already in your nav from a Navigation View."                                                                                           |
| Switches unreadable               | Log row                     | "Applied without checking which features this instance has."                                                                                        |
| Server dropped a pin              | Log row                     | "Domo didn't keep Code Engine on this instance."                                                                                                    |
| Order differs                     | Toast (warning)             | "Nav Pins Applied Out of Order" / "Your pins were added on acme.domo.com, but not in your preset's order."                                          |
| Partial or full failure           | Toast (danger) and log row  | "Nav Pins Not Fully Applied" / "Stopped on acme.domo.com after an error: {message}. Use Undo or Apply Now to finish."                               |
| Locked view (permission denied)   | Log row, Apply Now disabled | "Skipped: an admin locked the nav on this instance."                                                                                                |
| Left nav off                      | Log row                     | "Skipped: this instance doesn't use the left nav."                                                                                                  |
| Customized at first visit         | Log row                     | "Skipped: your nav was already customized. Use Apply Now to replace it."                                                                            |
| Undo success                      | Toast                       | "Nav Pins Restored" / "Restored your previous pins on acme.domo.com."                                                                               |
| Undo after later edits            | Toast (warning)             | "Can't Undo" / "Your pins on acme.domo.com changed after the preset was applied. Edit them in Domo or use Apply Now."                               |
| Undo, no tab                      | Options row                 | Undo disabled, tooltip "Open acme.domo.com in a tab to undo."                                                                                       |
| Clear Preset                      | Options                     | Plain button. Toast "Preset Cleared" / "Your nav pins on every instance are unchanged." with a **Restore** action holding the old preset in memory. |

Undo is not hold-gated: it only runs while the nav is exactly what the apply produced, so it can never delete pins added later.

### Implementation plan

1. **`src/utils/navPins.js` (new):** `buildDesiredPins`, `DOMO_DEFAULT_FEATURE_IDS`, `isPresetPinAvailable`, `isUntouchedNav`, `NAV_FEATURE_SWITCHES`, `PIN_SKIP_REASONS`, `pinKey`, `resolvePresetPin`, `toPresetPin`, exported in the order `code-style.md` sorting requires. Reuse `isFeatureSwitchEnabled` from `src/utils/featureSwitches.js`.
2. **`src/services/navPins.js` (new):** `applyNavPins`, `getNavPinEligibility`, `getNavPins`, through `executeInPage` from `src/utils/executeInPage.js`. Throw with `error.status` on failed fetches (architecture.md). Inline copies of `pinKey`, Domo's dedupe, and `findStore()` (from `src/services/pageVariables.js`) inside the injected function.
3. **`src/utils/currentObject.js`:** add `listOpenDomoInstances()` next to `getValidTabForInstance`: `chrome.tabs.query({ url: DOMO_MATCH_PATTERNS })`, filtered by `isDomoUrl`, mapped to `{ instance, label }` and deduped. Actions then call `getValidTabForInstance(instance)`.
4. **`src/background.js`:**
   - Add `navPresetAttempts` (Map), `navPresetInFlight` (Map), `navPresetSettled` (Set), and functions `applyNavPresetToInstance(instance, { force })`, `maybeApplyNavPreset(instance, instanceUser, tabId)`, `seedKnownNavInstances({ exclude })`, `undoNavPreset(instance)`, placed per the module sort rule.
   - Call `maybeApplyNavPreset` from the `getInstanceUser(...).then` in `detectAndStoreContext` (line 1612), after `applyInstanceUser`.
   - Add `APPLY_NAV_PRESET`, `GET_NAV_PRESET_PREVIEW`, `NAV_PRESET_SEEN` (clears the tab badge, sets `seen`), and `UNDO_NAV_PRESET` to the `onMessage` switch, sorted.
   - In `chrome.storage.onChanged`, clear `navPresetSettled` on preset or auto changes, and seed when `navPinPresetAuto` turns on. In `onInstalled`, seed when a preset exists.
5. **`src/hooks/useNavPinPreset.js` (new):** reads and writes `navPinPreset` and `navPinPresetAuto` (sync) and `navPinLog` (local), subscribing to `chrome.storage.onChanged` like `usePerInstanceSettings`.
6. **`src/hooks/useNavPresetNotification.jsx` (new):** modeled on `useReleaseNotification.jsx`. Given the current context's instance, shows the applied toast once with an Undo action (`UNDO_NAV_PRESET`) and sends `NAV_PRESET_SEEN` on close. Call it from `src/sidepanel/App.jsx` and `src/popup/App.jsx` where the tab context is available.
7. **`src/components/options/NavPinSettings.jsx` (new):** the tab UI, from HeroUI `Card`, `ListBox`, `Select`, `Switch`, `Disclosure` (Not Captured), `Chip` (type), `Button`, plus `HoldToConfirmButton`. Type labels reuse `ObjectTypeIcon` where a pin type maps to a `DomoObjectType`, with a generic icon for features.
8. **`src/options/App.jsx`:** add the `nav-pins` `Tabs.Tab` and `Tabs.Panel` after `per-instance-settings`, with the same heading and muted subtitle pattern ("Capture your left nav once and apply it on other instances.").
9. **`docs/RELEASE_NOTES.md`:** add the WIP bullets below.
10. Run `npx eslint --no-warn-ignored` on every touched file.

`docs/CONTRIBUTING.md` needs no change: it lists no options tabs or per-feature storage keys. Shared with other issues: none found that touch the nav; `listOpenDomoInstances` and the `findStore()` refresh are general.

### Edge cases and risks

- **Server default unverified (highest risk).** If a brand-new user's `GET /pins` returns synthesized defaults without numeric `id`s, they cannot be moved or deleted. Mitigation: if any personal pin lacks a numeric `id`, stop and log `failed` with "Could not read your default pins on this instance." The fresh-user test settles it.
- **Established instance on first sight.** Covered by seeding plus the untouched check. A long-used nav that is still exactly the defaults gets the preset, which matches the intent.
- **New device or reinstall.** The synced preset arrives with auto on and an empty local log; first-run seeding marks every instance this browser already has cookies or tabs for as known.
- **Cookie seeding gaps.** Users who clear Domo cookies (the extension offers this) lose that seed source; the untouched check remains. Whether every instance host keeps a host-scoped cookie is INFERRED and checked in testing.
- **First-run Domo flows.** No reload is ever forced, so invite acceptance, password set, and welcome tours are not interrupted.
- **Feature visibility beyond switches.** Authority-gated features (DataSets for a user without dataset rights) fail open and could leave a dead pin for a low-privilege user. Acceptable for this audience; the log lists what was applied.
- **Frontend drift.** Feature IDs, switch names, the reorder `order: null` meaning, and the `globalNavV2` slice come from Domo's bundle. An unknown feature ID is applied as-is, a renamed default ID yields a safe "customized" skip, a wrong reorder meaning shows as the out-of-order warning, and a missing slice falls back to "Reload the page."
- **Navigation Views.** `VIEW` pins are never moved or deleted, even unlocked ones, since deleting a view pin's ID could change the admin's view. Preset pins a view already shows are skipped to avoid visible duplicates.
- **Folders.** Same-label folders with different contents are replaced, not merged. A folder whose children are all instance-specific is dropped at capture. Domo caps folders at 100 children (`navigation/folder-full`).
- **Navigation mid-apply.** An SPA route change does not stop the injected script; a full reload does, and the `applying` entry resumes on the next detection with the original snapshot.
- **Two tabs at first sign-in.** The in-flight Map serializes within one service worker; the `applying` marker covers a restart.
- **Sync quota.** The 8 KB item cap is checked at capture; folders with many children are the likeliest overflow.
- **Same-instance links.** The ID heuristic (`\d{5,}` or a UUID) can skip a generic path with a long number; it never keeps a wrong one.
- **Internal instances (rigs, local).** Gated by `canActOnHost`; good throwaway targets.

### Testing and verification

- **Compile and lint:** `yarn dev` (usually already running on 31573), watch the Vite output, `npx eslint --no-warn-ignored` on each new or changed file.
- **Options UI:** CRXJS dev extension, `node scripts/ext-shot.js options` for the empty and populated states. Seed `navPinPreset` and `navPinLog` from the options page DevTools console to shoot each status row.
- **Capture (read-only, safe anywhere):** capture from domo.domo.com and confirm 7 kept and 8 skipped, as listed in API findings.
- **Seeding:** in the debug profile console, run `chrome.cookies.getAll({ domain: 'domo.com' })` from the service worker and confirm instance hosts appear; turn auto on and confirm `navPinKnownInstances` lists them.
- **Apply and undo (writes):** only on a rig, local instance, or trial, never on someone else's nav:
  1. Create a fresh test user there, sign in as that user in the debug profile, and record the first `GET /api/nav/v1/pins` (settles the default set and whether defaults have real `id`s; adjust `DOMO_DEFAULT_FEATURE_IDS`).
  2. Let the auto flow run. Confirm the personal pins match the preset order, view pins are untouched, the nav updated without a reload (`findStore()` reached `globalNavV2`), and the tab shows the badge.
  3. Open the side panel, press Undo in the toast, confirm the snapshot returns.
  4. Apply again, add one pin in Domo, press Undo, confirm "Can't Undo".
  5. Customize the nav, use Apply Now, confirm the hold appears.
  6. Assign a locked Navigation View to the test user, confirm the `locked-view` skip; assign an unlocked one and confirm the chosen behavior and the view-duplicate skip.
  7. Throttle the network, reload mid-apply, confirm the next detection resumes from `applying` and keeps the first snapshot.
  8. With Task Center in the preset, turn off `hopper` on the rig and confirm it is listed as unavailable.
  9. Confirm `order: null` on `PATCH /pins/{id}` moves a pin last (watch the Network panel response order).
  10. Append a folder holding a feature, a link, and a smart folder inline, and confirm all three children come back.
- **Background lifecycle:** open two tabs to the new instance at once and confirm a single apply in the Network panel; restart the service worker mid-apply and confirm resume.

### Design decisions made

- **Capture instead of hand-building.** Domo's picker and drag reorder already make arranging easy, and capture stores real, valid pin objects. Evidence: chunk `28547`, CLAUDE.md Scope.
- **Use `POST /pins/append`, `PATCH /pins/{id}`, and `DELETE /pins/{id}`, not bulk `POST /pins` or `POST /pins/reset`.** These are the calls Domo's UI makes; the other two are spec-only and unused by Domo. Evidence: chunk `64501` module `367389`, live OPTIONS.
- **Reorder with PATCH, not delete and re-append.** Kept pins keep their IDs and never disappear mid-run. Evidence: Domo's reorder thunk `Rj` and helper `Wc`.
- **Cross-instance identity uses the id-free branch of Domo's own key.** Domo keys smart folders and folders by server ID, which never matches across instances. Evidence: chunk `64501` function `d`.
- **Append folders with children inline, falling back to `?folderId=`.** Domo's feature-section pin does exactly this in one POST. Evidence: chunk `4343` component `ew`; the critique's claim that Domo only ever creates one-child folders was checked and is wrong for that path.
- **Refresh the nav through Redux instead of reloading the tab.** A reload can throw away first-login flows, and Domo itself refreshes by dispatching `SET_NAVIGATION_PINS`. Evidence: chunk `64501` slice `globalNavV2`; `findStore()` in `src/services/pageVariables.js`. This settles the draft's reload question.
- **Settle each instance in memory.** `getInstanceUser`'s `.then` runs on every detection. Evidence: `background.js` lines 475 and 1612.
- **Await feature switches before an automatic apply.** `getInstanceUser` resolves before switches arrive, and `isFeatureSwitchEnabled` fails open on `null`. Evidence: `background.js` lines 316 and 508, `src/utils/featureSwitches.js`.
- **Resume skips the untouched check and keeps the first snapshot.** A half-applied nav is no longer untouched. Evidence: the critique's ordering analysis, reproduced against the draft's flow.
- **Undo only while the nav still equals the applied result.** A converge-to-snapshot would otherwise delete pins added later. Evidence: critique UX review.
- **Known instances live in their own unrendered key, seeded from cookies, tabs, and settings.** `perInstance` and `instanceUsersBackup` alone miss most instances (`instanceUsersBackup` is session storage). Evidence: `background.js` line 258 and `persistInstanceUsers`, manifest `cookies` permission, `src/utils/clearCookies.js`.
- **Never touch `VIEW` pins, locked or not, and skip preset pins a view already shows.** Users cannot remove admin pins in Domo either, and Domo hides the personal copy on a collision. Evidence: views `56236e41-309c-4bdb-8191-8ea420ba12bf` and `b9217b4c-26a3-45bf-b0f0-e4f42ce25ed5`, chunk `11746` `unlockPins`, chunk `64501` dedupe.
- **An unassigned view named "Default" is not a default.** Evidence: `views/users/1813188617/view` returns 204 while that view exists.
- **Gate feature pins on the nav catalog's switches only.** Domo renders pinned items regardless of `show`; authority mirroring would be fragile. Evidence: chunks `4343`, `18900`.
- **Preset in `chrome.storage.sync`, log and snapshots in `chrome.storage.local`.** The preset should follow the user; snapshots are per-device history. Evidence: existing sync settings (`faviconRules`, `defaultDomoInstance`).
- **Reuse `getValidTabForInstance` and `DOMO_MATCH_PATTERNS` instead of a new tab hook.** Evidence: `src/utils/currentObject.js` line 748, `src/utils/constants.js` line 37.
- **Applied notice is a toast plus a per-tab badge, not a new Alert.** Same pattern as release notes, and visible without opening a surface. Evidence: `src/hooks/useReleaseNotification.jsx`.
- **Clear Preset is a plain button with a Restore toast.** It touches no nav. Evidence: critique scope review.
- **Retry transient errors up to 3 times instead of logging `leftnav-off` on a failed read.** Domo's own wrapper hides the error as `false`, which would wrongly mark the instance. Evidence: Domo's `isLeftNavEnabled` wrapper, as read in the draft investigation.
- **Use `instanceUser.user.id`, not `window.bootstrap`.** Already in hand. Evidence: `getInstanceUser`.
- **No new action button.** The feature is not object-scoped. Evidence: `ActionButtons.jsx` gating.

### Release notes draft

- You can now capture your left nav pins as a preset in Settings and have them replace Domo's default pins the first time you sign in to a new instance. ([#10](https://github.com/brycewc/domo-toolkit/issues/10))
- A nav pin preset can also be applied to any open instance on demand, with Undo to restore the pins you had before. ([#10](https://github.com/brycewc/domo-toolkit/issues/10))

## Appendix: writes made on domo.domo.com during planning

Every write went to a scratch object the agent created for the probe (named `domo-toolkit-probe-<issue>-*`), and every scratch object was deleted and confirmed gone. No pre-existing object, user setting, nav pin, or instance setting was written, and no share emails were sent. A final search of pages, cards, datasets, groups, and Beast Modes for `domo-toolkit-probe` returned nothing.

### #9

- Draft stage: created scratch page 1888016056 'domo-toolkit-probe-9-rename-page' (POST /api/content/v1/pages)
- Draft stage: created scratch card 2066953017 'domo-toolkit-probe-9-kpi Badges' via POST /api/content/v2/cards/1011747248/saveas onto page 1888016056 (source card 1011747248 not modified)
- Draft stage: six title PUTs on scratch card 2066953017 via PUT /api/content/v1/cards/2066953017/title (title only, all four fields, title plus dynamicTitle, empty title, 1026-character title, rename while locked)
- Draft stage: locked then unlocked scratch card 2066953017 (PUT and DELETE /api/content/v1/cards/bulk/lock)
- Draft stage: created scratch notebook card 1501266072 'domo-toolkit-probe-9-notebook' on page 1888016056 (POST /api/content/v1/cards/notebook) and renamed it once via PUT /api/content/v1/cards/1501266072/title
- Draft stage cleanup: deleted cards 2066953017 and 1501266072 (DELETE /api/content/v1/cards/bulk) and page 1888016056 (DELETE /api/content/v1/pages/1888016056); an earlier aborted run's page 20707722 and cards 1529212597 and 371030348 were confirmed already gone
- Critic stage: none to Domo (read-only GETs and read-only POSTs to adminsummary, search/v1/query and query/v1/execute only); confirmed the draft cleanup read-only
- Final stage: created scratch page 947765872 'domo-toolkit-probe-9-final-page' (POST /api/content/v1/pages)
- Final stage: created scratch card 1586037476 'domo-toolkit-probe-9-final' via POST /api/content/v2/cards/1011747248/saveas onto page 947765872 (source card 1011747248 not modified)
- Final stage: 20 title PUTs on scratch card 1586037476 via PUT /api/content/v1/cards/1586037476/title (description and dynamicDescription combinations, whitespace handling, 51-segment dynamicTitle, title-only with static description, rename while locked as a non-owner admin)
- Final stage: created scratch group 163222655 'domo-toolkit-probe-9-owner-group' (POST /api/content/v2/groups), added then removed the token user as its only member (PUT /api/content/v2/groups/access)
- Final stage: added scratch group 163222655 as owner of scratch card 1586037476 and removed the token user as owner (POST /api/content/v1/cards/owners/add with sendEmail false, POST /api/content/v1/cards/owners/remove)
- Final stage: locked then unlocked scratch card 1586037476 (PUT /api/content/v1/cards/bulk/lock, DELETE /api/content/v1/cards/bulk/lock)
- Final stage cleanup: deleted card 1586037476 (DELETE /api/content/v1/cards/bulk), page 947765872 (DELETE /api/content/v1/pages/947765872), and group 163222655 (DELETE /api/content/v2/groups/163222655, now active:false); confirmed the card no longer resolves, the page returns 404, and an adminsummary search for 'domo-toolkit-probe-9' returns 0 cards
- Final stage: one PUT /api/content/v1/cards/1586037476/title after deletion to observe the deleted-card response (404, no object exists)
- No writes to any pre-existing object, user setting, or instance setting in any stage. No repo files modified; scratch files only under /tmp/open-issue-plans/9f/

### #8

- Draft stage: POST /api/content/v1/pages created scratch page 1520547078 "domo-toolkit-probe-8-remove-page-a" (deleted)
- Draft stage: POST /api/content/v1/pages created scratch page 1932886529 "domo-toolkit-probe-8-remove-page-b" (deleted)
- Draft stage: PUT /api/content/v3/cards/kpi?pageId=1520547078 x3 created scratch cards 1800735888, 1670426394, 937508627 titled domo-toolkit-probe-8-card-a/b/c on dataset ea66147a-1fac-4891-befd-b16f81d7d06c (owned by the token user; dataset not modified) (deleted)
- Draft stage: POST /api/content/v4/pages/1520547078/layouts/convert/flowToLayout converted the scratch page to a layout, producing layout 2071060558 (first attempt with a JSON content type returned 400; deleted with the page)
- Draft stage: PUT /api/content/v1/cards/bulk/pages added scratch card 1670426394 to scratch page 1932886529
- Draft stage: DELETE /api/content/v1/cards/bulk/pages?cardIds=1800735888,1670426394&destinationPageIds=1520547078 -> 200 (remove probe)
- Draft stage: DELETE /api/content/v1/cards/bulk?cardIds=1800735888,1 -> 404, nothing deleted (all-or-nothing probe)
- Draft stage: DELETE /api/content/v1/cards/bulk/pages?cardIds=1800735888,1&destinationPageIds=1520547078 -> 404 (all-or-nothing probe)
- Draft stage: DELETE /api/content/v1/cards/bulk/pages?cardIds=1800735888&destinationPageIds=1520547078 -> 200 (idempotency probe)
- Draft stage: DELETE /api/content/v1/cards/bulk?cardIds=1800735888,1670426394,937508627 -> 200 (cleanup; cards confirmed gone)
- Draft stage: DELETE /api/content/v1/pages/1520547078 and /api/content/v1/pages/1932886529 -> 200 (cleanup; both 404 afterwards)
- Draft stage: confirmed by read-only GETs that objects from an earlier run (pages 934422488 and 2029455980, cards 1303788019 and 1403450342, app 642264579, view 1317878821) no longer exist
- Critique stage: none (read-only GETs and read-only POST searches only)
- Final stage: POST /api/content/v1/pages created scratch classic page 1365898974 "domo-toolkit-probe-8-classic-page" (deleted; GET returns 404)
- Final stage: PUT /api/content/v3/cards/kpi?pageId=1365898974 x3 created scratch cards 1200764577, 1331123134, 1917125635 titled domo-toolkit-probe-8-card-x/y/z on dataset ea66147a-1fac-4891-befd-b16f81d7d06c (dataset not modified) (all deleted; each reads back as [])
- Final stage: POST /api/content/v1/dataapps created scratch app 917641970 "domo-toolkit-probe-8-app" with landing view 503426363 (deleted; app and view both 404 afterwards)
- Final stage: PUT /api/content/v1/cards/bulk/pages added scratch card 1917125635 to scratch view 503426363 -> 200
- Final stage: DELETE /api/content/v1/cards/bulk/pages?cardIds=1200764577&destinationPageIds=1365898974 -> 200 (classic page remove probe)
- Final stage: DELETE /api/content/v1/cards/bulk/pages?cardIds=1917125635&destinationPageIds=503426363 -> 200 (App Studio view remove probe)
- Final stage: DELETE /api/content/v1/cards/bulk?cardIds=1200764577 -> 200, then the same call again -> 404 (already-deleted probe)
- Final stage: cleanup DELETE /api/content/v1/cards/bulk?cardIds=1331123134,1917125635 -> 200, DELETE /api/content/v1/dataapps/917641970 -> 200, DELETE /api/content/v1/pages/1365898974 -> 200

### #6

- Draft stage: created scratch dataset d12797c8-e569-4ac9-a03a-a94000bd9c7a ('domo-toolkit-probe-6-beastmode-rename') via POST /api/data/v2/datasources; deleted via DELETE /api/data/v3/datasources/d12797c8-e569-4ac9-a03a-a94000bd9c7a (confirmed 404 afterward).
- Draft stage: created scratch Beast Modes 576047 ('domo-toolkit-probe-6-bm-a') and 576048 ('domo-toolkit-probe-6-bm-b') via POST /api/query/v1/functions/bulk/template (create); updated both once via bulk/template update; tried one bulk update with 576047 plus a fake id 999999999 (rejected 400, nothing written); updated 576047 twice via PUT /api/query/v1/functions/template/576047; deleted both via DELETE /api/query/v1/functions/template/{id} (confirmed 404).
- Critic stage: created scratch dataset 2f909d46-0d36-47e4-aff9-294cb6ce6aca ('domo-toolkit-probe-6-review-cert') via POST /api/data/v2/datasources; deleted via DELETE /api/data/v3/datasources/2f909d46-0d36-47e4-aff9-294cb6ce6aca (confirmed 404).
- Critic stage: created scratch Beast Modes 576049 ('domo-toolkit-probe-6-review-a') and 576050 ('domo-toolkit-probe-6-review-b') via bulk/template create; updated 576049 once and 576050 twice via bulk/template update (certification probe); deleted both via DELETE /api/query/v1/functions/template/{id} (confirmed 404).
- Final stage: created scratch dataset fca2fce8-352b-468b-b0b9-d19b5112cead ('domo-toolkit-probe-6-final-cardbm') via POST /api/data/v2/datasources; deleted via DELETE /api/data/v3/datasources/fca2fce8-352b-468b-b0b9-d19b5112cead (confirmed 404 'does not exist').
- Final stage: created scratch Beast Mode 576051 ('domo-toolkit-probe-6-final-nonagg') on that dataset via bulk/template create; updated it once via bulk/template update (Old Col to New Col with stale nonAggregatedColumns) to confirm server recompute; deleted via DELETE /api/query/v1/functions/template/576051 (GET confirmed 404; dataset-filtered search totalHits 0).
- Final stage: three PUT /api/content/v3/cards/kpi?pageId=-100000 (and one without pageId) card-create attempts on the scratch dataset, all rejected with 400; the dataset reported cardCount 0 before deletion, so no card was created.
- All other calls in every stage were read-only (functions/search, functions/template/expressions, functions/template/{id} GET, cards/kpi/definition PUT reads, datasources bulk and schema reads, authority dataset query, frontend bundle fetch). Scratch files only under /tmp/open-issue-plans/. No pre-existing object, user setting, instance setting or repo file was written.

### #80

- none (draft stage)
- none (critique stage)
- none (final stage: only GETs and read-only POSTs, namely /api/search/v1/query and /domoapps/apps/v2/context/bulk; scratch files only under /tmp/open-issue-plans/80/)

### #43

- Draft probe 1 (move mechanics): created scratch pages 1147740868 (domo-toolkit-probe-43-a), 961358916 (domo-toolkit-probe-43-b), 348736127 (domo-toolkit-probe-43-c), 773211338 (domo-toolkit-probe-43-target), 1096991647 (domo-toolkit-probe-43-target-child) via POST /api/content/v1/pages. Moved them with PUT /api/content/v1/pages/bulk/move. Sent one PUT /api/content/v1/pages/1147740868 {parentPageId:0}, which was a no-op. Deleted all via DELETE /api/content/v1/pages/{id}, and all five verified 404.
- Draft probe 2 (permission modes): created closed, memberless groups 725125935 (domo-toolkit-probe-43-g1) and 292825995 (domo-toolkit-probe-43-g2), and scratch pages 1454182925, 968154496, 1991780633, 763716008 (domo-toolkit-probe-43-p1, -p2, -c, -d). Shared the scratch pages only with those groups (sendEmail=false) and ran bulk moves. Deleted all pages (verified 404) and both groups (Domo soft-deletes them).
- Draft probe 3 (permission matrix and edge cases): created scratch groups 164537448, 707073383, 714227434 (domo-toolkit-probe-43-gtop, -gsrc, -gsrcparent) and 15 scratch pages named domo-toolkit-probe-43-*. Shared with the scratch groups (sendEmail=false) and ran bulk moves. Deleted all 15 pages (0 remaining) and all 3 groups.
- Draft probe 4 (INHERIT under level 2): created scratch groups 1498723489, 297635029, 912394818 (domo-toolkit-probe-43-ga, -gb, -gs) and 3 scratch pages (domo-toolkit-probe-43-tt, -m, -s). Shared them (sendEmail=false) and ran one bulk move. Deleted all pages (0 remaining) and all 3 groups.
- Critique stage: created 3 closed, memberless scratch groups via POST /api/content/v2/groups: 377303730 (domo-toolkit-probe-43-rv-gt), 1792859137 (domo-toolkit-probe-43-rv-gs), 572302655 (domo-toolkit-probe-43-rv-gc). All deleted via DELETE /api/content/v2/groups/{id} (200).
- Critique stage: created 8 scratch pages domo-toolkit-probe-43-rv-{top, mid, leaf, src-INHERIT, child-INHERIT, src-OWNER_ONLY, child-OWNER_ONLY, ord}, IDs 526181513, 584788845, 107777398, 1931613322, 1199326967, 2113754213, 1868078523, 455591557. Shared them only with the scratch groups (sendEmail=false) and moved them with PUT /api/content/v1/pages/bulk/move. Sent one ignored PUT /api/content/v1/pages/455591557 {parentPageId: 526181513}. Deleted all 8 (all 404).
- Final stage probe 5 (aborted after setup by a script error in the nav read, so no moves ran): created closed, memberless groups 1173642886, 1563512158, 1792668837 (domo-toolkit-probe-43-p5-gt, -p5-gx, -p5-gs) and scratch pages 62889900 (domo-toolkit-probe-43-p5-top), 941711844 (-p5-x, under top), 1904508575 (-p5-y, under top), 753964943 (-p5-src). Shared top, x and src with their scratch groups via POST /api/content/v1/share?sendEmail=false. Deleted all 4 pages (200, 0 remaining) and all 3 groups (200).
- Final stage probe 6 (nav position and INHERIT gains): created closed, memberless groups 1093677080, 567946304, 297152180 (domo-toolkit-probe-43-p6-gt, -p6-gx, -p6-gs) and scratch pages 565177364 (domo-toolkit-probe-43-p6-top), 734640691 (-p6-x, under top), 1974747279 (-p6-y, under top), 1372185627 (-p6-src). Shared top, x and src with their scratch groups (sendEmail=false). Ran PUT /api/content/v1/pages/bulk/move twice (src under top with INHERIT, then src to top level with ORIGINAL). Deleted all 4 pages (200, 0 remaining) and all 3 groups (200).
- No pre-existing object, user setting, nav or pin setting, or instance setting was written at any stage. No emails were sent (sendEmail=false, and every group was empty). All other calls were read-only GETs or adminsummary POSTs.

### #10

- Draft stage: none (read-only GET and OPTIONS calls against domo.domo.com; Domo frontend bundles downloaded to /tmp/open-issue-plans/10/).
- Critique stage: none (read-only GET and OPTIONS calls; three unknown nav paths probed with GET returned 404, 405 and 500; scratch files in /tmp/open-issue-plans/10-review/).
- Final stage: none. Only read-only GET calls against domo.domo.com: /api/nav/v1/pins, /api/nav/v1/views, /api/nav/v1/views/users/1813188617/view, /api/nav/v1/views/users/1084204596/view, /api/nav/v1/leftnav/enabled, /api/nav/v1/leftnav/user (404), /api/nav/v1/leftnav/customer-settings/enabled (404), /api/content/v3/users/1813188617?includeDetails=true, /api/content/v2/groups/1857899041/permissions, /api/content/v2/groups/1857899041/users, /api/domoweb/bootstrap (500). Scratch files only under /tmp/open-issue-plans/10-final/ (a token-reading curl wrapper that never stores the token, and plan.md). No repo files, Domo objects, pins, or settings were changed.
