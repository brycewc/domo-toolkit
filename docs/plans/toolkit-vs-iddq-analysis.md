---
published: false
---

# IDDQDomo vs. Domo Toolkit: Feature Parity Analysis

## Context

Domo maintains an old internal-only Chrome extension, **IDDQDomo** (`~/repositories/dev-org/IDDQDomo`), built for Support staff. It is a jQuery content-script extension driven entirely by a right-click context menu and an injected floating button. Much of its functionality already exists in Domo Toolkit. This document catalogs every IDDQDomo feature, diffs it against Domo Toolkit's current capabilities, and reports **only the gaps** (things IDDQDomo does that Toolkit does not). For each gap it gives a best-guess classification: **All Users** (customer-appropriate power feature) vs. **Support-Only** (internal, infra-privileged, or security-sensitive), to inform a future "support mode" gated on the Domo Support system user ID.

This is an analysis deliverable, not an implementation plan. No support-mode design is included (per request). Parity is judged by observable behavior, not implementation; IDDQDomo scrapes the DOM with jQuery while Toolkit uses structured API services, which is irrelevant to whether the capability exists.

Sources: full IDDQDomo context-menu tree and function implementations (`menuFunctions.js`, `service-worker.js`, `buttonInsertionScript.js`); Toolkit action gating (`src/utils/availableActions.js`), type registry (`src/models/DomoObjectType.js`), and services (`src/services/`).

---

## Already at parity (no action needed)

These IDDQDomo features are effectively covered by Toolkit today, sometimes under a different name or split across several features:

| IDDQDomo feature                                  | Covered in Toolkit by                                                            |
| ------------------------------------------------- | -------------------------------------------------------------------------------- |
| Find Dashboards (pages a card is on)              | **Get Card Pages** (CARD)                                                        |
| Find Datasets (datasets on a page)                | **Get DataSets** (PAGE)                                                          |
| All MetaData (columns + cards + beast modes dump) | **Get Cards** + **Get Beast Modes** + Columns related tab + Current Context JSON |
| Find Joins (join transforms in a dataflow)        | **Inspect DataFlow** (shows every tile's expressions/aggregates/columns/config)  |
| Open Activity Log                                 | **Activity Log** (far richer: multi-user filters, DomoStats fallback)            |
| Lightning Lineage                                 | **View Lineage** full-page graph (upstream/downstream, tile ops, export)         |
| Passive error-response capture                    | **API Errors** panel (automatic capture of failed requests with full JSON)       |

---

## Gaps to expose to ALL users (customer-appropriate)

Ordered roughly by value. "Scope note" flags the CLAUDE.md test ("can a user already do this easily in Domo's UI?").

| Feature                                     | What it does                                                                                                                                                                                 | Object                       | Scope note                                                                                                                                                                             |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Get Connector Version**                   | Shows the dataset's connector version vs. the latest available in the appstore, so you know a connector is outdated and needs rebuilding.                                                    | DataSet / connector          | Domo's UI does not surface this clearly. Good fit.                                                                                                                                     |
| **Trigger Loop Check**                      | Detects cyclic dependency loops in a dataflow's lineage (dataflow A feeds B feeds A).                                                                                                        | DataFlow lineage             | Not exposed anywhere in Domo. Strong fit; complements existing lineage view.                                                                                                           |
| **Workbench: list Agents / Jobs / Version** | Lists all Workbench agents on the instance, the jobs under a given agent, and the Workbench version. Workbench Agent/Job/Schedule are already registry types with no actions behind them.    | Workbench Agent / Job        | Domo's Workbench admin surface is thin in the web UI. Fits the "expose hidden data" goal.                                                                                              |
| **Domo Everywhere inspection**              | Reveal all Publication IDs, all Subscription IDs, subscriber errors for a publication, and the PDP/proxy-user data permissions attached to a publication.                                    | Publication / Subscription   | Publishers/admins are customers. Batches list + error surfacing Domo only shows one-at-a-time. Subscriber-errors + publication-PDP are also heavily support-useful (see note below).   |
| **PDP by User and Group**                   | Builds a full matrix of who has Personalized Data Permission access to a dataset and why (explicit policy, group-inherited, dataset access, ownership, admin access), color-coded by source. | DataSet / PDP / User / Group | Exposes hidden data Domo's UI does not aggregate. Permission-gate on dataset.admin. Strong fit.                                                                                        |
| **Clone connector**                         | Opens a new dataset of the same connector type to recreate it.                                                                                                                               | Connector / Account          | Domo has no easy clone. Fits, but strip the internal bit (IDDQDomo auto-shares the account with hardcoded internal user id 27); a public version would share to the current user only. |
| **App Studio asset list**                   | Single unified manifest of every asset an App Studio app references: datasets, stacks/cards, forms, and Workflow models, with links.                                                         | Studio App                   | Partial parity today (Toolkit lists cards/datasets/pages separately). The gap is the unified manifest including forms + workflows. Medium value.                                       |
| **Show card filters**                       | Lists the filters currently applied on a card.                                                                                                                                               | Card                         | Partly covered by Copy Filtered URL + Card Definition tab. Low-value increment.                                                                                                        |
| **Beast Mode performance analysis**         | Beyond listing (Toolkit's Get Beast Modes), counts how many use `COUNT()` and how many exceed 30 lines, as performance-smell hints.                                                          | Card / Beast Mode            | Enhancement to the existing Get Beast Modes feature, not a new feature. Low priority.                                                                                                  |

**Likely out of scope (fail the CLAUDE.md "Domo UI already does this" test), listed for completeness:**

- **Find in App Store** and **Find Knowledge Articles**: just redirect searches into the appstore / support KB, both reachable directly in Domo. Recommend omitting unless bundled as a tiny convenience.
- **Error State** (raw stream/import failure JSON): dataset owners already see run errors in Domo's UI. The extra value (raw field-level API message) is marginal and leans toward support triage; consider it support-only or skip.

---

## Gaps likely limited to SUPPORT-only

These touch internal-only systems, privileged infrastructure, or security-sensitive data. They should be gated behind the planned support mode (or not ported at all).

| Feature                                 | What it does                                                                                                                                                                        | Why support-only                                                                                                                                      |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Get Datasource Engine**               | Runs raw SQL against **every Domo production environment** (prod1..prod201) via the DataAdmin desktop tool's local API (`localhost:6768`) to find which backend a dataset lives on. | Cross-tenant infra access; literally cannot function without an internal desktop tool and internal credentials. Never a customer feature.             |
| **Reveal Captured SAML**                | Decodes and pretty-prints the SAML SSO assertion passively intercepted from the user's `/auth/saml` login.                                                                          | Security-sensitive: captures federated auth assertions. Support/SSO-debugging only.                                                                   |
| **Retrieve Error TOEs**                 | Reads captured failed HTTP responses, fetches each one's backend **TOE (Trace Of Execution)** ID, and extracts a customer+session prefix for dev escalation.                        | TOE trace IDs are internal dev-escalation artifacts. Toolkit already captures errors (API Errors panel); only the TOE-extraction is support-specific. |
| **Show Debug**                          | Appends `?_f=show-debug` to a dataflow run URL to switch on a hidden internal debug output.                                                                                         | Internal feature-flag/debug hook.                                                                                                                     |
| **JIRA ECs**                            | Opens an internal `onjira.domo.com` JQL search for Enterprise Connector tickets.                                                                                                    | Internal issue tracker; not customer-accessible.                                                                                                      |
| **Last Import** (raw import-state JSON) | Opens the raw import metadata JSON for a stream for debugging.                                                                                                                      | Raw debugging artifact; leans support. Could be all-users but low value.                                                                              |
| **Show Console** (card chart packet)    | Enables the hidden card "console" button to grab the chart packet.                                                                                                                  | Chart-packet extraction is a debugging/escalation aid. Leans support.                                                                                 |
| **Get Dap ID**                          | Extracts the DAP ID + execution number specifically for dev tickets.                                                                                                                | Partly covered by Toolkit's Copy ID related-IDs for dataflow executions; the "for dev tickets" framing is support triage.                             |

**Internal-only bits to strip from anything ported:** the hardcoded account-share to user id 27 in Clone; all `onjira.domo.com` and DataAdmin (`localhost:6768`) dependencies; the always-on background SAML interceptor in `service-worker.js`.

---

## Classification heuristic used

- **Support-only** if the feature (a) calls an internal-only system (JIRA, DataAdmin, backend trace IDs), (b) reaches across tenants or into infra, (c) exposes security-sensitive auth data, or (d) toggles internal debug/feature flags.
- **All Users** if the feature operates only on objects the signed-in user can already access in their own instance and exposes/batches something Domo's UI hides or does one-at-a-time.
- Borderline items (Error State, Last Import, Show Console, subscriber errors) are called out inline; they work for customers but are primarily triage aids, so they are reasonable candidates to gate as support-only for cleanliness.

---

## How to verify this analysis

This is a read-only comparison; there is nothing to run. To validate the calls:

1. Cross-check each "parity" row by opening the named Toolkit feature (e.g. Get Card Pages on a card) and confirming it produces the same information IDDQDomo's function returns (`menuFunctions.js`).
2. Confirm the "All Users" gaps are genuinely absent by searching Toolkit for the capability, not just the type: e.g. `grep -rn 'onboard/agents' src` (Workbench listing, currently no hits) and reviewing `src/utils/availableActions.js` for the object type.
3. Confirm support-only features depend on internal systems by reading their implementations in `menuFunctions.js` (`getDatasourceEngine` ~line 4003, `revealCapturedSAML` ~line 3900, `getErrorTOES` ~line 2234) and the background capture listeners in `service-worker.js`.

## Suggested next step (not part of this analysis)

When you build support mode, the "All Users" table is the candidate backlog for standard features and the "Support-only" table is the gated set. Prioritization within "All Users" would start with Get Connector Version, Trigger Loop Check, and the Workbench listing, since those expose data Domo's own UI does not.
