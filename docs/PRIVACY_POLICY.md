# Privacy Policy for Domo Toolkit

**Last Updated:** February 4, 2026

## Overview

Domo Toolkit is a browser extension that enhances the Domo platform experience for power users. This privacy policy explains what data the extension accesses, how it's used, and your rights regarding that data.

**Key Points:**

- We do not operate servers or collect data. The only data that leaves your device is what we sync to your Google Account: theme preference, favicon settings, and your default Domo instance (all of which are optional). All other data is local to your device.
- No data is transmitted to external services or third parties.
- No data is used for advertising, analytics, or any purpose other than providing extension features.
- No human (including the developers) can read your data.
- No human (including the developers) can access Domo instances you use this extension with, or the data stored in them.

## Information the Extension Accesses

### 1. Domo Page Context (Session Only)

**What:** When you visit Domo pages (\*.domo.com/\*), the extension detects the current object you're viewing (page, card, dataset, dataflow, etc.) by reading URL patterns and page state.

**Why:** To provide contextual features like displaying object names in tab titles, enabling quick ID copying, and querying & displaying related objects in the side panel, etc.

**Storage:** Stored in browser session storage only. Only stores the current object per tab, overwriting immediately when a new object is viewed. Automatically cleared when you close your browser.

### 2. Clipboard Data (Temporary)

**What:** The extension reads your clipboard to check for valid Domo object IDs (numeric IDs or UUIDs) to power the "Navigate from Clipboard" feature.

**Why:** To enable quick navigation to Domo objects when you copy an ID from in or outside of Domo.

**Storage:** Only stored in session storage if the clipboard contains a valid Domo ID pattern. Never persists beyond your browser session. Clipboard contents that don't match Domo ID patterns are immediately discarded and never stored. Automatically cleared when you close your browser.

### 3. Cookie Names (Not Values)

**What:** The extension reads the names of cookies for \*.domo.com domains to identify Domo session cookies (DA-SID cookies). These are named DA-SID-\<environmentId\>-\<instanceId\>. These values are grabbed from window.bootstrap.data and do not contain sensitive information. For example, domo-community.domo.com would be named DA-SID-prod1-mmmm-0012-0200.

**Why:** To provide intelligent cookie management that resolves HTTP 431 errors while preserving your active sessions across multiple Domo instances.

**Storage:** Cookie names are processed in memory only and never stored. Cookie values are never read, stored, or used.

### 4. User Preferences (Persistent)

**What:** Your extension settings:

- Favicon customization rules (instance match regex patterns and colors)
- Theme preference (light/dark/system)
- Cookie clearing behavior preference (default/all/auto)
- Display card errors (true/false)
- Welcome page dismissal status (true/false)

**Why:** To remember your preferences across browser sessions.

**Storage:** Stored locally using Chrome's sync storage API, which syncs across your Chrome profile if you're signed in. This data is controlled by your Google account settings.

### 5. Favicon Cache (Persistent)

**What:** Cached favicon images generated based on your customization rules.

**Why:** To improve performance by avoiding regenerating favicons on every page load.

**Storage:** Stored locally using Chrome's local storage API. Remains on your device only.

### 6. Web Navigation Events (Domo Only)

**What:** The extension monitors navigation events (URL changes) exclusively on \*.domo.com domains.

**Why:** Domo sometimes uses single-page application routing, so the extension needs to detect when you navigate between objects to update object context and tab titles.

**Storage:** Navigation events are processed in real-time and not stored.

### 7. HTTP Response Status Codes (Optional, Domo Only)

**What:** When the auto cookie clearing is enabled (disabled by default), the extension monitors HTTP response status codes for requests to \*.domo.com.

**Why:** To automatically detect and resolve HTTP 431 "Request Header Fields Too Large" errors by clearing excess cookies, and HTTP errors on card URLs to display them to the user. If these options are disabled, these listeners are disabled entirely.

**Storage:** For cookies, only the status code (431) is read and triggers any action, never stored. For cards, only HTTP errors are read on card URLs and the response is displayed to the user directly from the content script, never stored.

## Information We Do NOT Collect

- **Personal Information:** We do not collect names, email addresses, or any other personally identifiable information (PII).
- **Domo Credentials:** We never read, access, store, or transmit your Domo username and password, SSO data, API access tokens, or API OAuth client IDs & secrets.
- **Domo Content:** We do not read or store data stored in the Domo instances you access.
- **Cookie Values:** We only read cookie names for identification purposes; cookie values are never accessed.
- **Browsing History:** We do not track your browsing activity outside of \*.domo.com domains. Any tracking only informs current context and event listeners and is never stored or used to track your behavior.
- **Analytics:** We do not collect usage analytics or telemetry of any kind ever.

## How We Use Information

All information accessed by the extension is used exclusively to provide the features described in this policy:

| Data Type         | Use                                                           |
| ----------------- | ------------------------------------------------------------- |
| Page context      | Display object names, enable ID copying, show related objects |
| Clipboard         | Navigate to copied Domo object IDs                            |
| Cookie names      | Intelligent session management for 431 error resolution       |
| Preferences       | Remember your extension settings                              |
| Favicon cache     | Display custom favicons efficiently                           |
| Navigation events | Keep extension context updated during SPA navigation          |
| Response codes    | Detect and resolve 431 errors (when enabled)                  |

## Data Sharing

**We do not share any data with anyone.**

- No data is transmitted to our servers (we don't operate any servers)
- No data is shared with third parties
- No data is used for advertising, marketing, or tracking of any kind
- No data is sold or monetized in any way

## Data Security

- Data remains in your local browser storage.
- Data passed between extension components uses Chrome's secure messaging APIs.
- The extension only operates on \*.domo.com domains, limiting its scope.
- The extension uses your existing Domo session authentication and therefore permissions; it cannot do anything you don't already have access to in a Domo instance.

## Data Retention

| Data Type        | Retention                                                                         |
| ---------------- | --------------------------------------------------------------------------------- |
| Page context     | Session only - cleared when browser closes                                        |
| Clipboard data   | Session only - cleared when browser closes                                        |
| User preferences | Until you change them or uninstall the extension                                  |
| Favicon cache    | Until you change favicon preferences, clear the cache, or uninstall the extension |

## Your Rights and Controls

### Viewing Your Data

- Extension preferences are visible in the extension's options page.
- Favicon rules can be viewed and edited in settings.

### Deleting Your Data

- **Session data:** Close your browser to clear all session storage.
- **Preferences:** Uninstall the extension to remove all stored data.
- **Favicon cache:** Use the "Clear Favicon Cache" option in settings or uninstall the extension.

### Disabling Features

- Automatic 431 handling can be disabled in settings (disabled by default)
- The extension can be disabled or uninstalled at any time via your browser's extension management

## Children's Privacy

This extension is designed for business users of the Domo platform and is not directed at children under 13. We do not knowingly collect any information from children.

## Changes to This Policy

If we make material changes to this privacy policy, we will update the "Last Updated" date and notify users through the Chrome Web Store and Edge Add-Ons Store listing update notes.

## Open Source

You don't just have to take our word for it. Domo Toolkit is entirely open source. You can review the complete source code to verify our privacy practices at: [https://github.com/brycewc/domo-toolkit](https://github.com/brycewc/domo-toolkit)

## Contact

If you have questions about this privacy policy or the extension's data practices, please contact us:

- **Email:** bryce.cindrich@domo.com
- **GitHub Issues:** [https://github.com/brycewc/domo-toolkit/issues](https://github.com/brycewc/domo-toolkit/issues)

## Limited Use Disclosure

Domo Toolkit's use and transfer of information received from Google APIs adheres to the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), including the Limited Use requirements:

1. **Allowed Use:** We only use permissions to provide the Domo productivity features described in this policy.
2. **Allowed Transfer:** We do not transfer any user data to external parties.
3. **No Advertising:** We do not use any data for personalized, re-targeted, or interest-based advertising.
4. **No Human Access:** No humans (including developers) read user data, except for debugging with explicit user consent via support requests.
