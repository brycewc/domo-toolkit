import { executeInPage } from '@/utils';

const LINEAGE_TYPE_MAP = { DATAFLOW_TYPE: 'DATAFLOW' };

export function convertToGraph(lineageResponse, startEntityType, startEntityId) {
  if (!lineageResponse || typeof lineageResponse !== 'object') {
    return { edges: [], nodes: [] };
  }

  const mappedType = LINEAGE_TYPE_MAP[startEntityType] ?? startEntityType;
  const startKey = toMapKey(mappedType, startEntityId);
  const nodes = [];
  const edges = [];
  const edgeSet = new Set();
  const addedNodes = new Set();

  const depths = new Map();
  depths.set(startKey, 0);

  const upVisited = new Set([startKey]);
  const upQueue = [startKey];
  while (upQueue.length > 0) {
    const key = upQueue.shift();
    const entity = lineageResponse[key];
    if (!entity) continue;
    const currentDepth = depths.get(key) ?? 0;

    for (const parent of entity.parents || []) {
      if (!parent) continue;
      const parentKey = toMapKey(parent.type, parent.id);
      if (!upVisited.has(parentKey)) {
        upVisited.add(parentKey);
        depths.set(parentKey, currentDepth - 1);
        upQueue.push(parentKey);
      }
    }
  }

  const downVisited = new Set([startKey]);
  const downQueue = [startKey];
  while (downQueue.length > 0) {
    const key = downQueue.shift();
    const entity = lineageResponse[key];
    if (!entity) continue;
    const currentDepth = depths.get(key) ?? 0;

    for (const child of entity.children || []) {
      if (!child) continue;
      const childKey = toMapKey(child.type, child.id);
      if (!downVisited.has(childKey)) {
        downVisited.add(childKey);
        if (!depths.has(childKey)) {
          depths.set(childKey, currentDepth + 1);
        }
        downQueue.push(childKey);
      }
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
      downstreamCount: children.length,
      entityId: entity.id,
      entityType: entity.type,
      id: nodeId,
      metadata: entity.metadata,
      name,
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

export async function enrichMetadata(lineageResponse, tabId = null, existingKeys = null) {
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
          const response = await fetch(
            '/api/data/v3/datasources/bulk?part=core,rowcolcount',
            {
              body: JSON.stringify(ids),
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              method: 'POST'
            }
          );
          if (response.ok) {
            const data = await response.json();
            return (data.dataSources || []).map((ds) => ({
              columnCount: ds.columnCount,
              id: ds.id,
              name: ds.name,
              rowCount: ds.rowCount
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
          const response = await fetch(
            `/api/dataprocessing/v2/dataflows?dataFlowId=${ids.join(',')}`,
            { credentials: 'include', method: 'GET' }
          );
          if (response.ok) {
            const data = await response.json();
            return (data.onboardFlows || []).map((df) => ({
              id: df.id,
              inputCount: df.inputs?.length,
              lastExecution: df.lastExecution,
              name: df.name,
              outputCount: df.outputs?.length,
              state: df.runState
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

  const datasetChunks = [];
  for (let i = 0; i < datasetIds.length; i += chunkSize) {
    datasetChunks.push(datasetIds.slice(i, i + chunkSize));
  }

  const dataflowChunks = [];
  for (let i = 0; i < dataflowIds.length; i += chunkSize) {
    dataflowChunks.push(dataflowIds.slice(i, i + chunkSize));
  }

  await Promise.all([
    ...datasetChunks.map(async (chunk) => {
      const results = await fetchDatasetBatch(chunk);
      applyResults(results, datasetEntities);
    }),
    ...dataflowChunks.map(async (chunk) => {
      const results = await fetchDataflowBatch(chunk);
      applyResults(results, dataflowEntities);
    })
  ]);

  return lineageResponse;
}

export async function getLineage(entityType, entityId, maxDepth = 4, tabId = null) {
  const apiType = LINEAGE_TYPE_MAP[entityType] ?? entityType;

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

  return mergeLineageResponses(upResponse, downResponse);
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

function mergeLineageResponses(upResponse, downResponse) {
  const merged = { ...upResponse };

  for (const [key, entity] of Object.entries(downResponse || {})) {
    if (!entity) continue;

    if (!merged[key]) {
      merged[key] = entity;
      continue;
    }

    const existing = merged[key];

    if (entity.parents?.length) {
      const seen = new Set(
        (existing.parents || []).map((p) => `${p.type}${p.id}`)
      );
      for (const parent of entity.parents) {
        if (!seen.has(`${parent.type}${parent.id}`)) {
          (existing.parents ??= []).push(parent);
        }
      }
    }

    if (entity.children?.length) {
      const seen = new Set(
        (existing.children || []).map((c) => `${c.type}${c.id}`)
      );
      for (const child of entity.children) {
        if (!seen.has(`${child.type}${child.id}`)) {
          (existing.children ??= []).push(child);
        }
      }
    }

    if (!existing.name && entity.name) existing.name = entity.name;
    if (entity.metadata) {
      existing.metadata = { ...existing.metadata, ...entity.metadata };
    }
  }

  return merged;
}
