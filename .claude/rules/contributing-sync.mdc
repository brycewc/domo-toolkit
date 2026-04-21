---
globs: docs/CONTRIBUTING.md
alwaysApply: false
---

# CONTRIBUTING.md Sync

When editing `CONTRIBUTING.md`, verify the following sections are up to date:

## Tech Stack Table

The table tracks **resolved/installed versions**, not the `^`-prefixed semver ranges in `package.json`. The installed version often drifts above the range as yarn picks up minor/patch updates (e.g., `"react": "^19.2.4"` in `package.json` may have `19.2.5` installed).

Pull the resolved version from `node_modules/<pkg>/package.json` — one lookup per row:

```bash
node -e "console.log(require('./node_modules/<pkg>/package.json').version)"
```

(Alternative: grep yarn.lock. The format is `"<name>@<range>":` followed by a `  version "X.Y.Z"` line. Harder because a single package name can have multiple ranges resolving to different versions — stick with `node_modules` unless you need the lockfile for a specific reason.)

Rows currently in the table (keep this list in sync if rows are added/removed):

- React → `react`
- Vite → `vite`
- @crxjs/vite-plugin → `@crxjs/vite-plugin`
- @heroui/react → `@heroui/react`
- Tailwind CSS → `tailwindcss`
- @tabler/icons-react → `@tabler/icons-react`
- @dagrejs/dagre → `@dagrejs/dagre`
- ESLint → `eslint`
- Prettier → `prettier`

When removing a dependency (e.g., `yarn remove <pkg>`), also remove its row from the table and this list. When adding a dependency, add it to both only if it belongs in the "Tech Stack" summary — not every dep needs a row.

## Project Structure

List `src/` directory contents and ensure the tree in CONTRIBUTING.md matches. Add any new top-level directories or files, remove any that no longer exist.

## Extension Permissions

Read `manifest.config.js` and ensure the permissions table lists every entry from the `permissions` array.
