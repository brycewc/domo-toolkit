// ESM config: every `remark-*`/`retext-*`/`unified` package in this project is
// `"type": "module"` so CJS `require()` cannot load them. Using the `.mjs`
// extension forces ESM resolution regardless of the cosmiconfig version
// inside `unified-engine` / `remark-language-server`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import dictionaryEn from 'dictionary-en';
import remarkFrontmatter from 'remark-frontmatter';
import remarkPresetLintConsistent from 'remark-preset-lint-consistent';
import remarkPresetLintMarkdownStyleGuide from 'remark-preset-lint-markdown-style-guide';
import remarkPresetLintRecommended from 'remark-preset-lint-recommended';
import remarkRetext from 'remark-retext';
import retextEnglish from 'retext-english';
import retextRepeatedWords from 'retext-repeated-words';
import retextSentenceSpacing from 'retext-sentence-spacing';
import retextSyntaxUrls from 'retext-syntax-urls';
import retextUsage from 'retext-usage';
import { unified } from 'unified';
import remarkGfm from 'remark-gfm';

// Personal dictionary — Domo product nouns and toolkit-specific terms. One
// word per line; `#` for comments; blank lines OK. Add words here as you hit
// false positives in docs (and reload the VS Code window after editing).

const config = {
  // `settings` configures remark-stringify (the formatter that
  // `unified-prettier` runs on format-on-save) to match the lint rules
  // enforced by `remark-preset-lint-markdown-style-guide`. Without these,
  // Prettier emits `*` bullets while the linter wants `-` — fight on every
  // save.
  settings: {
    bullet: '-',
    listItemIndent: 'one'
  },
  plugins: [
    remarkFrontmatter,
    [
      remarkRetext,
      unified().use({
        plugins: [
          retextEnglish,
          retextSyntaxUrls,
          [retextSentenceSpacing, { preferred: 1 }],
          retextRepeatedWords,
          retextUsage,
          remarkGfm
        ]
      })
    ],
    remarkPresetLintConsistent,
    remarkPresetLintRecommended,
    remarkPresetLintMarkdownStyleGuide
  ]
};

export default config;
