// ============================================
// Data Fetching, Normalization & API Logic
// ============================================

// ============================================
// Normalized Data Stores (populated on load)
// ============================================
export let edgesByNode = {};      // { [nodeId]: { up: string[], down: string[] } }
export let nodeMeta = {};         // { [nodeId]: [name, type, triggerSummary, lastRunTs, subType] }
export let triggerDetailsByNode = {}; // { [nodeId]: TriggerDetail[] }

// ============================================
// API Fetch Functions
// ============================================
export async function getL1Lineage() {
    try {
        console.log('Attempting API call for L1 Lineage...');
        const data = await domo.get('/data/v1/lineageL1');
        // console.log('Domo API L1 Lineage:', data);
        return data;
    } catch (err) {
        console.error('Domo API error. Unable to fetch Lineage L1 data:', err);
        return [];
    }
}

export async function getDatasetMetaData() {
    try {
        console.log('Attempting API call for Lineage MetaData...');
        const data = await domo.get('/data/v1/lineageMetaData');
        // console.log('Domo API Lineage MetaData:', data);
        return data;
    } catch (err) {
        console.error('Domo API error. Unable to fetch Lineage MetaData data:', err);
        return [];
    }
}

// ============================================
// Parsing Utilities
// ============================================

/**
 * Parse a stringified array of IDs (e.g., "[id1,id2]") into an array
 * Handles empty strings, empty arrays, and malformed data gracefully
 */
function parseIdArray(str) {
    if (!str || str === '[]' || str.trim() === '') {
        return [];
    }
    try {
        // Remove brackets and split by comma
        const inner = str.replace(/^\[|\]$/g, '').trim();
        if (!inner) return [];
        return inner.split(',').map(id => id.trim()).filter(Boolean);
    } catch (e) {
        console.warn('Failed to parse ID array:', str, e);
        return [];
    }
}

/**
 * Parse a timestamp string to epoch milliseconds
 * Expected format: "YYYY-MM-DD HH:mm:ss"
 */
function parseTimestamp(str) {
    if (!str || str.trim() === '') {
        return null;
    }
    try {
        // Replace space with 'T' for ISO format
        const isoStr = str.replace(' ', 'T') + 'Z';
        const ts = new Date(isoStr).getTime();
        return isNaN(ts) ? null : ts;
    } catch (e) {
        console.warn('Failed to parse timestamp:', str, e);
        return null;
    }
}

/**
 * Parse trigger details JSON string and extract trigger info
 * Returns { summary: string, details: TriggerDetail[] }
 */
function parseTriggerDetails(str) {
    const result = {
        summary: 'MANUAL',
        details: []
    };
    
    if (!str || str.trim() === '' || str === '[]') {
        return result;
    }
    
    try {
        const triggers = JSON.parse(str);
        if (!Array.isArray(triggers) || triggers.length === 0) {
            return result;
        }
        
        let hasSchedule = false;
        let hasDatasetUpdated = false;
        
        for (const trigger of triggers) {
            const triggerType = trigger.trigger_type || trigger.triggerType;
            
            if (triggerType === 'SCHEDULE') {
                hasSchedule = true;
                result.details.push({
                    type: 'SCHEDULE',
                    cron: trigger.trigger_cron_expression || trigger.triggerCronExpression || ''
                });
            } else if (triggerType === 'DATASET_UPDATED') {
                hasDatasetUpdated = true;
                result.details.push({
                    type: 'DATASET_UPDATED',
                    datasets: trigger.trigger_on_updated_datasets || trigger.triggerOnUpdatedDatasets || []
                });
            }
        }
        
        // Determine summary
        if (hasSchedule && hasDatasetUpdated) {
            result.summary = 'HYBRID';
        } else if (hasSchedule) {
            result.summary = 'SCHEDULE';
        } else if (hasDatasetUpdated) {
            result.summary = 'DATASET_UPDATED';
        }
        
        return result;
    } catch (e) {
        console.warn('Failed to parse trigger details:', str, e);
        return result;
    }
}

// ============================================
// Normalization Functions
// ============================================

/**
 * Normalize L1 Lineage data into edgesByNode map
 * Input: Array of { rootDatasetId, inputDatasetIds, outputDatasetIds }
 * Output: Populates edgesByNode global store
 */
export function normalizeL1Lineage(rawData) {
    console.log(`Normalizing ${rawData.length} L1 lineage records...`);
    const startTime = performance.now();
    
    edgesByNode = {};
    
    for (const row of rawData) {
        const nodeId = row.rootDatasetId;
        if (!nodeId) continue;
        
        edgesByNode[nodeId] = {
            up: parseIdArray(row.inputDatasetIds),
            down: parseIdArray(row.outputDatasetIds)
        };
    }
    
    const elapsed = (performance.now() - startTime).toFixed(2);
    console.log(`L1 Lineage normalized: ${Object.keys(edgesByNode).length} nodes in ${elapsed}ms`);
    
    return edgesByNode;
}

/**
 * Normalize Metadata into nodeMeta and triggerDetailsByNode maps
 * Input: Array of { datasetId, datasetName, datasetType, datasetSubType, ... }
 * Output: Populates nodeMeta and triggerDetailsByNode global stores
 * 
 * nodeMeta[id] = [name, type, triggerSummary, lastRunTs, subType, typeId, typeName, runtimeSeconds]
 * triggerDetailsByNode[id] = TriggerDetail[]
 */
export function normalizeMetadata(rawData) {
    console.log(`Normalizing ${rawData.length} metadata records...`);
    const startTime = performance.now();
    
    nodeMeta = {};
    triggerDetailsByNode = {};
    
    for (const row of rawData) {
        const nodeId = row.datasetId;
        if (!nodeId) continue;
        
        const { summary, details } = parseTriggerDetails(row.datasetTriggerDetails);
        
        // Store as array for memory efficiency: [name, type, triggerSummary, lastRunTs, subType, typeId, typeName, runtimeSeconds]
        nodeMeta[nodeId] = [
            row.datasetName || 'Unknown Dataset',
            row.datasetType || 'unknown',
            summary,
            parseTimestamp(row.datasetLastRunAt),
            row.datasetSubType || '',
            row.datasetTypeId || null,
            row.datasetTypeName || '',
            row.datasetLastRuntimeSeconds != null ? Number(row.datasetLastRuntimeSeconds) : null
        ];
        
        // Store trigger details (even if empty array, for consistency)
        triggerDetailsByNode[nodeId] = details;
    }
    
    const elapsed = (performance.now() - startTime).toFixed(2);
    console.log(`Metadata normalized: ${Object.keys(nodeMeta).length} nodes in ${elapsed}ms`);
    
    return { nodeMeta, triggerDetailsByNode };
}

// ============================================
// Data Access Helpers
// ============================================

// Index constants for nodeMeta array
export const META_NAME = 0;
export const META_TYPE = 1;
export const META_TRIGGER_SUMMARY = 2;
export const META_LAST_RUN_TS = 3;
export const META_SUBTYPE = 4;
export const META_TYPE_ID = 5;
export const META_TYPE_NAME = 6;
export const META_RUNTIME_SECONDS = 7;

/**
 * Get metadata for a node by ID
 * Returns object with named properties for convenience
 */
export function getNodeMeta(nodeId) {
    const meta = nodeMeta[nodeId];
    if (!meta) {
        return null;
    }
    return {
        name: meta[META_NAME],
        type: meta[META_TYPE],
        triggerSummary: meta[META_TRIGGER_SUMMARY],
        lastRunTs: meta[META_LAST_RUN_TS],
        subType: meta[META_SUBTYPE],
        typeId: meta[META_TYPE_ID],
        typeName: meta[META_TYPE_NAME],
        runtimeSeconds: meta[META_RUNTIME_SECONDS]
    };
}

/**
 * Get edges (neighbors) for a node by ID
 */
export function getNodeEdges(nodeId) {
    return edgesByNode[nodeId] || { up: [], down: [] };
}

/**
 * Get trigger details for a node by ID
 */
export function getNodeTriggerDetails(nodeId) {
    return triggerDetailsByNode[nodeId] || [];
}

/**
 * Check if a node exists in our data
 */
export function nodeExists(nodeId) {
    return nodeId in nodeMeta || nodeId in edgesByNode;
}

/**
 * Get upstream neighbor IDs for a node
 */
export function getUpstreamNeighbors(nodeId) {
    return edgesByNode[nodeId]?.up || [];
}

/**
 * Get downstream neighbor IDs for a node
 */
export function getDownstreamNeighbors(nodeId) {
    return edgesByNode[nodeId]?.down || [];
}

// ============================================
// Initialization
// ============================================

let dataLoaded = false;
let loadingPromise = null;

/**
 * Load and normalize all data from Domo APIs
 * Returns a promise that resolves when data is ready
 */
export async function initializeData() {
    if (dataLoaded) {
        return { edgesByNode, nodeMeta, triggerDetailsByNode };
    }
    
    if (loadingPromise) {
        return loadingPromise;
    }
    
    loadingPromise = (async () => {
        console.log('Starting data initialization...');
        const startTime = performance.now();
        
        // Fetch both datasets in parallel
        const [l1Data, metaData] = await Promise.all([
            getL1Lineage(),
            getDatasetMetaData()
        ]);
        
        // Normalize the data (this discards the raw arrays)
        normalizeL1Lineage(l1Data);
        normalizeMetadata(metaData);
        
        dataLoaded = true;
        const elapsed = (performance.now() - startTime).toFixed(2);
        console.log(`Data initialization complete in ${elapsed}ms`);
        
        return { edgesByNode, nodeMeta, triggerDetailsByNode };
    })();
    
    return loadingPromise;
}

/**
 * Check if data has been loaded
 */
export function isDataLoaded() {
    return dataLoaded;
}