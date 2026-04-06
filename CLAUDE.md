# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Domo Toolkit is a Chrome Extension (Manifest V3) that enhances the Domo platform experience for power users. It provides quick access to operations, data discovery, and administrative tools within Domo.

## Best Practices

- For cleaner code, do not provide backwards compatibility whenever possible. This is because the nature of a Chrome extension means the entire codebase is the same version and run locally for a user, so there is no need to maintain compatibility with older versions of the code.
- Follow existing code style and conventions as closely as possible.
- Always use index files for barrel exports in folders.
- Use named exports only (no default exports).
- Always import from top folder level using barrel exports.
- Use path alias `@/` to refer to `src/` directory. For example, `import { Copy } from '@/components'` and not `import { Copy } from '@/components/functions/Copy'`. and also not `import { Copy } from '@/components/functions'`.

**Tech Stack:** React 19 + Vite 7 + HeroUI + Tailwind CSS 4 + TanStack Virtual

## Development Commands

```bash
# Start development server with HMR
yarn dev

# Build for production (outputs to dist/)
yarn build

# Preview production build
yarn preview
```

**Loading the extension:**

1. Run `yarn dev`
2. Navigate to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the `dist` directory

## Architecture

### Extension Contexts

The extension has five execution contexts that communicate via message passing:

1. **Background Service Worker** (`src/background.js`) - Central message relay, maintains tab context cache with LRU eviction (max 10 tabs), persists to session storage
2. **Content Script** (`src/contentScript.js`) - Injected into Domo pages, detects objects via DOM, applies favicons
3. **Popup** (`src/popup/`) - Small UI when clicking extension icon
4. **Side Panel** (`src/sidepanel/`) - Persistent panel alongside Domo pages
5. **Options Page** (`src/options/`) - Full-page UI for settings, release notes, lineage viewer, and activity log

### Message Flow

```
Content Script (detects page context via URL/DOM)
  → Background (caches context, enriches with API data)
  → Popup/Sidepanel (receives TAB_CONTEXT_UPDATED messages)
  → User triggers action
  → Services execute via executeInPage() in page context
```

**Key message types:**

- `DETECT_CONTEXT` - Force re-detection of current page
- `GET_TAB_CONTEXT` - Popup/sidepanel requests current tab's context
- `RELEASE_NOTES_SEEN` - Release notes page viewed, clear badge and update lastSeenVersion
- `TAB_CONTEXT_UPDATED` - Background broadcasts context changes to all listeners

### Core Models

**DomoContext** (`src/models/DomoContext.js`)

- Represents a tab's full context (tabId, URL, instance, detected object)
- Serializable via `toJSON()` / `fromJSON()` for message passing
- Automatically extracts instance subdomain from URL

**DomoObject** (`src/models/DomoObject.js`)

- Represents a Domo object (Card, Page, Dataset, etc.) with ID and type
- Has `metadata` (from API), `url` (navigable URL), `parentId` (for nested objects)
- Supports async parent resolution for types like DATA_APP_VIEW, DRILL_PATH
- Methods: `buildUrl()`, `navigateTo()`, `getParent()`, `toJSON()`, `fromJSON()`

**DomoObjectType** (`src/models/DomoObjectType.js`)

- Registry of ~100+ supported object types with URL patterns, ID validation, API configs
- Each type has: `id`, `name`, `urlPath`, `idPattern`, `extractConfig`, `api`, `parents`
- URL paths can include `{id}` and `{parent}` placeholders
- API configs specify `method`, `endpoint`, `pathToName` for fetching object details
- Important types: PAGE, DATA_APP, DATA_APP_VIEW, CARD, DATA_SOURCE, USER, GROUP, ALERT, WORKFLOW_MODEL

### Executing Code in Page Context

**Critical pattern:** Services must run in the page context (MAIN world) to access Domo's authentication and session:

```javascript
import { executeInPage } from '@/utils/executeInPage';

// Service function that needs page context
const result = await executeInPage(
  (arg1, arg2) => {
    // This runs in MAIN world with page's auth
    return fetch('/api/endpoint').then((r) => r.json());
  },
  [arg1, arg2],
  tabId // Optional, defaults to active tab
);
```

**Rules:**

- Background and popup/sidepanel run in isolated contexts (no page access)
- Use `executeInPage()` to run code in page context via `chrome.scripting.executeScript`
- Functions passed to `executeInPage()` are serialized, so no closure variables
- Pass all needed data as arguments

### Context Detection Flow

1. **Trigger:** URL change, tab activation, history state update, or modal detection
2. **Background** injects detection script via `executeInPage(detectCurrentObject, [])`
3. **Detection** extracts object type and ID from URL using `DomoObjectType.extractObjectId()`
4. **Enrichment** fetches object details from API using `fetchObjectDetailsInPage()`
5. **Caching** stores in background's `tabContexts` Map and session storage
6. **Broadcast** sends `TAB_CONTEXT_UPDATED` to content script and extension pages
7. **Async loading** (non-blocking): fetch child pages and cards in background

### Parent Resolution

Some object types require a parent ID for URLs or API calls:

- **URL parent:** DATA_APP_VIEW requires parent DATA_APP ID in URL (`/app-studio/{parent}/pages/{id}`)
- **API parent:** Some API endpoints need parent ID in path or body
- **Resolution order:**
  1. Check `parentId` property (if already set)
  2. Try `extractParentId()` from original URL
  3. Fall back to API lookup: `getAppStudioPageParent()` or `getDrillParentCardId()`

## Code Conventions

### Path Alias

- `@/` maps to `src/` directory
- Example: `import { Copy } from '@/components'`

### Exports

- Use named exports only (no default exports)
- Barrel exports via index.js files

### React

- Functional components only
- React 19 - no `forwardRef` needed
- Custom hooks in `src/hooks/`

### Model Serialization

- ES6 classes must implement `toJSON()` and `static fromJSON()`
- Required for chrome.runtime message passing between contexts

### Styling

- Tailwind utility classes only (no inline styles)
- HeroUI components for complex UI. Use HeroUI React documentation from https://heroui.com/react/llms.txt
- Dark mode via `data-theme` attribute
- OKLch color space for theme colors (`src/assets/global.css`)
- When JS needs to produce a color value that ends up in the DOM (SVG `fill`, inline `style`, etc.), use `var(--color-*)` CSS variable references directly — do NOT resolve via `getComputedStyle`. Only resolve CSS variables when the color must be consumed by JS itself (e.g., canvas 2D, color math).

### Formatting & Linting (ESLint + Prettier)

- Single quotes for strings and JSX attributes
- No trailing commas
- 2-space indentation
- Semicolons required
- Tailwind classes auto-sorted via prettier-plugin-tailwindcss
- ESLint enforces strict alphabetical sorting via `eslint-plugin-perfectionist`: imports, exports, object keys, JSX props, switch cases
- After editing `.js`/`.jsx` files, run `npx eslint --no-warn-ignored <file>` to verify — fix all errors before finishing
- See `.claude/rules/code-style.mdc` for the full sorting and formatting spec

## Configuration Files

- **vite.config.js** - Dev server on port 5173, path alias `@/` → `src/`, CRXJS plugin for extension building
- **manifest.config.js** - Chrome extension manifest v3 with permissions, content scripts, side panel
- **.prettierrc** - Code formatting rules (single quotes, no trailing commas)
- **src/assets/global.css** - Tailwind and global styles, theme colors in OKLch

## Services Pattern

Services in `src/services/` typically:

1. Accept parameters including `tabId` or `inPageContext` flag
2. Use `executeInPage()` to run API calls in page context
3. Return structured data or throw errors
4. Handle both current object (throw on error) and related objects (return null on error)

Example:

```javascript
export async function fetchObjectDetails(typeId, objectId, tabId) {
  return executeInPage(fetchObjectDetailsInPage, [params], tabId);
}
```

## Background Service Worker Notes

- **Session persistence:** Tab contexts saved to `chrome.storage.session` on updates
- **LRU eviction:** Maximum 10 cached tabs, oldest evicted when full
- **Context enrichment:** Async loading of child pages and cards (non-blocking)
- **Title updates:** Automatically updates tab title from object name
- **Favicon tracking:** Content script applies favicon rules on page load/navigation

## Object Type Detection

Content script detects objects via:

1. **URL patterns:** Most types detected by URL structure (e.g., `/page/123`)
2. **Modal detection:** Card modals detected via MutationObserver watching for `.card-details-modal`
3. **ID extraction:** Uses `extractConfig` with keyword/offset or fromEnd patterns

## Clipboard Navigation

- Activated on button click (Navigate button in popup/sidepanel), not passive monitoring
- Reads clipboard via `navigator.clipboard.readText()` in the popup/sidepanel context
- Validates clipboard contains Domo object ID (numeric or UUID)
- Identifies object type, fetches metadata, and navigates to the object's URL

## Releasing a New Version

When the user asks to prepare a release, cut a version, or ship changes, follow these steps:

### 1. Bump the version in `package.json`

The `version` field in `package.json` is the single source of truth — `manifest.config.js` reads `pkg.version` from it. Use semver:

- **Patch** (1.0.0 → 1.0.1): Bug fixes, minor tweaks, no new features
- **Minor** (1.0.0 → 1.1.0): New features, non-breaking enhancements
- **Major** (1.0.0 → 2.0.0): Breaking changes, major redesigns

### 2. Add a release entry to `src/data/releases.js`

Add a new object to the **beginning** of the `releases` array (newest-first). The entry must have these fields sorted alphabetically:

```javascript
{
  date: 'YYYY-MM-DD',         // release date
  githubUrl: 'https://github.com/brycewc/domo-toolkit/releases/tag/vX.Y.Z',
  highlights: [                // short bullet points shown on the release notes page
    'Added feature X',
    'Fixed bug Y',
    'Improved Z performance'
  ],
  notify: 'fullPage',         // 'fullPage' | 'badge' | 'silent'
  summary: 'One-sentence description of this release.',
  version: 'X.Y.Z'            // must match the version in package.json
}
```

**`notify: 'fullPage'`:** Auto-opens the release notes page in a new tab. Use for minor and major releases that introduce features or changes users should know about.

**`notify: 'badge'`:** Shows a "NEW" badge on the extension icon and a toast in the popup/sidepanel. Use for patch releases with notable bug fixes. The badge clears when the user visits `#release-notes` or clears the toast.

**`notify: 'silent'`:** No notification at all. Use for trivial patch releases (minor bug fixes) where notifying the user would be noise. `lastSeenVersion` is updated automatically so no stale badge/toast appears.

### 3. How the notification system works

- `src/background.js` listens for `chrome.runtime.onInstalled` with `reason === 'update'`
- It compares `details.previousVersion` against each entry's `version` using `compareVersions()`
- If any new release has `notify: 'fullPage'`, it opens `src/options/index.html#release-notes`
- If the highest notification level is `'badge'`, it sets a "NEW" badge via `chrome.action.setBadgeText`
- If all new releases are `'silent'`, it updates `lastSeenVersion` without any notification
- The `ReleaseNotes` component (`src/components/options/ReleaseNotes.jsx`) displays the latest release and sends a `RELEASE_NOTES_SEEN` message on mount to clear the badge
- `lastSeenVersion` is stored in `chrome.storage.local` to track what the user has seen

### 4. Update `docs/RELEASE_NOTES.md`

Replace the contents of `docs/RELEASE_NOTES.md` with the detailed release notes for this version. This file always contains only the **latest** version's notes — do not accumulate old versions. Only include details that changed between this version and the previous. Lots of commit messages may include details of a features development progressing over the lifetime of a branch, for developer records. But these should not be included in the release notes, only the end result of that feature. The GitHub Release workflow uses this file as the release body.

### 5. Build and package locally

Run `yarn release` to build and create release zips. This runs `vite build` then `scripts/release.js`, which:

- Creates `release/chrome-domo-toolkit-{version}.zip` (excludes `.crx`, `.pem`, `.vite` artifacts)
- Creates `release/edge-domo-toolkit-{version}.zip` (same as Chrome but strips the `key` property from `manifest.json`)

### 6. GitHub Actions (automated publishing)

When the version bump is pushed to `main`, two workflows trigger automatically on `package.json` changes:

- **`.github/workflows/release.yml`** — creates a GitHub Release tagged `vX.Y.Z` using `docs/RELEASE_NOTES.md` as the body
- **`.github/workflows/publish.yml`** — builds the extension and publishes to Chrome Web Store and Microsoft Edge Add-ons

**Manual triggers:** Both workflows support `workflow_dispatch`. The publish workflow allows selecting:

- **target:** `chrome`, `edge`, or `both` (default: both)
- **upload-only:** Upload without publishing, for manual review in the store dashboard

## Domo API Reference

When working with Domo API endpoints (fetching data, building service functions, debugging API issues):

1. **User-provided endpoints take precedence.** If the user gives you an endpoint path, method, or usage instructions directly, use those as the source of truth — even if Postman doesn't have a matching entry.
2. When the user hasn't specified the endpoint, use the **Postman MCP** tools (prefixed `mcp__postman__`) to look up the correct endpoint, method, request body, and response format before writing or modifying API calls. Prefer the **local STDIO MCP server** if available; fall back to the **remote streamable HTTP MCP server** otherwise. The tool names and capabilities are the same across both.
3. Search with `searchPostmanElementsInPublicNetwork` using `q: "Domo <description>"` to find the endpoint.
4. Use `getCollectionRequest` with `populate: true` to get full request details including example responses.
5. The primary collection is **"Domo Product APIs"** (collection ID `17302996-d887dd51-ea30-43be-a2bd-3a81f15cce13`), workspace **"Domo Product APIs"**.
6. Never guess at endpoint paths, request body shapes, or response formats — verify via Postman or the user first.

## Package Manager

Always use `yarn` instead of `npm` for all package management commands:

- `yarn` instead of `npm install`
- `yarn add <package>` instead of `npm install <package>`
- `yarn remove <package>` instead of `npm uninstall <package>`
- `yarn dev` instead of `npm run dev`
- `yarn build` instead of `npm run build`

## Testing in Development

When running `yarn dev`:

- Vite dev server runs on port 5173 with HMR
- WebSocket HMR endpoint: `ws://localhost:5173`
- Changes to React components hot-reload without losing state
- Changes to background.js or contentScript.js require extension reload

## Claude Code Configuration (`.claude/`)

The `.claude/` directory contains rules, commands, and skills that extend Claude Code's behavior for this project.

### Rules (`.claude/rules/`)

Rules provide context-specific instructions that are automatically loaded when relevant:

| Rule                       | Trigger                        | Purpose                                                                                                   |
| -------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `code-style.mdc`           | Editing `.js`/`.jsx` files     | Full ESLint + Prettier sorting and formatting spec                                                        |
| `contributing-sync.mdc`    | Editing `docs/CONTRIBUTING.md` | Checklist: verify tech stack versions, project structure, and extension permissions match source of truth |
| `domo-apis.mdc`            | Always                         | Use Postman MCP to look up Domo API endpoints before writing API calls                                    |
| `domo-debug-utilities.mdc` | On demand                      | Browser console scripts for finding IDs/UUIDs and inspecting React internals on Domo pages                |
| `package-manager.mdc`      | Always                         | Use `yarn` instead of `npm` for all commands                                                              |
| `release-process.mdc`      | Editing release files          | Checklist ensuring `package.json`, `releases.js`, and `RELEASE_NOTES.md` stay in sync                     |

### Commands (`.claude/commands/`)

- **`/domo-debug`** — Outputs browser console debug utilities for reverse-engineering Domo pages (find integer IDs, find UUIDs, inspect React fiber tree)
- **`/prepare-release`** — Walks through the full release checklist: version bump, release entry, release notes, build, and summary

### Skills (`.claude/skills/`)

Skills are symlinked from `.agents/skills/` and provide specialized capabilities:

- **`heroui-react`** — HeroUI v3 component library documentation and usage
- **`playwriter`** — Browser automation via Playwright for testing and debugging

## Documentation (`docs/`)

- **`docs/CONTRIBUTING.md`** — Contributor guide (bug reports, PRs, tech stack, project structure). Keep in sync with the codebase — see `.claude/rules/contributing-sync.mdc`.
- **`docs/RELEASE_NOTES.md`** — Latest version's release notes. Replaced on each release. Used as the GitHub Release body.
- **`docs/README.md`** — Project README for GitHub Pages site.
- **`docs/PRIVACY_POLICY.md`** — Privacy policy required for Chrome Web Store / Edge Add-ons.

## GitHub Issue Templates (`.github/ISSUE_TEMPLATE/`)

- **`bug-report.md`** — Structured bug report (auto-labels `Bug`, auto-assigns maintainer)
- **`feature-request.md`** — Feature request template (auto-labels `Enhancement`)

<!-- HEROUI-REACT-AGENTS-MD-START -->

[HeroUI React v3 Docs Index]|root: ./.heroui-docs/react|STOP. What you remember about HeroUI React v3 is WRONG for this project. Always search docs and read before any task.|If docs missing, run this command first: heroui agents-md --react --output CLAUDE.md|components/(buttons):{button-group.mdx,button.mdx,close-button.mdx,toggle-button-group.mdx,toggle-button.mdx}|components/(collections):{dropdown.mdx,list-box.mdx,tag-group.mdx}|components/(colors):{color-area.mdx,color-field.mdx,color-picker.mdx,color-slider.mdx,color-swatch-picker.mdx,color-swatch.mdx}|components/(controls):{slider.mdx,switch.mdx}|components/(data-display):{badge.mdx,chip.mdx,table.mdx}|components/(date-and-time):{calendar.mdx,date-field.mdx,date-picker.mdx,date-range-picker.mdx,range-calendar.mdx,time-field.mdx}|components/(feedback):{alert.mdx,meter.mdx,progress-bar.mdx,progress-circle.mdx,skeleton.mdx,spinner.mdx}|components/(forms):{checkbox-group.mdx,checkbox.mdx,description.mdx,error-message.mdx,field-error.mdx,fieldset.mdx,form.mdx,input-group.mdx,input-otp.mdx,input.mdx,label.mdx,number-field.mdx,radio-group.mdx,search-field.mdx,text-area.mdx,text-field.mdx}|components/(layout):{card.mdx,separator.mdx,surface.mdx,toolbar.mdx}|components/(media):{avatar.mdx}|components/(navigation):{accordion.mdx,breadcrumbs.mdx,disclosure-group.mdx,disclosure.mdx,link.mdx,pagination.mdx,tabs.mdx}|components/(overlays):{alert-dialog.mdx,drawer.mdx,modal.mdx,popover.mdx,toast.mdx,tooltip.mdx}|components/(pickers):{autocomplete.mdx,combo-box.mdx,select.mdx}|components/(typography):{kbd.mdx}|components/(utilities):{scroll-shadow.mdx}|getting-started/(handbook):{animation.mdx,colors.mdx,composition.mdx,styling.mdx,theming.mdx}|getting-started/(overview):{design-principles.mdx,quick-start.mdx}|getting-started/(ui-for-agents):{agent-skills.mdx,agents-md.mdx,llms-txt.mdx,mcp-server.mdx}|releases:{v3-0-0-alpha-32.mdx,v3-0-0-alpha-33.mdx,v3-0-0-alpha-34.mdx,v3-0-0-alpha-35.mdx,v3-0-0-beta-1.mdx,v3-0-0-beta-2.mdx,v3-0-0-beta-3.mdx,v3-0-0-beta-4.mdx,v3-0-0-beta-6.mdx,v3-0-0-beta-7.mdx,v3-0-0-beta-8.mdx,v3-0-0-rc-1.mdx,v3-0-0.mdx}|demos/accordion:{basic.tsx,custom-indicator.tsx,custom-render-function.tsx,custom-styles.tsx,disabled.tsx,faq.tsx,multiple.tsx,surface.tsx,without-separator.tsx}|demos/alert-dialog:{backdrop-variants.tsx,close-methods.tsx,controlled.tsx,custom-animations.tsx,custom-backdrop.tsx,custom-icon.tsx,custom-portal.tsx,custom-trigger.tsx,default.tsx,dismiss-behavior.tsx,placements.tsx,sizes.tsx,statuses.tsx,with-close-button.tsx}|demos/alert:{basic.tsx}|demos/autocomplete:{allows-empty-collection.tsx,asynchronous-filtering.tsx,controlled-open-state.tsx,controlled.tsx,custom-indicator.tsx,default.tsx,disabled.tsx,email-recipients.tsx,full-width.tsx,location-search.tsx,multiple-select.tsx,required.tsx,single-select.tsx,tag-group-selection.tsx,user-selection-multiple.tsx,user-selection.tsx,variants.tsx,with-description.tsx,with-disabled-options.tsx,with-sections.tsx}|demos/avatar:{basic.tsx,colors.tsx,custom-styles.tsx,fallback.tsx,group.tsx,sizes.tsx,variants.tsx}|demos/badge:{basic.tsx,colors.tsx,dot.tsx,placements.tsx,sizes.tsx,variants.tsx,with-content.tsx}|demos/breadcrumbs:{basic.tsx,custom-render-function.tsx,custom-separator.tsx,disabled.tsx,level-2.tsx,level-3.tsx}|demos/button-group:{basic.tsx,disabled.tsx,full-width.tsx,orientation.tsx,sizes.tsx,variants.tsx,with-icons.tsx,without-separator.tsx}|demos/button:{basic.tsx,custom-render-function.tsx,custom-variants.tsx,disabled.tsx,full-width.tsx,icon-only.tsx,loading-state.tsx,loading.tsx,outline-variant.tsx,ripple-effect.tsx,sizes.tsx,social.tsx,variants.tsx,with-icons.tsx}|demos/calendar:{basic.tsx,booking-calendar.tsx,controlled.tsx,custom-icons.tsx,custom-styles.tsx,default-value.tsx,disabled.tsx,focused-value.tsx,international-calendar.tsx,min-max-dates.tsx,multiple-months.tsx,read-only.tsx,unavailable-dates.tsx,with-indicators.tsx,year-picker.tsx}|demos/card:{default.tsx,horizontal.tsx,variants.tsx,with-avatar.tsx,with-form.tsx,with-images.tsx}|demos/checkbox-group:{basic.tsx,controlled.tsx,custom-render-function.tsx,disabled.tsx,features-and-addons.tsx,indeterminate.tsx,on-surface.tsx,validation.tsx,with-custom-indicator.tsx}|demos/checkbox:{basic.tsx,controlled.tsx,custom-indicator.tsx,custom-render-function.tsx,custom-styles.tsx,default-selected.tsx,disabled.tsx,form.tsx,full-rounded.tsx,indeterminate.tsx,invalid.tsx,render-props.tsx,variants.tsx,with-description.tsx,with-label.tsx}|demos/chip:{basic.tsx,statuses.tsx,variants.tsx,with-icon.tsx}|demos/close-button:{default.tsx,interactive.tsx,variants.tsx,with-custom-icon.tsx}|demos/color-area:{basic.tsx,controlled.tsx,custom-render-function.tsx,disabled.tsx,space-and-channels.tsx,with-dots.tsx}|demos/color-field:{basic.tsx,channel-editing.tsx,controlled.tsx,custom-render-function.tsx,disabled.tsx,form-example.tsx,full-width.tsx,invalid.tsx,on-surface.tsx,required.tsx,variants.tsx,with-description.tsx}|demos/color-picker:{basic.tsx,controlled.tsx,with-fields.tsx,with-sliders.tsx,with-swatches.tsx}|demos/color-slider:{alpha-channel.tsx,basic.tsx,channels.tsx,controlled.tsx,custom-render-function.tsx,disabled.tsx,rgb-channels.tsx,vertical.tsx}|demos/color-swatch-picker:{basic.tsx,controlled.tsx,custom-indicator.tsx,custom-render-function.tsx,default-value.tsx,disabled.tsx,sizes.tsx,stack-layout.tsx,variants.tsx}|demos/color-swatch:{accessibility.tsx,basic.tsx,custom-render-function.tsx,custom-styles.tsx,shapes.tsx,sizes.tsx,transparency.tsx}|demos/combo-box:{allows-custom-value.tsx,asynchronous-loading.tsx,controlled-input-value.tsx,controlled.tsx,custom-filtering.tsx,custom-indicator.tsx,custom-render-function.tsx,custom-value.tsx,default-selected-key.tsx,default.tsx,disabled.tsx,full-width.tsx,menu-trigger.tsx,on-surface.tsx,required.tsx,with-description.tsx,with-disabled-options.tsx,with-sections.tsx}|demos/date-field:{basic.tsx,controlled.tsx,custom-render-function.tsx,disabled.tsx,form-example.tsx,full-width.tsx,granularity.tsx,invalid.tsx,on-surface.tsx,required.tsx,variants.tsx,with-description.tsx,with-prefix-and-suffix.tsx,with-prefix-icon.tsx,with-suffix-icon.tsx,with-validation.tsx}|demos/date-picker:{basic.tsx,controlled.tsx,custom-render-function.tsx,disabled.tsx,form-example.tsx,format-options-no-ssr.tsx,format-options.tsx,international-calendar.tsx,with-custom-indicator.tsx,with-validation.tsx}|demos/date-range-picker:{basic.tsx,controlled.tsx,custom-render-function.tsx,disabled.tsx,form-example.tsx,format-options-no-ssr.tsx,format-options.tsx,input-container.tsx,international-calendar.tsx,with-custom-indicator.tsx,with-validation.tsx}|demos/description:{basic.tsx}|demos/disclosure-group:{basic.tsx,controlled.tsx}|demos/disclosure:{basic.tsx,custom-render-function.tsx}|demos/drawer:{backdrop-variants.tsx,basic.tsx,controlled.tsx,navigation.tsx,non-dismissable.tsx,placements.tsx,scrollable-content.tsx,with-form.tsx}|demos/dropdown:{controlled-open-state.tsx,controlled.tsx,custom-trigger.tsx,default.tsx,long-press-trigger.tsx,single-with-custom-indicator.tsx,with-custom-submenu-indicator.tsx,with-descriptions.tsx,with-disabled-items.tsx,with-icons.tsx,with-keyboard-shortcuts.tsx,with-multiple-selection.tsx,with-section-level-selection.tsx,with-sections.tsx,with-single-selection.tsx,with-submenus.tsx}|demos/error-message:{basic.tsx,with-tag-group.tsx}|demos/field-error:{basic.tsx}|demos/fieldset:{basic.tsx,on-surface.tsx}|demos/form:{basic.tsx,custom-render-function.tsx}|demos/input-group:{default.tsx,disabled.tsx,full-width.tsx,invalid.tsx,on-surface.tsx,password-with-toggle.tsx,required.tsx,variants.tsx,with-badge-suffix.tsx,with-copy-suffix.tsx,with-icon-prefix-and-copy-suffix.tsx,with-icon-prefix-and-text-suffix.tsx,with-keyboard-shortcut.tsx,with-loading-suffix.tsx,with-prefix-and-suffix.tsx,with-prefix-icon.tsx,with-suffix-icon.tsx,with-text-prefix.tsx,with-text-suffix.tsx,with-textarea.tsx}|demos/input-otp:{basic.tsx,controlled.tsx,disabled.tsx,form-example.tsx,four-digits.tsx,on-complete.tsx,on-surface.tsx,variants.tsx,with-pattern.tsx,with-validation.tsx}|demos/input:{basic.tsx,controlled.tsx,full-width.tsx,on-surface.tsx,types.tsx,variants.tsx}|demos/kbd:{basic.tsx,inline.tsx,instructional.tsx,navigation.tsx,special.tsx,variants.tsx}|demos/label:{basic.tsx}|demos/link:{basic.tsx,custom-icon.tsx,custom-render-function.tsx,icon-placement.tsx,underline-and-offset.tsx,underline-offset.tsx,underline-variants.tsx}|demos/list-box:{controlled.tsx,custom-check-icon.tsx,custom-render-function.tsx,default.tsx,multi-select.tsx,virtualization.tsx,with-disabled-items.tsx,with-sections.tsx}|demos/meter:{basic.tsx,colors.tsx,custom-value.tsx,sizes.tsx,without-label.tsx}|demos/modal:{backdrop-variants.tsx,close-methods.tsx,controlled.tsx,custom-animations.tsx,custom-backdrop.tsx,custom-portal.tsx,custom-trigger.tsx,default.tsx,dismiss-behavior.tsx,placements.tsx,scroll-comparison.tsx,sizes.tsx,with-form.tsx}|demos/number-field:{basic.tsx,controlled.tsx,custom-icons.tsx,custom-render-function.tsx,disabled.tsx,form-example.tsx,full-width.tsx,on-surface.tsx,required.tsx,validation.tsx,variants.tsx,with-chevrons.tsx,with-description.tsx,with-format-options.tsx,with-step.tsx,with-validation.tsx}|demos/pagination:{basic.tsx,controlled.tsx,custom-icons.tsx,disabled.tsx,simple-prev-next.tsx,sizes.tsx,with-ellipsis.tsx,with-summary.tsx}|demos/popover:{basic.tsx,custom-render-function.tsx,interactive.tsx,placement.tsx,with-arrow.tsx}|demos/progress-bar:{basic.tsx,colors.tsx,custom-value.tsx,indeterminate.tsx,sizes.tsx,without-label.tsx}|demos/progress-circle:{basic.tsx,colors.tsx,custom-svg.tsx,indeterminate.tsx,sizes.tsx,with-label.tsx}|demos/radio-group:{basic.tsx,controlled.tsx,custom-indicator.tsx,custom-render-function.tsx,delivery-and-payment.tsx,disabled.tsx,horizontal.tsx,on-surface.tsx,uncontrolled.tsx,validation.tsx,variants.tsx}|demos/range-calendar:{allows-non-contiguous-ranges.tsx,basic.tsx,booking-calendar.tsx,controlled.tsx,default-value.tsx,disabled.tsx,focused-value.tsx,international-calendar.tsx,invalid.tsx,min-max-dates.tsx,multiple-months.tsx,read-only.tsx,three-months.tsx,unavailable-dates.tsx,with-indicators.tsx,year-picker.tsx}|demos/scroll-shadow:{custom-size.tsx,default.tsx,hide-scroll-bar.tsx,orientation.tsx,visibility-change.tsx,with-card.tsx}|demos/search-field:{basic.tsx,controlled.tsx,custom-icons.tsx,custom-render-function.tsx,disabled.tsx,form-example.tsx,full-width.tsx,on-surface.tsx,required.tsx,validation.tsx,variants.tsx,with-description.tsx,with-keyboard-shortcut.tsx,with-validation.tsx}|demos/select:{asynchronous-loading.tsx,controlled-multiple.tsx,controlled-open-state.tsx,controlled.tsx,custom-indicator.tsx,custom-render-function.tsx,custom-value-multiple.tsx,custom-value.tsx,default.tsx,disabled.tsx,full-width.tsx,multiple-select.tsx,on-surface.tsx,required.tsx,variants.tsx,with-description.tsx,with-disabled-options.tsx,with-sections.tsx}|demos/separator:{basic.tsx,custom-render-function.tsx,manual-variant-override.tsx,variants.tsx,vertical.tsx,with-content.tsx,with-surface.tsx}|demos/skeleton:{animation-types.tsx,basic.tsx,card.tsx,grid.tsx,list.tsx,single-shimmer.tsx,text-content.tsx,user-profile.tsx}|demos/slider:{custom-render-function.tsx,default.tsx,disabled.tsx,range.tsx,vertical.tsx}|demos/spinner:{basic.tsx,colors.tsx,sizes.tsx}|demos/surface:{variants.tsx}|demos/switch:{basic.tsx,controlled.tsx,custom-render-function.tsx,custom-styles.tsx,default-selected.tsx,disabled.tsx,form.tsx,group-horizontal.tsx,group.tsx,label-position.tsx,render-props.tsx,sizes.tsx,with-description.tsx,with-icons.tsx,without-label.tsx}|demos/table:{async-loading.tsx,basic.tsx,column-resizing.tsx,custom-cells.tsx,empty-state.tsx,pagination.tsx,secondary-variant.tsx,selection.tsx,sorting.tsx,tanstack-table.tsx,virtualization.tsx}|demos/tabs:{basic.tsx,custom-render-function.tsx,custom-styles.tsx,disabled.tsx,secondary-vertical.tsx,secondary.tsx,vertical.tsx,with-separator.tsx}|demos/tag-group:{basic.tsx,controlled.tsx,custom-render-function.tsx,disabled.tsx,selection-modes.tsx,sizes.tsx,variants.tsx,with-error-message.tsx,with-list-data.tsx,with-prefix.tsx,with-remove-button.tsx}|demos/textarea:{basic.tsx,controlled.tsx,full-width.tsx,on-surface.tsx,rows.tsx,variants.tsx}|demos/textfield:{basic.tsx,controlled.tsx,custom-render-function.tsx,disabled.tsx,full-width.tsx,input-types.tsx,on-surface.tsx,required.tsx,textarea.tsx,validation.tsx,with-description.tsx,with-error.tsx}|demos/time-field:{basic.tsx,controlled.tsx,custom-render-function.tsx,disabled.tsx,form-example.tsx,full-width.tsx,invalid.tsx,on-surface.tsx,required.tsx,with-description.tsx,with-prefix-and-suffix.tsx,with-prefix-icon.tsx,with-suffix-icon.tsx,with-validation.tsx}|demos/toast:{callbacks.tsx,custom-indicator.tsx,custom-queue.tsx,custom-toast.tsx,default.tsx,placements.tsx,promise.tsx,simple.tsx,variants.tsx}|demos/toggle-button-group:{attached.tsx,basic.tsx,controlled.tsx,disabled.tsx,full-width.tsx,orientation.tsx,selection-mode.tsx,sizes.tsx,without-separator.tsx}|demos/toggle-button:{basic.tsx,controlled.tsx,disabled.tsx,icon-only.tsx,sizes.tsx,variants.tsx}|demos/toolbar:{basic.tsx,custom-styles.tsx,vertical.tsx,with-button-group.tsx}|demos/tooltip:{basic.tsx,custom-render-function.tsx,custom-trigger.tsx,placement.tsx,with-arrow.tsx}

<!-- HEROUI-REACT-AGENTS-MD-END -->
