import {
  Alert,
  Card,
  Chip,
  Disclosure,
  DisclosureGroup,
  Link,
  ScrollShadow,
  SearchField,
  Separator,
  Spinner,
  Tabs
} from '@heroui/react';
import { memo, useEffect, useMemo, useState } from 'react';
import JsonView from 'react18-json-view';

import '@/assets/json-view-theme.css';
import { AlertStatusIcon } from '@/components/AlertStatusIcon';
import { AnimatedCheck } from '@/components/AnimatedCheck';
import { SqlBlock } from '@/components/SqlBlock';
import { ViewHeader } from '@/components/views/ViewHeader';
import { parseDataflow, searchTiles } from '@/services/dataflowParser';
import { getDataflowDetail } from '@/services/dataflows';
import IconASemicolonB from '@icons/a-semicolon-b.svg?react';
import IconAToB from '@icons/a-to-b.svg?react';
import IconAbc from '@icons/abc.svg?react';
import IconAiModel from '@icons/ai-model.svg?react';
import IconAiPencil from '@icons/ai-pencil.svg?react';
import IconAi from '@icons/ai.svg?react';
import IconAnalyzer from '@icons/analyzer.svg?react';
import IconArrowsDiagonalIn from '@icons/arrows-diagonal-in.svg?react';
import IconArrowsRotating from '@icons/arrows-rotating.svg?react';
import IconCalculator from '@icons/calculator.svg?react';
import IconCalendar from '@icons/calendar.svg?react';
import IconCapitalization from '@icons/capitalization.svg?react';
import IconChartBarBox from '@icons/chart-bar-box.svg?react';
import IconChevronDown from '@icons/chevron-down.svg?react';
import IconClipboardCopy from '@icons/clipboard-copy.svg?react';
import IconCloudUpload from '@icons/cloud-upload.svg?react';
import IconCodeTags from '@icons/code-tags.svg?react';
import IconColumnArrowsOut from '@icons/column-arrows-out.svg?react';
import IconColumnConstants from '@icons/column-constants.svg?react';
import IconColumnSelect from '@icons/column-select.svg?react';
import IconDatabaseIn from '@icons/database-in.svg?react';
import IconDatabaseOut from '@icons/database-out.svg?react';
import IconDatabase from '@icons/database.svg?react';
import IconDateAdd from '@icons/date-add.svg?react';
import IconEye from '@icons/eye.svg?react';
import IconForecast from '@icons/forecast.svg?react';
import IconFunctionOf from '@icons/function-of.svg?react';
import IconFunnel from '@icons/funnel.svg?react';
import IconGauge from '@icons/gauge.svg?react';
import IconGear from '@icons/gear.svg?react';
import IconGetSchema from '@icons/get-schema.svg?react';
import IconJoinLeftOuter from '@icons/join-left-outer.svg?react';
import IconJoin from '@icons/join.svg?react';
import IconLetters from '@icons/letters.svg?react';
import IconListBulleted from '@icons/list-bulleted.svg?react';
import IconMetaSelect from '@icons/meta-select.svg?react';
import IconPencil from '@icons/pencil.svg?react';
import IconPython from '@icons/python.svg?react';
import IconRowAdd from '@icons/row-add.svg?react';
import IconRowRemove from '@icons/row-remove.svg?react';
import IconSageMaker from '@icons/sage-maker.svg?react';
import IconSql from '@icons/sql.svg?react';
import IconTableEdit from '@icons/table-edit.svg?react';
import IconTableRow from '@icons/table-row.svg?react';
import IconTable from '@icons/table.svg?react';
import IconTree from '@icons/tree.svg?react';
import IconVector from '@icons/vector.svg?react';
import IconWrench from '@icons/wrench.svg?react';

const CATEGORY_COLORS = {
  'Aggregate': { bg: 'bg-pink-500', text: 'text-pink-500' },
  'AI Services': { bg: 'bg-rose-500', text: 'text-rose-500' },
  'Combine Data': { bg: 'bg-amber-500', text: 'text-amber-500' },
  'Data Science': { bg: 'bg-lime-500', text: 'text-lime-500' },
  'DataSets': { bg: 'bg-blue-500', text: 'text-blue-500' },
  'Dates and Numbers': { bg: 'bg-orange-500', text: 'text-orange-500' },
  'Filter': { bg: 'bg-emerald-500', text: 'text-emerald-500' },
  'Performance': { bg: 'bg-slate-500', text: 'text-slate-500' },
  'Pivot': { bg: 'bg-cyan-500', text: 'text-cyan-500' },
  'Scripting': { bg: 'bg-purple-500', text: 'text-purple-500' },
  'Text': { bg: 'bg-sky-500', text: 'text-sky-500' },
  'Utility': { bg: 'bg-violet-500', text: 'text-violet-500' }
};

const CATEGORY_ICONS = {
  'Aggregate': IconArrowsDiagonalIn,
  'AI Services': IconAi,
  'Combine Data': IconJoinLeftOuter,
  'Data Science': IconAnalyzer,
  'DataSets': IconDatabase,
  'Dates and Numbers': IconCalendar,
  'Filter': IconFunnel,
  'Performance': IconGauge,
  'Pivot': IconArrowsRotating,
  'Scripting': IconCodeTags,
  'Text': IconCapitalization,
  'Utility': IconWrench
};

const TILE_ICONS = {
  AIForecasting: IconForecast,
  ConcatFields: IconASemicolonB,
  Constant: IconColumnConstants,
  DateCalculator: IconDateAdd,
  Denormaliser: IconArrowsRotating,
  ExpressionEvaluator: IconFunctionOf,
  ExpressionRowGenerator: IconColumnConstants,
  Filter: IconFunnel,
  FixedInput: IconTableEdit,
  GenerateTableAction: IconTable,
  GroupBy: IconArrowsDiagonalIn,
  JsonExpandAction: IconTree,
  Limit: IconTable,
  LoadFromVault: IconDatabaseIn,
  MakoVectorOutputAction: IconVector,
  MergeJoin: IconJoinLeftOuter,
  Metadata: IconTableRow,
  MetaSelectAction: IconMetaSelect,
  MLInferenceAction: IconSageMaker,
  ModelInferenceAction: [IconAiModel, 'rotate-90'],
  NormalizeAll: IconRowAdd,
  Normalizer: IconRowAdd,
  NumericCalculator: IconCalculator,
  Order: IconListBulleted,
  PublishToVault: IconDatabaseOut,
  PublishToWriteback: IconCloudUpload,
  PythonEngineAction: IconPython,
  REngineAction: IconCodeTags,
  ReplaceString: IconPencil,
  SchemaAction: IconGetSchema,
  SelectValues: IconColumnSelect,
  SetValueField: IconAToB,
  SplitColumnAction: IconColumnArrowsOut,
  SplitFilter: IconFunnel,
  SplitJoin: IconJoin,
  SQL: IconSql,
  SqlAction: IconSql,
  StashAction: IconGear,
  StringCalculator: IconAbc,
  TextFormatting: IconLetters,
  TextGeneration: IconAiPencil,
  UnionAll: IconRowAdd,
  Unique: IconRowRemove,
  UnstashAction: IconGear,
  UserDefinedAction: IconAnalyzer,
  ValueMapper: IconAToB,
  WindowAction: IconChartBarBox
};

/**
 * Panel for inspecting a dataflow's transforms (Magic ETL + SQL dataflows).
 * @param {Object} props
 * @param {React.RefObject<Map>} [props.cacheRef] - Shared cache for parsed dataflow data
 * @param {string} [props.className] - Outer card classes (defaults to the lineage right-rail look)
 * @param {string} props.dataflowId - Dataflow ID to inspect
 * @param {Function} [props.resolveTabId] - Async function that resolves a valid tab ID
 * @param {Function} props.onClose - Close handler
 * @param {boolean} [props.showJson=true] - Show the Tiles/JSON tabs (lineage). When false, renders just the tiles list (sidepanel, where the JSON is already available in the context footer).
 * @param {string} [props.versionId] - When set, inspect that historical version instead of the live dataflow
 */
export function DataflowInspector({
  cacheRef,
  className = 'h-full rounded-none border-l border-divider shadow-none',
  dataflowId,
  onClose,
  resolveTabId,
  showJson = true,
  versionId
}) {
  // Key the cache by dataflow AND version so the live definition and a historical version
  // don't overwrite each other's entry when the user toggles between them.
  const cacheKey = versionId ? `${dataflowId}:${versionId}` : dataflowId;
  const cached = cacheRef?.current?.get(cacheKey);
  const [dataflow, setDataflow] = useState(cached?.parsed ?? null);
  const [rawJSON, setRawJSON] = useState(cached?.raw ?? null);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState(null);
  const [tileSearch, setTileSearch] = useState('');
  const [activeTab, setActiveTab] = useState('tiles');

  useEffect(() => {
    if (cached) {
      setDataflow(cached.parsed);
      setRawJSON(cached.raw);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    async function fetchDataflow() {
      setLoading(true);
      setError(null);
      try {
        const tabId = await resolveTabId?.();
        const dataflowJSON = await getDataflowDetail(dataflowId, tabId, versionId);
        const parsed = parseDataflow(dataflowJSON);
        if (!cancelled) {
          cacheRef?.current?.set(cacheKey, { parsed, raw: dataflowJSON });
          setDataflow(parsed);
          setRawJSON(dataflowJSON);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[DataflowInspector] Failed to fetch dataflow:', err);
          setError(err.message || 'Failed to load ETL data');
          setLoading(false);
        }
      }
    }

    fetchDataflow();

    return () => {
      cancelled = true;
    };
  }, [cacheKey, cacheRef, dataflowId, resolveTabId, versionId]);

  const filteredTiles = useMemo(() => {
    if (!dataflow) return [];
    if (!tileSearch.trim()) return dataflow.tiles;

    const matches = searchTiles(dataflow.tiles, tileSearch.trim());
    const matchedIds = new Set(matches.map((m) => m.tile.id));
    return dataflow.tiles.filter((t) => matchedIds.has(t.id));
  }, [dataflow, tileSearch]);

  const flatRows = useMemo(() => {
    const groups = new Map();
    for (const tile of filteredTiles) {
      const group = groups.get(tile.category) || [];
      group.push(tile);
      groups.set(tile.category, group);
    }

    const rows = [];
    for (const [category, tiles] of groups) {
      rows.push({ category, count: tiles.length, type: 'header' });
      for (const tile of tiles) {
        rows.push({ tile, type: 'tile' });
      }
    }
    return rows;
  }, [filteredTiles]);

  if (loading) {
    return (
      <Card className={`flex flex-col p-2 ${className}`}>
        <ViewHeader feature='Inspect Dataflow' featureIcon={<IconEye />} subtext='Loading...' onClose={onClose} />
        <Card.Content className='flex flex-1 items-center justify-center'>
          <Spinner size='md' />
        </Card.Content>
      </Card>
    );
  }

  if (error || !dataflow) {
    return (
      <Card className={`flex flex-col p-2 ${className}`}>
        <ViewHeader feature='Inspect Dataflow' featureIcon={<IconEye />} onClose={onClose} />
        <Card.Content className='flex flex-1 items-center justify-center text-danger'>
          <p>{error || 'No data available'}</p>
        </Card.Content>
      </Card>
    );
  }

  const tilesView = (
    <>
      <div className='border-divider shrink-0 border-b py-2'>
        <SearchField fullWidth aria-label='Search tiles' value={tileSearch} variant='secondary' onChange={setTileSearch}>
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder='Search tiles (column, expression, value...)' />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
        {tileSearch && (
          <div className='text-xs text-muted'>
            {filteredTiles.length} of {dataflow.tiles.length} tiles match
          </div>
        )}
      </div>

      <ScrollShadow hideScrollBar className='min-h-0 flex-1 pt-2' offset={10}>
        {flatRows.length === 0 ? (
          <div className='py-8 text-center text-muted'>
            <p>No tiles match &ldquo;{tileSearch}&rdquo;</p>
          </div>
        ) : (
          <DisclosureGroup className='w-full'>
            {flatRows.map((row) =>
              row.type === 'header' ? (
                <CategoryHeader category={row.category} count={row.count} key={`h-${row.category}`} />
              ) : (
                <div className='mb-1.5' key={row.tile.id}>
                  <TileDetail dialect={dataflow.engine} searchQuery={tileSearch || undefined} tile={row.tile} />
                </div>
              )
            )}
          </DisclosureGroup>
        )}
      </ScrollShadow>
    </>
  );

  return (
    <Card className={`flex flex-col p-2 ${className}`}>
      <ViewHeader
        feature='Inspect'
        featureIcon={<IconEye />}
        subject={dataflow.name}
        subjectTypeId='DATAFLOW_TYPE'
        subtext={`ID: ${dataflow.id} | ${dataflow.tiles.length} tiles`}
        onClose={onClose}
      />

      {versionId && (
        <Alert className='mb-2 w-full border border-border bg-transparent' status='warning'>
          <AlertStatusIcon />
          <Alert.Content>
            <Alert.Title>Historical version</Alert.Title>
            <Alert.Description>
              Showing version {dataflow.versionNumber ?? versionId}, not the live definition.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {!showJson ? (
        <div className='flex min-h-0 flex-1 flex-col overflow-hidden'>{tilesView}</div>
      ) : (
        <Tabs
          className='flex min-h-0 flex-1 flex-col'
          defaultSelectedKey='tiles'
          selectedKey={activeTab}
          variant='secondary'
          onSelectionChange={setActiveTab}
        >
          <Tabs.ListContainer>
            <Tabs.List className='border-divider shrink-0 justify-center'>
              <Tabs.Tab id='tiles'>
                Tiles
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id='json'>
                JSON
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
          <Tabs.Panel className='flex min-h-0 flex-1 flex-col overflow-hidden p-0' id='tiles'>
            {tilesView}
          </Tabs.Panel>

          <Tabs.Panel className='min-h-0 flex-1 overflow-auto' id='json'>
            <ScrollShadow hideScrollBar className='h-full'>
              {rawJSON ? (
                <JsonView
                  displaySize
                  className='text-sm'
                  collapsed={1}
                  collapseStringMode='word'
                  collapseStringsAfterLength={80}
                  customizeCopy={(node) => (typeof node === 'object' ? JSON.stringify(node, null, 2) : String(node))}
                  matchesURL={false}
                  src={rawJSON}
                  CopiedComponent={({ className, style }) => (
                    <AnimatedCheck className={className + ' text-success'} size={16} stroke={1.5} style={style} />
                  )}
                  CopyComponent={({ className, onClick, style }) => (
                    <IconClipboardCopy className={className} size={16} style={style} onClick={onClick} />
                  )}
                  customizeNode={(params) => {
                    if (params.node === null || params.node === undefined) {
                      return { enableClipboard: false };
                    }
                    if (typeof params.node === 'string' && params.node.startsWith('https://')) {
                      return (
                        <Link
                          className='text-sm text-accent no-underline decoration-accent hover:underline'
                          href={params.node}
                          target='_blank'
                        >
                          {params.node}
                        </Link>
                      );
                    }
                    if (params?.indexOrName?.toLowerCase()?.includes('id')) {
                      return { enableClipboard: true };
                    }
                    if (
                      (typeof params.node === 'number' || typeof params.node === 'string') &&
                      params.node?.toString().length >= 7
                    ) {
                      return { enableClipboard: true };
                    }
                    if (typeof params.node === 'object' && Object.keys(params.node).length > 0) {
                      return { enableClipboard: true };
                    }
                    if (Array.isArray(params.node) && params.node.length > 0) {
                      return { enableClipboard: true };
                    }
                    return { enableClipboard: false };
                  }}
                />
              ) : (
                <div className='py-8 text-center text-muted'>
                  <p>No JSON data available</p>
                </div>
              )}
            </ScrollShadow>
          </Tabs.Panel>
        </Tabs>
      )}
    </Card>
  );
}

const DEFAULT_CATEGORY_COLOR = { bg: 'bg-gray-500', text: 'text-gray-500' };

function CategoryHeader({ category, count }) {
  const color = CATEGORY_COLORS[category] || DEFAULT_CATEGORY_COLOR;
  const entry = CATEGORY_ICONS[category] || IconColumnSelect;
  const Icon = Array.isArray(entry) ? entry[0] : entry;
  const rotate = Array.isArray(entry) ? entry[1] : '';
  return (
    <h3 className='mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase first:mt-0'>
      <Icon className={`size-3.5 shrink-0 ${color.text} ${rotate}`} />
      <span className={color.text}>{category}</span>
      <span className='text-muted'>({count})</span>
    </h3>
  );
}

function hasDetailKey(rawDetails, key) {
  const val = rawDetails[key];
  if (val == null) return false;
  if (Array.isArray(val)) return val.length > 0;
  return true;
}

function highlightMatch(text, query) {
  const str = text == null ? '' : typeof text === 'string' ? text : text.name || String(text);
  if (!query || !str) return str;
  const idx = str.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return str;
  return (
    <>
      {str.slice(0, idx)}
      <mark className='rounded bg-yellow-200 px-0.5'>{str.slice(idx, idx + query.length)}</mark>
      {str.slice(idx + query.length)}
    </>
  );
}

function tileHasContent(tile) {
  if (
    tile.filters.length > 0 ||
    tile.joins.length > 0 ||
    tile.expressions.length > 0 ||
    tile.sql.length > 0 ||
    tile.columns.length > 0 ||
    tile.inputDatasets.length > 0 ||
    tile.outputDataset
  ) {
    return true;
  }
  const d = tile.rawDetails;
  return (
    hasDetailKey(d, 'aggregates') ||
    hasDetailKey(d, 'constants') ||
    hasDetailKey(d, 'delimiter') ||
    hasDetailKey(d, 'fieldValue') ||
    hasDetailKey(d, 'formatType') ||
    hasDetailKey(d, 'inputCount') ||
    hasDetailKey(d, 'mappings') ||
    hasDetailKey(d, 'outputField') ||
    hasDetailKey(d, 'pivotField') ||
    hasDetailKey(d, 'renames') ||
    hasDetailKey(d, 'replace') ||
    hasDetailKey(d, 'rowCount') ||
    hasDetailKey(d, 'rowLimit') ||
    hasDetailKey(d, 'search') ||
    hasDetailKey(d, 'separator') ||
    hasDetailKey(d, 'unionType') ||
    hasDetailKey(d, 'updateMode') ||
    hasDetailKey(d, 'valueField')
  );
}

const TileDetail = memo(function TileDetail({ dialect, searchQuery, tile }) {
  const hasContent = tileHasContent(tile);
  const categoryColor = CATEGORY_COLORS[tile.category] || DEFAULT_CATEGORY_COLOR;
  const tileEntry = TILE_ICONS[tile.type] || IconColumnSelect;
  const Icon = Array.isArray(tileEntry) ? tileEntry[0] : tileEntry;
  const tileRotate = Array.isArray(tileEntry) ? tileEntry[1] : '';

  const trigger = (
    <>
      <span className='flex min-w-0 flex-1 items-center gap-2' title={tile.name}>
        <Icon className={`size-4 shrink-0 ${categoryColor.text} ${tileRotate}`} />
        <span className='truncate text-sm font-medium' title={tile.name}>
          {highlightMatch(tile.name, searchQuery)}
        </span>
      </span>
      <Chip className={`text-white ${categoryColor.bg}`} size='sm' variant='soft'>
        <Chip.Label>{tile.displayType}</Chip.Label>
      </Chip>
    </>
  );

  if (!hasContent) {
    return (
      <div className='border-divider flex w-full items-center justify-between gap-2 overflow-hidden rounded-lg border bg-surface-secondary p-2'>
        {trigger}
        <IconChevronDown className='size-4 shrink-0 text-surface' />
      </div>
    );
  }

  return (
    <Disclosure className='border-divider overflow-hidden rounded-lg border bg-surface-secondary'>
      <Disclosure.Heading>
        <Disclosure.Trigger className='flex w-full items-center justify-between gap-2 p-2'>
          {trigger}
          <Disclosure.Indicator>
            <IconChevronDown />
          </Disclosure.Indicator>
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content>
        <div className='px-4'>
          <Separator variant='secondary' />
        </div>
        <div className='flex flex-col gap-2 p-2'>
          {tile.inputDatasets.length > 0 && (
            <DetailSection label='Input DataSet'>
              {tile.inputDatasets.map((id, i) => (
                <DetailMono key={i}>{id}</DetailMono>
              ))}
            </DetailSection>
          )}

          {tile.outputDataset && (
            <DetailSection label='Output DataSet'>
              <DetailMono>{tile.outputDataset}</DetailMono>
              {tile.rawDetails.updateMode && <DetailMono>Mode: {tile.rawDetails.updateMode}</DetailMono>}
            </DetailSection>
          )}

          {tile.rawDetails.constants?.length > 0 && (
            <DetailSection label='Constants'>
              {tile.rawDetails.constants.map((c, i) => (
                <DetailMono key={i}>
                  {highlightMatch(c.name, searchQuery)} ={' '}
                  <span className='text-muted'>{highlightMatch(String(c.value), searchQuery)}</span>
                </DetailMono>
              ))}
            </DetailSection>
          )}

          {tile.filters.length > 0 && (
            <DetailSection label='Filters'>
              {tile.filters.map((f, i) => (
                <DetailMono key={i}>{highlightMatch(`${f.field} ${f.operator} ${f.value}`, searchQuery)}</DetailMono>
              ))}
            </DetailSection>
          )}

          {tile.joins.length > 0 && (
            <DetailSection label='Join Keys'>
              {tile.joins.map((j, i) => (
                <DetailMono key={i}>
                  {highlightMatch(j.leftKey, searchQuery)} = {highlightMatch(j.rightKey, searchQuery)}
                  <span className='ml-2 text-muted'>({j.joinType})</span>
                </DetailMono>
              ))}
            </DetailSection>
          )}

          {tile.expressions.length > 0 && (
            <DetailSection label='Expressions'>
              {tile.expressions.map((e, i) => (
                <div className='border-divider rounded border bg-surface p-2 text-xs' key={i}>
                  <div className='font-semibold'>{highlightMatch(e.resultField, searchQuery)}</div>
                  <div className='font-mono break-all'>{highlightMatch(e.expression, searchQuery)}</div>
                </div>
              ))}
            </DetailSection>
          )}

          {tile.rawDetails.aggregates?.length > 0 && (
            <DetailSection label='Aggregates'>
              {tile.rawDetails.aggregates.map((a, i) => (
                <div className='border-divider rounded border bg-surface p-2 text-xs' key={i}>
                  <div className='font-semibold'>{highlightMatch(a.field, searchQuery)}</div>
                  <div className='font-mono break-all text-muted'>{highlightMatch(a.expression, searchQuery)}</div>
                </div>
              ))}
            </DetailSection>
          )}

          {tile.rawDetails.renames?.length > 0 && (
            <DetailSection label='Renames'>
              {tile.rawDetails.renames.map((r, i) => (
                <DetailMono key={i}>
                  {highlightMatch(r.from, searchQuery)}
                  {' → '}
                  {highlightMatch(r.to, searchQuery)}
                </DetailMono>
              ))}
            </DetailSection>
          )}

          {(tile.rawDetails.search != null || tile.rawDetails.replace != null) && (
            <DetailSection label='Search / Replace'>
              <DetailMono>
                {highlightMatch(tile.rawDetails.search || '', searchQuery)}
                {' → '}
                {highlightMatch(tile.rawDetails.replace || '', searchQuery)}
              </DetailMono>
            </DetailSection>
          )}

          {tile.rawDetails.fieldValue != null && (
            <DetailSection label='Value'>
              <DetailMono>{highlightMatch(String(tile.rawDetails.fieldValue), searchQuery)}</DetailMono>
            </DetailSection>
          )}

          {tile.rawDetails.mappings && (
            <DetailSection label='Mappings'>
              {Array.isArray(tile.rawDetails.mappings)
                ? tile.rawDetails.mappings.map((m, i) => (
                    <DetailMono key={i}>
                      {highlightMatch(String(m.source ?? m.from ?? ''), searchQuery)}
                      {' → '}
                      {highlightMatch(String(m.target ?? m.to ?? ''), searchQuery)}
                    </DetailMono>
                  ))
                : Object.entries(tile.rawDetails.mappings).map(([k, v], i) => (
                    <DetailMono key={i}>
                      {highlightMatch(k, searchQuery)}
                      {' → '}
                      {highlightMatch(String(v), searchQuery)}
                    </DetailMono>
                  ))}
            </DetailSection>
          )}

          {tile.sql.length > 0 && (
            <DetailSection label='SQL'>
              {tile.sql.map((s, i) => (
                <SqlBlock dialect={dialect} key={i} query={searchQuery} sql={typeof s === 'string' ? s : s.query} />
              ))}
            </DetailSection>
          )}

          {tile.columns.length > 0 && (
            <DetailSection label={`Columns (${tile.columns.length})`}>
              <div className='border-divider rounded border bg-surface p-2 text-xs'>
                {tile.columns
                  .map((c) => highlightMatch(c, searchQuery))
                  .reduce((acc, col, i) => {
                    if (i === 0) return [col];
                    return [...acc, ', ', col];
                  }, [])}
              </div>
            </DetailSection>
          )}

          <TileConfig rawDetails={tile.rawDetails} />
        </div>
      </Disclosure.Content>
    </Disclosure>
  );
});

function DetailMono({ children }) {
  return <div className='border-divider rounded border bg-surface p-2 font-mono text-xs'>{children}</div>;
}

function DetailSection({ children, label }) {
  return (
    <div className='flex flex-col gap-1'>
      <div className='text-xs font-semibold'>{label}</div>
      {children}
    </div>
  );
}

function TileConfig({ rawDetails }) {
  const entries = [];
  if (rawDetails.separator != null) entries.push(['Separator', rawDetails.separator || '(empty)']);
  if (rawDetails.outputField) entries.push(['Output Field', rawDetails.outputField]);
  if (rawDetails.delimiter) entries.push(['Delimiter', rawDetails.delimiter]);
  if (rawDetails.formatType) entries.push(['Format', rawDetails.formatType]);
  if (rawDetails.pivotField) entries.push(['Pivot Field', rawDetails.pivotField]);
  if (rawDetails.valueField) entries.push(['Value Field', rawDetails.valueField]);
  if (rawDetails.rowLimit != null) entries.push(['Row Limit', String(rawDetails.rowLimit)]);
  if (rawDetails.rowCount != null) entries.push(['Row Count', String(rawDetails.rowCount)]);
  if (rawDetails.inputCount != null) entries.push(['Inputs', String(rawDetails.inputCount)]);
  if (rawDetails.targetTableName) entries.push(['Table Alias', rawDetails.targetTableName]);
  if (rawDetails.unionType) entries.push(['Union Type', rawDetails.unionType]);
  if (entries.length === 0) return null;

  return (
    <DetailSection label='Configuration'>
      {entries.map(([label, value], i) => (
        <div className='border-divider flex items-center justify-between rounded border bg-surface p-2 text-xs' key={i}>
          <span className='font-semibold'>{label}</span>
          <span className='font-mono text-muted'>{value}</span>
        </div>
      ))}
    </DetailSection>
  );
}
