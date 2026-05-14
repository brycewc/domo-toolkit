// ESM config: every `remark-*`/`retext-*`/`unified` package in this project is
// `"type": "module"` so CJS `require()` cannot load them. Using the `.mjs`
// extension forces ESM resolution regardless of the cosmiconfig version
// inside `unified-engine` / `remark-language-server`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import dictionaryEn from 'dictionary-en';
import remarkFrontmatter from 'remark-frontmatter';
import remarkLintListItemSpacing from 'remark-lint-list-item-spacing';
import remarkLintMaximumHeadingLength from 'remark-lint-maximum-heading-length';
import remarkLintMaximumLineLength from 'remark-lint-maximum-line-length';
import remarkLintNoDuplicateHeadings from 'remark-lint-no-duplicate-headings';
import remarkLintNoFileNameIrregularCharacters from 'remark-lint-no-file-name-irregular-characters';
import remarkLintOrderedListMarkerValue from 'remark-lint-ordered-list-marker-value';
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
    emphasis: '*',
    listItemIndent: 'one',
    // Force `[text](url)` form for links even when text === url.
    // Without this, mdast-util-to-markdown collapses them to autolinks (`<url>`).
    resourceLink: true,
    rule: '-'
  },
  plugins: [
    remarkFrontmatter,
    // `remark-gfm` must run on the outer mdast tree so the parser
    // recognizes task lists, tables, strikethrough, and autolinks.
    // Without this, `- [ ] item` parses as a plain list item and the
    // stringifier escapes the `[` to `\[` on every format-on-save.
    remarkGfm,
    [
      remarkRetext,
      unified().use({
        plugins: [
          retextEnglish,
          retextSyntaxUrls,
          [retextSentenceSpacing, { preferred: 1 }],
          retextRepeatedWords,
          retextUsage
        ]
      })
    ],
    remarkPresetLintConsistent,
    remarkPresetLintRecommended,
    remarkPresetLintMarkdownStyleGuide,
    // Override style-guide rules that fight prose docs. Order matters —
    // these must come *after* the preset to win the last-in-wins merge.
    [remarkLintMaximumLineLength, false],
    [remarkLintMaximumHeadingLength, false],
    [remarkLintNoDuplicateHeadings, false],
    [remarkLintListItemSpacing, false],
    // Disabled because Jekyll requires `_config.yml` / `_includes` / `_sass`
    // (leading underscores) and existing assets use snake_case names.
    [remarkLintNoFileNameIrregularCharacters, false],
    // Disabled because we prefer explicit `1. 2. 3.` numbering over the style
    // guide's "lazy numbering" (every item written as `1.`).
    [remarkLintOrderedListMarkerValue, false]
  ]
};

export default config;
