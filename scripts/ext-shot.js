import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ext-shot.js: screenshot an extension surface (popup, side panel, options)
 * over a Playwriter direct-CDP connection.
 *
 * The default Playwriter extension-relay mode cannot reach chrome-extension://
 * pages (Chrome blocks chrome.debugger from attaching to another extension's
 * pages). Direct CDP bypasses that, so this script drives a browser that was
 * launched with --remote-debugging-port and connects with `session new --direct`.
 *
 * Prereq: launch your browser with the debugging port, e.g. on Windows:
 *   msedge.exe --remote-debugging-port=9222
 * (Your normal profile and loaded dev extension carry over. From WSL this is
 * reachable on localhost:9222 with mirrored networking.)
 *
 * Usage:
 *   node scripts/ext-shot.js <surface> [options]
 *
 * Surfaces: popup | sidepanel | options
 *
 * Options:
 *   --out <path>   Output PNG (default: .playwriter-shots/<surface>.png)
 *   --live         Render with live context from an already-open Domo tab:
 *                    popup     -> opened as a background tab in the Domo tab's
 *                                 window, so it resolves the Domo tab on mount
 *                                 (the popup reads context once and has no tab-
 *                                 activation listener, so it stays populated).
 *                    sidepanel -> attaches to the real side panel you already
 *                                 opened next to the Domo page and shoots that
 *                                 live target (opening the side panel as a plain
 *                                 tab is racy: it re-fetches on tab activation,
 *                                 so screenshotting resets it to empty).
 *   --port <n>     CDP port (default: 9222)
 *   --keep         Leave the temp tab/page open after the shot
 */

const SURFACES = { options: 'src/options/index.html', popup: 'src/popup/index.html', sidepanel: 'src/sidepanel/index.html' };
const VIEWPORTS = {
  options: { height: 900, width: 1280 },
  popup: { height: 720, width: 420 },
  sidepanel: { height: 760, width: 520 }
};

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

main();

/** Derive the deterministic unpacked-extension ID from the manifest `key`. */
function extensionId() {
  const manifest = readFileSync(join(repoRoot, 'manifest.config.js'), 'utf8');
  const match = manifest.match(/key:\s*'([A-Za-z0-9+/=]+)'/);
  if (!match) {
    throw new Error('Could not find `key` in manifest.config.js');
  }
  const digest = createHash('sha256').update(Buffer.from(match[1], 'base64')).digest('hex').slice(0, 32);
  return [...digest].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

function main() {
  const args = process.argv.slice(2);
  const surface = args.find((a) => !a.startsWith('--'));
  if (!surface || !SURFACES[surface]) {
    console.error('Usage: node scripts/ext-shot.js <popup|sidepanel|options> [--live] [--out <path>] [--port <n>] [--keep]');
    process.exit(1);
  }
  const flag = (name, fallback) => {
    const i = args.indexOf(name);
    return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
  };
  const live = args.includes('--live');
  const keep = args.includes('--keep');
  const port = flag('--port', '9222');
  const out = flag('--out', join(repoRoot, '.playwriter-shots', `${surface}.png`));
  mkdirSync(dirname(out), { recursive: true });

  const id = extensionId();
  requireCdp(port);

  const sessionId = newDirectSession();
  try {
    const snippet = live ? liveSnippet(surface, id, out, keep) : standaloneSnippet(surface, id, out, keep);
    const result = runSnippet(sessionId, snippet);
    process.stdout.write(result);
    console.log(`\nSaved ${surface} screenshot -> ${out}`);
  } finally {
    try {
      pw(['session', 'delete', String(sessionId)]);
    } catch {
      /* best-effort cleanup */
    }
  }
}

/** Build the JS snippet for a live-context capture. */
function liveSnippet(surface, id, out, keep) {
  const vp = VIEWPORTS[surface];
  if (surface === 'sidepanel') {
    return `
      const url = 'chrome-extension://${id}/src/sidepanel/index.html';
      const panel = context.pages().find((pg) => pg.url().startsWith(url));
      if (!panel) throw new Error('No open side panel found. Open the side panel next to a Domo page first, then rerun with --live.');
      await panel.bringToFront();
      await panel.screenshot({ path: ${JSON.stringify(out)} });
      console.log('shot live side panel:', panel.url());
    `;
  }
  // popup: open as a background tab in the Domo tab's window so mount resolves the Domo context
  return `
    const extBase = 'chrome-extension://${id}';
    let host = context.pages().find((pg) => pg.url().startsWith(extBase));
    if (!host) { host = await context.newPage(); await host.goto(extBase + '/src/options/index.html', { waitUntil: 'load' }); }
    const created = context.waitForEvent('page', { timeout: 15000 });
    const info = await host.evaluate(async (base) => {
      // Do not guess an instance from the URL: many *.domo.com hosts (pipeline/jenkins,
      // docs, support) are not product instances. Ask the extension which tab it actually
      // detected an object for; the background caches a context with a domoObject only for
      // real object pages, so that is the authoritative signal.
      const tabs = await chrome.tabs.query({});
      const onDomo = tabs.filter((t) => {
        try {
          return new URL(t.url).hostname.endsWith('.domo.com');
        } catch {
          return false;
        }
      });
      let domo = null;
      for (const t of onDomo) {
        const res = await chrome.runtime.sendMessage({ tabId: t.id, type: 'GET_TAB_CONTEXT' });
        if (res && res.success && res.context && res.context.domoObject) {
          domo = t;
          break;
        }
      }
      if (!domo) return { error: 'No Domo tab with a detected object found. Open a Domo object page (dataset, card, page, etc.) first.' };
      // The popup reads its window's active tab on mount, so make the instance tab active first.
      await chrome.tabs.update(domo.id, { active: true });
      const tab = await chrome.tabs.create({ active: false, url: base + '/src/popup/index.html', windowId: domo.windowId });
      return { domo: domo.url, tabId: tab.id };
    }, extBase);
    if (info.error) throw new Error(info.error);
    const popup = await created;
    await popup.setViewportSize({ width: ${vp.width}, height: ${vp.height} });
    await popup.waitForLoadState('load');
    await new Promise((r) => setTimeout(r, 2500));
    await popup.screenshot({ path: ${JSON.stringify(out)} });
    console.log('shot live popup for Domo tab:', info.domo);
    ${keep ? '' : 'await popup.close();'}
  `;
}

/** Start a fresh direct-CDP session and return its numeric id. */
function newDirectSession() {
  const out = pw(['session', 'new', '--direct']);
  const match = out.match(/Session (\d+) created/);
  if (!match) {
    throw new Error(`Could not parse session id from:\n${out}`);
  }
  return Number(match[1]);
}

/** Thin wrapper around the playwriter CLI. */
function pw(cliArgs) {
  return execFileSync('playwriter', cliArgs, { encoding: 'utf8' });
}

function requireCdp(port) {
  try {
    execFileSync('curl', ['-sf', '--max-time', '4', `http://localhost:${port}/json/version`], { encoding: 'utf8' });
  } catch {
    console.error(
      `No CDP endpoint on localhost:${port}.\n` +
        `Launch your browser with the debugging port first, e.g.:\n` +
        `  msedge.exe --remote-debugging-port=${port}\n` +
        `Then rerun this command.`
    );
    process.exit(1);
  }
}

function runSnippet(sessionId, snippet) {
  return pw(['-s', String(sessionId), '-e', snippet]);
}

/** Build the JS snippet for a plain standalone capture (empty context). */
function standaloneSnippet(surface, id, out, keep) {
  const vp = VIEWPORTS[surface];
  return `
    const p = await context.newPage();
    await p.setViewportSize({ width: ${vp.width}, height: ${vp.height} });
    await p.goto('chrome-extension://${id}/${SURFACES[surface]}', { waitUntil: 'load', timeout: 15000 });
    await new Promise((r) => setTimeout(r, 2500));
    await p.screenshot({ path: ${JSON.stringify(out)} });
    console.log('shot', p.url());
    ${keep ? '' : 'await p.close();'}
  `;
}
