/**
 * ETL JSON Parser
 * Parses hydrated dataflow JSON and extracts structured info from each tile:
 * filters, joins, expressions, column references, SQL, etc.
 */

/**
 * Magic ETL Tile Display Names
 */
const TILE_DISPLAY_NAMES = {
  LoadFromVault: 'Input Dataset',
  PublishToVault: 'Output Dataset',
  SelectValues: 'Select Columns',
  SetValueField: 'Set Column Value',
  ReplaceString: 'Replace Text',
  ConcatFields: 'Combine Columns',
  TextFormatting: 'Text Formatting',
  StringCalculator: 'String Operations',
  NumericCalculator: 'Calculator',
  DateCalculator: 'Date Operations',
  Metadata: 'Alter Columns',
  SplitColumnAction: 'Split Column',
  Order: 'Sort Rows',
  Constant: 'Add Constants',
  Limit: 'Limit Rows',
  SchemaAction: 'Get Schema',
  MetaSelectAction: 'Meta Select',
  GroupBy: 'Group By',
  WindowAction: 'Rank & Window',
  MergeJoin: 'Join Data',
  UnionAll: 'Append Rows',
  Filter: 'Filter Rows',
  Unique: 'Remove Duplicates',
  NormalizeAll: 'Dynamic Unpivot',
  Denormaliser: 'Pivot',
  Normalizer: 'Unpivot',
  ExpressionEvaluator: 'Add Formula',
  ExpressionRowGenerator: 'Series',
  ValueMapper: 'Value Mapper',
  SQL: 'SQL Query',
  PythonEngineAction: 'Python Script',
  REngineAction: 'R Script',
  StashAction: 'Store Columns',
  UnstashAction: 'Restore Columns',
  MLInferenceAction: 'AutoML Inference',
};

/**
 * Magic ETL Tile Category Map
 */
const TILE_CATEGORY_MAP = {
  LoadFromVault: 'Data I/O',
  PublishToVault: 'Data I/O',
  SelectValues: 'Transformation',
  SetValueField: 'Transformation',
  ReplaceString: 'Transformation',
  ConcatFields: 'Transformation',
  TextFormatting: 'Transformation',
  StringCalculator: 'Transformation',
  NumericCalculator: 'Transformation',
  DateCalculator: 'Transformation',
  Metadata: 'Transformation',
  SplitColumnAction: 'Transformation',
  Order: 'Transformation',
  Constant: 'Transformation',
  Limit: 'Transformation',
  SchemaAction: 'Transformation',
  MetaSelectAction: 'Transformation',
  GroupBy: 'Aggregation',
  WindowAction: 'Aggregation',
  MergeJoin: 'Joining',
  UnionAll: 'Joining',
  Filter: 'Filtering',
  Unique: 'Filtering',
  NormalizeAll: 'Normalization',
  Denormaliser: 'Normalization',
  Normalizer: 'Normalization',
  ExpressionEvaluator: 'Expressions',
  ExpressionRowGenerator: 'Expressions',
  ValueMapper: 'Expressions',
  SQL: 'Code',
  PythonEngineAction: 'Code',
  REngineAction: 'Code',
  StashAction: 'Advanced',
  UnstashAction: 'Advanced',
  MLInferenceAction: 'Advanced',
};

/**
 * Parse a single action/tile from the ETL JSON
 * @param {Object} action - The ETL action object
 * @returns {Object} ParsedTile object with structured data
 */
function parseTile(action) {
  const tile = {
    id: action.id,
    name: action.name,
    type: action.type,
    displayType: TILE_DISPLAY_NAMES[action.type] || action.type,
    category: TILE_CATEGORY_MAP[action.type] || 'Other',
    filters: [],
    joins: [],
    expressions: [],
    columns: [],
    sql: [],
    inputDatasets: [],
    outputDataset: null,
    rawDetails: {},
  };

  switch (action.type) {
    case 'Filter':
      tile.filters = (action.filterList || []).map(f => ({
        field: f.field || f.column || '?',
        operator: f.operator || '=',
        value: f.value || (f.values || []).join(', ') || '?',
      }));
      tile.columns = tile.filters.map(f => f.field);
      break;

    case 'MergeJoin':
      if (action.keys1 && action.keys2) {
        const len = Math.max(action.keys1.length, action.keys2.length);
        for (let i = 0; i < len; i++) {
          tile.joins.push({
            leftKey: action.keys1[i] || '?',
            rightKey: action.keys2[i] || '?',
            joinType: action.joinType || 'INNER',
          });
        }
        tile.columns = [...(action.keys1 || []), ...(action.keys2 || [])];
      }
      break;

    case 'ExpressionEvaluator':
      tile.expressions = (action.expressions || []).map(e => ({
        expression: e.expression || '',
        resultField: e.resultField || '',
      }));
      tile.columns = tile.expressions.map(e => e.resultField).filter(Boolean);
      break;

    case 'GroupBy':
      if (action.groups) tile.columns.push(...action.groups);
      if (action.aggregates) {
        tile.rawDetails.aggregates = action.aggregates;
        tile.columns.push(
          ...action.aggregates.map(a => a.field || '').filter(Boolean)
        );
      }
      break;

    case 'SelectValues':
      if (action.fields) {
        tile.columns = action.fields.map(f => f.name || '').filter(Boolean);
        tile.rawDetails.renames = action.fields
          .filter(f => f.rename)
          .map(f => ({ from: f.name, to: f.rename }));
      }
      break;

    case 'SQL':
      tile.sql = (action.statements || []).filter(s => !!s);
      break;

    case 'PythonEngineAction':
    case 'REngineAction':
      tile.sql = (action.statements || []).filter(s => !!s);
      break;

    case 'SetValueField':
      if (action.fieldName) {
        tile.columns.push(action.fieldName);
        tile.rawDetails.fieldValue = action.fieldValue;
      }
      break;

    case 'ValueMapper':
      if (action.sourceField) tile.columns.push(action.sourceField);
      if (action.targetField) tile.columns.push(action.targetField);
      tile.rawDetails.mappings = action.mappings;
      break;

    case 'ReplaceString':
      if (action.inField) tile.columns.push(action.inField);
      if (action.outField) tile.columns.push(action.outField);
      tile.rawDetails.search = action.searchString;
      tile.rawDetails.replace = action.replaceString;
      break;

    case 'LoadFromVault':
      // Input datasets are tracked via dependsOn / settings
      if (action.settings?.dataSourceId) {
        tile.inputDatasets.push(String(action.settings.dataSourceId));
      }
      break;

    case 'PublishToVault':
      if (action.settings?.dataSourceId) {
        tile.outputDataset = String(action.settings.dataSourceId);
      }
      break;

    case 'Order':
      if (Array.isArray(action.fields)) {
        tile.columns = action.fields.map(f =>
          typeof f === 'string' ? f : f.name || ''
        ).filter(Boolean);
      }
      break;

    case 'Unique':
      if (Array.isArray(action.fields)) {
        tile.columns = action.fields.map(f =>
          typeof f === 'string' ? f : f.name || ''
        ).filter(Boolean);
      }
      break;

    case 'WindowAction':
      if (action.groups) tile.columns.push(...action.groups);
      break;

    case 'Metadata':
      if (Array.isArray(action.fields)) {
        tile.columns = action.fields.map(f =>
          typeof f === 'string' ? f : f.name || ''
        ).filter(Boolean);
      }
      break;
  }

  return tile;
}

/**
 * Parse a full dataflow response into structured data
 * @param {Object} detail - The dataflow detail object from Domo API
 * @returns {Object} ParsedDataflow with id, name, tiles, and dataset IDs
 */
export function parseDataflow(detail) {
  const tiles = (detail.actions || []).map(parseTile);

  const inputDatasetIds = (detail.inputs || []).map(i => i.dataSourceId);
  const outputDatasetIds = (detail.outputs || []).map(o => o.dataSourceId);

  return {
    id: detail.id,
    name: detail.name,
    tiles,
    inputDatasetIds,
    outputDatasetIds,
  };
}

/**
 * Search across parsed tiles for a query string
 * @param {Array} tiles - Array of ParsedTile objects
 * @param {string} query - Search query string
 * @returns {Array} Array of search matches with tile, matchType, and matchText
 */
export function searchTiles(tiles, query) {
  const q = query.toLowerCase();
  const results = [];

  const s = (v) => (typeof v === 'string' ? v : '');

  for (const tile of tiles) {
    // Search filter conditions
    for (const f of tile.filters) {
      if (s(f.field).toLowerCase().includes(q) || s(f.value).toLowerCase().includes(q)) {
        results.push({
          tile,
          matchType: 'filter',
          matchText: `${f.field} ${f.operator} ${f.value}`,
        });
      }
    }

    // Search join keys
    for (const j of tile.joins) {
      if (s(j.leftKey).toLowerCase().includes(q) || s(j.rightKey).toLowerCase().includes(q)) {
        results.push({
          tile,
          matchType: 'join',
          matchText: `${j.leftKey} = ${j.rightKey} (${j.joinType})`,
        });
      }
    }

    // Search expressions
    for (const e of tile.expressions) {
      if (s(e.expression).toLowerCase().includes(q) || s(e.resultField).toLowerCase().includes(q)) {
        results.push({
          tile,
          matchType: 'expression',
          matchText: `${e.resultField} = ${s(e.expression).slice(0, 100)}`,
        });
      }
    }

    // Search column references
    for (const col of tile.columns) {
      if (s(col).toLowerCase().includes(q)) {
        results.push({
          tile,
          matchType: 'column',
          matchText: s(col),
        });
      }
    }

    // Search SQL
    for (const sql of tile.sql) {
      if (s(sql).toLowerCase().includes(q)) {
        const lower = s(sql).toLowerCase();
        const idx = lower.indexOf(q);
        const start = Math.max(0, idx - 30);
        const end = Math.min(sql.length, idx + q.length + 30);
        results.push({
          tile,
          matchType: 'sql',
          matchText: `...${s(sql).slice(start, end)}...`,
        });
      }
    }

    // Search tile name
    if (s(tile.name).toLowerCase().includes(q)) {
      results.push({
        tile,
        matchType: 'name',
        matchText: tile.name,
      });
    }
  }

  return results;
}
