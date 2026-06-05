---
description: How to test UI changes against the localhost dev server before claiming success
---

# Local Testing: Dev Server

**Do not claim a UI change is "untestable" without checking this file first.** This project ships with localhost dev routes that mount specific components in a real browser environment, plus a Chrome-API polyfill so extension code runs without being loaded as an extension.

## Standalone dev routes

`yarn dev` starts a Vite dev server at `http://localhost:5173` with HMR. Two custom middleware routes mount individual components for fast iteration:

| Route               | Mounts                 | Use for                          |
| ------------------- | ---------------------- | -------------------------------- |
| `/dev-activity-log` | `<ActivityLogTable />` | Any change in `src/activityLog/` |
| `/dev-lineage`      | Lineage view           | Any change in `src/lineage/`     |

These are real React pages, with full HMR, real network calls (proxied via Vite to a real Domo instance using a dev token), and the actual production component tree. Not a snapshot, not a Storybook stub.

## Required env

The dev routes need `.env.development.local` (gitignored — copy from `.env.development.local.example` if it doesn't exist):

```
VITE_DOMO_BASE_URL=https://<instance>.domo.com
VITE_DOMO_TOKEN=<developer token from Admin > Authentication > Access Tokens>
VITE_DOMO_ENTITY_ID=<id of object to load>
VITE_DOMO_ENTITY_TYPE=<DATA_SOURCE | DATAFLOW | PAGE | etc.>
VITE_DOMO_OBJECT_NAME=<display name>
```

Vite proxies `/api/*` to `VITE_DOMO_BASE_URL` and injects `X-Domo-Developer-Token: VITE_DOMO_TOKEN`. The `chromePolyfill.js` reads these env vars and seeds `chrome.storage.session` so the components find their initial state.

## Three layers of verification (use what fits)

1. **Compile / HMR check**: Start `yarn dev` in the background (Bash with `run_in_background: true`) and tail its output. Any syntax error, bad import, or invalid JSX surfaces here within ~1s of saving the file. Use this for every UI change as a baseline.

2. **Route smoke check**: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/dev-activity-log` should return `200`. Confirms the middleware and entry file resolved without a 500.

3. **Visual verification via Playwriter**: Use the `playwriter` skill to drive the user's actual Chrome to `http://localhost:5173/dev-activity-log` (or `/dev-lineage`) and screenshot. This is the real visual test for layout, colors, responsive breakpoints, and interactions. Run before claiming a visual change "looks right." Before starting `yarn dev`, check `ss -tln | grep 5173` — the user often has it already running, and a duplicate just lands on 5174.

## What's NOT covered by dev routes

The dev pages only mount Activity Log and Lineage. The following still require loading the unpacked `dist/` extension in Chrome and cannot be tested via localhost:

- Popup (`src/popup/`)
- Side panel (`src/sidepanel/`)
- Options page (`src/options/`)
- Content scripts that inject into Domo pages (`src/contentScripts/`)
- Background service worker behavior (`src/background.js`)
- Anything that depends on `chrome.scripting`, `chrome.runtime.onInstalled`, or other APIs the polyfill intentionally omits

For those, do not claim the change works just because ESLint passes. But also **do not tack on a standing caveat** explaining that these contexts lack a localhost dev route and therefore can't be tested here (e.g. "this lives in the popup/sidepanel/background, which the dev routes don't cover, so please verify in browser"). The maintainer already knows which surfaces have dev routes and which don't; repeating it every turn is noise. Just do the verification a dev route enables when one exists, run ESLint, and stop. Surface a "please verify in browser" note only when there is something genuinely non-obvious to check (an untested assumption, a response shape you couldn't confirm, a risky edge case), not as boilerplate about where the code runs.

## Polyfill caveats

`src/dev/chromePolyfill.js` stubs `chrome.storage.session`, `chrome.storage.sync`, `chrome.storage.onChanged`, and `chrome.tabs`. It deliberately **omits** `chrome.scripting` — `executeInPage()` checks for its absence to detect dev mode and call functions directly. If new code needs a Chrome API the polyfill doesn't stub, either add the stub or accept that path can't run on localhost.

## Workflow when fixing a UI bug

1. `yarn dev` (background)
2. Make the edit
3. Watch Vite output for compile errors
4. `curl` the relevant `/dev-*` route — confirm 200
5. Playwriter screenshot the relevant route — confirm the change looks right
6. Run `npx eslint --no-warn-ignored <file>` per `code-style.md`
7. Update `docs/RELEASE_NOTES.md` per `wip-release-notes.md`
