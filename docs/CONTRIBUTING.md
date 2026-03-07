# Contributing to Domo Toolkit

Thanks for your interest in contributing! Whether it's reporting a bug, suggesting a feature, or submitting code, this guide covers everything you need to know.

## Reporting Issues

Found a bug or have a feature request? [Open an issue](https://github.com/brycewc/domo-toolkit/issues) on GitHub. An issue is just a post describing what bug you ran into or what you'd like to see -- no coding or technical knowledge required. You'll need a free [GitHub account](https://github.com/signup) to create one. Include as much detail as you can (what you were doing, what happened, what you expected) and I'll take it from there.

### Bug Reports

Include as much of the following as you can:

- What you were doing when the bug occurred
- What you expected to happen vs. what actually happened
- Your browser and version (e.g., Chrome 130, Edge 131)
- Screenshots or screen recordings (where applicable)
- The Domo object type you were working with (Page, Card, DataSet, etc.)
- Any errors in the browser console (`F12` > Console tab)

### Feature Requests

Describe the problem you're trying to solve, not just the solution you have in mind. Context about your workflow helps prioritize and design the right approach.

## Submitting Pull Requests

### Getting Started

1. Fork the repository
2. Clone your fork and create a branch from `main`:

   ```bash
   git clone https://github.com/<your-username>/domo-toolkit.git
   cd domo-toolkit
   git checkout -b your-branch-name
   ```

3. Install dependencies and start the dev server:

   ```bash
   yarn
   yarn dev
   ```

4. Load the extension from the `dist` directory (see [Development Setup](#development-setup))

### Branch Naming

Use a short, descriptive branch name that reflects the change. For example:

- `fix-431-cookie-clearing`
- `add-workflow-delete`
- `update-favicon-settings-ui`

### Commit Messages

Write clear, descriptive commit messages. Start with what the change does, not what file was edited. A single commit covering a cohesive set of changes is preferred over many small ones, but split unrelated changes into separate commits.

Good:

- `Added retry functionality for loading object details`
- `Fixed scrolling height bug when switching between tabs on context footer`

Avoid:

- `Fixed bug`
- `Updated files`
- `WIP`

### PR Guidelines

- Keep PRs focused on a single change or feature
- Include a description of what the PR does and why
- Test your changes against a live Domo instance (domo-community.domo.com is a great testing environment if you don't feel comfortable testing in your usual instance)
- Make sure the extension builds without errors (`yarn build`)
- Run Prettier before submitting (`npx prettier --write .`)
- If your change affects the UI, include a screenshot or screen recording

### Code Review

All PRs are reviewed before merging. You may be asked to make changes -- this is normal and part of the process. Keep an eye on your PR for comments and requested changes.

# Helpful Developer Information

## Tech Stack

| Category             | Technology              | Version      |
| -------------------- | ----------------------- | ------------ |
| **Framework**        | React                   | 19.2.4       |
| **Bundler**          | Vite                    | 7.3.0        |
| **Extension Plugin** | @crxjs/vite-plugin      | 2.0.3        |
| **UI Library**       | @heroui/react           | 3.0.0-beta.6 |
| **CSS**              | Tailwind CSS            | 4.1.18       |
| **Icons**            | @tabler/icons-react     | 3.36.1       |
| **Tables**           | @tanstack/react-table   | 8.21.3       |
| **Virtualization**   | @tanstack/react-virtual | 3.13.18      |
| **Formatter**        | Prettier                | 3.7.4        |

## Project Structure

```
src/
├── popup/              # Popup UI (click on extension icon)
├── sidepanel/          # Side panel UI (contextual panel alongside pages)
├── options/            # Settings/options page
├── components/         # Shared React components
│   ├── functions/      # Action button implementations
│   └── options/        # Settings page components
├── services/           # Domo API service functions
├── models/             # Data classes (DomoObject, DomoContext, DomoObjectType)
├── hooks/              # Custom React hooks
├── utils/              # Utility functions
├── assets/             # Static assets and global CSS
├── background.js       # Service worker (background script)
└── contentScript.js    # Content script (injected into Domo pages)
```

## Architecture

The extension has four main execution contexts:

1. **Popup** - Small interface when extension icon is clicked
2. **Side Panel** - Persistent panel alongside Domo pages with richer UI
3. **Content Script** - Injected into Domo pages; detects objects, applies favicons
4. **Background Service Worker** - Handles message passing, maintains tab context cache

### Data Flow

```
Content Script (detects page context)
  → Background Service Worker (message relay, caches context)
  → Popup/Sidepanel (receives context via chrome.runtime messages)
  → User triggers action → Services execute via content script
```

### Core Models

- **DomoContext** - Represents a tab's context (instance, URL, detected object)
- **DomoObject** - Represents a Domo object (Card, Page, Dataset, etc.) with ID and type
- **DomoObjectType** - Registry of ~100+ supported object types with URL patterns, ID validation, and API configs

## Development Setup

```bash
# Install dependencies
yarn          # or: npm install

# Start dev server (with HMR)
yarn dev      # or: npm run dev

# Build for production
yarn build    # or: npm run build

# Preview production build
yarn preview  # or: npm run preview
```

Load the extension in Chrome:

1. Navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `dist` directory

## Code Conventions

### Formatting (via Prettier)

- Single quotes for strings and JSX attributes
- No trailing commas
- 2-space indentation
- Semicolons required
- Tailwind classes auto-sorted

### File Organization

- **Path alias:** `@/` maps to `src/` (e.g., `import { Copy } from '@/components'`)
- **Barrel exports:** Index files re-export from directories
- **Named exports only** (no default exports for components)

### React Patterns

- Functional components only (no class components)
- Custom hooks for reusable logic (see `src/hooks/`)
- Props destructuring in function signatures
- React 19 - no `forwardRef` needed

### Model Classes

- ES6 classes with `toJSON()` and `static fromJSON()` for serialization (required for message passing between extension contexts)

### Styling

- Tailwind CSS utility classes only (no inline styles)
- HeroUI components for complex UI elements
- Dark mode support via `data-theme` attribute on document root
- OKLch color space for theme colors (see `src/assets/global.css`)

## Key Patterns

### Executing Code in Page Context

Services need to inherit user session, authentication, and permissions by running in the page context:

```javascript
import { executeInPage } from '@/utils/executeInPage';

const result = await executeInPage(
  (arg1, arg2) => {
    // This runs in the Domo page context
    return fetch('/api/endpoint').then((r) => r.json());
  },
  [arg1, arg2],
  tabId
);
```

### Message Passing

Popup and sidepanel listen for context updates from the background service worker. Messages are filtered by `currentTabId` so each view only responds to updates for the tab it's displaying:

```javascript
useEffect(() => {
  const handleMessage = (message, sender, sendResponse) => {
    if (message.type === 'TAB_CONTEXT_UPDATED') {
      if (message.tabId === currentTabId) {
        const context = DomoContext.fromJSON(message.context);
        setCurrentContext(context);
      }
      sendResponse({ received: true });
      return true;
    }
    return false;
  };

  chrome.runtime.onMessage.addListener(handleMessage);
  return () => chrome.runtime.onMessage.removeListener(handleMessage);
}, [currentTabId]);
```

### Status Bar Pattern

Status messages are managed by the `useStatusBar` hook in the parent App component (popup or sidepanel). Child components receive an `onStatusUpdate` callback prop and call it to display transient alerts:

```javascript
// In the parent App component (popup/App.jsx or sidepanel/App.jsx)
const { statusBar, showStatus, hideStatus } = useStatusBar();

// Pass showStatus down as a prop
<ActionButtons onStatusUpdate={showStatus} />
<ContextFooter onStatusUpdate={showStatus} />

// Render StatusBar alongside content (animated overlay)
{statusBar.visible && (
  <StatusBar
    title={statusBar.title}
    description={statusBar.description}
    status={statusBar.status}
    timeout={statusBar.timeout}
    onClose={hideStatus}
  />
)}
```

Inside action components, call the callback to show a status message:

```javascript
// In any action component
onStatusUpdate('Copied', 'Object ID copied to clipboard', 'success', 3000);
```

## Extension Permissions

| Permission            | Purpose                                    |
| --------------------- | ------------------------------------------ |
| `sidePanel`           | Open side panel UI                         |
| `storage`             | Persist settings (sync) and cache (local)  |
| `scripting`           | Inject and execute scripts in pages        |
| `activeTab`           | Access current tab info                    |
| `clipboardRead/Write` | Copy object IDs                            |
| `cookies`             | Clear Domo cookies                         |
| `webNavigation`       | Listen for navigation events               |
| `webRequest`          | Detect 431 errors for auto cookie clearing |

Host permission: `*://*.domo.com/*`

## Configuration Files

| File                 | Purpose                                                           |
| -------------------- | ----------------------------------------------------------------- |
| `vite.config.js`     | Vite config with CRXJS, Tailwind, and path aliases                |
| `manifest.config.js` | Chrome extension manifest v3 (permissions, content scripts, etc.) |
| `.prettierrc`        | Code formatting rules                                             |

## Documentation

- [React Documentation](https://react.dev/reference/react)
- [Vite Documentation](https://vite.dev/guide/)
- [CRXJS Documentation](https://crxjs.dev/concepts/manifest)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [HeroUI Documentation](https://v3.heroui.com/docs/react/getting-started)
- [Tabler Icons Documentation](https://tabler.io/icons)
- [TanStack Table Documentation](https://tanstack.com/table/latest/docs/introduction)
- [TanStack Virtual Documentation](https://tanstack.com/virtual/latest/docs/introduction)
- [Prettier Documentation](https://prettier.io/docs)
