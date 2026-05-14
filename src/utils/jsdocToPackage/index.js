import { buildManifestFunctions } from './buildManifestFunctions';
import { mergeManifestFunctions } from './mergeManifest';
import { parseFunctionSignatures } from './parseFunctionSignatures';
import { parseJSDoc } from './parseJSDoc';
import { reconcileSignatures } from './reconcileSignatures';
import { applyJSDocRewrites } from './rewriteJSDoc';

export { buildManifestFunctions } from './buildManifestFunctions';
export { deriveDisplayName } from './displayName';
export {
  computeStructuralDiff,
  diffFunctions,
  findCurrentVersionInfo,
  findLatestVersion,
  findLatestVersionInfo,
  findVersionForBaseline,
  incrementPatch,
  isVersionReleased,
  mergeManifestFunctions,
  preparePackagePayload,
  resolveTargetVersion
} from './mergeManifest';
export { parseFunctionSignatures } from './parseFunctionSignatures';
export { parseJSDoc } from './parseJSDoc';
export { evaluateJSDocDefault, reconcileSignatures, serializeJSDocDefault } from './reconcileSignatures';
export { applyJSDocRewrites } from './rewriteJSDoc';
export { mapJSDocType, PRIMITIVE_TYPES } from './typeMap';

export function parseSourceToManifest(source, existingFunctions = []) {
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
