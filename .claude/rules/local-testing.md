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

The dev routes need `.env.development.local` (gitignored, copy from `.env.development.local.example` if it doesn't exist):

```
VITE_DOMO_BASE_URL=https://<instance>.domo.com
VITE_DOMO_TOKEN=<developer token from Admin > Authentication > Access Tokens>
VITE_DOMO_ENTITY_ID=<id of object to load>
VITE_DOMO_ENTITY_TYPE=<DATA_SOURCE | DATAFLOW | PAGE | etc.>
VITE_DOMO_OBJECT_NAME=<display name>
VITE_DOMO_ACTIVITY_LOG_DATASET_ID=<optional, see below>
```

Vite proxies `/api/*` to `VITE_DOMO_BASE_URL` and injects `X-Domo-Developer-Token: VITE_DOMO_TOKEN`. The `chromePolyfill.js` reads these env vars and seeds `chrome.storage.session` so the components find their initial state.

`VITE_DOMO_ACTIVITY_LOG_DATASET_ID` is optional and only affects `/dev-activity-log`. Setting it seeds `chrome.storage.local` with that instance's `activityLogDatasetId` plus `preferActivityLogDataset`, so the view opens on the DomoStats dataset source instead of the audit API. Without it the polyfill's `chrome.storage.local` starts empty, so the view opens on the API source and the dataset path is only reachable by clicking "Use DomoStats" to run discovery.

## Three layers of verification (use what fits)

1. **Compile / HMR check**: Start `yarn dev` in the background (Bash with `run_in_background: true`) and tail its output. Any syntax error, bad import, or invalid JSX surfaces here within ~1s of saving the file. Use this for every UI change as a baseline.

2. **Route smoke check**: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/dev-activity-log` should return `200`. Confirms the middleware and entry file resolved without a 500.

3. **Visual verification via Playwriter**: Use the `playwriter` skill to drive the user's actual Chrome to `http://localhost:5173/dev-activity-log` (or `/dev-lineage`) and screenshot. This is the real visual test for layout, colors, responsive breakpoints, and interactions. Run before claiming a visual change "looks right." Before starting `yarn dev`, check `ss -tln | grep 5173`; the user often has it already running, and a duplicate just lands on 5174.

   **Playwriter's default (extension relay) mode cannot open `chrome-extension://` pages, but direct CDP mode can.** In the default mode the Playwriter extension attaches via `chrome.debugger`, which Chrome forbids from attaching to another extension's pages, so navigating to a `chrome-extension://` URL fails with `Protocol error (Page.navigate): Detached while handling command`. That is the limitation, not the `chrome-extension://` scheme itself. Direct CDP mode (`playwriter session new --direct`) connects to the browser's own DevTools endpoint instead, bypassing `chrome.debugger`, and reaches every extension surface. So the popup, side panel, and options page ARE visually verifiable through Playwriter after all. See "[Driving extension pages via direct CDP](#driving-extension-pages-via-direct-cdp)" below for the recipe and the `scripts/ext-shot.js` helper. The `/dev-*` routes are still handy for fast component iteration, but they are no longer the only Playwriter path to the extension surfaces.

## Driving extension pages via direct CDP

The popup, side panel, and options page render as real `chrome-extension://` pages, and Playwriter reaches them in **direct CDP mode**. This is verified working from WSL against the maintainer's Windows Edge.

**Why the fixed URL works:** `manifest.config.js` pins a `key`, so the unpacked extension ID is deterministic in every mode and on every machine (`gagcendhhghphglhcgjakkkocbliekaj`). Each surface has a stable address:

- `chrome-extension://gagcendhhghphglhcgjakkkocbliekaj/src/popup/index.html`
- `chrome-extension://gagcendhhghphglhcgjakkkocbliekaj/src/sidepanel/index.html`
- `chrome-extension://gagcendhhghphglhcgjakkkocbliekaj/src/options/index.html`

(If you ever need to recompute the ID, `scripts/ext-shot.js` derives it from the manifest `key`.)

### Prerequisite: launch the browser with a debugging port on a non-default profile

Direct CDP needs the browser's DevTools endpoint open, which can only be set at launch. Two things trip this up, both verified the hard way:

- **Chromium 136+ ignores `--remote-debugging-port` on the default `user-data-dir`.** This is a security hardening (it stops malware from attaching to your everyday logged-in profile and reading its cookies). The flag is accepted, no port opens, no error. Edge 151 does this. So you MUST launch with a **non-default `--user-data-dir`**. Switching only `--profile-directory` does not help; the hardening and the singleton lock both key on the user-data-dir.
- **The singleton lock is per user-data-dir.** Launching the flag against an already-running profile just forwards the args to the existing process and drops the flag. A separate `--user-data-dir` sidesteps this too, so you can leave your normal browser open and run the debug instance alongside it.

Launch a dedicated, persistent debug profile (leave your main browser running):

```
"/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
  --user-data-dir="C:\Users\<you>\AppData\Local\Microsoft\Edge\Debug User Data" \
  --remote-debugging-port=9222 &
```

The dir persists, so future runs are just this one command. Because it starts empty, do a one-time setup in that window: sign into Domo (SSO), and if the Toolkit is not already there, `edge://extensions` -> Developer mode -> Load unpacked -> your `dist/`. For `--live` you also need a Domo object page open (and the side panel open next to it for the side-panel capture).

From WSL the port is reachable on `localhost:9222` when WSL2 mirrored networking is on (verified). Confirm with `curl -s http://localhost:9222/json/version`.

### The helper: `scripts/ext-shot.js`

```bash
node scripts/ext-shot.js <popup|sidepanel|options> [--live] [--out <path>] [--port 9222] [--keep]
```

It computes the extension ID, opens a `--direct` session, screenshots the surface to `.playwriter-shots/<surface>.png` (gitignored), and cleans the session up. Without `--live` the surface renders in its empty state (no Domo context), which is enough for layout, theme, and copy checks.

### Live populated Domo context

The popup and side panel derive their content from the **active Domo tab** via the background's per-tab context cache, so a bare tab shows "Not a Domo Instance." `--live` gets real context, and the two surfaces need different handling because they resolve context differently:

- **Popup** reads context once on mount and has no tab-activation listener. `--live` activates the Domo tab, then opens the popup as a **background tab in that tab's window**, so it resolves the Domo tab at mount and stays populated even when brought to front for the shot.
- **Side panel** re-fetches context on every tab activation in its window, so opening it as a plain tab is racy (screenshotting re-activates the extension tab and resets it to empty). `--live` instead **attaches to the real side panel** you already opened next to the Domo page and shoots that live target.

To pick the Domo tab, `--live` does not guess from the URL (many `*.domo.com` hosts, pipeline/jenkins, docs, support, are not product instances). It asks the background for each `*.domo.com` tab's context and takes the first with a detected `domoObject`, which is the extension's own signal for a real object page. Live mode therefore needs the dedicated debug profile signed into Domo (above) with a Domo object page open; both surfaces were verified rendering full live context (action grid plus the Current Context panel) this way.

### Caveats

- Direct CDP has **no screen recording** (Playwriter says so on connect). Screenshots and DOM snapshots work; video does not.
- The real popup is ephemeral (closes on blur); `--live` sidesteps that by rendering it as a tab.

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

`src/dev/chromePolyfill.js` stubs `chrome.storage.session`, `chrome.storage.sync`, `chrome.storage.onChanged`, and `chrome.tabs`. It deliberately **omits** `chrome.scripting`, which `executeInPage()` checks for the absence of to detect dev mode and call functions directly. If new code needs a Chrome API the polyfill doesn't stub, either add the stub or accept that path can't run on localhost.

## Workflow when fixing a UI bug

1. `yarn dev` (background)
2. Make the edit
3. Watch Vite output for compile errors
4. `curl` the relevant `/dev-*` route, confirm 200
5. Playwriter screenshot the relevant route, confirm the change looks right
6. Run `npx eslint --no-warn-ignored <file>` per `code-style.md`
7. Update `docs/RELEASE_NOTES.md` per `wip-release-notes.md`
