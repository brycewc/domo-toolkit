/**
 * Domo instance identity.
 *
 * The extension identifies an instance by a single string "instance key", which
 * doubles as a storage key (per-instance settings, sidepanel view slots, the
 * background's per-instance user cache). Three shapes exist:
 *
 *   - Hosted:  `acme`               (the subdomain of `acme.domo.com`)
 *   - Local:   `dev.localhost:9128` (the full authority, port included)
 *   - Rig:     `bcindrich.domorig.io` (the full authority)
 *
 * Hosted keys stay bare subdomains so nothing already in storage has to be
 * migrated. Local keys carry the port because Domo's local dev server reads it
 * from the `PORT` env var, so two local instances can differ only by port and
 * must not share a storage slot. Rig keys keep their domain so a rig named for
 * the same word as a hosted instance cannot collide with it. No shape can
 * contain an underscore, which is what `sidepanelStorageKeyPrefix` relies on to
 * slice a key back out.
 *
 * Local and rig hosts are the two "internal" families: both are Domo-only, and
 * both sit behind the single optional host permission (see `internalInstance.js`).
 *
 * Local hosts come in three shapes, all of which have a `localhost` label
 * somewhere in the hostname:
 *
 *   http://dev.localhost:9128/              (default form)
 *   http://dev.localhost.domo.com:9128/     (also ends with .domo.com)
 *   http://qa2staging.domo.com.localhost:9128/  (wildcard proxy form)
 *
 * The `localhost` test therefore has to run BEFORE the `.domo.com` test, or the
 * second form would be read as the hosted instance `dev.localhost` and lose its
 * port.
 *
 * Passing the local test only makes a host a *candidate*: any local dev server on
 * `<something>.localhost` looks identical from the URL alone. Confirming a
 * candidate is really Domo requires the in-page `window.bootstrap` probe the
 * background runs (see `isVerifiedDomoOrigin` in `background.js`). Bare
 * `localhost` is excluded outright so our own Vite dev server on
 * `localhost:31573` is never a candidate. A rig host needs no such probe, since
 * `domorig.io` is Domo's own domain and hosts nothing else.
 */

/**
 * Build the instance key for a URL.
 * @param {string} url - A full URL string
 * @returns {string|null} The instance key, or null if the URL is not a Domo host
 */
export function instanceKeyFromUrl(url) {
  try {
    const { host, hostname } = new URL(url);
    if (isInternalDomoHostname(hostname)) {
      return host;
    }
    if (hostname.endsWith('.domo.com')) {
      return hostname.slice(0, -'.domo.com'.length);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Human-readable label for an instance key, for display only.
 * @param {string} key - An instance key
 * @returns {string} e.g. `acme.domo.com`, `dev.localhost:9128`, or `bcindrich.domorig.io`
 */
export function instanceLabel(key) {
  if (!key) return '';
  return isInternalInstanceKey(key) ? key : `${key}.domo.com`;
}

/**
 * Rebuild an origin from an instance key. This is a FALLBACK for the few paths
 * where only a bare key survives (a stored `defaultDomoInstance`, a session key
 * written by an older record). Prefer the exact origin already carried on
 * `DomoContext.origin` or `DomoObject.baseUrl`, since this cannot know whether a
 * local instance is being served over http or https.
 * @param {string} key - An instance key
 * @param {string} [scheme='http:'] - Scheme to assume for local keys
 * @returns {string} An origin, or '' when there is no key
 */
export function instanceOriginFromKey(key, scheme = 'http:') {
  if (!key) return '';
  if (isLocalInstanceKey(key)) return `${scheme}//${key}`;
  if (isInternalInstanceKey(key)) return `https://${key}`;
  return `https://${key}.domo.com`;
}

/**
 * Whether a hostname belongs to Domo at all: a domo.com host (exact or any
 * subdomain) or an internal host. Says nothing about whether the host is
 * excluded (see EXCLUDED_HOSTNAMES) or, for local candidates, whether it is
 * actually running Domo.
 * @param {string} hostname - A hostname, without port
 * @returns {boolean}
 */
export function isDomoHostname(hostname) {
  if (!hostname) return false;
  return isInternalDomoHostname(hostname) || hostname === 'domo.com' || hostname.endsWith('.domo.com');
}

/**
 * Whether a hostname is a Domo-internal host, meaning one behind the optional
 * host permission: a local dev candidate or a test rig.
 * @param {string} hostname - A hostname, without port
 * @returns {boolean}
 */
export function isInternalDomoHostname(hostname) {
  return isLocalDomoHostname(hostname) || isRigDomoHostname(hostname);
}

/**
 * Whether an instance key refers to an internal instance, whose key is a full
 * authority rather than a bare subdomain.
 * @param {string} key - An instance key
 * @returns {boolean}
 */
export function isInternalInstanceKey(key) {
  if (!key) return false;
  return isInternalDomoHostname(key.split(':')[0]);
}

/**
 * Whether a hostname is a candidate local Domo dev host. Requires at least one
 * label before `localhost`, since the local server uses that label to pick the
 * backend customer, and since bare `localhost` is where our own dev server runs.
 * @param {string} hostname - A hostname, without port
 * @returns {boolean}
 */
export function isLocalDomoHostname(hostname) {
  if (!hostname) return false;
  const labels = hostname.split('.');
  return labels.length > 1 && labels.includes('localhost');
}

/**
 * Whether an instance key refers to a local instance.
 * @param {string} key - An instance key
 * @returns {boolean}
 */
export function isLocalInstanceKey(key) {
  if (!key) return false;
  return isLocalDomoHostname(key.split(':')[0]);
}

/**
 * Whether a hostname is a Domo development test rig. Requires a subdomain, since
 * the bare domain is not an instance.
 * @param {string} hostname - A hostname, without port
 * @returns {boolean}
 */
function isRigDomoHostname(hostname) {
  if (!hostname) return false;
  return hostname.endsWith('.domorig.io');
}
