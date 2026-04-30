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

const COMPARED_FIELDS = ['displayName', 'description', 'isPrivate', 'inputs', 'output'];

export function diffFunctions(derived, existing) {
  const diffFields = [];
  for (const field of COMPARED_FIELDS) {
    if (!deepEqual(derived?.[field], existing?.[field])) diffFields.push(field);
  }
  return diffFields;
}

export function mergeManifestFunctions({ derivedFunctions, existingFunctions }) {
  const existingByName = new Map();
  for (const fn of existingFunctions || []) {
    if (fn?.name) existingByName.set(fn.name, fn);
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
      decisions.push({ action: 'added', derived: fn, diffFields: [], existing: null, name: fn.name });
      merged.push(fn);
      continue;
    }
    const diffFields = diffFunctions(fn, existing);
    const finalFn = preserveCuratedFields(fn, existing);
    decisions.push({
      action: diffFields.length === 0 ? 'unchanged' : 'updated',
      derived: fn,
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

function preserveCuratedFields(derived, existing) {
  if (!existing) return derived;
  const out = { ...derived };
  if (existing.example && existing.example !== '') {
    out.example = existing.example;
  }
  return out;
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
      accountsMapping: [],
      externalPackageMapping: {},
      mlModel: []
    };

  const payload = {
    code,
    environment: existingDefinition?.environment || 'LAMBDA',
    id: '',
    language: existingDefinition?.language || 'JAVASCRIPT',
    manifest: {
      configuration: baseConfiguration,
      functions: manifestFunctions
    },
    name: existingDefinition?.name || '',
    packageId,
    version: newVersion
  };

  for (const field of SERVER_FIELDS) {
    delete payload[field];
  }
  return payload;
}
