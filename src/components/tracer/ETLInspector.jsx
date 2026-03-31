import {
  Button,
  ButtonGroup,
  Card,
  Chip,
  CloseButton,
  Disclosure,
  DisclosureGroup,
  Link,
  ScrollShadow,
  SearchField,
  Spinner,
  Tabs
} from '@heroui/react';
import {
  IconAB,
  IconAB2,
  IconAbc,
  IconAi,
  IconArchive,
  IconArchiveOff,
  IconArrowFork,
  IconArrowsDiagonalMinimize2,
  IconArrowsJoin,
  IconArrowsJoin2,
  IconBraces,
  IconBrain,
  IconBrandPython,
  IconCalculator,
  IconCalendar,
  IconCalendarPlus,
  IconChartBar,
  IconChevronDown,
  IconClipboard,
  IconCode,
  IconColumns3,
  IconCopy,
  IconDatabase,
  IconDatabaseExport,
  IconDatabaseImport,
  IconExternalLink,
  IconFilter,
  IconFilterCog,
  IconFlask,
  IconFunction,
  IconGauge,
  IconGitFork,
  IconLetterCase,
  IconLink,
  IconListNumbers,
  IconPackageExport,
  IconReplace,
  IconRotate,
  IconRowInsertBottom,
  IconRowRemove,
  IconSchema,
  IconSortAscending,
  IconSparkles,
  IconSql,
  IconTableColumn,
  IconTableImport,
  IconTableMinus,
  IconTableOptions,
  IconTableRow,
  IconTransform,
  IconTrendingUp,
  IconTypography,
  IconVector,
  IconX
} from '@tabler/icons-react';
import { memo, useEffect, useMemo, useState } from 'react';
import JsonView from 'react18-json-view';

import '@/assets/json-view-theme.css';
import { AnimatedCheck } from '@/components';
import { getObjectType } from '@/models';
import { getDataflowDetail, parseDataflow, searchTiles } from '@/services';

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
  'Aggregate': IconArrowsDiagonalMinimize2,
  'AI Services': IconAi,
  'Combine Data': IconArrowsJoin2,
  'Data Science': IconFlask,
  'DataSets': IconDatabase,
  'Dates and Numbers': IconCalendar,
  'Filter': IconFilter,
  'Performance': IconGauge,
  'Pivot': IconRotate,
  'Scripting': IconCode,
  'Text': IconTypography,
  'Utility': IconTransform
};

const TILE_ICONS = {
  AIForecasting: IconTrendingUp,
  ConcatFields: IconAB,
  Constant: IconTableColumn,
  DateCalculator: IconCalendarPlus,
  Denormaliser: IconRotate,
  ExpressionEvaluator: IconFunction,
  ExpressionRowGenerator: IconListNumbers,
  Filter: IconFilter,
  FixedInput: IconTableImport,
  GroupBy: IconArrowsDiagonalMinimize2,
  JsonExpandAction: IconBraces,
  Limit: IconTableMinus,
  LoadFromVault: IconDatabaseImport,
  MakoVectorOutputAction: IconVector,
  MergeJoin: IconArrowsJoin2,
  Metadata: IconTableRow,
  MetaSelectAction: IconTableOptions,
  MLInferenceAction: IconBrain,
  ModelInferenceAction: [IconArrowsJoin, 'rotate-90'],
  NormalizeAll: IconRowInsertBottom,
  Normalizer: IconRowInsertBottom,
  NumericCalculator: IconCalculator,
  Order: IconSortAscending,
  PublishToVault: IconDatabaseExport,
  PublishToWriteback: IconPackageExport,
  PythonEngineAction: IconBrandPython,
  REngineAction: IconCode,
  ReplaceString: IconReplace,
  SchemaAction: IconSchema,
  SelectValues: IconColumns3,
  SetValueField: IconCopy,
  SplitColumnAction: IconLink,
  SplitFilter: IconFilterCog,
  SplitJoin: IconGitFork,
  SQL: IconSql,
  StashAction: IconArchive,
  StringCalculator: IconAbc,
  TextFormatting: IconLetterCase,
  TextGeneration: IconSparkles,
  UnionAll: IconRowInsertBottom,
  Unique: IconRowRemove,
  UnstashAction: IconArchiveOff,
  UserDefinedAction: IconFlask,
  ValueMapper: IconAB2,
  WindowAction: IconChartBar
};

/**
 * Right panel for inspecting ETL dataflow tiles
 * @param {Object} props
 * @param {React.RefObject<Map>} [props.cacheRef] - Shared cache for parsed dataflow data
 * @param {string} props.dataflowId - Dataflow ID to inspect
 * @param {string} [props.instance] - Domo instance subdomain for building URLs
 * @param {Function} [props.resolveTabId] - Async function that resolves a valid tab ID
 * @param {Function} props.onClose - Close handler
 */
export function ETLInspector({
  cacheRef,
  dataflowId,
  instance,
  onClose,
  resolveTabId
}) {
  const cached = cacheRef?.current?.get(dataflowId);
  const [dataflow, setDataflow] = useState(cached?.parsed ?? null);
  const [rawJSON, setRawJSON] = useState(cached?.raw ?? null);
  const [domoUrl, setDomoUrl] = useState(null);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState(null);
  const [tileSearch, setTileSearch] = useState('');
  const [activeTab, setActiveTab] = useState('tiles');

  useEffect(() => {
    if (cached) return;

    let cancelled = false;

    async function fetchDataflow() {
      setLoading(true);
      setError(null);
      try {
        const tabId = await resolveTabId?.();
        const dataflowJSON = await getDataflowDetail(dataflowId, tabId);
        const parsed = parseDataflow(dataflowJSON);
        if (!cancelled) {
          cacheRef?.current?.set(dataflowId, { parsed, raw: dataflowJSON });
          setDataflow(parsed);
          setRawJSON(dataflowJSON);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[ETLInspector] Failed to fetch dataflow:', err);
          setError(err.message || 'Failed to load ETL data');
          setLoading(false);
        }
      }
    }

    fetchDataflow();

    return () => {
      cancelled = true;
    };
  }, [cacheRef, dataflowId, resolveTabId]);

  useEffect(() => {
    if (!instance || !dataflow) {
      setDomoUrl(null);
      return;
    }
    const baseUrl = `https://${instance}.domo.com`;
    getObjectType('DATAFLOW_TYPE')
      ?.buildObjectUrl(baseUrl, dataflow.id)
      ?.then(setDomoUrl)
      ?.catch(() => setDomoUrl(null));
  }, [instance, dataflow]);

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
      <Card className='border-divider h-full rounded-none border-l p-0 shadow-none'>
        <Card.Header className='border-divider flex-row items-center justify-between border-b px-4 py-3'>
          <span className='font-semibold'>Loading ETL...</span>
          <CloseButton size='sm' onPress={onClose} />
        </Card.Header>
        <Card.Content className='items-center justify-center'>
          <Spinner size='md' />
        </Card.Content>
      </Card>
    );
  }

  if (error || !dataflow) {
    return (
      <Card className='border-divider h-full rounded-none border-l p-0 shadow-none'>
        <Card.Header className='border-divider flex-row items-center justify-between border-b px-4 py-3'>
          <span className='font-semibold'>ETL Inspector</span>
          <CloseButton size='sm' onPress={onClose} />
        </Card.Header>
        <Card.Content className='items-center justify-center text-danger'>
          <p>{error || 'No data available'}</p>
        </Card.Content>
      </Card>
    );
  }

  return (
    <Card className='border-divider flex h-full flex-col rounded-none border-l p-0 shadow-none'>
      <Card.Header className='border-divider shrink-0 gap-1 border-b p-2'>
        <div className='flex items-center justify-between'>
          <div className='flex min-w-0 items-center gap-2'>
            <IconArrowFork className='size-4 shrink-0 rotate-180 text-amber-500' />
            <span className='truncate font-semibold' title={dataflow.name}>
              {dataflow.name}
            </span>
          </div>
          <ButtonGroup size='sm' variant='tertiary'>
            {domoUrl && (
              <Button isIconOnly onPress={() => window.open(domoUrl)}>
                <IconExternalLink stroke={1.5} />
              </Button>
            )}
            <Button isIconOnly onPress={onClose}>
              <IconX stroke={1.5} />
            </Button>
          </ButtonGroup>
        </div>
        <div className='text-xs text-muted'>
          {dataflow.tiles.length} tiles &middot; ID: {dataflow.id}
        </div>
      </Card.Header>

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
        <Tabs.Panel
          className='flex min-h-0 flex-1 flex-col overflow-hidden p-0'
          id='tiles'
        >
          <div className='border-divider shrink-0 border-b p-2'>
            <SearchField
              fullWidth
              aria-label='Search tiles'
              value={tileSearch}
              variant='secondary'
              onChange={setTileSearch}
            >
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

          <ScrollShadow hideScrollBar className='min-h-0 flex-1 p-2'>
            {flatRows.length === 0 ? (
              <div className='py-8 text-center text-muted'>
                <p>No tiles match &ldquo;{tileSearch}&rdquo;</p>
              </div>
            ) : (
              <DisclosureGroup className='w-full'>
                {flatRows.map((row) =>
                  row.type === 'header' ? (
                    <CategoryHeader
                      category={row.category}
                      count={row.count}
                      key={`h-${row.category}`}
                    />
                  ) : (
                    <div className='mb-1.5' key={row.tile.id}>
                      <TileDetail
                        searchQuery={tileSearch || undefined}
                        tile={row.tile}
                      />
                    </div>
                  )
                )}
              </DisclosureGroup>
            )}
          </ScrollShadow>
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
                matchesURL={false}
                src={rawJSON}
                CopiedComponent={({ className, style }) => (
                  <AnimatedCheck
                    className={className + ' text-success'}
                    size={16}
                    stroke={1.5}
                    style={style}
                  />
                )}
                CopyComponent={({ className, onClick, style }) => (
                  <IconClipboard
                    className={className}
                    size={16}
                    stroke={1.5}
                    style={style}
                    onClick={onClick}
                  />
                )}
                customizeCopy={(node) =>
                  typeof node === 'object'
                    ? JSON.stringify(node, null, 2)
                    : String(node)
                }
                customizeNode={(params) => {
                  if (params.node === null || params.node === undefined) {
                    return { enableClipboard: false };
                  }
                  if (
                    typeof params.node === 'string' &&
                    params.node.startsWith('https://')
                  ) {
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
                  if (params.indexOrName?.toLowerCase().includes('id')) {
                    return { enableClipboard: true };
                  }
                  if (
                    (typeof params.node === 'number' ||
                      typeof params.node === 'string') &&
                    params.node?.toString().length >= 7
                  ) {
                    return { enableClipboard: true };
                  }
                  if (
                    typeof params.node === 'object' &&
                    Object.keys(params.node).length > 0
                  ) {
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
    </Card>
  );
}

const DEFAULT_CATEGORY_COLOR = { bg: 'bg-gray-500', text: 'text-gray-500' };

function CategoryHeader({ category, count }) {
  const color = CATEGORY_COLORS[category] || DEFAULT_CATEGORY_COLOR;
  const entry = CATEGORY_ICONS[category] || IconColumns3;
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
  const str =
    text == null
      ? ''
      : typeof text === 'string'
        ? text
        : text.name || String(text);
  if (!query || !str) return str;
  const idx = str.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return str;
  return (
    <>
      {str.slice(0, idx)}
      <mark className='rounded bg-yellow-200 px-0.5'>
        {str.slice(idx, idx + query.length)}
      </mark>
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

const TileDetail = memo(function TileDetail({ searchQuery, tile }) {
  const hasContent = tileHasContent(tile);
  const categoryColor =
    CATEGORY_COLORS[tile.category] || DEFAULT_CATEGORY_COLOR;
  const tileEntry = TILE_ICONS[tile.type] || IconColumns3;
  const Icon = Array.isArray(tileEntry) ? tileEntry[0] : tileEntry;
  const tileRotate = Array.isArray(tileEntry) ? tileEntry[1] : '';

  const trigger = (
    <>
      <span
        className='flex min-w-0 flex-1 items-center gap-2'
        title={tile.name}
      >
        <Icon
          className={`size-4 shrink-0 ${categoryColor.text} ${tileRotate}`}
        />
        <span className='truncate text-sm font-medium' title={tile.name}>
          {highlightMatch(tile.name, searchQuery)}
        </span>
      </span>
      <Chip
        className={`text-white ${categoryColor.bg}`}
        size='sm'
        variant='soft'
      >
        <Chip.Label>{tile.displayType}</Chip.Label>
      </Chip>
    </>
  );

  if (!hasContent) {
    return (
      <div className='border-divider flex w-full items-center justify-between gap-2 overflow-hidden rounded-lg border bg-background p-2'>
        {trigger}
        <IconChevronDown className='size-4 shrink-0 text-background' />
      </div>
    );
  }

  return (
    <Disclosure className='border-divider overflow-hidden rounded-lg border bg-background'>
      <Disclosure.Heading>
        <Disclosure.Trigger className='flex w-full items-center justify-between gap-2 p-2'>
          {trigger}
          <Disclosure.Indicator className='text-muted'>
            <IconChevronDown stroke={1.5} />
          </Disclosure.Indicator>
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content>
        <div className='border-divider flex flex-col gap-2 border-t p-2'>
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
              {tile.rawDetails.updateMode && (
                <DetailMono>Mode: {tile.rawDetails.updateMode}</DetailMono>
              )}
            </DetailSection>
          )}

          {tile.rawDetails.constants?.length > 0 && (
            <DetailSection label='Constants'>
              {tile.rawDetails.constants.map((c, i) => (
                <DetailMono key={i}>
                  {highlightMatch(c.name, searchQuery)} ={' '}
                  <span className='text-muted'>
                    {highlightMatch(String(c.value), searchQuery)}
                  </span>
                </DetailMono>
              ))}
            </DetailSection>
          )}

          {tile.filters.length > 0 && (
            <DetailSection label='Filters'>
              {tile.filters.map((f, i) => (
                <DetailMono key={i}>
                  {highlightMatch(
                    `${f.field} ${f.operator} ${f.value}`,
                    searchQuery
                  )}
                </DetailMono>
              ))}
            </DetailSection>
          )}

          {tile.joins.length > 0 && (
            <DetailSection label='Join Keys'>
              {tile.joins.map((j, i) => (
                <DetailMono key={i}>
                  {highlightMatch(j.leftKey, searchQuery)} ={' '}
                  {highlightMatch(j.rightKey, searchQuery)}
                  <span className='ml-2 text-muted'>({j.joinType})</span>
                </DetailMono>
              ))}
            </DetailSection>
          )}

          {tile.expressions.length > 0 && (
            <DetailSection label='Expressions'>
              {tile.expressions.map((e, i) => (
                <div
                  className='border-divider rounded border bg-background p-2 text-xs'
                  key={i}
                >
                  <div className='font-semibold'>
                    {highlightMatch(e.resultField, searchQuery)}
                  </div>
                  <div className='font-mono break-all'>
                    {highlightMatch(e.expression, searchQuery)}
                  </div>
                </div>
              ))}
            </DetailSection>
          )}

          {tile.rawDetails.aggregates?.length > 0 && (
            <DetailSection label='Aggregates'>
              {tile.rawDetails.aggregates.map((a, i) => (
                <div
                  className='border-divider rounded border bg-background p-2 text-xs'
                  key={i}
                >
                  <div className='font-semibold'>
                    {highlightMatch(a.field, searchQuery)}
                  </div>
                  <div className='font-mono break-all text-muted'>
                    {highlightMatch(a.expression, searchQuery)}
                  </div>
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

          {(tile.rawDetails.search != null ||
            tile.rawDetails.replace != null) && (
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
              <DetailMono>
                {highlightMatch(
                  String(tile.rawDetails.fieldValue),
                  searchQuery
                )}
              </DetailMono>
            </DetailSection>
          )}

          {tile.rawDetails.mappings && (
            <DetailSection label='Mappings'>
              {Array.isArray(tile.rawDetails.mappings)
                ? tile.rawDetails.mappings.map((m, i) => (
                    <DetailMono key={i}>
                      {highlightMatch(
                        String(m.source ?? m.from ?? ''),
                        searchQuery
                      )}
                      {' → '}
                      {highlightMatch(
                        String(m.target ?? m.to ?? ''),
                        searchQuery
                      )}
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
                <pre
                  className='border-divider overflow-x-auto rounded border bg-background p-2 font-mono text-xs'
                  key={i}
                >
                  {highlightMatch(
                    typeof s === 'string' ? s : s.query,
                    searchQuery
                  )}
                </pre>
              ))}
            </DetailSection>
          )}

          {tile.columns.length > 0 && (
            <DetailSection label={`Columns (${tile.columns.length})`}>
              <div className='border-divider rounded border bg-background p-2 text-xs'>
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
  return (
    <div className='border-divider rounded border bg-background p-2 font-mono text-xs'>
      {children}
    </div>
  );
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
  if (rawDetails.separator != null)
    entries.push(['Separator', rawDetails.separator || '(empty)']);
  if (rawDetails.outputField)
    entries.push(['Output Field', rawDetails.outputField]);
  if (rawDetails.delimiter) entries.push(['Delimiter', rawDetails.delimiter]);
  if (rawDetails.formatType) entries.push(['Format', rawDetails.formatType]);
  if (rawDetails.pivotField)
    entries.push(['Pivot Field', rawDetails.pivotField]);
  if (rawDetails.valueField)
    entries.push(['Value Field', rawDetails.valueField]);
  if (rawDetails.rowLimit != null)
    entries.push(['Row Limit', String(rawDetails.rowLimit)]);
  if (rawDetails.rowCount != null)
    entries.push(['Row Count', String(rawDetails.rowCount)]);
  if (rawDetails.inputCount != null)
    entries.push(['Inputs', String(rawDetails.inputCount)]);
  if (rawDetails.unionType)
    entries.push(['Union Type', rawDetails.unionType]);
  if (entries.length === 0) return null;

  return (
    <DetailSection label='Configuration'>
      {entries.map(([label, value], i) => (
        <div
          className='border-divider flex items-center justify-between rounded border bg-background p-2 text-xs'
          key={i}
        >
          <span className='font-semibold'>{label}</span>
          <span className='font-mono text-muted'>{value}</span>
        </div>
      ))}
    </DetailSection>
  );
}
