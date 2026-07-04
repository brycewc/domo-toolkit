const DIRECTION_LABELS = { downstream: 'Downstream', root: 'Root', upstream: 'Upstream' };

// Column order is intentional: it controls the CSV/Excel column order.
export const LINEAGE_EXPORT_COLUMNS = [
  { accessorKey: 'id', header: 'ID' },
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'type', header: 'Type' },
  { accessorKey: 'direction', header: 'Direction' },
  { accessorKey: 'level', header: 'Level' },
  { accessorKey: 'rows', header: 'Rows' },
  { accessorKey: 'columns', header: 'Columns' },
  { accessorKey: 'lastRun', header: 'Last Run' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'state', header: 'State' },
  { accessorKey: 'directUpstream', header: 'Direct Upstream' },
  { accessorKey: 'directDownstream', header: 'Direct Downstream' },
  { accessorKey: 'url', header: 'URL' }
];

/**
 * Build a structured JSON representation of the lineage: the flat node rows
 * plus the explicit parent -> child edges and a small root descriptor. The
 * edges give downstream tools the relationships the flat rows only encode via
 * Direction/Level.
 * @param {{ edges: Array, nodes: Array }} graph - Full lineage graph
 * @param {string} rootNodeId - The root node id (`${type}:${id}`)
 * @returns {{ root: Object | null, nodes: Array, edges: Array }}
 */
export function buildLineageJson(graph, rootNodeId) {
  const nodes = buildLineageRows(graph);
  const edges = (graph?.edges ?? []).map((edge) => ({ source: edge.sourceId, target: edge.targetId }));
  const rootNode = graph?.nodes?.find((node) => node.id === rootNodeId);
  const root = rootNode
    ? { id: rootNode.entityId, name: rootNode.name, type: rootNode.object?.typeId ?? rootNode.entityType }
    : null;
  // Emit root -> nodes -> edges for a natural top-to-bottom read of the JSON.
  const result = {};
  result.root = root;
  result.nodes = nodes;
  result.edges = edges;
  return result;
}

/**
 * Flatten a lineage graph into one plain row per object, sorted from deepest
 * upstream through the root to deepest downstream. Native types are preserved
 * (Level/Rows/Columns stay numeric) so JSON output is clean; the CSV/Excel
 * layer stringifies. Type-specific fields are blank for the other type, and
 * every metadata read is defensive since frontier nodes may be un-enriched.
 * Type and URL come from each node's DomoObject (built in convertToGraph), so
 * they inherit the canonical type ids and URL patterns from the shared registry
 * rather than duplicating them here. Keys are emitted in LINEAGE_EXPORT_COLUMNS
 * order so a human reading the JSON export sees the same column order as the
 * CSV/Excel exports.
 * @param {{ nodes: Array }} graph - Full lineage graph
 * @returns {Array<Object>} Flat rows keyed to LINEAGE_EXPORT_COLUMNS
 */
export function buildLineageRows(graph) {
  if (!graph || !Array.isArray(graph.nodes)) return [];

  return graph.nodes
    .slice()
    .sort((a, b) => a.depth - b.depth)
    .map((node) => {
      const meta = node.metadata;
      const isDataset = node.entityType === 'DATA_SOURCE';
      const isDataflow = node.entityType === 'DATAFLOW';
      const values = {
        columns: isDataset && meta?.columnCount != null ? meta.columnCount : '',
        directDownstream: node.downstreamCount ?? '',
        direction: DIRECTION_LABELS[node.direction] ?? node.direction,
        directUpstream: node.upstreamCount ?? '',
        id: node.entityId,
        lastRun: isDataflow ? toIsoDate(meta?.lastExecution?.endTime) : '',
        level: node.depth,
        name: node.name,
        rows: isDataset && meta?.rowCount != null ? meta.rowCount : '',
        state: isDataflow ? (meta?.runState ?? '') : (meta?.cryoStatus ?? ''),
        status: isDataflow ? (meta?.lastExecution?.state ?? '') : (meta?.status ?? ''),
        type: node.object?.typeId ?? node.entityType,
        url: node.object?.url ?? ''
      };
      const row = {};
      for (const column of LINEAGE_EXPORT_COLUMNS) {
        row[column.accessorKey] = values[column.accessorKey];
      }
      return row;
    });
}

/**
 * Normalize a Domo execution timestamp to ISO 8601. The lineage API returns
 * lastExecution.endTime as epoch milliseconds, which is unhelpful in an
 * exported file; ISO is sortable and clear for both humans and AI tools.
 * Returns '' for missing or unparseable values.
 * @param {number|string} value - Epoch millis or date string
 * @returns {string} ISO 8601 string, or ''
 */
function toIsoDate(value) {
  if (value == null) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}
