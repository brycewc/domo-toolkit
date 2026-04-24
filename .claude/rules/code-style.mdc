---
globs: .js,.jsx
alwaysApply: false
---

# Code Style (ESLint + Prettier)

This project enforces strict sorting and formatting via `eslint-plugin-perfectionist`, `@stylistic/eslint-plugin`, and Prettier. All generated code **must** conform to these rules. After writing or editing any `.js` or `.jsx` file, run `npx eslint --no-warn-ignored <file>` to verify — fix any errors before finishing.

## Sorting (perfectionist recommended-alphabetical)

Everything is sorted **alphabetically (case-insensitive, ascending)** unless noted otherwise.

### Imports

1. Sort import **statements** alphabetically by module specifier.
2. Group imports with a blank line between groups, in this order:
   - Side-effect imports (`import 'foo';`)
   - External packages (`react`, `@heroui/react`, `motion/react`, etc.)
   - Internal alias (`@/components`, `@/hooks`, `@/utils`, etc.)
3. Within each group, sort alphabetically by the `from` path.
4. Sort **named imports** inside braces alphabetically: `import { Alpha, Beta, Gamma } from '...'`.
5. When named imports span multiple lines, put each on its own line, sorted alphabetically.

```javascript
// CORRECT
import { Button, Card, Link } from '@heroui/react';
import { IconBolt, IconEye } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import { FaviconSettings, Settings } from '@/components';
import { useTheme } from '@/hooks';

// WRONG — unsorted named imports, missing blank line before internal group
import { Card, Button, Link } from '@heroui/react';
import { useTheme } from '@/hooks';
import { IconEye, IconBolt } from '@tabler/icons-react';
```

### Exports

- Sort named exports alphabetically: `export { Alpha, Beta, Gamma }`.
- Sort export statements alphabetically by export path.

### Object Properties

Sort object keys alphabetically in:

- Object literals / state initializers
- Configuration objects
- Object patterns (destructuring)

```javascript
// CORRECT
const config = { apiUrl: '/api', retries: 3, timeout: 5000 };

// WRONG
const config = { timeout: 5000, apiUrl: '/api', retries: 3 };
```

### JSX Props

Sort JSX props in this group order, alphabetically within each group:

1. **Shorthand (boolean) props** — `disabled`, `fullWidth`, `required`
2. **Regular props** — `className`, `id`, `value`, etc. (alphabetical)
3. **Callback props** (`on*`) — `onChange`, `onClick`, `onPress`, etc. (alphabetical)
4. **Multiline props** — props whose value spans multiple lines (last)

```jsx
// CORRECT
<Select
  fullWidth                           // 1. shorthand
  aria-label='Cookie clearing'        // 2. regular (alpha)
  className='w-40'
  value={cookieSetting}
  variant='secondary'
  onChange={handleChange}              // 3. callback
  onPress={() => {                    // 4. multiline callback
    doSomething();
    doMore();
  }}
/>

// WRONG — callback before regular props, shorthand not first
<Select
  className='w-40'
  onChange={handleChange}
  fullWidth
  value={cookieSetting}
/>
```

### Module-level Declarations (sort-modules)

Within a file, order top-level declarations by kind:

1. Imports
2. `export` declarations (exported consts, exported functions, exported classes)
3. Non-exported declarations (consts, functions, classes)

Exported functions must come **before** non-exported functions. Use function declarations (hoisted) for helpers referenced by module-level consts above the export.

**Within each kind, sort alphabetically by declaration name** (case-insensitive). This applies to exported functions, non-exported functions, exported consts, and classes. When adding a new function to an existing file, find its alphabetical home — do not append to the bottom.

```javascript
// CORRECT — exported functions alphabetized, non-exported last
export function fetchObjectDetailsInPage(...) { ... }
export function getObjectType(...) { ... }
export function shareContent(...) { ... }
export function shareWithSelf(...) { ... }

async function shareForType(...) { ... }  // non-exported helper, goes after all exports

// WRONG — shareContent appended after shareWithSelf instead of alphabetized before it,
// and non-exported shareForType interleaved with exports
export function shareWithSelf(...) { ... }
async function shareForType(...) { ... }
export function shareContent(...) { ... }
```

### Switch Cases

Sort `case` clauses alphabetically. `default` goes last.

### Array Elements, Enums, Classes, Interfaces

Sort members/elements alphabetically when the collection is a declaration (not when order is semantic, like function arguments or steps).

## Formatting (Stylistic + Prettier)

| Rule                        | Value                                                    |
| --------------------------- | -------------------------------------------------------- |
| Quotes                      | Single quotes (`'`), including JSX attributes            |
| Trailing commas             | **None**                                                 |
| Semicolons                  | Always                                                   |
| Indentation                 | 2 spaces (no tabs)                                       |
| Arrow parens                | Always: `(x) => x`                                       |
| Brace style                 | `1tbs` (opening brace on same line)                      |
| Bracket spacing             | `{ foo }` not `{foo}`                                    |
| JSX bracket                 | Closing `>` on its own line (not same line as last prop) |
| Line endings                | LF (Unix)                                                |
| Max empty lines             | 1                                                        |
| No trailing spaces          | Enforced                                                 |
| Padded blocks               | Never (no blank lines after `{` or before `}`)           |
| Space before function paren | Named: no, Anonymous: no, Async arrow: yes               |

## Unused Variables

- Prefix unused variables/args with `_`: `(_event)`, `_unused`.
- Caught errors don't need prefixing (caughtErrors: 'none').

## Verification

After creating or editing `.js`/`.jsx` files, **always** run:

```bash
npx eslint --no-warn-ignored <file-paths>
```

Fix all errors before considering the task complete. The most commonly missed rules are **import sorting**, **JSX prop ordering**, **object key sorting**, **module-level function sorting** (alphabetize within a file — don't just append), and **trailing commas** (must be none).
