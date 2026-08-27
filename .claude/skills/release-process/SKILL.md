---
name: release-process
description: "Domo Toolkit's release lifecycle, start to finish: starting a new development cycle (wiping release notes to a WIP list and bumping package.json), maintaining that WIP list while features land, and then cutting the release by hand (finalizing the notes, adding the releases.js entry, building the zips, tagging the GitHub Release, and uploading to the Chrome and Edge stores). Use whenever a release comes up: cutting, shipping, or publishing a version, bumping or choosing a version number, starting the next version's branch, finalizing or wiping release notes, adding a releases.js entry, running yarn release, tagging vX.Y.Z, or uploading to the web stores. Keywords: release, ship, publish, version bump, semver, release notes, WIP notes, releases.js, GitHub Release, Chrome Web Store, Edge Add-ons."
---

# Release Process

`docs/RELEASE_NOTES.md` has two lifecycle phases:

- **Between releases**: maintained as a running WIP list while features land. See "Maintaining WIP release notes" below.
- **At release time**: polished, finalized, and used as the GitHub Release body. See the numbered checklist starting at step 1.

## The version bump happens at cycle start, not at release time

**`package.json` is bumped to the next version when the previous release ships**, in the same change that wipes the release notes to a fresh WIP list. It is not bumped as part of cutting the release. Every cycle in the project's history works this way, so by the time you reach the checklist below, `package.json` already holds the version you are releasing, and step 1 is a confirmation rather than an edit.

The version chosen at cycle start is **provisional**. Scope routinely grows past the initial guess, and revising it mid-cycle is normal, not a mistake. Worked example: the cycle after v1.4.0 opened as 1.4.1 in both `package.json` and the WIP title, grew well past a patch, and was re-bumped to 1.5.0 mid-cycle (`5729454`) before shipping as v1.5.0.

## Maintaining WIP release notes

Because this project ships slowly with many changes per release, the user keeps `docs/RELEASE_NOTES.md` as a running WIP list during development so nothing is forgotten when it's time to compile the final notes.

**Update the WIP list automatically after every change worth noting; do not wait for the user to ask.** Trigger after any user-facing change: new feature, bug fix to a previously shipped behavior, UI/UX adjustment, newly supported object type, performance improvement, etc. Skip pure internal refactors entirely (they never go in the notes at all; git history is their record on this solo project), dev-only tooling, and iteration on this version's not-yet-shipped features (see "Commits are save points, not atomic features" below). Mention the WIP update briefly in the end-of-turn summary so the user sees it happened.

### Starting the next cycle, after a release ships

Three things happen together, on a new branch named for the next version (bare `X.Y.Z`, no `v` prefix, matching the `1.6.0` and `1.7.0` branches):

1. Wipe `docs/RELEASE_NOTES.md` and start a fresh WIP list, titled `# Domo Toolkit vX.Y.Z Release Notes (WIP)` with the next expected version. Keep the section skeleton the cycle will fill in (`## New Features and Improvements`, `## UI Improvements`, `## Bug Fixes`).
2. Bump `version` in `package.json` to that same version. This field is the single source of truth; `manifest.config.js` reads `pkg.version`.
3. Include a blockquote note in the notes if the version is already being reconsidered (e.g., patch → minor due to expected scope).

Do **not** add a `releases.js` entry now. That belongs to the release itself, at step 2 of the checklist.

### Adding items to the WIP list

- Use the same section structure as prior final releases (New Features, Newly Supported Object Types, UI/UX Changes, Bug Fixes, etc.) so the final polish pass is just fleshing out bullets, not restructuring.
- Keep each bullet to one sentence: a headline, not a paragraph. The user will expand the few that warrant it at release time. Full guidance and a before/after calibration live in `wip-release-notes.md` under "Length: one sentence per bullet."
- Write every bullet in user-facing language from the start, even in the WIP draft: no endpoint paths, function or component names, file paths, response-field names, or framework internals. Describe what the user sees, not how it was built. Full guidance, exclusion list, and worked examples live in `wip-release-notes.md` under "Voice: write for the user."
- Don't log internal refactors at all, not even in a "Refactoring" section at the bottom. They are never user-facing, and git history is their record on this solo project. If a refactor produces a user-visible effect, log that effect in the relevant user-facing section under its user-facing description, not as a refactor.

### Working from voice-transcribed rambles

The user may paste rough transcriptions of voice notes. Condense into bullets, grouping into the standard sections. The ramble will be out of order and repetitive, so reorganize aggressively.

### Preserve uncertainty inline

When the ramble is unsure about something ("I can't remember which version", "may have been last release", "I think I did this"), preserve the uncertainty with an italic parenthetical, e.g. `_(may have landed in prior version)_` or `TODO:` for incomplete work. Don't silently assert or silently drop. These are self-triage signals for the final polish pass.

### Verifying WIP claims against git history

Before asserting that a fix is new to this version, verify with `git tag --contains <sha>`. Empty output = commit isn't in any release, so it's new. Chronology alone (commit date vs tag date) is **not** sufficient, since commits can be cherry-picked onto release branches. Always cross-check both.

When a ramble is ambiguous about direction or details (e.g., "A recognized as B or B as A, I can't remember which"), grep `git log` for keywords and let the commit message lock it down before writing the bullet. Commit subjects are more reliable than fuzzy recall.

### Commits are save points, not atomic features

The user is a solo developer who commits frequently as a way to save work in progress, **not** as holistic feature commits. This has a critical implication for release notes:

**Do not list "bug fixes" that were never shipped to users.** A commit titled "Fixed X" during this version's development cycle is only a user-facing bug fix if X was broken in a released version. Iteration on this version's new features, even when the commit says "fixed," is part of the feature's initial delivery and should NOT appear in the Bug Fixes section.

When scanning `git log` for release notes, for each "fix" commit ask:

> Did this bug ever reach a released version?

- **Yes** → Include in Bug Fixes.
- **No (the bug only existed during this version's dev work on a new feature)** → Skip it entirely, or fold the resulting capability into the new feature's description.
- **Unsure** → Add the bullet with an italic uncertainty marker (e.g., `_(verify this shipped in v{prior} before including)_`) and resolve during the polish pass.

Examples:

- "Fixed subscriptions not fetching for transfer ownership" during a version that **adds** Transfer Ownership → skip (iteration).
- "Fixed subscriptions not fetching for Get Card Pages" during a version after Get Card Pages has shipped → include (real bug fix).
- "Fixed side panel state not syncing across windows" → include (side panel shipped long ago).
- "DevMenu: email functionality" → skip (DevMenu is developer-only, never user-facing).

### Changes whose baseline never shipped

"Commits are save points" above is one instance of a broader rule: **release notes describe only the net delta between the last released version and the next one.** The litmus is not limited to commits with "fix" in the title. For _any_ change, ask whether the state it moves away from was ever in users' hands.

The case most likely to fool you is a **dependency or library upgrade performed on the current branch.** Bumping HeroUI, React, Tailwind, etc. can change default styling or behavior with no intent on your part. Reacting to that, whether by restoring the prior look or by adapting to new APIs, is invisible to users who never ran the intermediate version, so none of that adaptation work is a release-note item. What _is_ loggable is any net, intentional difference the upgrade leaves between the last release and the next (for example, a genuinely new component capability you chose to expose).

Worked example: on the unreleased 1.3.1 branch, HeroUI v3 began deriving every component's corner radius from the global `--radius`. Under this project's deliberately low `--radius`, avatars and switches that were fully rounded started rendering boxy, so they were forced back to fully rounded. That work restores the _pre-upgrade_ appearance, meaning a user updating from the last release sees no change in those components. It must NOT appear in the release notes, even though in isolation it reads like a tidy "UI improvement." The same logic covers a regression both introduced and fixed within one unreleased branch: net zero for users, so skip it.

### Version bump signaling

The version set at cycle start is a guess. As the WIP list accumulates, watch whether it still fits and flag the user when it doesn't, rather than waiting for release day. Semver guidance, used both to pick the version at cycle start and to re-check it here:

- **Patch** (1.0.0 → 1.0.1): isolated bug fixes, minor tweaks, no new features
- **Minor** (1.0.0 → 1.1.0): new features, UX changes, non-breaking enhancements
- **Major** (1.0.0 → 2.0.0): breaking changes, major redesigns

When it needs to change, update `package.json` and the WIP title together, as `5729454` did for 1.4.1 → 1.5.0.

---

## 1. Confirm the version in `package.json`

**Do not bump here.** `package.json` was set to this version at cycle start (see above). Confirm it still matches what you are shipping, using the semver guidance under "Version bump signaling," and correct it now only if the cycle's scope outgrew the provisional number and it was never revised mid-cycle.

## 2. Add a release entry to `src/data/releases.js`

Add a new object to the **beginning** of the `releases` array (newest-first). Fields sorted alphabetically:

```javascript
{
  date: 'YYYY-MM-DD',
  githubUrl: 'https://github.com/brycewc/domo-toolkit/releases/tag/vX.Y.Z',
  highlights: ['Added feature X', 'Fixed bug Y', 'Improved Z performance'],
  notify: 'fullPage',    // 'fullPage' | 'badge' | 'silent'
  summary: 'One-sentence description of this release.',
  version: 'X.Y.Z'       // must match package.json
}
```

`highlights` and `summary` show up in the in-extension release notification users see on update, so they follow the same user-facing voice as the notes themselves: plain descriptions of what changed, never function names, endpoints, or internals.

**`notify` values:**

- `'fullPage'`: Auto-opens release notes in new tab. Use for minor/major releases.
- `'badge'`: Shows "NEW" badge on icon + toast in popup/sidepanel. Use for notable patches. Clears when user visits `#release-notes`.
- `'silent'`: No notification. Use for trivial patches. Updates `lastSeenVersion` automatically.

## 3. Notification system internals

- `src/background.js` listens for `chrome.runtime.onInstalled` with `reason === 'update'`
- Compares `details.previousVersion` against entries using `compareVersions()`
- `fullPage` → opens `src/options/index.html#release-notes`
- `badge` → sets "NEW" badge via `chrome.action.setBadgeText`
- `silent` → updates `lastSeenVersion` silently
- `lastSeenVersion` stored in `chrome.storage.local`

## 4. Finalize `docs/RELEASE_NOTES.md`

At this point the file already exists as a WIP list accumulated during development (see "Maintaining WIP release notes" above). Polish it for publication:

- Remove the `(WIP)` suffix from the title
- Flesh out short bullets into user-facing descriptions: the end result a user sees, not the development history or the implementation
- Strip any developer detail that leaked into the WIP draft, since this file becomes the published GitHub Release body. A reader should never hit a symbol that exists only in the source: no endpoint paths, function or component names, file paths, response-field names, or framework internals. The "Voice" section in `wip-release-notes.md` has the full exclusion list and translation examples
- Resolve all inline `TODO` and `_(may have...)_` uncertainties; verify against `git log` and either confirm, correct, or remove
- Only include this version's notes (not accumulated across versions). GitHub Release workflow uses this file as the release body.

## 5. Build and package locally

Run `yarn release` (runs `vite build` then `scripts/release.js`):

- Creates `release/chrome-domo-toolkit-{version}.zip`
- Creates `release/edge-domo-toolkit-{version}.zip` (strips `key` from manifest)

**Stop `yarn dev` first.** Both commands write to `dist/`, so building over a live dev server corrupts the CRXJS dev loader. `rm -rf dist release` before the build, and expect to restart `yarn dev` afterward. Details in `local-testing.md`.

## 6. Publish (all manual)

**There is no release automation.** The `release.yml` and `publish.yml` workflows described here previously were deleted in `a47ea53` (2026-05-14), before v1.4.0. Pushing to `main` tags nothing, creates no release, and uploads nothing to either store. Every release from v1.4.0 onward has been cut by hand with the steps below.

### 6a. Push and cut the GitHub Release

```bash
git push origin main
cp release/chrome-domo-toolkit-X.Y.Z.zip release/domo-toolkit-X.Y.Z.zip
gh release create vX.Y.Z \
  release/domo-toolkit-X.Y.Z.zip \
  --title vX.Y.Z \
  --notes-file docs/RELEASE_NOTES.md \
  --target main
```

Conventions to match the existing releases:

- Release title is the bare tag (`v1.6.0`), not a descriptive name.
- Body is the whole of `docs/RELEASE_NOTES.md`.
- **One asset only, the Chrome build with the `chrome-` prefix dropped**, so `domo-toolkit-X.Y.Z.zip`. The Edge zip is not attached; it only exists for the Edge store upload.
- Push before creating the release, since the tag is cut from the pushed `main`.
- `--target` takes a branch name or a full 40-character SHA. An abbreviated SHA fails with `HTTP 422: Release.target_commitish is invalid`.

### 6b. Upload to the stores

Upload by hand, using the prefixed zips left in `release/`:

- Chrome Web Store: `release/chrome-domo-toolkit-X.Y.Z.zip`
- Edge Add-ons: `release/edge-domo-toolkit-X.Y.Z.zip` (the one with `key` stripped)

## Validation checklist

- [ ] `version` in `package.json` (set at cycle start) matches the `releases.js` entry and the version being tagged
- [ ] `githubUrl` format: `https://github.com/brycewc/domo-toolkit/releases/tag/vX.Y.Z`
- [ ] `yarn dev` stopped, then `yarn release` builds and packages successfully
- [ ] Both zips report the right version, and only the Edge one has `key` stripped
- [ ] `main` pushed, then the release cut with the tag and a single `domo-toolkit-X.Y.Z.zip` asset
- [ ] Both store uploads done by hand

## After shipping

Open the next cycle: new branch, wipe the notes, bump `package.json`. See "Starting the next cycle, after a release ships" above.
