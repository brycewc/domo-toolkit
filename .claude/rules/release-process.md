---
description: Release checklist for version bumps and publishing
globs: package.json,src/data/releases.js,docs/RELEASE_NOTES.md
alwaysApply: false
---

# Release Process

`docs/RELEASE_NOTES.md` has two lifecycle phases:

- **Between releases**: maintained as a running WIP list while features land. See "Maintaining WIP release notes" below.
- **At release time**: polished, finalized, and used as the GitHub Release body. See the numbered checklist starting at step 1.

## Maintaining WIP release notes

Because this project ships slowly with many changes per release, the user keeps `docs/RELEASE_NOTES.md` as a running WIP list during development so nothing is forgotten when it's time to compile the final notes.

**Update the WIP list automatically after every change worth noting; do not wait for the user to ask.** Trigger after any user-facing change: new feature, bug fix to a previously shipped behavior, UI/UX adjustment, newly supported object type, performance improvement, etc. Skip for pure internal refactors (or jot under a "Refactoring" reminder section at the bottom), dev-only tooling, and iteration on this version's not-yet-shipped features (see "Commits are save/sync points, not atomic features" below). Mention the WIP update briefly in the end-of-turn summary so the user sees it happened.

### After a release ships

Wipe `docs/RELEASE_NOTES.md` and start a fresh WIP list for the next version. Title it `# Domo Toolkit vX.Y.Z Release Notes (WIP)` with the next expected version. Include a blockquote note if the version bump is being reconsidered (e.g., patch → minor due to scope creep).

### Adding items to the WIP list

- Use the same section structure as prior final releases (New Features, Newly Supported Object Types, UI/UX Changes, Bug Fixes, etc.) so the final polish pass is just fleshing out bullets, not restructuring.
- Keep bullets short. The user will expand them at release time. Just enough detail to remember what was done.
- Don't include internal refactoring in user-facing sections. A short "Refactoring" note at the bottom is fine as a reminder to decide at release time whether to mention it.

### Working from voice-transcribed rambles

The user may paste rough transcriptions of voice notes. Condense into bullets, grouping into the standard sections. The ramble will be out of order and repetitive, so reorganize aggressively.

### Preserve uncertainty inline

When the ramble is unsure about something ("I can't remember which version", "may have been last release", "I think I did this"), preserve the uncertainty with an italic parenthetical, e.g. `_(may have landed in prior version)_` or `TODO:` for incomplete work. Don't silently assert or silently drop. These are self-triage signals for the final polish pass.

### Verifying WIP claims against git history

Before asserting that a fix is new to this version, verify with `git tag --contains <sha>`. Empty output = commit isn't in any release, so it's new. Chronology alone (commit date vs tag date) is **not** sufficient, since commits can be cherry-picked onto release branches. Always cross-check both.

When a ramble is ambiguous about direction or details (e.g., "A recognized as B or B as A, I can't remember which"), grep `git log` for keywords and let the commit message lock it down before writing the bullet. Commit subjects are more reliable than fuzzy recall.

### Commits are save/sync points, not atomic features

The user is a solo developer who commits frequently as a way to save and sync changes between laptop and desktop, **not** as holistic feature commits. This has a critical implication for release notes:

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

"Commits are save/sync points" above is one instance of a broader rule: **release notes describe only the net delta between the last released version and the next one.** The litmus is not limited to commits with "fix" in the title. For *any* change, ask whether the state it moves away from was ever in users' hands.

The case most likely to fool you is a **dependency or library upgrade performed on the current branch.** Bumping HeroUI, React, Tailwind, etc. can change default styling or behavior with no intent on your part. Reacting to that, whether by restoring the prior look or by adapting to new APIs, is invisible to users who never ran the intermediate version, so none of that adaptation work is a release-note item. What *is* loggable is any net, intentional difference the upgrade leaves between the last release and the next (for example, a genuinely new component capability you chose to expose).

Worked example: on the unreleased 1.3.1 branch, HeroUI v3 began deriving every component's corner radius from the global `--radius`. Under this project's deliberately low `--radius`, avatars and switches that were fully rounded started rendering boxy, so they were forced back to fully rounded. That work restores the *pre-upgrade* appearance, meaning a user updating from the last release sees no change in those components. It must NOT appear in the release notes, even though in isolation it reads like a tidy "UI improvement." The same logic covers a regression both introduced and fixed within one unreleased branch: net zero for users, so skip it.

### Version bump signaling

If the WIP list is accumulating substantial new features, flag when a minor bump may be warranted over a patch. Semver guidance:

- Multiple new features + UX changes → minor
- Isolated bug fixes → patch
- Breaking changes → major

---

## 1. Bump the version in `package.json`

The `version` field is the single source of truth; `manifest.config.js` reads `pkg.version`. Use semver:

- **Patch** (1.0.0 → 1.0.1): Bug fixes, minor tweaks, no new features
- **Minor** (1.0.0 → 1.1.0): New features, non-breaking enhancements
- **Major** (1.0.0 → 2.0.0): Breaking changes, major redesigns

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
- Flesh out short bullets into user-facing descriptions (the end result, not development history)
- Resolve all inline `TODO` and `_(may have...)_` uncertainties; verify against `git log` and either confirm, correct, or remove
- Drop the internal "Refactoring" note unless a refactor is genuinely user-visible
- Only include this version's notes (not accumulated across versions). GitHub Release workflow uses this file as the release body.

## 5. Build and package locally

Run `yarn release` (runs `vite build` then `scripts/release.js`):

- Creates `release/chrome-domo-toolkit-{version}.zip`
- Creates `release/edge-domo-toolkit-{version}.zip` (strips `key` from manifest)

## 6. GitHub Actions (automated)

On `package.json` changes pushed to `main`:

- **`.github/workflows/release.yml`**: Creates GitHub Release tagged `vX.Y.Z` with `docs/RELEASE_NOTES.md` as body
- **`.github/workflows/publish.yml`**: Publishes to Chrome Web Store and Edge Add-ons

Both support `workflow_dispatch`. Publish workflow allows `target` (chrome/edge/both) and `upload-only` options.

## Validation checklist

- [ ] `version` in `package.json` matches `releases.js` entry
- [ ] `githubUrl` format: `https://github.com/brycewc/domo-toolkit/releases/tag/vX.Y.Z`
- [ ] `yarn release` builds and packages successfully
