import { executeInPage } from '@/utils';

function toMapKey(type, id) {
  return `${type}${id}`;
}

function toNodeId(type, id) {
  return `${type}:${id}`;
}

async function getLineage(entityType, entityId, tabId = null) {
  return await executeInPage(
    async (entityType, entityId) => {
      const response = await fetch(
        `/api/datalineage/v1/lineage?entityType=${entityType}&entityId=${entityId}`,
        {
          method: 'GET',
          credentials: 'include'
        }
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch lineage: HTTP ${response.status}`
        );
      }

      return response.json();
    },
    [entityType, entityId],
    tabId
  );
}

async function enrichMetadata(lineageResponse, tabId = null) {
  const datasetIds = [];
  const dataflowIds = [];

  for (const [key, entity] of Object.entries(lineageResponse)) {
    if (entity.type === 'DATA_SOURCE') {
      datasetIds.push(entity.id);
    } else if (entity.type === 'DATAFLOW') {
      dataflowIds.push(entity.id);
    }
  }

  const chunkSize = 10;
  const enrichedData = { ...lineageResponse };

  const fetchDatasetBatch = async (ids) => {
    return await executeInPage(
      async (ids) => {
        const results = {};
        await Promise.all(
          ids.map(async (id) => {
            try {
              const response = await fetch(
                `/api/data/v3/datasources/${id}`,
                {
                  method: 'GET',
                  credentials: 'include'
                }
              );
              if (response.ok) {
                const data = await response.json();
                results[id] = {
                  name: data.name,
                  rowCount: data.rowCount,
                  columnCount: data.columns?.length
                };
              }
            } catch (e) {
              console.warn(`Failed to fetch dataset ${id}:`, e);
            }
          })
        );
        return results;
      },
      [ids],
      tabId
    );
  };

  const fetchDataflowBatch = async (ids) => {
    return await executeInPage(
      async (ids) => {
        const results = {};
        await Promise.all(
          ids.map(async (id) => {
            try {
              const response = await fetch(
                `/api/dataprocessing/v1/dataflows/${id}`,
                {
                  method: 'GET',
                  credentials: 'include'
                }
              );
              if (response.ok) {
                const data = await response.json();
                results[id] = {
                  name: data.name,
                  state: data.state,
                  inputCount: data.inputs?.length,
                  outputCount: data.outputs?.length
                };
              }
            } catch (e) {
              console.warn(`Failed to fetch dataflow ${id}:`, e);
            }
          })
        );
        return results;
      },
      [ids],
      tabId
    );
  };

  for (let i = 0; i < datasetIds.length; i += chunkSize) {
    const chunk = datasetIds.slice(i, i + chunkSize);
    const results = await fetchDatasetBatch(chunk);
    
    for (const [id, metadata] of Object.entries(results)) {
      const key = toMapKey('DATA_SOURCE', id);
      if (enrichedData[key]) {
        enrichedData[key].name = metadata.name || enrichedData[key].name;
        enrichedData[key].metadata = {
          ...enrichedData[key].metadata,
          ...metadata
        };
      }
    }
  }

  for (let i = 0; i < dataflowIds.length; i += chunkSize) {
    const chunk = dataflowIds.slice(i, i + chunkSize);
    const results = await fetchDataflowBatch(chunk);
    
    for (const [id, metadata] of Object.entries(results)) {
      const key = toMapKey('DATAFLOW', id);
      if (enrichedData[key]) {
        enrichedData[key].name = metadata.name || enrichedData[key].name;
        enrichedData[key].metadata = {
          ...enrichedData[key].metadata,
          ...metadata
        };
      }
    }
  }

  return enrichedData;
}

function convertToGraph(lineageResponse, startEntityType, startEntityId, maxDepth = 10) {
  const startKey = toMapKey(startEntityType, startEntityId);
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

    if (Math.abs(currentDepth - 1) > maxDepth) continue;

    for (const parent of entity.parents || []) {
      if (parent.type === 'ALERT') continue;
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

    if (Math.abs(currentDepth + 1) > maxDepth) continue;

    for (const child of entity.children || []) {
      if (child.type === 'ALERT') continue;
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
    if (entity.type === 'ALERT') continue;
    if (entity.type === 'CARD') continue;

    const depth = depths.get(key);
    if (depth === undefined || Math.abs(depth) > maxDepth) continue;

    const nodeId = toNodeId(entity.type, entity.id);
    if (addedNodes.has(nodeId)) continue;
    addedNodes.add(nodeId);

    const name = entity.name || entity.id;

    nodes.push({
      id: nodeId,
      entityId: entity.id,
      entityType: entity.type,
      name,
      depth,
      metadata: entity.metadata
    });

    for (const parent of entity.parents || []) {
      if (parent.type === 'ALERT' || parent.type === 'CARD') continue;
      const parentNodeId = toNodeId(parent.type, parent.id);
      const edgeKey = `${parentNodeId}->${nodeId}`;
      if (!edgeSet.has(edgeKey)) {
        edgeSet.add(edgeKey);
        edges.push({ sourceId: parentNodeId, targetId: nodeId });
      }
    }

    for (const child of entity.children || []) {
      if (child.type === 'ALERT' || child.type === 'CARD') continue;
      const childNodeId = toNodeId(child.type, child.id);
      const edgeKey = `${nodeId}->${childNodeId}`;
      if (!edgeSet.has(edgeKey)) {
        edgeSet.add(edgeKey);
        edges.push({ sourceId: nodeId, targetId: childNodeId });
      }
    }
  }

  for (const edge of edges) {
    for (const id of [edge.sourceId, edge.targetId]) {
      if (!addedNodes.has(id)) {
        addedNodes.add(id);
        const [type, ...rest] = id.split(':');
        const eid = rest.join(':');
        nodes.push({
          id,
          entityId: eid,
          entityType: type,
          name: eid,
          depth: 0
        });
      }
    }
  }

  const dataflowIds = nodes
    .filter(n => n.entityType === 'DATAFLOW')
    .map(n => n.entityId);

  return { nodes, edges, dataflowIds };
}

export async function tracePipeline(entityType, entityId, depth = 10, tabId = null) {
  const lineageResponse = await getLineage(entityType, entityId, tabId);
  
  const enrichedResponse = await enrichMetadata(lineageResponse, tabId);
  
  const graph = convertToGraph(enrichedResponse, entityType, entityId, depth);
  
  return graph;
}
