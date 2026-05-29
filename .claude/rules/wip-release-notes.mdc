---
description: Auto-update the WIP release notes after every notable change without being asked
alwaysApply: true
---

# WIP Release Notes (Auto-Update)

After completing any user-facing change, append a short bullet to `docs/RELEASE_NOTES.md` (the running WIP list) **without waiting for the user to ask**. This project ships slowly with many changes per release, and the user is a solo dev who commits frequently as save/sync points across devices, so items get forgotten by release time if not captured as they land.

## The gate (apply before logging anything)

Release notes describe what a user notices when they update from the **last released version** to the next. Before logging, ask:

> Relative to the version users have installed now, will they see a difference after updating?

If the "before" state your change moves away from never shipped, the answer is no, so skip it, however user-facing the change looks in isolation. A change and a later counter-change within the same unreleased version net to zero for users. This gate sits above every trigger below (it is why "bug fixes" are qualified as **previously shipped**) and applies equally to UI/UX tweaks and performance work.

**Easy-to-miss trap: a dependency or library upgrade on this branch.** Upgrading HeroUI, React, Tailwind, etc. can change default styling or behavior. Re-establishing the prior look, or adapting to the new version, is invisible to users who never saw the intermediate state, so it is not loggable; only a net difference from the last release counts. Real example: HeroUI v3 made avatars and switches radius-derived instead of fully rounded (which looked boxy under our low `--radius`); restoring them to fully rounded on the same unreleased branch is NOT a note item, because users only ever saw the rounded version. Full reasoning: `release-process.mdc` → "Changes whose baseline never shipped."

## Trigger after (each still subject to the gate above)

- New features
- Bug fixes to **previously shipped** behavior
- UI/UX adjustments **that a user on the last release would actually see change**
- Newly supported object types
- Performance improvements
- Anything else the user would want listed in the release announcement

## Skip for

- Pure internal refactors (or jot under a "Refactoring" reminder section at the bottom of the WIP file, then decide at release time whether it is user-visible)
- Dev-only tooling, DevMenu, debug scripts
- Iteration on **this version's** not-yet-shipped features. Even when the commit says "fixed," that is part of the feature's initial delivery, not a bug fix.
- **Anything whose "before" state never shipped** (the gate above, restated as a skip rule): same-branch regressions fixed before release, and changes that only counter an unshipped dependency or library upgrade, such as restoring a look the upgrade changed.
- Underlying principle: `release-process.mdc` → "Commits are save/sync points, not atomic features" and "Changes whose baseline never shipped."

## How

- Use the existing section structure in the WIP file (New Features, Newly Supported Object Types, UI/UX Changes, Bug Fixes, etc.). Add a section if needed.
- Keep the bullet short, just enough to remember what was done. The user expands at release time.
- Preserve uncertainty inline with `_(...)_` or `TODO:` rather than silently asserting or dropping.
- Mention the WIP update briefly in the end-of-turn summary so the user sees it happened.
- Full guidance and section taxonomy live in `release-process.mdc` under "Maintaining WIP release notes."
