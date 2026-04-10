# CLAUDE.md

Domo Toolkit is a Chrome Extension (Manifest V3) that enhances the Domo platform for power users. Quick access to operations, data discovery, and admin tools within Domo.

**Tech Stack:** React 19 + Vite 7 + HeroUI v3 + Tailwind CSS 4 + TanStack Virtual

## Best Practices

- No backwards compatibility — extension runs locally, entire codebase is same version
- Named exports only (no default exports)
- Barrel exports via `index.js` in every folder
- Import from top folder level: `import { Copy } from '@/components'` (not `@/components/functions/Copy` or `@/components/functions`)
- `@/` path alias maps to `src/`

## Development

```bash
yarn dev       # Dev server with HMR
yarn build     # Production build → dist/
yarn release   # Build + package Chrome/Edge zips
```

Load unpacked from `dist/` at `chrome://extensions` with developer mode enabled.

## Rules & Skills Directory

Rules load automatically when their glob/trigger matches. Read them when working in their domain.

| Rule                       | Trigger                | What it covers                                                                                               |
| -------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| `code-style.mdc`           | `.js`/`.jsx` files     | ESLint + Prettier sorting/formatting spec. **Always run `npx eslint --no-warn-ignored <file>` after edits.** |
| `architecture.mdc`         | Core source files      | Extension contexts, message flow, core models, `executeInPage()`, services pattern, detection flow           |
| `release-process.mdc`      | Release files          | Full release checklist: version bump, releases.js, release notes, build, CI/CD                               |
| `domo-apis.mdc`            | Always                 | Use Postman MCP to look up Domo API endpoints before writing API calls                                       |
| `package-manager.mdc`      | Always                 | Use `yarn` not `npm`                                                                                         |
| `contributing-sync.mdc`    | `docs/CONTRIBUTING.md` | Keep contributor guide in sync with codebase                                                                 |
| `domo-debug-utilities.mdc` | On demand              | Browser console scripts for reverse-engineering Domo pages                                                   |

| Skill          | What it covers                             |
| -------------- | ------------------------------------------ |
| `heroui-react` | HeroUI v3 component library docs and usage |

| Command            | What it does                            |
| ------------------ | --------------------------------------- |
| `/domo-debug`      | Outputs browser console debug utilities |
| `/prepare-release` | Walks through full release checklist    |

## Code Conventions (quick reference)

- Functional components only, React 19 (no `forwardRef`)
- Tailwind utility classes only (no inline styles)
- ES6 model classes must implement `toJSON()` and `static fromJSON()` for message passing
- OKLch colors via CSS variables — use `var(--color-*)` in DOM, only resolve in JS when needed for canvas/math
- Custom hooks in `src/hooks/`
- See `code-style.mdc` for full formatting spec
