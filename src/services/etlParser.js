/**
 * ETL JSON Parser
 * Parses hydrated dataflow JSON and extracts structured info from each tile:
 * filters, joins, expressions, column references, SQL, etc.
 */

/**
 * Magic ETL Tile Display Names
 */
const TILE_DISPLAY_NAMES = {
  ConcatFields: 'Combine Columns',
  Constant: 'Add Constants',
  DateCalculator: 'Date Operations',
  Denormaliser: 'Pivot',
  ExpressionEvaluator: 'Add Formula',
  ExpressionRowGenerator: 'Series',
  Filter: 'Filter Rows',
  GroupBy: 'Group By',
  Limit: 'Limit Rows',
  LoadFromVault: 'Input Dataset',
  MergeJoin: 'Join Data',
  Metadata: 'Alter Columns',
  MetaSelectAction: 'Meta Select',
  MLInferenceAction: 'AutoML Inference',
  NormalizeAll: 'Dynamic Unpivot',
  Normalizer: 'Unpivot',
  NumericCalculator: 'Calculator',
  Order: 'Sort Rows',
  PublishToVault: 'Output Dataset',
  PythonEngineAction: 'Python Script',
  REngineAction: 'R Script',
  ReplaceString: 'Replace Text',
  SchemaAction: 'Get Schema',
  SelectValues: 'Select Columns',
  SetValueField: 'Set Column Value',
  SplitColumnAction: 'Split Column',
  SQL: 'SQL Query',
  StashAction: 'Store Columns',
  StringCalculator: 'String Operations',
  TextFormatting: 'Text Formatting',
  UnionAll: 'Append Rows',
  Unique: 'Remove Duplicates',
  UnstashAction: 'Restore Columns',
  ValueMapper: 'Value Mapper',
  WindowAction: 'Rank & Window'
};

/**
 * Magic ETL Tile Category Map
 */
const TILE_CATEGORY_MAP = {
  ConcatFields: 'Transformation',
  Constant: 'Transformation',
  DateCalculator: 'Transformation',
  Denormaliser: 'Normalization',
  ExpressionEvaluator: 'Expressions',
  ExpressionRowGenerator: 'Expressions',
  Filter: 'Filtering',
  GroupBy: 'Aggregation',
  Limit: 'Transformation',
  LoadFromVault: 'Data I/O',
  MergeJoin: 'Joining',
  Metadata: 'Transformation',
  MetaSelectAction: 'Transformation',
  MLInferenceAction: 'Advanced',
  NormalizeAll: 'Normalization',
  Normalizer: 'Normalization',
  NumericCalculator: 'Transformation',
  Order: 'Transformation',
  PublishToVault: 'Data I/O',
  PythonEngineAction: 'Code',
  REngineAction: 'Code',
  ReplaceString: 'Transformation',
  SchemaAction: 'Transformation',
  SelectValues: 'Transformation',
  SetValueField: 'Transformation',
  SplitColumnAction: 'Transformation',
  SQL: 'Code',
  StashAction: 'Advanced',
  StringCalculator: 'Transformation',
  TextFormatting: 'Transformation',
  UnionAll: 'Joining',
  Unique: 'Filtering',
  UnstashAction: 'Advanced',
  ValueMapper: 'Expressions',
  WindowAction: 'Aggregation'
};

/**
 * Parse a full dataflow response into structured data
 * @param {Object} detail - The dataflow detail object from Domo API
 * @returns {Object} ParsedDataflow with id, name, tiles, and dataset IDs
 */
export function parseDataflow(detail) {
  const tiles = (detail.actions || []).map(parseTile);

  const inputDatasetIds = (detail.inputs || []).map((i) => i.dataSourceId);
  const outputDatasetIds = (detail.outputs || []).map((o) => o.dataSourceId);

  return {
    id: detail.id,
    inputDatasetIds,
    name: detail.name,
    outputDatasetIds,
    tiles
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
          matchText: `${f.field} ${f.operator} ${f.value}`,
          matchType: 'filter',
          tile
        });
      }
    }

    // Search join keys
    for (const j of tile.joins) {
      if (s(j.leftKey).toLowerCase().includes(q) || s(j.rightKey).toLowerCase().includes(q)) {
        results.push({
          matchText: `${j.leftKey} = ${j.rightKey} (${j.joinType})`,
          matchType: 'join',
          tile
        });
      }
    }

    // Search expressions
    for (const e of tile.expressions) {
      if (s(e.expression).toLowerCase().includes(q) || s(e.resultField).toLowerCase().includes(q)) {
        results.push({
          matchText: `${e.resultField} = ${s(e.expression).slice(0, 100)}`,
          matchType: 'expression',
          tile
        });
      }
    }

    // Search column references
    for (const col of tile.columns) {
      if (s(col).toLowerCase().includes(q)) {
        results.push({
          matchText: s(col),
          matchType: 'column',
          tile
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
          matchText: `...${s(sql).slice(start, end)}...`,
          matchType: 'sql',
          tile
        });
      }
    }

    // Search tile name
    if (s(tile.name).toLowerCase().includes(q)) {
      results.push({
        matchText: tile.name,
        matchType: 'name',
        tile
      });
    }
  }

  return results;
}

function parseTile(action) {
  const tile = {
    category: TILE_CATEGORY_MAP[action.type] || 'Other',
    columns: [],
    displayType: TILE_DISPLAY_NAMES[action.type] || action.type,
    expressions: [],
    filters: [],
    id: action.id,
    inputDatasets: [],
    joins: [],
    name: typeof action.name === 'string' ? action.name : action.name?.name || String(action.name ?? ''),
    outputDataset: null,
    rawDetails: {},
    sql: [],
    type: action.type
  };

  switch (action.type) {
    case 'ExpressionEvaluator':
      tile.expressions = (action.expressions || []).map((e) => ({
        expression: e.expression || '',
        resultField: e.resultField || ''
      }));
      tile.columns = tile.expressions.map((e) => e.resultField).filter(Boolean);
      break;

    case 'Filter':
      tile.filters = (action.filterList || []).map((f) => ({
        field: toFieldName(f.field || f.column) || '?',
        operator: f.operator || '=',
        value: typeof f.value === 'string' ? f.value : (f.values || []).join(', ') || '?'
      }));
      tile.columns = tile.filters.map((f) => f.field);
      break;

    case 'GroupBy':
      if (action.groups) tile.columns.push(...action.groups.map(toFieldName));
      if (action.aggregates) {
        tile.rawDetails.aggregates = action.aggregates;
        tile.columns.push(
          ...action.aggregates.map((a) => toFieldName(a.field)).filter(Boolean)
        );
      }
      break;

    case 'LoadFromVault':
      // Input datasets are tracked via dependsOn / settings
      if (action.settings?.dataSourceId) {
        tile.inputDatasets.push(String(action.settings.dataSourceId));
      }
      break;

    case 'MergeJoin':
      if (action.keys1 && action.keys2) {
        const len = Math.max(action.keys1.length, action.keys2.length);
        for (let i = 0; i < len; i++) {
          tile.joins.push({
            joinType: action.joinType || 'INNER',
            leftKey: toFieldName(action.keys1[i]) || '?',
            rightKey: toFieldName(action.keys2[i]) || '?'
          });
        }
        tile.columns = [
          ...(action.keys1 || []).map(toFieldName),
          ...(action.keys2 || []).map(toFieldName)
        ];
      }
      break;

    case 'Metadata':
      if (Array.isArray(action.fields)) {
        tile.columns = action.fields.map((f) =>
          typeof f === 'string' ? f : f.name || ''
        ).filter(Boolean);
      }
      break;

    case 'Order':
      if (Array.isArray(action.fields)) {
        tile.columns = action.fields.map((f) =>
          typeof f === 'string' ? f : f.name || ''
        ).filter(Boolean);
      }
      break;
    case 'PublishToVault':
      if (action.settings?.dataSourceId) {
        tile.outputDataset = String(action.settings.dataSourceId);
      }
      break;

    case 'PythonEngineAction':
      break;
    case 'REngineAction':
      tile.sql = (action.statements || []).filter((s) => !!s);
      break;

    case 'ReplaceString':
      if (action.inField) tile.columns.push(action.inField);
      if (action.outField) tile.columns.push(action.outField);
      tile.rawDetails.search = action.searchString;
      tile.rawDetails.replace = action.replaceString;
      break;

    case 'SelectValues':
      if (action.fields) {
        tile.columns = action.fields.map((f) => f.name || '').filter(Boolean);
        tile.rawDetails.renames = action.fields
          .filter((f) => f.rename)
          .map((f) => ({ from: f.name, to: f.rename }));
      }
      break;

    case 'SetValueField':
      if (action.fieldName) {
        tile.columns.push(action.fieldName);
        tile.rawDetails.fieldValue = action.fieldValue;
      }
      break;

    case 'SQL':
      tile.sql = (action.statements || []).filter((s) => !!s);
      break;

    case 'Unique':
      if (Array.isArray(action.fields)) {
        tile.columns = action.fields.map((f) =>
          typeof f === 'string' ? f : f.name || ''
        ).filter(Boolean);
      }
      break;

    case 'ValueMapper':
      if (action.sourceField) tile.columns.push(action.sourceField);
      if (action.targetField) tile.columns.push(action.targetField);
      tile.rawDetails.mappings = action.mappings;
      break;

    case 'WindowAction':
      if (action.groups) tile.columns.push(...action.groups.map(toFieldName));
      break;
  }

  return tile;
}

/**
 * Parse a single action/tile from the ETL JSON
 * @param {Object} action - The ETL action object
 * @returns {Object} ParsedTile object with structured data
 */
function toFieldName(f) {
  return typeof f === 'string' ? f : f?.name || '';
}
