export function findCurrentVersionInfo(versions, currentVersionId) {
  if (!Array.isArray(versions)) return null;
  if (currentVersionId) {
    const match = versions.find((v) => v?.version === currentVersionId);
    if (match) return match;
  }
  return findLatestVersionInfo(versions);
}

export function findLatestVersion(versions) {
  return findLatestVersionInfo(versions)?.version || null;
}

export function findLatestVersionInfo(versions) {
  if (!Array.isArray(versions) || versions.length === 0) return null;
  const sorted = [...versions]
    .filter((v) => v?.version)
    .sort((a, b) => compareSemverDesc(a.version, b.version));
  return sorted[0] || null;
}

export function incrementPatch(version) {
  if (!version || typeof version !== 'string') return '1.0.0';
  const parts = version.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return '1.0.0';
  return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
}

export function isVersionReleased(versionInfo) {
  return versionInfo?.released != null;
}

const COMPARED_FIELDS = [
  'displayName',
  'description',
  'isPrivate',
  'inputs',
  'output',
  'hasReturn'
];
const OUTPUT_STRUCTURAL_FIELDS = [
  'type',
  'value',
  'nullable',
  'isList',
  'children',
  'entitySubType',
  'defaultValues'
];

export function computeStructuralDiff(before, after) {
  const out = [];
  walkDiff(before, after, [], out);
  return out;
}

export function diffFunctions(derived, existing, meta = {}) {
  const diffFields = [];
  for (const field of COMPARED_FIELDS) {
    if (field === 'output' && meta.explicitOutputName === false) {
      if (!outputsEqualIgnoringName(derived?.output, existing?.output)) {
        diffFields.push('output');
      }
      continue;
    }
    if (!deepEqual(derived?.[field], existing?.[field])) diffFields.push(field);
  }
  return diffFields;
}

export function mergeManifestFunctions({ derivedFunctions, existingFunctions, perFunctionMeta }) {
  const existingByName = new Map();
  for (const fn of existingFunctions || []) {
    if (fn?.name) existingByName.set(fn.name, normalizeExistingFunction(fn));
  }
  const derivedByName = new Map();
  for (const fn of derivedFunctions || []) {
    if (fn?.name) derivedByName.set(fn.name, fn);
  }

  const decisions = [];
  const merged = [];

  for (const fn of derivedFunctions) {
    const existing = existingByName.get(fn.name);
    if (!existing) {
      decisions.push({
        action: 'added',
        derived: fn,
        diffFields: [],
        existing: null,
        name: fn.name
      });
      merged.push(fn);
      continue;
    }
    const meta = perFunctionMeta?.[fn.name] || {};
    const finalFn = preserveCuratedFields(fn, existing, meta);
    const diffFields = diffFunctions(finalFn, existing, meta);
    decisions.push({
      action: diffFields.length === 0 ? 'unchanged' : 'updated',
      derived: finalFn,
      diffFields,
      existing,
      name: fn.name
    });
    merged.push(finalFn);
  }

  for (const fn of existingFunctions || []) {
    if (!fn?.name) continue;
    if (derivedByName.has(fn.name)) continue;
    decisions.push({
      action: 'kept',
      derived: null,
      diffFields: [],
      existing: fn,
      name: fn.name
    });
    merged.push(fn);
  }

  return { decisions, merged };
}

export function resolveTargetVersion({ versions }) {
  const latest = findLatestVersionInfo(versions);
  if (latest && !isVersionReleased(latest)) {
    return { mode: 'overwrite', version: latest.version };
  }
  if (latest) {
    return { mode: 'create', version: incrementPatch(latest.version) };
  }
  return { mode: 'create', version: '1.0.0' };
}

function addMissingDefaultValues(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  if ('defaultValues' in entry) return entry;
  return { ...entry, defaultValues: entry.value ?? null };
}

function compareSemverDesc(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const av = pa[i] || 0;
    const bv = pb[i] || 0;
    if (av !== bv) return bv - av;
  }
  return 0;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (typeof a === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (!deepEqual(a[k], b[k])) return false;
    }
    return true;
  }
  return false;
}

function isNamedItem(x) {
  return x && typeof x === 'object' && !Array.isArray(x) && typeof x.name === 'string';
}

function normalizeExistingFunction(fn) {
  if (!fn || typeof fn !== 'object') return fn;
  return {
    ...fn,
    hasReturn: fn.hasReturn ?? fn.output != null,
    inputs: Array.isArray(fn.inputs) ? fn.inputs.map(addMissingDefaultValues) : fn.inputs,
    output:
      fn.output && typeof fn.output === 'object' ? addMissingDefaultValues(fn.output) : fn.output
  };
}

function outputsEqualIgnoringName(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  for (const f of OUTPUT_STRUCTURAL_FIELDS) {
    if (!deepEqual(a[f], b[f])) return false;
  }
  return true;
}

function preserveCuratedFields(derived, existing, meta = {}) {
  if (!existing) return derived;
  const out = { ...derived };
  if (existing.example && existing.example !== '') {
    out.example = existing.example;
  }
  if (existing.editorStartIndex != null) {
    out.editorStartIndex = existing.editorStartIndex;
  }
  if (meta.explicitOutputName === false && existing.output && derived.output) {
    out.output = {
      ...derived.output,
      displayName: existing.output.displayName,
      name: existing.output.name
    };
  }
  if (Array.isArray(out.inputs)) {
    out.inputs = preserveNullableInEntries(out.inputs, existing.inputs);
  }
  if (Array.isArray(out.variables)) {
    out.variables = preserveNullableInEntries(out.variables, existing.variables);
  }
  if (out.output && existing.output) {
    out.output = preserveNullableInEntry(out.output, existing.output);
  }
  return out;
}

function preserveNullableInEntries(derivedEntries, existingEntries) {
  const existingByName = new Map();
  if (Array.isArray(existingEntries)) {
    for (const e of existingEntries) {
      if (e?.name) existingByName.set(e.name, e);
    }
  }
  return derivedEntries.map((d) => preserveNullableInEntry(d, existingByName.get(d?.name)));
}

function preserveNullableInEntry(derived, existing) {
  if (!derived || typeof derived !== 'object') return derived;
  const out = { ...derived };
  // derived.nullable === false means "no default was found in JSDoc". The build
  // step only sets nullable=true when a real default exists. In that case defer to
  // whatever the user has set in Domo's UI rather than overwriting with our derived
  // default-of-false. When derived nullable is true, JSDoc carries authoritative
  // signal (a default value) and wins.
  if (existing && derived.nullable === false && typeof existing.nullable === 'boolean') {
    out.nullable = existing.nullable;
  }
  if (Array.isArray(derived.children)) {
    const existingChildren = Array.isArray(existing?.children) ? existing.children : [];
    out.children = preserveNullableInEntries(derived.children, existingChildren);
  }
  return out;
}

function walkDiff(a, b, path, out) {
  if (deepEqual(a, b)) return;
  if (a === undefined && b === undefined) return;
  if (a === undefined) {
    out.push({ kind: 'added', path: [...path], value: b });
    return;
  }
  if (b === undefined) {
    out.push({ kind: 'removed', path: [...path], value: a });
    return;
  }
  if (a === null || b === null) {
    out.push({ after: b, before: a, kind: 'changed', path: [...path] });
    return;
  }
  const aIsArr = Array.isArray(a);
  const bIsArr = Array.isArray(b);
  if (aIsArr !== bIsArr || typeof a !== typeof b) {
    out.push({ after: b, before: a, kind: 'changed', path: [...path] });
    return;
  }
  if (aIsArr) {
    const aHasNames = a.length > 0 && a.every(isNamedItem);
    const bHasNames = b.length > 0 && b.every(isNamedItem);
    if (aHasNames && bHasNames) {
      walkNamedArrays(a, b, path, out);
    } else {
      const max = Math.max(a.length, b.length);
      for (let i = 0; i < max; i++) {
        walkDiff(a[i], b[i], [...path, String(i)], out);
      }
    }
    return;
  }
  if (typeof a === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      walkDiff(a[k], b[k], [...path, k], out);
    }
    return;
  }
  out.push({ after: b, before: a, kind: 'changed', path: [...path] });
}

function walkNamedArrays(a, b, path, out) {
  const aMap = new Map(a.map((x) => [x.name, x]));
  const bMap = new Map(b.map((x) => [x.name, x]));
  const seen = new Set();
  const ordered = [];
  for (const x of [...a, ...b]) {
    if (!seen.has(x.name)) {
      seen.add(x.name);
      ordered.push(x.name);
    }
  }
  for (const name of ordered) {
    const ax = aMap.get(name);
    const bx = bMap.get(name);
    if (ax === undefined) {
      out.push({ kind: 'added', path: [...path, name], value: bx });
    } else if (bx === undefined) {
      out.push({ kind: 'removed', path: [...path, name], value: ax });
    } else {
      walkDiff(ax, bx, [...path, name], out);
    }
  }
}

const SERVER_FIELDS = ['createdOn', 'updatedOn', 'releasedOn', 'createdBy', 'updatedBy'];

export function findVersionForBaseline(versions, targetVersionId) {
  if (!Array.isArray(versions)) return null;
  if (targetVersionId) {
    const exact = versions.find((v) => v?.version === targetVersionId);
    if (exact) return exact;
  }
  return findLatestVersionInfo(versions);
}

export function preparePackagePayload({
  baseVersion,
  code,
  existingDefinition,
  manifestFunctions,
  newVersion,
  packageId
}) {
  const baseConfiguration = baseVersion?.configuration ||
    existingDefinition?.configuration || {
      accountsMapping: []
    };

  const payload = {
    code,
    environment: existingDefinition?.environment || 'LAMBDA',
    id: packageId,
    language: existingDefinition?.language || 'JAVASCRIPT',
    manifest: {
      configuration: baseConfiguration,
      functions: manifestFunctions
    },
    name: existingDefinition?.name || '',
    version: newVersion
  };

  for (const field of SERVER_FIELDS) {
    delete payload[field];
  }
  return payload;
}
