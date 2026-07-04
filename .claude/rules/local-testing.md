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

   **Playwriter cannot open `chrome-extension://` pages.** It only reaches `http://localhost` URLs, so the popup, side panel, options page, and Welcome page are NOT visually verifiable through Playwriter, even when the CRXJS dev extension is loaded. This is the whole reason the `/dev-*` routes exist: they re-mount a component as a localhost page Playwriter can drive. A surface with no `/dev-*` route (popup, side panel, options, Welcome) has no Playwriter path at all. For those, verify via the compile/HMR check plus ESLint, build the change so it hot-reloads in the loaded extension for the maintainer to eyeball, and do not claim the visual result was confirmed.

## Two ways to run dev, do not confuse them

There are two distinct localhost testing paths, and the surfaces each one covers are different:

1. **Standalone `/dev-*` routes** (the table above): localhost pages that mount one component with a Chrome-API polyfill. Only Activity Log and Lineage have these. Use them for fast, screenshot-friendly iteration on those two views.
2. **The CRXJS dev extension**: `yarn dev` also builds a development copy of the whole extension via `@crxjs/vite-plugin` and serves it with HMR. Loading that unpacked gives you the popup, side panel, options page, and content scripts running as a real extension, with edits hot-reloading across all of those surfaces. This is NOT limited to Activity Log and Lineage.

So the popup/side panel/options/content scripts are **not** coverable by the standalone `/dev-*` routes, but they **are** coverable by loading the CRXJS dev extension while `yarn dev` runs. "No `/dev-*` route exists for the side panel" does not mean "the side panel can't be tested on localhost."

### The maintainer is almost always running `yarn dev` already

Assume a dev server is live on `5173` and the unpacked `dist/` is loaded in Chrome whenever you're prompted. Two consequences:

- **Don't run `yarn build` to "test" a change.** HMR has already applied your edit to every surface; verify via ESLint plus the running dev server, not a production build. Reserve `yarn build` / `yarn release` for actually cutting a release.
- **Both `yarn dev` and `yarn build` write to `dist/`.** Running a production build into `dist/` while the dev server is serving it corrupts the CRXJS dev loader: it rewrites each surface's `index.html` into a tiny loader that boots from the dev server, and bundled `assets/` written over that leave the loader referencing files that don't line up, so the popup/side panel render `"An unknown error occurred. Failed to load the script."` If a surface ever shows that error, suspect a polluted `dist/`: stop everything, `rm -rf dist`, then run a single mode.

### What still can't run on localhost at all

Code that depends on `chrome.scripting`, `chrome.runtime.onInstalled`, or other APIs the standalone-route polyfill omits (see "Polyfill caveats" below) won't run on the `/dev-*` routes. The loaded CRXJS dev extension does have real Chrome APIs, so most of this works there, but background-service-worker lifecycle events still need a real install/update to observe.

For anything you genuinely can't verify, do not claim the change works just because ESLint passes. But also **do not tack on a standing caveat** about where the code runs (e.g. "this lives in the side panel, so please verify in browser"). The maintainer knows the surfaces. Do the verification a dev path enables, run ESLint, and stop. Surface a "please verify in browser" note only when there is something genuinely non-obvious to check (an untested assumption, a response shape you couldn't confirm, a risky edge case), not as boilerplate about where the code runs.

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
