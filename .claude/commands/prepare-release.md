Cut a new release for Domo Toolkit. Invoke the `release-process` skill and follow its numbered checklist, which is the authoritative version of these steps.

1. Confirm the version. `package.json` was already bumped to this version at the start of the cycle, so check that it still matches the scope of what's shipping rather than bumping it again. Compare `git log` against the latest entry in `src/data/releases.js`.
2. Add a new entry to the **beginning** of the `releases` array in `src/data/releases.js`.
3. Finalize `docs/RELEASE_NOTES.md`, which already holds this version's WIP list: drop the `(WIP)` suffix, flesh out the bullets, and resolve any inline `TODO` or uncertainty markers. Write them in user-facing language: no endpoint paths, function or component names, file paths, or framework internals. See "Voice: write for the user" in `.claude/rules/wip-release-notes.md`.
4. Present a summary of all changes for review before committing. Publishing is automated: merging to `main` and pushing a `vX.Y.Z` tag builds the zips, cuts the GitHub Release, and uploads to both stores, so get approval before the tag goes up.
5. A local `yarn release` is optional, only for inspecting the zips by hand. Stop `yarn dev` first, since both write to `dist/`.

If a version number is provided as an argument, use that, correcting `package.json` if it disagrees. Otherwise, trust the version already in `package.json` and flag the user if the commit history suggests it no longer fits.
