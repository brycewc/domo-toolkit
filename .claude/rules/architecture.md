---
description: Extension architecture, execution contexts, message flow, and core patterns
paths:
  - 'src/background.js'
  - 'src/contentScript.js'
  - 'src/sidepanel/**'
  - 'src/popup/**'
  - 'src/options/**'
  - 'src/services/**'
  - 'src/models/**'
  - 'src/utils/executeInPage.js'
---

# Extension Architecture

## Execution Contexts

Five contexts communicate via `chrome.runtime` message passing:

1. **Background Service Worker** (`src/background.js`) — Central relay, tab context cache (LRU, max 10 tabs), session storage persistence
2. **Content Script** (`src/contentScript.js`) — Injected into Domo pages, detects objects via DOM/URL, applies favicons
3. **Popup** (`src/popup/`) — Small UI on extension icon click
4. **Side Panel** (`src/sidepanel/`) — Persistent panel alongside Domo pages
5. **Options Page** (`src/options/`) — Full-page UI for settings, release notes, lineage viewer, activity log

## Message Flow

```
Content Script (detects page context via URL/DOM)
  → Background (caches context, enriches with API data)
  → Popup/Sidepanel (receives TAB_CONTEXT_UPDATED messages)
  → User triggers action
  → Services execute via executeInPage() in page context
```

**Key message types:** `DETECT_CONTEXT`, `GET_TAB_CONTEXT`, `RELEASE_NOTES_SEEN`, `TAB_CONTEXT_UPDATED`

## Instance Identity (hosted vs local)

An instance is identified by one string, the **instance key**, which doubles as a storage key
(`perInstance` settings, `sidepanelData_{windowId}_{instance}`, the background's per-instance user cache):

|        | key                  | label                |
| ------ | -------------------- | -------------------- |
| hosted | `acme`               | `acme.domo.com`      |
| local  | `dev.localhost:9128` | `dev.localhost:9128` |

`src/utils/instance.js` is the only place that classifies a host or converts between key, label, and origin.
Nothing else should test hostnames with its own regex. `detectCurrentObject` is the one exception: it is
stringified and injected, so it carries an inlined copy of the host check.

**Never rebuild an origin from an instance key.** A local instance is served over http on an arbitrary port
(`PORT` env var), so use the exact `DomoContext.origin` or `DomoObject.baseUrl` that detection captured.
`instanceOriginFromKey()` exists only for the few paths where a bare key round-trips through storage.

Local support is an **optional** host permission (`*://*.localhost/*`), off by default so the install-time
warning is unchanged for store users. See `src/utils/localInstance.js`: because it is optional, the content
script for those hosts is registered at runtime instead of declared in the manifest. A `*.localhost` host also
only _looks_ like Domo, so `confirmDomoTab()` in `background.js` probes the page for `window.bootstrap` and
caches positive verdicts per origin in `chrome.storage.session`.

**Never assume the browser will keep the extension off a local host.** `activeTab` grants host access,
`chrome.scripting` included, to whatever tab the user invokes the extension on, and invoking a keyboard command
counts as invoking it. The permission must therefore be checked in code. Three places do it, and new code
touching a page needs to respect one of them:

- `canActOnHost()` (`utils/localInstance.js`) gates `executeInPage()` / `executeInAllFrames()`, which covers
  every service and action. Anything reaching a page through `executeInPage` is already safe.
- `confirmDomoTab()` checks it before the probe **and** before the verified-origin cache, so revoking takes
  effect at once and a cached verdict can never grant access.
- `isActionableDomoUrl()` in `background.js` gates the synchronous tab handling (title management,
  content-script injection, the tab-iteration loops) on `localAccessGranted`, a cached mirror of the
  permission. That flag is only a fast pre-filter; the two checks above re-read the real permission, so a stale
  `true` cannot grant access.

Code that calls `chrome.scripting` **directly** rather than through `executeInPage` (the title helpers,
`utils/copyToClipboard.js`) has to gate itself; that is what made the first version of this leak.

A blocked local tab is not reported as "not a Domo instance". `blockedLocalInstance()` rides along on
`GET_TAB_CONTEXT` and `TAB_CONTEXT_UPDATED`, and `ContextFooter` turns it into a prompt with an inline
"Enable Local Instances" button, so the opt-in is reachable without visiting the options page. Requesting an
optional permission needs a live user gesture, so it runs straight off the click; Chrome's dialog can dismiss
the popup before the promise settles, which is harmless because the background's `permissions.onAdded` listener
does the registration and re-detects local tabs either way.

## Core Models

- **DomoContext** (`src/models/DomoContext.js`) — Tab's full context (tabId, URL, instance, origin, detected object). Serializable via `toJSON()`/`fromJSON()`.
- **DomoObject** (`src/models/DomoObject.js`) — A Domo object (Card, Page, Dataset, etc.) with ID, type, metadata, URL. Methods: `buildUrl()`, `navigateTo()`, `getParent()`, `toJSON()`, `fromJSON()`.
- **DomoObjectType** (`src/models/DomoObjectType.js`) — Registry of ~100+ types with URL patterns, ID validation, API configs. Each type has: `id`, `name`, `urlPath`, `idPattern`, `extractConfig`, `api`, `parents`.

## Executing Code in Page Context

**Critical pattern:** Background, popup, and sidepanel run in isolated contexts (no page access). Services must use `executeInPage()` to run in the MAIN world with Domo's auth:

```javascript
import { executeInPage } from '@/utils';

const result = await executeInPage(
  (arg1, arg2) => {
    // Runs in MAIN world — has page's auth cookies
    return fetch('/api/endpoint').then((r) => r.json());
  },
  [arg1, arg2],
  tabId // Optional, defaults to active tab
);
```

**Rules:**

- Functions are serialized — no closure variables allowed
- Pass all needed data as arguments
- Import from `@/utils`, not `@/utils/executeInPage`
- **Never `throw` inside the injected function to signal a failure the caller acts on.** Chrome does not propagate a rejected promise from an async injected function: it returns `{ result: null }` with no `error`, so `executeInPage` returns `null` instead of throwing and the rejection is silently swallowed. For a void mutation that means a failed operation looks exactly like success. Instead, **return a structured result** and throw in the outer service function:

  ```javascript
  const result = await executeInPage(
    async (id) => {
      const res = await fetch(`/api/...`, { method: 'DELETE' });
      if (!res.ok) return { error: `HTTP ${res.status}`, ok: false };
      return { ok: true };
    },
    [id],
    tabId
  );
  if (!result?.ok) throw new Error(result?.error || 'Failed to ...');
  ```

  This is why `deleteWorkflow`, `deleteDataset`, `sharePages`, `transferDatasets`, `deleteDataflowAndOutputs`, etc. all return an `{ ok, ... }`-style object rather than throwing inside the page. A read whose return value the caller consumes can still `throw` inside (a swallowed throw surfaces as a `null` the caller handles), but any mutation, or any failure the caller branches on, must use the return-and-throw pattern above.

## Services Pattern

Services in `src/services/` follow this pattern:

1. Accept parameters including `tabId` or `inPageContext` flag
2. Use `executeInPage()` to run API calls in page context
3. Return structured data or throw errors
4. Handle both current object (throw on error) and related objects (return null on error)

## Context Detection Flow

1. **Trigger:** URL change, tab activation, history state update, or modal detection
2. **Background** injects detection via `executeInPage(detectCurrentObject, [])`
3. **Detection** extracts object type + ID from URL via `DomoObjectType.extractObjectId()`
4. **Enrichment** fetches details from API via `fetchObjectDetailsInPage()`
5. **Caching** stores in background's `tabContexts` Map + session storage
6. **Broadcast** sends `TAB_CONTEXT_UPDATED` to content script and extension pages
7. **Async loading** (non-blocking): fetch child pages and cards in background

## Parent Resolution

Some types require a parent ID for URLs or API calls:

- **URL parent:** DATA_APP_VIEW needs parent DATA_APP ID (`/app-studio/{parent}/pages/{id}`)
- **Resolution order:** Check `parentId` → `extractParentId()` from URL → API lookup (`getAppStudioPageParent()` or `getDrillParentCardId()`)

## Background Service Worker

- **Session persistence:** Tab contexts saved to `chrome.storage.session` on updates
- **LRU eviction:** Max 10 cached tabs, oldest evicted when full
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
- Reads clipboard via `navigator.clipboard.readText()` in popup/sidepanel context
- Validates clipboard contains Domo object ID (numeric or UUID)
- Identifies object type, fetches metadata, navigates to object's URL

## Action Buttons — Button Component Gating

Action button components in `src/components/buttons/` (e.g., `GetCardPages`, `GetCards`, `DeleteCurrentObject`) are gated by `getAvailableActions()` in `src/components/ActionButtons.jsx`. **A button component will not render in the expandable section unless its action is in the set returned by `getAvailableActions()` for the current object's `typeId`.**

When adding support for a new `DomoObjectType` to any button component, immediately check `getAvailableActions()` and add the type to the relevant action set. This applies even to always-visible buttons that self-manage their disabled state — verify the full render path so the button actually shows up.

## Configuration Files

- **vite.config.js** — Dev server on port 5173, path alias `@/` → `src/`, CRXJS plugin
- **manifest.config.js** — Chrome extension manifest v3 with permissions, content scripts, side panel
- **.prettierrc** — Code formatting rules (single quotes, no trailing commas)
- **src/assets/global.css** — Tailwind and global styles, theme colors in OKLch
