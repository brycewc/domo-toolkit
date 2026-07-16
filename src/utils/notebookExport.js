/**
 * Convert a text (notebook) card's content into a downloadable Markdown or HTML
 * document. Both derive from the card response's `textHtml`, the rendered
 * fragment whose dynamic values (summary numbers, variables) are already
 * resolved, so exports carry live values rather than field configs.
 */

/**
 * Wrap a card's rendered content in a standalone HTML document.
 * @param {{textHtml: string}} notebook - Notebook card response
 * @param {string} title - Card name, used as the document title
 * @returns {string} A complete HTML document
 */
export function notebookToHtml(notebook, title) {
  const textHtml = notebook?.textHtml;
  if (!textHtml) throw new Error('This card has no text content to export.');
  const safeTitle = String(title || 'Text Card').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${safeTitle}</title>
    <style>
      body {
        font-family: 'Open Sans', 'Helvetica Neue', Arial, Helvetica, sans-serif;
      }
    </style>
  </head>
  <body>
${textHtml}
  </body>
</html>
`;
}

/**
 * Convert a card's rendered content to Markdown by walking its `textHtml`.
 * Headings, bold/italic, links, and nested bullet/numbered lists are mapped;
 * color, underline, and alignment have no Markdown equivalent and are dropped.
 * @param {{textHtml: string}} notebook - Notebook card response
 * @returns {string} Markdown text
 */
export function notebookToMarkdown(notebook) {
  const textHtml = notebook?.textHtml;
  if (!textHtml) throw new Error('This card has no text content to export.');
  const doc = new DOMParser().parseFromString(textHtml, 'text/html');
  const markdown = renderBlocks(doc.body, 0).join('\n');
  return `${markdown.replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

// Escape the Markdown control characters that could be misread inside text, and
// strip zero-width / non-breaking artifacts Domo leaves in authored content.
function escapeText(text) {
  return text
    .replace(/\uFEFF/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/([\\`*])/g, '\\$1');
}

// Render a container's child nodes as block-level Markdown lines. Inline
// siblings are buffered into an implicit paragraph; block children recurse.
function renderBlocks(container, listDepth) {
  const lines = [];
  let inline = '';

  const flushInline = () => {
    const text = inline.replace(/[ \t]+/g, ' ').trim();
    if (text) lines.push(text, '');
    inline = '';
  };

  for (const node of container.childNodes) {
    if (node.nodeType === 3) {
      inline += escapeText(node.textContent);
      continue;
    }
    if (node.nodeType !== 1) continue;

    const tag = node.tagName;
    if (tag === 'UL' || tag === 'OL') {
      flushInline();
      lines.push(...renderList(node, tag === 'OL', listDepth), '');
    } else if (tag === 'DIV' || tag === 'P') {
      flushInline();
      lines.push(...renderBlocks(node, listDepth));
    } else if (/^H[1-6]$/.test(tag)) {
      flushInline();
      lines.push(`${'#'.repeat(Number(tag[1]))} ${renderInlineNodes([...node.childNodes]).trim()}`.trim(), '');
    } else if (tag === 'BR') {
      inline += '\n';
    } else {
      inline += renderInline(node);
    }
  }

  flushInline();
  return lines;
}

// Render a single inline element, applying its emphasis and unwrapping links.
function renderInline(el) {
  const tag = el.tagName;
  if (tag === 'BR') return '\n';
  const inner = renderInlineNodes([...el.childNodes]);
  if (tag === 'A' && el.getAttribute('href')) {
    return `[${inner.trim()}](${el.getAttribute('href')})`;
  }
  if (tag === 'STRONG' || tag === 'B') return wrapEmphasis(inner, '**');
  if (tag === 'EM' || tag === 'I') return wrapEmphasis(inner, '*');
  if (tag === 'SPAN') {
    const weight = el.style?.fontWeight;
    if (weight === 'bold' || Number(weight) >= 600) return wrapEmphasis(inner, '**');
    if (el.style?.fontStyle === 'italic') return wrapEmphasis(inner, '*');
  }
  return inner;
}

// Concatenate the inline Markdown for a list of sibling nodes.
function renderInlineNodes(nodes) {
  let out = '';
  for (const node of nodes) {
    if (node.nodeType === 3) out += escapeText(node.textContent);
    else if (node.nodeType === 1) out += renderInline(node);
  }
  return out;
}

// Render a <ul>/<ol> and its items, recursing into nested lists with a
// two-space indent per level. Each item's own text is separated from any
// nested lists so the child list renders on its own indented lines.
function renderList(listEl, ordered, depth) {
  const lines = [];
  const indent = '  '.repeat(depth);
  let index = 1;

  for (const li of listEl.children) {
    if (li.tagName !== 'LI') continue;

    const nested = [];
    const content = [];
    for (const child of li.childNodes) {
      if (child.nodeType === 1 && (child.tagName === 'UL' || child.tagName === 'OL')) nested.push(child);
      else content.push(child);
    }

    const marker = ordered ? `${index}.` : '-';
    const text = renderInlineNodes(content).replace(/\s+/g, ' ').trim();
    lines.push(`${indent}${marker} ${text}`.trimEnd());
    for (const list of nested) {
      lines.push(...renderList(list, list.tagName === 'OL', depth + 1));
    }
    index++;
  }

  return lines;
}

// Wrap text in an emphasis marker, keeping any surrounding whitespace outside
// the markers so the emphasis actually renders (** text ** does not).
function wrapEmphasis(text, marker) {
  const [, lead, core, trail] = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!core) return text;
  return `${lead}${marker}${core}${marker}${trail}`;
}
