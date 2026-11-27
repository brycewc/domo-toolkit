---
published: false
---

# IDDQDomo vs. Domo Toolkit: Feature Parity Analysis

## Context

Domo maintains an old internal-only Chrome extension, **IDDQDomo** (v3.17.1, `~/repositories/Shmupport/IDDQDomo`), built for Support staff. It is a jQuery content-script extension driven entirely by a right-click context menu and an injected floating button. Much of its functionality already exists in Domo Toolkit. This document catalogs every IDDQDomo feature, diffs it against Domo Toolkit's current capabilities, and reports **only the gaps** (things IDDQDomo does that Toolkit does not). For each gap it gives a best-guess classification: **All Users** (customer-appropriate power feature) vs. **Support-Only** (internal, infra-privileged, or security-sensitive), to inform support mode.

This is an analysis deliverable, not an implementation plan. Parity is judged by observable behavior, not implementation; IDDQDomo scrapes the DOM with jQuery while Toolkit uses structured API services, which is irrelevant to whether the capability exists. A feature Domo has since shipped in its own product also counts as covered, since Toolkit's scope excludes what Domo's UI already does.

Sources: full IDDQDomo context-menu tree and function implementations (`menuFunctions.js`, `service-worker.js`, `buttonInsertionScript.js`); Toolkit action gating (`src/utils/availableActions.js`), type registry (`src/models/DomoObjectType.js`), services (`src/services/`), and the Current Context JSON view (`src/components/ContextFooter.jsx`).

### Support mode today

The gating plumbing exists, but nothing is behind it yet:

- `src/utils/supportMode.js` recognizes the Domo Support system user (`27`) and the support test account (`1010101`) via `isSupportUser(currentContext)`, plus an async `isSupportUserForTab(tabId)` for surfaces without a context (currently unused).
- `src/hooks/useSupportMode.js` ORs that with a dev-only `chrome.storage.local.supportModeOverride`, toggled from the Dev menu's "Enter/Exit Support Mode" item.
- `ActionButtons` passes the result to `getAvailableActions(currentContext, isSupportActive)`, whose `if (isSupportActive)` block is empty. A support-only feature adds its action key there.

---

## Already at parity (no action needed)

These IDDQDomo features are covered by Toolkit or by Domo's own product today, sometimes under a different name or split across several features:

| IDDQDomo feature                                  | Covered by                                                                                                                                                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Find Dashboards (pages a card is on)              | **Get Card Pages** (CARD)                                                                                                                                                                                     |
| Find DataSets (datasets on a page)                | **Get DataSets** (PAGE)                                                                                                                                                                                       |
| All MetaData (columns + cards + beast modes dump) | **Get Cards** + **Get Beast Modes** + Columns related tab + Current Context JSON                                                                                                                              |
| Find Joins (join transforms in a dataflow)        | **Inspect DataFlow** (shows every tile's expressions/aggregates/columns/config)                                                                                                                               |
| Open Activity Log                                 | **Activity Log** (far richer: multi-user filters, DomoStats fallback)                                                                                                                                         |
| Lightning Lineage                                 | **View Lineage** full-page graph (upstream/downstream, tile ops, export)                                                                                                                                      |
| Passive error-response capture                    | **API Errors** panel (automatic capture of failed requests with full JSON, including errors Domo reports inside a successful response)                                                                        |
| Get Connector Version                             | Current Context JSON on a dataset's Stream tab annotates the installed `transport.version` with the latest published connector version (`useConnectorVersion`, `ConnectorVersionAnnotation`)                  |
| App Studio asset list                             | **Get App Cards** (cards, forms, queues, and workflows, grouped per view), **Get App DataSets**, and **Get Pages** on any App Studio view. Split across three actions rather than one manifest, which is fine |
| Clone connector                                   | Now in Domo's product. Toolkit covers the account side: **Share with Self** on a dataset shares its account(s), and **Swap Account** rebinds a dataset to another account                                     |
| Error State (last stream execution JSON)          | Now in Domo's product                                                                                                                                                                                         |
| Last Import                                       | For a stream it only opens `/api/data/v1/streams/{id}`, which the Stream tab in Current Context already shows (with `fields=all`). Its legacy `/import/{id}` branch predates streams                          |
| Show Debug (`?_f=show-debug` on a dataflow run)   | Live for all users in Domo; the flag only renders the execution JSON in the page, which the Current Context JSON view already shows for a DataFlow Execution                                                  |
| Get Dap ID                                        | The DAP ID is the execution payload's `dapDataFlowExecutionId`, which the Current Context JSON view shows on a DataFlow Execution. A **Copy DAP ID** long-press entry would be a one-line `copyConfigs` add   |

---

## Gaps to expose to ALL users (customer-appropriate)

Ordered roughly by value. "Scope note" flags the CLAUDE.md test ("can a user already do this easily in Domo's UI?").

| Feature                             | What it does                                                                                                                                                                                                 | Object                       | Scope note                                                                                                                                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Trigger Loop Check**              | Walks every dataflow's inputs marked to run the flow when updated (`executeFlowWhenUpdated`) to find trigger loops: a dataflow that triggers itself, or A triggers B triggers A.                             | DataFlow triggers            | Not exposed anywhere in Domo, and View Lineage draws data lineage without flagging trigger cycles. Strong fit.                                                                                                |
| **Workbench: list Agents / Jobs**   | Opens the raw JSON of all Workbench agents on the instance (`/api/data/v1/onboard/agents`) and of the jobs under a given agent. Workbench Agent/Job/Schedule are registry types with no actions behind them. | Workbench Agent / Job        | Domo's Workbench admin surface is thin in the web UI. Fits the "expose hidden data" goal, and a port would render a list rather than open raw JSON.                                                           |
| **Domo Everywhere inspection**      | Reveal all Publication IDs, all Subscription IDs, subscriber errors for a publication, and the PDP/proxy-user data permissions attached to a publication.                                                    | Publication / Subscription   | Toolkit only touches these through Objects Owned and Transfer Ownership. Batches list + error surfacing Domo only shows one-at-a-time. Subscriber errors and publication PDP are also heavily support-useful. |
| **PDP by User and Group**           | Builds a full matrix of who has Personalized Data Permission access to a dataset and why (explicit policy, group-inherited, dataset access, ownership, admin access), color-coded by source.                 | DataSet / PDP / User / Group | Exposes hidden data Domo's UI does not aggregate. Toolkit reads PDP policies only to remap them in Migrate Downstream Content. Permission-gate on `dataset.admin`. Strong fit.                                |
| **Show card filters**               | Tables the card's saved filters (column, values, filter type, operand, data type), read from the card's `subscriptions` part.                                                                                | Card                         | Partly covered: the Card Definition tab carries the saved definition as JSON, and Copy Filtered URL captures the live filters and variables, but nothing tables them for reading. Low-value increment.        |
| **Beast Mode performance analysis** | For one card, counts its Beast Modes, how many contain `DISTINCT`, and how many are longer than 30 characters, naming the flagged ones as performance-smell hints.                                           | Card / Beast Mode            | Enhancement to the existing Get Beast Modes feature, not a new feature. The 30-character threshold is too crude to port as is. Low priority.                                                                  |

**Likely out of scope (fail the CLAUDE.md "Domo UI already does this" test), listed for completeness:**

- **Find in App Store** and **Find Knowledge Articles**: just redirect searches into the appstore / support KB, both reachable directly in Domo. Recommend omitting unless bundled as a tiny convenience.

---

## Gaps likely limited to SUPPORT-only

These touch internal-only systems, privileged infrastructure, or security-sensitive data. They should be gated behind support mode (or not ported at all).

| Feature                          | What it does                                                                                                                                                                                                        | Why support-only                                                                                                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Get Datasource Engine**        | Runs raw SQL against **every Domo production environment** (prod1..prod201) via the DataAdmin desktop tool's local API (`localhost:6768`) to find which backend a dataset lives on.                                 | Cross-tenant infra access; literally cannot function without an internal desktop tool and internal credentials. Never a customer feature.                                                                                  |
| **Reveal Captured SAML**         | Decodes and pretty-prints the SAML SSO assertion passively intercepted from the user's `/auth/saml` login.                                                                                                          | Security-sensitive: captures federated auth assertions. Support/SSO-debugging only. `availableActions.js` already names `revealCapturedSaml` as the example support key, but nothing is built.                             |
| **Retrieve Error TOEs**          | The service worker logs the URL and status of every 4xx/5xx Domo response; this re-fetches each URL to read the `toe` (Trace Of Execution) from the body and extracts a customer+session prefix for dev escalation. | TOE trace IDs are internal dev-escalation artifacts. Mostly covered: the API Errors panel captures the original response body, so its `toe` already shows there without a re-fetch. Only the prefix extraction is missing. |
| **JIRA ECs**                     | Opens an internal `onjira.domo.com` JQL search for Enterprise Connector tickets.                                                                                                                                    | Internal issue tracker; not customer-accessible.                                                                                                                                                                           |
| **Get Workbench Version**        | Queries an internal dataset on `domo.domo.com` for Workbench version info, and refuses to run on any other instance.                                                                                                | Depends on Domo's own instance and an internal dataset; a customer cannot run it.                                                                                                                                          |
| **Show Console** (`?_f=console`) | Appends `?_f=console` to a page or card URL, which turns on the card console used to grab the chart packet.                                                                                                         | Debugging/escalation aid. It is only a URL flag, so like Show Debug it may already work for any user; confirm before building anything for it.                                                                             |

**Internal-only bits to strip from anything ported:** all `onjira.domo.com`, `domo.domo.com` dataset, and DataAdmin (`localhost:6768`) dependencies; the always-on background SAML interceptor in `service-worker.js` (a port should capture only while support mode is active).

---

## Classification heuristic used

- **Support-only** if the feature (a) calls an internal-only system (JIRA, DataAdmin, backend trace IDs), (b) reaches across tenants or into infra, (c) exposes security-sensitive auth data, or (d) toggles internal debug/feature flags.
- **All Users** if the feature operates only on objects the signed-in user can already access in their own instance and exposes/batches something Domo's UI hides or does one-at-a-time.
- Borderline items (Show Console, subscriber errors) are called out inline; they work for customers but are primarily triage aids, so they are reasonable candidates to gate as support-only for cleanliness.

---

## How to verify this analysis

This is a read-only comparison; there is nothing to run. To validate the calls:

1. Cross-check each "parity" row by opening the named Toolkit feature (e.g. Get Card Pages on a card, Get App Cards on an App Studio view) and confirming it produces the same information IDDQDomo's function returns (`menuFunctions.js`).
2. Confirm the "All Users" gaps are genuinely absent by searching Toolkit for the capability, not just the type: e.g. `grep -rn 'onboard/agents' src` (Workbench listing, currently no hits) and reviewing `src/utils/availableActions.js` for the object type.
3. Confirm support-only features depend on internal systems by reading their implementations in `menuFunctions.js` (`getDatasourceEngine` ~line 4003, `revealCapturedSAML` ~line 3900, `getErrorTOES` ~line 2234) and the background capture listeners in `service-worker.js`.

## Suggested next step (not part of this analysis)

The "All Users" table is the candidate backlog for standard features and the "Support-only" table is the gated set, added under the `isSupportActive` block in `getAvailableActions`. Prioritization within "All Users" would start with Trigger Loop Check, the Workbench listing, and PDP by User and Group, since those expose data Domo's own UI does not.
