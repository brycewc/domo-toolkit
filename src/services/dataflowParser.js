/**
 * ETL JSON Parser
 * Parses hydrated dataflow JSON and extracts structured info from each tile:
 * filters, joins, expressions, column references, SQL, etc.
 */

import { getDataflowEngine } from '@/services/sqlColumns';

/**
 * The normalized shape every consumer (the inspector's rendering and `searchTiles`)
 * reads. `parseTile` is the single place that maps Domo's irregular raw action JSON
 * onto this contract, so downstream code must reference these fields, never the raw
 * keys (e.g. `resultField`, not the raw `fieldName`/`outputField` it may originate from).
 *
 * @typedef {Object} ParsedExpression
 * @property {string} expression  The formula or SQL text of the expression.
 * @property {string} resultField The output column the expression produces.
 */

/**
 * @typedef {Object} ParsedFilter
 * @property {string} field    The column being filtered.
 * @property {string} operator The comparison operator (defaults to '=').
 * @property {string} value    The comparison value (comma-joined when multi-valued).
 */

/**
 * @typedef {Object} ParsedJoin
 * @property {string} joinType One of INNER, LEFT, RIGHT, etc. (defaults to 'INNER').
 * @property {string} leftKey  The left-side join key.
 * @property {string} rightKey The right-side join key.
 */

/**
 * @typedef {Object} ParsedTile
 * @property {string} id                     The tile's action id.
 * @property {string} type                   Raw Domo action type (e.g. 'ExpressionEvaluator').
 * @property {string} displayType            User-facing tile name (e.g. 'Add Formula'), from TILE_DISPLAY_NAMES.
 * @property {string} category               User-facing category, from TILE_CATEGORY_MAP.
 * @property {string} name                   The tile's display name.
 * @property {string[]} columns              Columns the tile references or produces.
 * @property {ParsedExpression[]} expressions Expressions the tile evaluates.
 * @property {ParsedFilter[]} filters         Filter conditions the tile applies.
 * @property {ParsedJoin[]} joins             Join key pairs the tile defines.
 * @property {string[]} sql                   Raw SQL statements the tile runs.
 * @property {string[]} inputDatasets         Dataset ids the tile reads from.
 * @property {string|null} outputDataset      Dataset id the tile writes to, if any.
 * @property {Object} rawDetails              Per-type extras (constants, aggregates, renames, mappings, etc.).
 */

/**
 * @typedef {Object} ParsedDataflow
 * @property {string} id
 * @property {string} name
 * @property {string} databaseType
 * @property {string} engine                 The dataflow's SQL engine, from getDataflowEngine.
 * @property {string[]} inputDatasetIds
 * @property {string[]} outputDatasetIds
 * @property {ParsedTile[]} tiles
 * @property {number} [versionNumber]        Present when a historical version was parsed.
 */

/**
 * @typedef {Object} TileSearchMatch
 * @property {string} matchText A short human-readable snippet describing the match.
 * @property {string} matchType One of 'filter'|'join'|'expression'|'column'|'sql'|'name'.
 * @property {ParsedTile} tile  The tile the match was found in.
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
  GenerateTableAction: 'Transform',
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
  SqlAction: 'SQL',
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
  GenerateTableAction: 'Utility',
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
  SqlAction: 'Utility',
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
 * @returns {ParsedDataflow}
 */
export function parseDataflow(detail) {
  const tiles = (detail.actions || []).map(parseTile);

  const inputDatasetIds = (detail.inputs || []).map((i) => i.dataSourceId);
  const outputDatasetIds = (detail.outputs || []).map((o) => o.dataSourceId);

  return {
    databaseType: detail.databaseType,
    engine: getDataflowEngine(detail),
    id: detail.id,
    inputDatasetIds,
    name: detail.name,
    outputDatasetIds,
    tiles,
    versionNumber: detail.versionNumber
  };
}

/**
 * Search across parsed tiles for a query string
 * @param {ParsedTile[]} tiles - Array of ParsedTile objects
 * @param {string} query - Search query string
 * @returns {TileSearchMatch[]}
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

/**
 * Extract the output table name from a `CREATE TABLE <name> AS ...` statement.
 * Handles backtick-, double-quote-, and bare-identifier forms; returns '' if
 * the statement isn't a CREATE TABLE.
 * @param {string} sql
 * @returns {string}
 */
function createTableTarget(sql) {
  if (typeof sql !== 'string') return '';
  const match = sql.match(/^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?([^\s`"(]+)/i);
  return match ? match[1] : '';
}

/**
 * Parse a single action/tile from the ETL JSON into the normalized shape.
 * @param {Object} action - The ETL action object
 * @returns {ParsedTile}
 */
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
        resultField: e.resultField || e.fieldName || ''
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

    case 'GenerateTableAction':
      // MySQL SQL dataflow transform: a bare SELECT plus an explicit output
      // table name. Domo titles the step by that table name.
      if (action.selectStatement) tile.sql = [action.selectStatement];
      if (!tile.name && action.tableName) tile.name = action.tableName;
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
      // SQL dataflows bind the input dataset to a table alias the statements
      // reference (e.g. `FROM activity_log`); surface it and use it as the title.
      if (action.targetTableName) {
        tile.rawDetails.targetTableName = action.targetTableName;
        if (!tile.name) tile.name = action.targetTableName;
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
        tile.columns = [...(action.keys1 || []).map(toFieldName), ...(action.keys2 || []).map(toFieldName)];
      }
      break;

    case 'Metadata':
      if (Array.isArray(action.fields)) {
        tile.columns = action.fields.map((f) => (typeof f === 'string' ? f : f.name || '')).filter(Boolean);
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
      // Order tiles hold their sort columns at `orderBy[].expression` (a
      // structured Field node), not `action.fields`.
      if (Array.isArray(action.orderBy)) {
        tile.columns = action.orderBy.map((o) => toFieldName(o?.expression)).filter(Boolean);
      } else if (Array.isArray(action.fields)) {
        tile.columns = action.fields.map(toFieldName).filter(Boolean);
      }
      break;

    case 'PublishToVault':
      if (action.dataSource?.guid) {
        tile.outputDataset = String(action.dataSource.guid);
      } else if (action.settings?.dataSourceId) {
        tile.outputDataset = String(action.settings.dataSourceId);
      }
      // Output tiles carry no `name`; title them by the output dataset's name.
      if (!tile.name && action.dataSource?.name) tile.name = action.dataSource.name;
      if (action.versionChainType) {
        tile.rawDetails.updateMode = action.versionChainType;
      }
      // SQL dataflows define the output dataset with a SELECT query; show it.
      if (action.query) tile.sql = [action.query];
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
        tile.rawDetails.renames = action.fields.filter((f) => f.rename).map((f) => ({ from: f.name, to: f.rename }));
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
      // Redshift SQL dataflows write `CREATE TABLE <name> AS <body>`; Domo titles
      // the step by that output table name.
      if (!tile.name) tile.name = createTableTarget(tile.sql[0]);
      break;

    case 'SqlAction':
      // MySQL SQL dataflow statements (e.g. CREATE INDEX); Domo labels these by
      // their statement text since they have no separate name.
      tile.sql = (action.statements || []).filter((s) => !!s);
      if (!tile.name) tile.name = tile.sql[0] || '';
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
        tile.columns = action.fields.map((f) => (typeof f === 'string' ? f : f.name || '')).filter(Boolean);
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
 * Normalize a Domo field reference to its plain name. Fields arrive as either a
 * bare string or a `{ name }` object depending on the tile type.
 * @param {string|{name?: string}} f
 * @returns {string}
 */
function toFieldName(f) {
  return typeof f === 'string' ? f : f?.name || '';
}
