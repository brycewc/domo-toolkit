/**
 * ETL JSON Parser
 * Parses hydrated dataflow JSON and extracts structured info from each tile:
 * filters, joins, expressions, column references, SQL, etc.
 */

/**
 * Magic ETL Tile Display Names
 * Matches Domo's native ETL editor (localActionConfigurations)
 */
const TILE_DISPLAY_NAMES = {
  AIForecasting: 'AI Forecasting',
  ConcatFields: 'Combine Columns',
  Constant: 'Add Constants',
  DateCalculator: 'Date Operations',
  Denormaliser: 'Pivot',
  ExpressionEvaluator: 'Add Formula',
  ExpressionRowGenerator: 'Series',
  Filter: 'Filter Rows',
  FixedInput: 'Fixed Input',
  GroupBy: 'Group By',
  JsonExpandAction: 'JSON Expander',
  Limit: 'Limit',
  LoadFromVault: 'Input DataSet',
  MakoVectorOutputAction: 'Vector Output',
  MergeJoin: 'Join Data',
  Metadata: 'Alter Columns',
  MetaSelectAction: 'Meta Select',
  MLInferenceAction: 'AutoML Inference',
  ModelInferenceAction: 'AI Model Inference',
  NormalizeAll: 'Dynamic Unpivot',
  Normalizer: 'Unpivot',
  NumericCalculator: 'Calculator',
  Order: 'Order',
  PublishToVault: 'Output DataSet',
  PublishToWriteback: 'Writeback',
  PythonEngineAction: 'Python Script',
  REngineAction: 'R Script',
  ReplaceString: 'Replace Text',
  SchemaAction: 'Get Schema',
  SelectValues: 'Select Columns',
  SetValueField: 'Duplicate Column',
  SplitColumnAction: 'Split Column',
  SplitFilter: 'Split Filter',
  SplitJoin: 'Split Join',
  SQL: 'SQL',
  StashAction: 'Select and Store Columns',
  StringCalculator: 'String Operations',
  TextFormatting: 'Text Formatting',
  TextGeneration: 'Text Generation',
  UnionAll: 'Append Rows',
  Unique: 'Remove Duplicates',
  UnstashAction: 'Restore Columns',
  UserDefinedAction: 'Data Science Model',
  ValueMapper: 'Value Mapper',
  WindowAction: 'Rank & Window'
};

/**
 * Magic ETL Tile Category Map
 * Matches Domo's native ETL editor categories (dfCategoryService)
 */
const TILE_CATEGORY_MAP = {
  AIForecasting: 'AI Services',
  ConcatFields: 'Text',
  Constant: 'Utility',
  DateCalculator: 'Dates and Numbers',
  Denormaliser: 'Pivot',
  ExpressionEvaluator: 'Utility',
  ExpressionRowGenerator: 'Utility',
  Filter: 'Filter',
  FixedInput: 'DataSets',
  GroupBy: 'Aggregate',
  JsonExpandAction: 'Utility',
  Limit: 'Utility',
  LoadFromVault: 'DataSets',
  MakoVectorOutputAction: 'DataSets',
  MergeJoin: 'Combine Data',
  Metadata: 'Utility',
  MetaSelectAction: 'Utility',
  MLInferenceAction: 'Data Science',
  ModelInferenceAction: 'AI Services',
  NormalizeAll: 'Pivot',
  Normalizer: 'Pivot',
  NumericCalculator: 'Dates and Numbers',
  Order: 'Utility',
  PublishToVault: 'DataSets',
  PublishToWriteback: 'DataSets',
  PythonEngineAction: 'Scripting',
  REngineAction: 'Scripting',
  ReplaceString: 'Text',
  SchemaAction: 'Utility',
  SelectValues: 'Utility',
  SetValueField: 'Utility',
  SplitColumnAction: 'Text',
  SplitFilter: 'Filter',
  SplitJoin: 'Combine Data',
  SQL: 'Utility',
  StashAction: 'Performance',
  StringCalculator: 'Text',
  TextFormatting: 'Text',
  TextGeneration: 'AI Services',
  UnionAll: 'Combine Data',
  Unique: 'Filter',
  UnstashAction: 'Performance',
  UserDefinedAction: 'Data Science',
  ValueMapper: 'Utility',
  WindowAction: 'Aggregate'
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
    case 'ConcatFields':
      if (action.fields) tile.columns = action.fields.map(toFieldName).filter(Boolean);
      if (action.separator != null) tile.rawDetails.separator = action.separator;
      if (action.resultField) tile.rawDetails.outputField = action.resultField;
      break;

    case 'Constant':
      if (action.fields) {
        tile.rawDetails.constants = action.fields
          .map((f) => ({ name: f.name || '', value: f.value ?? '' }))
          .filter((f) => f.name);
        tile.columns = tile.rawDetails.constants.map((c) => c.name);
      }
      break;

    case 'DateCalculator':
    case 'NumericCalculator':
    case 'StringCalculator':
      if (action.expressions) {
        tile.expressions = action.expressions.map((e) => ({
          expression: e.expression || e.formula || '',
          resultField: e.resultField || e.outputField || ''
        }));
        tile.columns = tile.expressions.map((e) => e.resultField).filter(Boolean);
      }
      if (action.calculations) {
        tile.expressions = action.calculations.map((c) => ({
          expression: c.expression || c.formula || '',
          resultField: c.resultField || c.outputField || ''
        }));
        tile.columns = tile.expressions.map((e) => e.resultField).filter(Boolean);
      }
      break;

    case 'Denormaliser':
      if (action.groupField) tile.columns.push(toFieldName(action.groupField));
      if (action.pivotField) tile.rawDetails.pivotField = toFieldName(action.pivotField);
      if (action.valueField) tile.rawDetails.valueField = toFieldName(action.valueField);
      break;

    case 'ExpressionEvaluator':
      tile.expressions = (action.expressions || []).map((e) => ({
        expression: e.expression || '',
        resultField: e.resultField || ''
      }));
      tile.columns = tile.expressions.map((e) => e.resultField).filter(Boolean);
      break;

    case 'ExpressionRowGenerator':
      if (action.expressions) {
        tile.expressions = action.expressions.map((e) => ({
          expression: e.expression || '',
          resultField: e.resultField || ''
        }));
        tile.columns = tile.expressions.map((e) => e.resultField).filter(Boolean);
      }
      if (action.rowCount != null) tile.rawDetails.rowCount = action.rowCount;
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
      if (action.fields) {
        tile.rawDetails.aggregates = action.fields
          .filter((f) => f.expression)
          .map((f) => ({ expression: f.expression, field: f.name || '' }));
      }
      break;

    case 'Limit':
      if (action.rowLimit != null) tile.rawDetails.rowLimit = action.rowLimit;
      break;

    case 'LoadFromVault':
      if (action.dataSourceId) {
        tile.inputDatasets.push(String(action.dataSourceId));
      } else if (action.settings?.dataSourceId) {
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

    case 'NormalizeAll':
    case 'Normalizer':
      if (action.groupFields) tile.columns.push(...action.groupFields.map(toFieldName));
      if (action.fields) {
        tile.columns.push(...action.fields.map(toFieldName).filter(Boolean));
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
      if (action.dataSource?.guid) {
        tile.outputDataset = String(action.dataSource.guid);
      } else if (action.settings?.dataSourceId) {
        tile.outputDataset = String(action.settings.dataSourceId);
      }
      if (action.versionChainType) {
        tile.rawDetails.updateMode = action.versionChainType;
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
      if (action.searchString) tile.rawDetails.search = action.searchString;
      if (action.replaceString != null) tile.rawDetails.replace = action.replaceString;
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
        if (action.fieldValue != null) tile.rawDetails.fieldValue = action.fieldValue;
      }
      break;

    case 'SplitColumnAction':
      if (action.sourceField) tile.columns.push(action.sourceField);
      if (action.delimiter) tile.rawDetails.delimiter = action.delimiter;
      break;

    case 'SQL':
      tile.sql = (action.statements || []).filter((s) => !!s);
      break;

    case 'TextFormatting':
      if (action.fields) {
        tile.columns = action.fields.map(toFieldName).filter(Boolean);
      }
      if (action.formatType) tile.rawDetails.formatType = action.formatType;
      break;

    case 'UnionAll':
      tile.rawDetails.inputCount = (action.inputs || action.dependsOn || []).length;
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
      if (action.mappings) tile.rawDetails.mappings = action.mappings;
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
