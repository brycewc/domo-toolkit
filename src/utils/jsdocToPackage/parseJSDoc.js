import { parse as parseComments } from 'comment-parser';

export function parseJSDoc(source) {
  const blocks = parseComments(source, { spacing: 'preserve' });
  const offsets = blocks.map((block) => computeBlockRange(source, block));

  const functionDocs = [];
  const typedefs = {};

  blocks.forEach((block, idx) => {
    const range = offsets[idx];
    const typedefTag = block.tags.find((t) => t.tag === 'typedef');
    if (typedefTag) {
      const typedef = buildTypedef(block, typedefTag);
      if (typedef) typedefs[typedef.name] = typedef;
      return;
    }

    const fnName = findFunctionNameAfter(source, range.end);
    if (!fnName) return;
    const fnDoc = buildFunctionDoc({ block, functionName: fnName, range });
    if (fnDoc) functionDocs.push(fnDoc);
  });

  return { functionDocs, typedefs };
}

function computeBlockRange(source, block) {
  const indicator = `/**${block.source[0]?.tokens?.delimiter ? '' : ''}`;
  void indicator;
  const startLine = block.source[0]?.number ?? 0;
  const endLine = block.source[block.source.length - 1]?.number ?? startLine;
  const lineOffsets = computeLineOffsets(source);
  const start = lineOffsets[startLine] ?? 0;
  const endLineStart = lineOffsets[endLine] ?? start;
  const lineSource = block.source[block.source.length - 1]?.source ?? '';
  const closeIdx = source.indexOf('*/', endLineStart);
  const end = closeIdx === -1 ? endLineStart + lineSource.length : closeIdx + 2;
  return { end, start };
}

function computeLineOffsets(source) {
  const offsets = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') offsets.push(i + 1);
  }
  return offsets;
}

const FN_DECL_PATTERNS = [
  /^\s*(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/,
  /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\s*\*?\s*[A-Za-z_$\w$]*\s*)?\(/,
  /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/,
  /^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/
];

function buildFunctionDoc({ block, functionName, range }) {
  const summary = singleTagText(block, 'summary');
  const explicitDesc = singleTagText(block, 'description');
  const implicitDesc = (block.description || '').trim();
  const description = explicitDesc || implicitDesc || '';
  const isPrivate = block.tags.some((t) => t.tag === 'private');
  const params = extractParams(block.tags.filter((t) => t.tag === 'param'));
  const returns = extractReturns(block.tags.filter((t) => t.tag === 'returns' || t.tag === 'return'));
  return {
    blockRange: range,
    description,
    displayName: summary || null,
    functionName,
    isPrivate,
    params,
    rawBlock: block,
    returns
  };
}

function buildParamFromTag(tag) {
  const rawName = (tag.name || '').trim();
  if (!rawName) return null;
  return {
    defaultRaw: typeof tag.default === 'string' ? tag.default : null,
    description: (tag.description || '').trim(),
    optional: Boolean(tag.optional),
    rawName,
    rawType: tag.type || ''
  };
}

function buildTypedef(block, typedefTag) {
  const name = typedefTag.name?.trim();
  if (!name) return null;
  const baseType = typedefTag.type?.trim() || 'object';
  const properties = extractProperties(block.tags.filter((t) => t.tag === 'property' || t.tag === 'prop'));
  return { baseType, name, properties };
}

function extractParams(paramTags) {
  return paramTags.map((tag) => buildParamFromTag(tag)).filter(Boolean);
}

function extractProperties(propertyTags) {
  return propertyTags.map((tag) => buildParamFromTag(tag)).filter(Boolean);
}

function extractReturns(returnsTags) {
  if (!Array.isArray(returnsTags) || returnsTags.length === 0) return null;
  const [rootTag, ...rest] = returnsTags;
  const rawType = rootTag.type || '';
  const nameRaw = (rootTag.name || '').trim();
  const descRaw = (rootTag.description || '').trim();
  const isIdentifier = nameRaw && /^[A-Za-z_$][\w$]*$/.test(nameRaw);

  // Additional @returns tags whose name carries a dotted/bracket path (e.g.
  // `users[].id`) describe the output's nested schema inline, symmetric to the
  // `@param users[].id` convention used for inputs. They are parsed like params
  // so the manifest builder can walk them into the output's children.
  const properties = rest.map((tag) => buildParamFromTag(tag)).filter((p) => p && /[.[]/.test(p.rawName));

  // Form: `@returns {type} name - description` or `@returns {type} name` (single
  // identifier; user explicitly named the output).
  if (isIdentifier && (/^-\s/.test(descRaw) || !descRaw)) {
    return {
      description: descRaw.replace(/^-\s*/, ''),
      explicitName: true,
      name: nameRaw,
      properties,
      rawType
    };
  }

  // Form: `@returns {type} description...` (no name, all description even when the
  // first word is a valid identifier like "The"). Treat the whole post-type text
  // as the description.
  const fullDesc = [nameRaw, descRaw].filter(Boolean).join(' ').replace(/^-\s*/, '').trim();
  return { description: fullDesc, explicitName: false, name: null, properties, rawType };
}

function findFunctionNameAfter(source, fromIndex) {
  let cursor = fromIndex;
  while (cursor < source.length) {
    while (cursor < source.length && /\s/.test(source[cursor])) cursor++;
    if (cursor >= source.length) return null;
    if (source.startsWith('//', cursor)) {
      const nl = source.indexOf('\n', cursor);
      cursor = nl === -1 ? source.length : nl + 1;
      continue;
    }
    if (source.startsWith('/*', cursor)) {
      const close = source.indexOf('*/', cursor);
      cursor = close === -1 ? source.length : close + 2;
      continue;
    }
    const tail = source.slice(cursor, cursor + 200);
    for (const pattern of FN_DECL_PATTERNS) {
      const match = tail.match(pattern);
      if (match) return match[1];
    }
    return null;
  }
  return null;
}

function joinTagText(tag) {
  const namePart = tag.name ? tag.name : '';
  const descPart = tag.description ? tag.description : '';
  return [namePart, descPart].filter(Boolean).join(' ').trim();
}

function singleTagText(block, tagName) {
  const tag = block.tags.find((t) => t.tag === tagName);
  if (!tag) return '';
  return joinTagText(tag).trim();
}
