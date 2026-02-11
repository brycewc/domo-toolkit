# Domo Toolkit

A Chrome extension (Manifest V3) that enhances the Domo experience for power users ("Domos"), providing quick access to frequently used operations, data discovery, and administrative tools within Domo's platform.

## Tech Stack

| Category             | Technology              | Version      |
| -------------------- | ----------------------- | ------------ |
| **Framework**        | React                   | 19.1.0       |
| **Bundler**          | Vite                    | 7.3.0        |
| **Extension Plugin** | @crxjs/vite-plugin      | 2.0.3        |
| **UI Library**       | @heroui/react           | 3.0.0-beta.5 |
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
│   └── functions/      # Action button implementations
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
- **DomoObjectType** - Registry of ~30+ supported object types with URL patterns and validation

## Development Setup

```bash
# Install dependencies
npm install

# Start dev server (with HMR)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
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

Popup/Sidepanel listen for context updates from background:

```javascript
useEffect(() => {
  const handleMessage = (message) => {
    if (message.type === 'TAB_CONTEXT_UPDATED') {
      setCurrentContext(DomoContext.fromJSON(message.context));
    }
  };
  chrome.runtime.onMessage.addListener(handleMessage);
  return () => chrome.runtime.onMessage.removeListener(handleMessage);
}, []);
```

### Status Bar Pattern

Actions use StatusBar (already in ActionButtons) to show transient messages:

```javascript
const [statusData, setStatusData] = useState(null);

const showStatus = (message, level = 'primary', timeout = 3000) => {
  setStatusData({ message, level, timeout });
};

<StatusBar data={statusData} onDismiss={() => setStatusData(null)} />;
```

## Extension Permissions

| Permission            | Purpose                                   |
| --------------------- | ----------------------------------------- |
| `sidePanel`           | Open side panel UI                        |
| `storage`             | Persist settings (sync) and cache (local) |
| `scripting`           | Inject and execute scripts in pages       |
| `activeTab`           | Access current tab info                   |
| `clipboardRead/Write` | Copy object IDs                           |
| `cookies`             | Clear Domo cookies                        |
| `webNavigation`       | Listen for navigation events              |

Host permission: `https://*.domo.com/*`

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
