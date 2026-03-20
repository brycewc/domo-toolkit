# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Domo Toolkit is a Chrome Extension (Manifest V3) that enhances the Domo platform experience for power users. It provides quick access to operations, data discovery, and administrative tools within Domo.

## Best Pracetices

- This extension hasn't launched yet and has no users.
  - For cleaner code, do not provide backwards compatibility when changing features or redoing code that would have otherwise broken things if there were users.
  - Do not write comments that clarify how a new implementation works compared to an old one. Only comments that clarify the current state of the code should be left.
- Follow existing code style and conventions as closely as possible.
- Always use index files for barrel exports in folders.
- Use named exports only (no default exports).
- Always import from top folder level using barrel exports.
- Use path alias `@/` to refer to `src/` directory. For example, `import { Copy } from '@/components'` and not `import { Copy } from '@/components/functions/Copy'`. and also not `import { Copy } from '@/components/functions'`.

**Tech Stack:** React 19 + Vite 7 + HeroUI + Tailwind CSS 4 + TanStack Table/Virtual

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

The extension has four execution contexts that communicate via message passing:

1. **Background Service Worker** (`src/background.js`) - Central message relay, maintains tab context cache with LRU eviction (max 10 tabs), persists to session storage
2. **Content Script** (`src/contentScript.js`) - Injected into Domo pages, detects objects via DOM, applies favicons, monitors clipboard
3. **Popup** (`src/popup/`) - Small UI when clicking extension icon
4. **Side Panel** (`src/sidepanel/`) - Persistent panel alongside Domo pages

### Message Flow

```
Content Script (detects page context via URL/DOM)
  → Background (caches context, enriches with API data)
  → Popup/Sidepanel (receives TAB_CONTEXT_UPDATED messages)
  → User triggers action
  → Services execute via executeInPage() in page context
```

**Key message types:**

- `CLIPBOARD_COPIED` - Content script detected copy event
- `CLIPBOARD_UPDATED` - Notify about valid Domo object ID in clipboard
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
- Example: `import { Copy } from '@/components/functions'`

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
- HeroUI components for complex UI
- Dark mode via `data-theme` attribute
- OKLch color space for theme colors (`src/assets/global.css`)

### Formatting (Prettier)

- Single quotes for strings and JSX attributes
- No trailing commas
- 2-space indentation
- Semicolons required
- Tailwind classes auto-sorted via prettier-plugin-tailwindcss

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

## Clipboard Integration

- Content script listens for copy events and window focus
- Validates clipboard contains Domo object ID (numeric or UUID)
- Caches to `chrome.storage.session` for background access
- Background broadcasts `CLIPBOARD_UPDATED` when value changes
- Keyboard shortcut: Ctrl+Shift+V (Cmd+Shift+V on Mac) triggers clipboard check

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
  fullPage: true,              // true = auto-open release notes page; false = badge only
  githubUrl: 'https://github.com/brycewc/domo-toolkit/releases/tag/vX.Y.Z',
  highlights: [                // short bullet points shown on the release notes page
    'Added feature X',
    'Fixed bug Y',
    'Improved Z performance'
  ],
  summary: 'One-sentence description of this release.',
  version: 'X.Y.Z'            // must match the version in package.json
}
```

**When to set `fullPage: true`:** Use for minor and major releases that introduce features or changes users should know about. The background script will automatically open the release notes page in a new tab on update.

**When to set `fullPage: false`:** Use for patch releases with small bug fixes. The background script will show a "NEW" badge on the extension icon instead. The badge clears when the user visits `#release-notes`.

### 3. How the notification system works

- `src/background.js` listens for `chrome.runtime.onInstalled` with `reason === 'update'`
- It compares `details.previousVersion` against each entry's `version` using `compareVersions()`
- If any new release has `fullPage: true`, it opens `src/options/index.html#release-notes`
- Otherwise, it sets a "NEW" badge via `chrome.action.setBadgeText`
- The `ReleaseNotesPage` component (`src/components/options/ReleaseNotesPage.jsx`) displays the latest release and sends a `RELEASE_NOTES_SEEN` message on mount to clear the badge
- `lastSeenVersion` is stored in `chrome.storage.local` to track what the user has seen

### 4. Update `docs/RELEASE_NOTES.md`

Replace the contents of `docs/RELEASE_NOTES.md` with the detailed release notes for this version. This file always contains only the **latest** version's notes — do not accumulate old versions. The GitHub Release workflow uses this file as the release body.

### 5. Build and publish

Run `yarn release` to build and package locally. When the version bump is pushed to `main`, two GitHub Actions workflows trigger automatically:

- **`.github/workflows/release.yml`** — creates a GitHub Release tagged `vX.Y.Z` using `docs/RELEASE_NOTES.md` as the body
- **`.github/workflows/publish.yml`** — builds and publishes to Chrome Web Store and Edge Add-ons

Both workflows can also be triggered manually via `workflow_dispatch`.

## Testing in Development

When running `yarn dev`:

- Vite dev server runs on port 5173 with HMR
- WebSocket HMR endpoint: `ws://localhost:5173`
- Changes to React components hot-reload without losing state
- Changes to background.js or contentScript.js require extension reload
