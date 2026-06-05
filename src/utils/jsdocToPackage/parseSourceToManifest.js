import { buildManifestFunctions } from './buildManifestFunctions';
import { mergeManifestFunctions } from './mergeManifest';
import { parseFunctionSignatures } from './parseFunctionSignatures';
import { parseJSDoc } from './parseJSDoc';
import { reconcileSignatures } from './reconcileSignatures';
import { applyJSDocRewrites } from './rewriteJSDoc';

export function parseSourceToManifest(source, existingFunctions = [], editorStartIndices = {}) {
  const allWarnings = [];

  const { functionDocs, typedefs } = parseJSDoc(source);
  const sigResult = parseFunctionSignatures(source);
  for (const err of sigResult.errors) allWarnings.push({ ...err, severity: 'error' });

  const reconciled = reconcileSignatures({
    functionDocs,
    signatures: sigResult.signatures,
    source
  });
  allWarnings.push(...reconciled.warnings);

  const reconciledSource = applyJSDocRewrites(source, reconciled.jsdocRewrites);

  const built = buildManifestFunctions({
    editorStartIndices,
    reconciledDocs: reconciled.reconciledDocs,
    typedefs
  });
  allWarnings.push(...built.warnings);

  const merged = mergeManifestFunctions({
    derivedFunctions: built.functions,
    existingFunctions,
    perFunctionMeta: built.perFunctionMeta
  });

  return {
    decisions: merged.decisions,
    derivedFunctions: built.functions,
    jsdocRewrites: reconciled.jsdocRewrites,
    mergedFunctions: merged.merged,
    reconciledSource,
    typedefs,
    warnings: allWarnings
  };
}
