import { DomoObject } from '@/models/DomoObject';
import { executeInPage } from '@/utils/executeInPage';

// Which neighbor list a traversal direction is authoritative for, and the flag
// that records it. The lineage API only fills in the side it traversed: a
// downstream response lists every child of each entity it expanded, but trims
// those entities' parents down to the edges on the traversal path.
const COMPLETENESS_FLAGS = { children: 'childrenComplete', parents: 'parentsComplete' };
const LINEAGE_TYPE_MAP = { DATAFLOW_TYPE: 'DATAFLOW' };

export function convertToGraph(lineageResponse, startEntityType, startEntityId, baseUrl = '') {
  if (!lineageResponse || typeof lineageResponse !== 'object') {
    return { edges: [], nodes: [] };
  }

  const mappedType = LINEAGE_TYPE_MAP[startEntityType] ?? startEntityType;
  const startKey = toMapKey(mappedType, startEntityId);
  const nodes = [];
  const edges = [];
  const edgeSet = new Set();
  const addedNodes = new Set();

  // Run upstream and downstream BFS with independent depth maps so
  // neither pass contaminates the other's distance calculations.
  // Merge afterward, keeping the depth closest to root for each node.
  const upDepths = new Map();
  upDepths.set(startKey, 0);
  const upVisited = new Set([startKey]);
  const upQueue = [startKey];
  while (upQueue.length > 0) {
    const key = upQueue.shift();
    const entity = lineageResponse[key];
    if (!entity) continue;
    const currentDepth = upDepths.get(key);

    for (const parent of entity.parents || []) {
      if (!parent) continue;
      const parentKey = toMapKey(parent.type, parent.id);
      if (!upVisited.has(parentKey)) {
        upVisited.add(parentKey);
        upDepths.set(parentKey, currentDepth - 1);
        upQueue.push(parentKey);
      }
    }
  }

  const downDepths = new Map();
  downDepths.set(startKey, 0);
  const downVisited = new Set([startKey]);
  const downQueue = [startKey];
  while (downQueue.length > 0) {
    const key = downQueue.shift();
    const entity = lineageResponse[key];
    if (!entity) continue;
    const currentDepth = downDepths.get(key);

    for (const child of entity.children || []) {
      if (!child) continue;
      const childKey = toMapKey(child.type, child.id);
      if (!downVisited.has(childKey)) {
        downVisited.add(childKey);
        downDepths.set(childKey, currentDepth + 1);
        downQueue.push(childKey);
      }
    }
  }

  // Merge: start with upstream depths, then override with downstream
  // when it is closer to (or equidistant from) root.
  const depths = new Map();
  depths.set(startKey, 0);
  for (const [key, dep] of upDepths) {
    if (key !== startKey) depths.set(key, dep);
  }
  for (const [key, dep] of downDepths) {
    if (key === startKey) continue;
    const existing = depths.get(key);
    if (existing === undefined || Math.abs(dep) <= Math.abs(existing)) {
      depths.set(key, dep);
    }
  }

  for (const [key, entity] of Object.entries(lineageResponse)) {
    if (!entity) continue;

    const depth = depths.get(key);
    if (depth === undefined) continue;

    const nodeId = toNodeId(entity.type, entity.id);
    if (addedNodes.has(nodeId)) continue;
    addedNodes.add(nodeId);

    const name = entity.name || entity.id;
    const parents = entity.parents || [];
    const children = entity.children || [];

    nodes.push({
      depth,
      direction: depth === 0 ? 'root' : depth < 0 ? 'upstream' : 'downstream',
      // Counts describe what we hold; the flags say whether that is the whole
      // story. A truncated node reports 0 neighbors and must not read as a leaf.
      downstreamComplete: entity.childrenComplete === true,
      downstreamCount: children.length,
      entityId: entity.id,
      entityType: entity.type,
      id: nodeId,
      metadata: entity.metadata,
      name,
      object: buildNodeObject(entity.type, entity.id, baseUrl, entity.metadata),
      upstreamComplete: entity.parentsComplete === true,
      upstreamCount: parents.length
    });

    for (const parent of parents) {
      const parentNodeId = toNodeId(parent.type, parent.id);
      const edgeKey = `${parentNodeId}->${nodeId}`;
      if (!edgeSet.has(edgeKey)) {
        edgeSet.add(edgeKey);
        edges.push({ sourceId: parentNodeId, targetId: nodeId });
      }
    }

    for (const child of children) {
      const childNodeId = toNodeId(child.type, child.id);
      const edgeKey = `${nodeId}->${childNodeId}`;
      if (!edgeSet.has(edgeKey)) {
        edgeSet.add(edgeKey);
        edges.push({ sourceId: nodeId, targetId: childNodeId });
      }
    }
  }

  return { edges, nodes };
}

export async function enrichMetadata(lineageResponse, tabId = null, existingKeys = null, onProgress = null) {
  if (!lineageResponse || typeof lineageResponse !== 'object') {
    return {};
  }

  const datasetIds = [];
  const dataflowIds = [];
  const datasetEntities = new Map();
  const dataflowEntities = new Map();

  for (const [key, entity] of Object.entries(lineageResponse)) {
    if (!entity) continue;
    if (existingKeys && existingKeys.has(key)) continue;
    if (entity.type === 'DATA_SOURCE') {
      datasetIds.push(entity.id);
      datasetEntities.set(String(entity.id), entity);
    } else if (entity.type === 'DATAFLOW') {
      dataflowIds.push(entity.id);
      dataflowEntities.set(String(entity.id), entity);
    }
  }

  const chunkSize = 50;

  const fetchDatasetBatch = async (ids) => {
    return await executeInPage(
      async (ids) => {
        try {
          const response = await fetch('/api/data/v3/datasources/bulk?part=core,rowcolcount,status,cryo', {
            body: JSON.stringify(ids),
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            method: 'POST'
          });
          if (response.ok) {
            const data = await response.json();
            return (data.dataSources || []).map((ds) => ({
              columnCount: ds.columnCount,
              cryoStatus: ds.cryoStatus,
              id: ds.id,
              name: ds.name,
              // The bulk payload already names the owner, so a dataset needs no
              // follow-up lookup the way a dataflow (id only) does.
              owner: ds.owner
                ? {
                    id: ds.owner.id,
                    name: ds.owner.name,
                    type: ds.owner.type === 'GROUP' || ds.owner.group ? 'GROUP' : 'USER'
                  }
                : null,
              rowCount: ds.rowCount,
              status: ds.status
            }));
          }
        } catch {
          // Bulk dataset fetch failure is non-critical
        }
        return [];
      },
      [ids],
      tabId
    );
  };

  const fetchDataflowBatch = async (ids) => {
    return await executeInPage(
      async (ids) => {
        try {
          const response = await fetch(`/api/dataprocessing/v2/dataflows?dataFlowId=${ids.join(',')}`, {
            credentials: 'include',
            method: 'GET'
          });
          if (response.ok) {
            const data = await response.json();
            const flows = data.onboardFlows || [];

            // A dataflow names only its owner's id, so the batch's owners are
            // named in one more call here rather than by the caller: the export
            // reads these names straight off the metadata, and it never puts a
            // node on screen for a hook to fill in afterward. Best-effort, since
            // a nameless owner is not worth losing the rest of the batch over.
            const ownerIds = [...new Set(flows.map((df) => df.responsibleUserId).filter((id) => id != null))];
            const ownerNames = {};
            if (ownerIds.length > 0) {
              try {
                const usersResponse = await fetch(`/api/content/v3/users?id=${ownerIds.join(',')}`, {
                  credentials: 'include',
                  method: 'GET'
                });
                if (usersResponse.ok) {
                  for (const user of await usersResponse.json()) {
                    if (user?.id != null && user.displayName) ownerNames[user.id] = user.displayName;
                  }
                }
              } catch {
                // Owner names are non-critical
              }
            }

            return flows.map((df) => ({
              databaseType: df.databaseType,
              id: df.id,
              inputCount: df.inputs?.length,
              lastExecution: df.lastExecution,
              name: df.name,
              outputCount: df.outputs?.length,
              owner:
                df.responsibleUserId != null
                  ? {
                      id: df.responsibleUserId,
                      name: ownerNames[df.responsibleUserId] ?? null,
                      type: 'USER'
                    }
                  : null,
              runState: df.runState
            }));
          }
        } catch {
          // Bulk dataflow fetch failure is non-critical
        }
        return [];
      },
      [ids],
      tabId
    );
  };

  const applyResults = (results, entityMap) => {
    for (const { id, ...metadata } of results || []) {
      const entity = entityMap.get(String(id));
      if (entity) {
        entity.name = metadata.name || entity.name;
        entity.metadata = { ...entity.metadata, ...metadata };
      }
    }
  };

  // A large export enriches thousands of entities in 50-at-a-time batches, which
  // is the long tail of the work, so report after each batch. onProgress is the
  // only signal the caller has that anything is happening.
  const total = datasetIds.length + dataflowIds.length;
  let done = 0;
  const runBatch = async (chunk, fetchBatch, entityMap) => {
    applyResults(await fetchBatch(chunk), entityMap);
    done += chunk.length;
    onProgress?.(done, total);
  };

  const jobs = [];
  for (let i = 0; i < datasetIds.length; i += chunkSize) {
    const chunk = datasetIds.slice(i, i + chunkSize);
    jobs.push(() => runBatch(chunk, fetchDatasetBatch, datasetEntities));
  }
  for (let i = 0; i < dataflowIds.length; i += chunkSize) {
    const chunk = dataflowIds.slice(i, i + chunkSize);
    jobs.push(() => runBatch(chunk, fetchDataflowBatch, dataflowEntities));
  }

  // Bounded concurrency: every batch goes through executeInPage, and a full
  // export can queue hundreds of them, which stalls the chrome.scripting bridge
  // if they all fire at once.
  const CONCURRENCY = 5;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (jobs.length > 0) {
      const job = jobs.shift();
      if (!job) return;
      await job();
    }
  });
  await Promise.allSettled(workers);

  return lineageResponse;
}

/**
 * Find the entities where the API cut a traversal short, so a caller can re-root
 * a request at each one and see past the boundary. Walks out from the root along
 * each side and stops at the first entity whose neighbor list on that side is
 * not known-complete, since nothing beyond such an entity is known yet.
 * @param {Object} cache - Merged lineage entities keyed by `${type}${id}`
 * @param {string} rootType - Entity type the cache is rooted at
 * @param {string} rootId - Entity id the cache is rooted at
 * @returns {Array<{ id: string, type: string }>} Entities still to be traversed
 */
export function findTruncatedNodes(cache, rootType, rootId) {
  const rootKey = toMapKey(toLineageType(rootType), rootId);
  const truncated = new Map();

  for (const [side, flag] of Object.entries(COMPLETENESS_FLAGS)) {
    const visited = new Set([rootKey]);
    const queue = [rootKey];

    while (queue.length > 0) {
      const key = queue.shift();
      const entity = cache?.[key];
      if (!entity) continue;

      if (entity[flag] !== true) {
        truncated.set(key, { id: entity.id, type: entity.type });
        continue;
      }

      for (const neighbor of entity[side] || []) {
        if (!neighbor) continue;
        const neighborKey = toMapKey(neighbor.type, neighbor.id);
        if (!visited.has(neighborKey)) {
          visited.add(neighborKey);
          queue.push(neighborKey);
        }
      }
    }
  }

  return [...truncated.values()];
}

export async function getLineage(entityType, entityId, maxDepth = 4, tabId = null) {
  const apiType = LINEAGE_TYPE_MAP[entityType] ?? entityType;
  const rootKey = toMapKey(apiType, entityId);

  const fetchDirection = (traverseParam) =>
    executeInPage(
      async (entityType, entityId, maxDepth, traverseParam) => {
        const url = `/api/data/v1/lineage/${entityType}/${entityId}?${traverseParam}&maxDepth=${maxDepth}&requestEntities=DATA_SOURCE,DATAFLOW`;
        const response = await fetch(url, {
          credentials: 'include',
          method: 'GET'
        });
        if (!response.ok) {
          throw new Error(`Failed to fetch lineage: HTTP ${response.status}`);
        }
        return response.json();
      },
      [apiType, entityId, maxDepth, traverseParam],
      tabId
    );

  const [upResponse, downResponse] = await Promise.all([
    fetchDirection('traverseDown=false'),
    fetchDirection('traverseUp=false')
  ]);

  annotateCompleteness(upResponse, rootKey, maxDepth, 'parents');
  annotateCompleteness(downResponse, rootKey, maxDepth, 'children');

  return mergeLineageInto(mergeLineageInto({}, upResponse), downResponse);
}

/**
 * Merge a lineage response into an accumulating cache, in place. Neighbor lists
 * union rather than replace, and the completeness flags only ever improve: one
 * authoritative fetch settles a side, and a later response that truncated that
 * side must not undo it. Existing entities are mutated rather than swapped out,
 * so metadata already enriched onto them survives.
 * @param {Object} target - Cache to merge into, keyed by `${type}${id}`
 * @param {Object} source - Lineage response to merge in
 * @returns {Object} The same `target`, for chaining
 */
export function mergeLineageInto(target, source) {
  for (const [key, entity] of Object.entries(source || {})) {
    if (!entity) continue;

    const existing = target[key];
    if (!existing) {
      target[key] = entity;
      continue;
    }

    for (const [side, flag] of Object.entries(COMPLETENESS_FLAGS)) {
      if (entity[side]?.length) {
        const seen = new Set((existing[side] || []).map((n) => toMapKey(n.type, n.id)));
        for (const neighbor of entity[side]) {
          if (!seen.has(toMapKey(neighbor.type, neighbor.id))) {
            (existing[side] ??= []).push(neighbor);
          }
        }
      }
      if (entity[flag]) existing[flag] = true;
    }

    if (!existing.name && entity.name) existing.name = entity.name;
    if (entity.metadata) {
      existing.metadata = { ...existing.metadata, ...entity.metadata };
    }
  }

  return target;
}

export function toLineageType(type) {
  return LINEAGE_TYPE_MAP[type] ?? type;
}

export function toMapKey(type, id) {
  return `${type}${id}`;
}

export function toNodeId(type, id) {
  return `${type}:${id}`;
}

/**
 * Record, per entity, whether its neighbor list on the traversed side is the
 * complete one. The API expands `maxDepth` hops from the requested root and then
 * includes the entities one hop past that as entries whose traversed-side list
 * is empty. Those stubs are indistinguishable from genuine leaves unless we
 * measure how far out each entity sat, which is what this does.
 * @param {Object} response - Single-direction lineage response
 * @param {string} rootKey - Map key of the requested root
 * @param {number} maxDepth - Depth the request asked for
 * @param {'children'|'parents'} side - The side the request traversed
 * @returns {Object} The same `response`, annotated in place
 */
function annotateCompleteness(response, rootKey, maxDepth, side) {
  if (!response || typeof response !== 'object') return response;

  const flag = COMPLETENESS_FLAGS[side];
  const distances = new Map([[rootKey, 0]]);
  const queue = [rootKey];

  while (queue.length > 0) {
    const key = queue.shift();
    const entity = response[key];
    if (!entity) continue;
    const distance = distances.get(key);

    for (const neighbor of entity[side] || []) {
      if (!neighbor) continue;
      const neighborKey = toMapKey(neighbor.type, neighbor.id);
      if (!distances.has(neighborKey)) {
        distances.set(neighborKey, distance + 1);
        queue.push(neighborKey);
      }
    }
  }

  for (const [key, entity] of Object.entries(response)) {
    if (!entity) continue;
    const distance = distances.get(key);
    entity[flag] = distance !== undefined && distance <= maxDepth;
  }

  return response;
}

function buildNodeObject(type, id, baseUrl, metadata) {
  try {
    const object = new DomoObject(type, id, baseUrl, metadata ?? {});
    // Without an instance we cannot build an absolute deep link, so drop the
    // relative URL DomoObject would otherwise produce.
    if (!baseUrl) object.url = null;
    return object;
  } catch {
    // Unknown type (not in the registry): callers fall back to the raw lineage
    // type and skip the URL.
    return null;
  }
}
