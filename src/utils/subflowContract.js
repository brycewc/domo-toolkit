import { getVersionDefinition } from '@/services/workflows';

/**
 * Turn a referenced workflow version's flat `schema.inputs` / `schema.outputs`
 * maps into the same manifest-entry shape the Code Engine diff/reconcile code
 * already expects, so a subflow tile can reuse that whole pipeline. Each map is
 * keyed by param id, with fields `{ name, type, subType, isList, isNullable, id,
 * isChild, parent }`; each returned entry carries
 * `{ id, name, type, entitySubType, isList, nullable, children }`. Nesting is
 * reconstructed from `parent`/`isChild` so a nested-object param keeps its child
 * fields (scalar params, the common case, simply have no children). Preserving the
 * schema `id` on each entry is what lets a newly added subflow input adopt the
 * referenced workflow's stable param id instead of a fresh random one.
 *
 * @param {Object|null} schema - The referenced version definition's top-level `schema`.
 * @returns {{ inputs: Object[], outputs: Object[] }}
 */
export function buildContractFromSchema(schema) {
  return {
    inputs: buildEntries(schema?.inputs),
    outputs: buildEntries(schema?.outputs)
  };
}

/**
 * Fetch a referenced workflow's input/output contract at a specific version and
 * normalize it to the manifest-entry shape. Mirrors `getFunctionContract` in
 * `ceContractDiff.js`, caching the normalized contract by `modelId@version` under a
 * `subflow:` namespace so it never collides with a Code Engine package's cache
 * entry in the same shared map.
 *
 * @param {Object} params
 * @param {Map<string, Object>} [params.cache] - Cache keyed by `subflow:${modelId}@${version}`.
 * @param {string} params.modelId - The referenced workflow's model id.
 * @param {number|null} [params.tabId] - Optional Chrome tab ID.
 * @param {string} params.version - The referenced version string.
 * @returns {Promise<{ inputs: Object[], outputs: Object[] }>}
 */
export async function getSubflowContract({ cache, modelId, tabId = null, version }) {
  const key = `subflow:${modelId}@${version}`;
  let contract = cache?.get(key);
  if (!contract) {
    const definition = await getVersionDefinition(modelId, version, tabId);
    contract = buildContractFromSchema(definition?.schema);
    cache?.set(key, contract);
  }
  return contract;
}

// Reshape one schema map (inputs or outputs) into a list of manifest entries,
// nesting children under their parent by id. Order follows the map's own key
// order, which is fine since the diff downstream matches entries by name.
function buildEntries(map) {
  if (!map || typeof map !== 'object') return [];
  const fields = Object.values(map);
  const byId = new Map(fields.map((field) => [field.id, toEntry(field)]));
  const roots = [];
  for (const field of fields) {
    const entry = byId.get(field.id);
    const parent = field.isChild && field.parent != null ? byId.get(field.parent) : null;
    if (parent) parent.children.push(entry);
    else roots.push(entry);
  }
  return roots;
}

function toEntry(field) {
  return {
    children: [],
    entitySubType: field.subType ?? null,
    id: field.id,
    isList: field.isList ?? false,
    name: field.name,
    nullable: field.isNullable ?? true,
    type: field.type ?? null
  };
}
