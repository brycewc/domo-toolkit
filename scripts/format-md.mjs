// One-off helper: format a markdown file with the project's remark settings.
// Useful when manual edits leave the table misaligned and you can't reach
// VS Code's format-on-save (which uses remark-language-server with the same
// settings from .remarkrc.mjs).
//
// Usage: node scripts/format-md.mjs <path-to-md-file>

import { readFileSync, writeFileSync } from 'node:fs';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/format-md.mjs <path-to-md-file>');
  process.exit(1);
}

const input = readFileSync(file, 'utf8');
const result = await unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkStringify, {
    bullet: '-',
    emphasis: '*',
    listItemIndent: 'one',
    rule: '-'
  })
  .process(input);
writeFileSync(file, String(result));
console.log(`Formatted ${file}`);
