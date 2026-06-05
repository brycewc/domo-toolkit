---
description: Auto-update the WIP release notes after every notable change without being asked
---

# WIP Release Notes (Auto-Update)

After completing any user-facing change, append a short bullet to `docs/RELEASE_NOTES.md` (the running WIP list) **without waiting for the user to ask**. This project ships slowly with many changes per release, and the user is a solo dev who commits frequently as save/sync points across devices, so items get forgotten by release time if not captured as they land.

## The gate (apply before logging anything)

Release notes describe what a user notices when they update from the **last released version** to the next. Before logging, ask:

> Relative to the version users have installed now, will they see a difference after updating?

If the "before" state your change moves away from never shipped, the answer is no, so skip it, however user-facing the change looks in isolation. A change and a later counter-change within the same unreleased version net to zero for users. This gate sits above every trigger below (it is why "bug fixes" are qualified as **previously shipped**) and applies equally to UI/UX tweaks and performance work.

**Easy-to-miss trap: a dependency or library upgrade on this branch.** Upgrading HeroUI, React, Tailwind, etc. can change default styling or behavior. Re-establishing the prior look, or adapting to the new version, is invisible to users who never saw the intermediate state, so it is not loggable; only a net difference from the last release counts. Real example: HeroUI v3 made avatars and switches radius-derived instead of fully rounded (which looked boxy under our low `--radius`); restoring them to fully rounded on the same unreleased branch is NOT a note item, because users only ever saw the rounded version. Full reasoning: `release-process.md` → "Changes whose baseline never shipped."

## Voice: write for the user, not the extension's developer

Release notes are read by the people who _use_ the extension (Domo power users and admins), at every phase, WIP included. They are not a developer changelog: the code and git history are the developer record, the notes are not. Write each bullet for someone who only ever sees the extension's buttons and panels and never the source.

**The test for every bullet:** would this sentence mean anything to a user who has never read the code? If a phrase only lands for someone who has, cut it or rewrite it as the behavior the user sees.

**Never put these in the notes (they are the "how," not the "what"):**

- API endpoints, paths, or HTTP verbs ("Posts to `/api/datastores/v1/export/{id}`", "the cards endpoint")
- Function, hook, or component names (`waitForChildPages`, `transferAllOwnership`, `DataList`)
- File or module paths (`Sync.jsx`, `services/transferOwnership.js`)
- Variable, prop, state, or response-field names (`context.appPages`, `selectedKey`, `details.active`, `projectName`, the `depth` prop)
- Framework or library internals (React Aria commit-on-blur, CodeMirror's parse tree, HeroUI radius derivation)
- Internal architecture vocabulary (background service worker, in-page injection, message passing), unless restated purely as something the user observes

**Translate, do not transcribe.** State the user-observable result and stop; the mechanism that makes it work stays in the commit message. The implementation detail explains why the change works, but the note says only what the user gets.

Worked example, from a real WIP bullet for the worksheet-pages fix:

- Too developer-focused: "`waitForChildPages` routed only `DATA_APP_VIEW` to the `context.appPages` slot and sent worksheet views to the empty `context.childPages` slot, so the helper polled until it timed out."
- User-facing: "Get Worksheet Pages now lists the worksheet's pages instead of spinning and then erroring out."

Two more, translating phrasings already in this file:

- "Posts to `/api/datastores/v1/export/{datastoreId}`" becomes "starts a datastore sync"
- "Service now reads `projectName` first, with `name` ... as fallbacks" becomes "project rows show their names instead of numeric IDs"

If a technical fact feels too important to drop, it belongs in the commit message, not the note. The only thing that stays inline is a `_(...)_` or `TODO:` marker about the _note itself_ (for example, whether the bug ever shipped), never implementation detail.

## Length: one sentence per bullet

A WIP bullet is a headline, not a paragraph. Write the single user-facing change in one sentence and stop. The user expands the few that warrant it at release time, so detail added now is mostly detail someone cuts later.

By default, cut:

- The why or how, in any form: a parenthetical aside, a trailing "because" / "since" / "so" clause, or a "what made it possible" note. Both "...because Domo gives them the same URL" and "(it generates the definition rather than syncing)" tell the user nothing. State what changed, not why it changed. A reason hidden in parentheses is still a reason.
- Before-state beyond the minimal contrast the headline needs to make sense.
- Consequences that follow from the headline: "recognized as its own type" already implies its own icon and label, so don't spell those out.
- Lists of every screen the change touches: name the feature, not each surface.
- Trailing "instead of X" / "rather than Y" / "so that Z" clauses, unless the change is meaningless without them.

Calibration (a real bullet, before and after):

- Too long: "Variables are now recognized as their own type instead of being treated as Beast Modes. The two were previously indistinguishable because Domo gives them the same URL, so they shared the Beast Mode label and icon. Variables now get their own icon and "Variable" label, and the Objects Owned and Transfer Ownership views (and the transfer audit log) label each item as a Variable or Beast Mode individually rather than lumping them all under Beast Mode."
- Right: "Variables are now recognized as their own type instead of being treated as Beast Modes."

And a parenthetical reason, the easiest kind to leave in by accident:

- Too long: "Renamed the "Sync JSDoc to Package" button to "Generate Definition from JSDoc" (it generates the definition rather than syncing)."
- Right: "Renamed the "Sync JSDoc to Package" button to "Generate Definition from JSDoc"."

When one feature has several genuinely distinct user-facing changes, give each its own one-sentence bullet rather than packing them into a paragraph.

## Trigger after (each still subject to the gate above)

- New features
- Bug fixes to **previously shipped** behavior
- UI/UX adjustments **that a user on the last release would actually see change**
- Newly supported object types
- Performance improvements
- Anything else the user would want listed in the release announcement

## Skip for

- Pure internal refactors. They are never user-facing, so they never go in the notes at any phase, and there is no "Refactoring" holding-pen section at the bottom. This is a solo project: git history is the complete record of internal changes, so the notes do not need to mirror it. If a refactor happens to change something a user sees, that effect is logged in the relevant user-facing section, described the way the user experiences it, never as a "refactor" entry.
- Dev-only tooling, DevMenu, debug scripts
- Iteration on **this version's** not-yet-shipped features. Even when the commit says "fixed," that is part of the feature's initial delivery, not a bug fix.
- **Anything whose "before" state never shipped** (the gate above, restated as a skip rule): same-branch regressions fixed before release, and changes that only counter an unshipped dependency or library upgrade, such as restoring a look the upgrade changed.
- Underlying principle: `release-process.md` → "Commits are save/sync points, not atomic features" and "Changes whose baseline never shipped."

## How

- Use the existing section structure in the WIP file (New Features, Newly Supported Object Types, UI/UX Changes, Bug Fixes, etc.). Add a section if needed.
- Keep each bullet to one sentence (see "Length" above): just enough to remember the user-facing change, phrased the way the user would notice it (see "Voice"), not the way it was built. The user expands it at release time.
- Preserve uncertainty inline with `_(...)_` or `TODO:` rather than silently asserting or dropping.
- Mention the WIP update briefly in the end-of-turn summary so the user sees it happened.
- Full guidance and section taxonomy live in `release-process.md` under "Maintaining WIP release notes."
