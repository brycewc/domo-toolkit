Prepare a new release for Domo Toolkit. Follow the "Releasing a New Version" section in CLAUDE.md.

1. Determine the version bump type (patch, minor, or major) based on the changes since the last release. Check `git log` against the latest entry in `src/data/releases.js`.
2. Bump `version` in `package.json`.
3. Add a new entry to the **beginning** of the `releases` array in `src/data/releases.js`.
4. Replace `docs/RELEASE_NOTES.md` with detailed notes for this version.
5. Run `yarn release` to build and verify the zips are created.
6. Present a summary of all changes for review before committing.

If a version number is provided as an argument, use that. Otherwise, infer the appropriate bump from the commit history.
