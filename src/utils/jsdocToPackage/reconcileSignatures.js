export function evaluateJSDocDefault(raw) {
  if (raw == null) return { defaultEvaluated: null, defaultLiteralOk: false };
  try {
    return { defaultEvaluated: JSON.parse(raw), defaultLiteralOk: true };
  } catch {
    if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
      return {
        defaultEvaluated: raw.slice(1, -1).replace(/\\(['"])/g, '$1'),
        defaultLiteralOk: true
      };
    }
    return { defaultEvaluated: raw, defaultLiteralOk: false };
  }
}

export function reconcileSignatures({ functionDocs, signatures, source }) {
  const reconciledDocs = [];
  const jsdocRewrites = [];
  const warnings = [];

  for (const doc of functionDocs) {
    const signature = signatures[doc.functionName];
    if (!signature) {
      reconciledDocs.push({ ...doc, params: doc.params.map(annotateJSDocOnlyParam) });
      continue;
    }

    const sigParams = signature.params;
    const topLevelJSDocParams = doc.params.filter((p) => !p.rawName.includes('.') && !p.rawName.includes('['));
    const childParams = doc.params.filter((p) => p.rawName.includes('.') || p.rawName.includes('['));
    const reconciledTop = [];

    const max = Math.max(topLevelJSDocParams.length, sigParams.length);
    for (let i = 0; i < max; i++) {
      const jp = topLevelJSDocParams[i];
      const sp = sigParams[i];

      if (jp && !sp) {
        warnings.push({
          functionName: doc.functionName,
          message: `Param \`${jp.rawName}\` is in JSDoc but not in function signature; will be skipped in manifest.`,
          paramName: jp.rawName,
          severity: 'warning'
        });
        reconciledTop.push({ ...annotateJSDocOnlyParam(jp), excludeFromManifest: true });
        continue;
      }
      if (sp && !jp) {
        warnings.push({
          functionName: doc.functionName,
          message: `Param \`${sp.name || '<destructured>'}\` is in function signature but missing from JSDoc; not auto-added.`,
          paramName: sp.name,
          severity: 'warning'
        });
        continue;
      }
      if (sp.isDestructured) {
        reconciledTop.push(annotateJSDocOnlyParam(jp));
        continue;
      }
      if (sp.isRest) {
        reconciledTop.push(annotateJSDocOnlyParam(jp));
        continue;
      }
      if (jp.rawName !== sp.name) {
        warnings.push({
          functionName: doc.functionName,
          message: `Position ${i}: JSDoc param \`${jp.rawName}\` does not match signature param \`${sp.name}\`. JSDoc kept as-is — verify manually.`,
          paramName: jp.rawName,
          severity: 'warning'
        });
        reconciledTop.push(annotateJSDocOnlyParam(jp));
        continue;
      }

      const reconciledParam = reconcileParam({
        doc,
        jp,
        rewrites: jsdocRewrites,
        source,
        sp,
        warnings
      });
      reconciledTop.push(reconciledParam);
    }

    reconciledDocs.push({ ...doc, params: [...reconciledTop, ...childParams.map(annotateJSDocOnlyParam)] });
  }

  return { jsdocRewrites, reconciledDocs, warnings };
}

export function serializeJSDocDefault(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return `'${value.replace(/'/g, "\\'")}'`;
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return JSON.stringify(value);
  }
  if (typeof value === 'object') {
    if (Object.keys(value).length === 0) return '{}';
    return JSON.stringify(value);
  }
  return JSON.stringify(value);
}

function annotateJSDocOnlyParam(jp) {
  if (!jp) return jp;
  const { defaultEvaluated, defaultLiteralOk } = evaluateJSDocDefault(jp.defaultRaw);
  return {
    ...jp,
    defaultEvaluated,
    defaultLiteralOk,
    defaultSource: jp.defaultRaw == null ? 'none' : 'jsdoc'
  };
}

function buildParamRewrite({ blockRange, defaultLiteral, functionName, paramName, source }) {
  const block = source.slice(blockRange.start, blockRange.end);
  const escName = escapeRegex(paramName);
  const pattern = new RegExp(
    `(@param[ \\t]+\\{[^}]+\\}[ \\t]+)(\\[?[ \\t]*${escName}(?:[ \\t]*=[ \\t]*(?:'[^']*'|"[^"]*"|[^\\]\\n]+?))?[ \\t]*\\]?)(?=[ \\t]|$|\\n)`,
    'm'
  );
  const match = block.match(pattern);
  if (!match) return null;
  const matchStart = blockRange.start + match.index;
  const tagPrefix = match[1];
  const replacement = `${tagPrefix}[${paramName}=${defaultLiteral}]`;
  const oldText = source.slice(matchStart, matchStart + match[0].length);
  return {
    end: matchStart + match[0].length,
    functionName,
    line: lineForOffset(source, matchStart),
    newText: replacement,
    oldText,
    paramName,
    start: matchStart
  };
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function lineForOffset(source, offset) {
  let line = 1;
  const limit = Math.min(offset, source.length);
  for (let i = 0; i < limit; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
}

function reconcileParam({ doc, jp, rewrites, source, sp, warnings }) {
  const jsdocDefault = evaluateJSDocDefault(jp.defaultRaw);
  if (sp.hasDefault) {
    if (!sp.isLiteralDefault) {
      warnings.push({
        functionName: doc.functionName,
        message: `Param \`${sp.name}\` has a non-literal default in the signature (\`${sp.defaultRaw}\`); JSDoc left untouched, manifest emits null default.`,
        paramName: sp.name,
        severity: 'warning'
      });
      return {
        ...jp,
        defaultEvaluated: null,
        defaultLiteralOk: false,
        defaultRaw: jp.defaultRaw,
        defaultSource: jsdocDefault.defaultLiteralOk ? 'jsdoc' : 'signature-non-literal',
        optional: true
      };
    }
    const sigLiteral = serializeJSDocDefault(sp.defaultEvaluated.value);
    const jsdocSerialized = jp.defaultRaw != null ? serializeJSDocDefault(jsdocDefault.defaultEvaluated) : null;
    if (jsdocSerialized !== sigLiteral) {
      const rewrite = buildParamRewrite({
        blockRange: doc.blockRange,
        defaultLiteral: sigLiteral,
        functionName: doc.functionName,
        paramName: sp.name,
        source
      });
      if (rewrite) rewrites.push(rewrite);
    }
    return {
      ...jp,
      defaultEvaluated: sp.defaultEvaluated.value,
      defaultLiteralOk: true,
      defaultRaw: sigLiteral,
      defaultSource: 'signature',
      optional: true
    };
  }
  return {
    ...jp,
    defaultEvaluated: jsdocDefault.defaultEvaluated,
    defaultLiteralOk: jsdocDefault.defaultLiteralOk,
    defaultSource: jp.defaultRaw == null ? 'none' : 'jsdoc'
  };
}
