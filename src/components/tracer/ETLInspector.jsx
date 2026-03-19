import { Button, CloseButton, Spinner } from '@heroui/react';
import {
  IconAbc,
  IconAi,
  IconArchive,
  IconArchiveOff,
  IconArrowBarDown,
  IconArrowFork,
  IconArrowsExchange,
  IconArrowsJoin2,
  IconBraces,
  IconBrandPython,
  IconCalculator,
  IconCalendar,
  IconChevronDown,
  IconChevronRight,
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
  IconReplace,
  IconRobot,
  IconRotate,
  IconRowInsertBottom,
  IconSchema,
  IconSearch,
  IconSortAscending,
  IconSparkles,
  IconSql,
  IconSquareCheck,
  IconStack,
  IconSum,
  IconTableImport,
  IconTextWrap,
  IconTransform,
  IconTrendingUp,
  IconTypography,
  IconVector
} from '@tabler/icons-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getObjectType } from '@/models';
import { getDataflowDetail, parseDataflow, searchTiles } from '@/services';

const CATEGORY_ICONS = {
  'Aggregate': IconSum,
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
  ConcatFields: IconTextWrap,
  Constant: IconSquareCheck,
  DateCalculator: IconCalendar,
  Denormaliser: IconRotate,
  ExpressionEvaluator: IconFunction,
  ExpressionRowGenerator: IconListNumbers,
  Filter: IconFilter,
  FixedInput: IconTableImport,
  GroupBy: IconStack,
  JsonExpandAction: IconBraces,
  Limit: IconArrowBarDown,
  LoadFromVault: IconDatabaseImport,
  MakoVectorOutputAction: IconVector,
  MergeJoin: IconArrowsJoin2,
  Metadata: IconColumns3,
  MetaSelectAction: IconSquareCheck,
  MLInferenceAction: IconFlask,
  ModelInferenceAction: IconRobot,
  NormalizeAll: IconRowInsertBottom,
  Normalizer: IconRowInsertBottom,
  NumericCalculator: IconCalculator,
  Order: IconSortAscending,
  PublishToVault: IconDatabaseExport,
  PublishToWriteback: IconDatabaseExport,
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
  Unique: IconArrowsExchange,
  UnstashAction: IconArchiveOff,
  UserDefinedAction: IconFlask,
  ValueMapper: IconArrowsExchange,
  WindowAction: IconSum
};

const CATEGORY_COLORS = {
  'Aggregate': '#ec4899',
  'AI Services': '#f43f5e',
  'Combine Data': '#f59e0b',
  'Data Science': '#84cc16',
  'DataSets': '#6366f1',
  'Dates and Numbers': '#f97316',
  'Filter': '#10b981',
  'Performance': '#64748b',
  'Pivot': '#06b6d4',
  'Scripting': '#a855f7',
  'Text': '#0ea5e9',
  'Utility': '#8b5cf6'
};

/**
 * Right panel for inspecting ETL dataflow tiles
 * @param {Object} props
 * @param {string} props.dataflowId - Dataflow ID to inspect
 * @param {string} [props.instance] - Domo instance subdomain for building URLs
 * @param {number} [props.tabId] - Chrome tab ID
 * @param {Function} props.onClose - Close handler
 */
export function ETLInspector({ dataflowId, instance, onClose, tabId }) {
  const [dataflow, setDataflow] = useState(null);
  const [domoUrl, setDomoUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tileSearch, setTileSearch] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function fetchDataflow() {
      setLoading(true);
      setError(null);
      try {
        const dataflowJSON = await getDataflowDetail(dataflowId, tabId);
        const parsed = parseDataflow(dataflowJSON);
        if (!cancelled) {
          setDataflow(parsed);
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
  }, [dataflowId, tabId]);

  useEffect(() => {
    if (!instance || !dataflow) {
      setDomoUrl(null);
      return;
    }
    const baseUrl = `https://${instance}.domo.com`;
    getObjectType('DATAFLOW')
      .buildObjectUrl(baseUrl, dataflow.id)
      .then(setDomoUrl)
      .catch(() => setDomoUrl(null));
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

  const scrollRef = useRef(null);

  const virtualizer = useVirtualizer({
    count: flatRows.length,
    estimateSize: useCallback(
      (index) => (flatRows[index].type === 'header' ? 32 : 44),
      [flatRows]
    ),
    getScrollElement: () => scrollRef.current,
    overscan: 8
  });

  if (loading) {
    return (
      <div className='border-divider flex h-full flex-col border-l bg-background'>
        <div className='border-divider flex items-center justify-between border-b px-4 py-3'>
          <span className='font-semibold'>Loading ETL...</span>
          <CloseButton size='sm' onPress={onClose} />
        </div>
        <div className='flex flex-1 items-center justify-center'>
          <Spinner size='md' />
        </div>
      </div>
    );
  }

  if (error || !dataflow) {
    return (
      <div className='border-divider flex h-full flex-col border-l bg-background'>
        <div className='border-divider flex items-center justify-between border-b px-4 py-3'>
          <span className='font-semibold'>ETL Inspector</span>
          <CloseButton size='sm' onPress={onClose} />
        </div>
        <div className='flex flex-1 items-center justify-center text-danger'>
          <p>{error || 'No data available'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className='border-divider flex h-full flex-col border-l bg-background'>
      <div className='border-divider shrink-0 border-b px-4 py-3'>
        <div className='flex items-center justify-between'>
          <div className='flex min-w-0 items-center gap-2'>
            <IconArrowFork className='size-4 shrink-0 rotate-180 text-amber-500' />
            <span className='truncate font-semibold'>{dataflow.name}</span>
          </div>
          <div className='flex shrink-0 items-center gap-1'>
            {domoUrl && (
              <a
                className='hover:bg-content2 rounded p-1 text-accent'
                href={domoUrl}
                rel='noopener noreferrer'
                target='_blank'
                title='Open in Domo'
              >
                <IconExternalLink className='size-4' />
              </a>
            )}
            <CloseButton size='sm' onPress={onClose} />
          </div>
        </div>
        <div className='mt-1 text-xs text-muted'>
          {dataflow.tiles.length} tiles &middot; ID: {dataflow.id}
        </div>
      </div>

      <div className='border-divider shrink-0 border-b px-4 py-2'>
        <div className='relative'>
          <IconSearch className='absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted' />
          <input
            className='border-divider w-full rounded-md border bg-background py-1.5 pr-3 pl-8 text-sm focus:ring-2 focus:ring-accent focus:outline-none'
            placeholder='Search tiles (column, expression, value...)'
            type='text'
            value={tileSearch}
            onChange={(e) => setTileSearch(e.target.value)}
          />
        </div>
        {tileSearch && (
          <div className='mt-1 text-xs text-muted'>
            {filteredTiles.length} of {dataflow.tiles.length} tiles match
          </div>
        )}
      </div>

      <div className='flex-1 overflow-y-auto px-4 py-3' ref={scrollRef}>
        {flatRows.length === 0 ? (
          <div className='py-8 text-center text-muted'>
            <p>No tiles match &ldquo;{tileSearch}&rdquo;</p>
          </div>
        ) : (
          <div
            className='relative w-full'
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map((vItem) => {
              const row = flatRows[vItem.index];
              return (
                <div
                  className='absolute left-0 w-full'
                  data-index={vItem.index}
                  key={vItem.key}
                  ref={virtualizer.measureElement}
                  style={{ top: vItem.start }}
                >
                  {row.type === 'header' ? (
                    <CategoryHeader category={row.category} count={row.count} />
                  ) : (
                    <div className='mb-1.5'>
                      <TileDetail
                        defaultOpen={!!tileSearch}
                        searchQuery={tileSearch || undefined}
                        tile={row.tile}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function CategoryHeader({ category, count }) {
  const color = CATEGORY_COLORS[category] || '#6b7280';
  const Icon = CATEGORY_ICONS[category] || IconColumns3;
  return (
    <h3 className='mt-4 mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase first:mt-0'>
      <Icon className='size-3.5 shrink-0' style={{ color }} />
      <span style={{ color }}>{category}</span>
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
    hasDetailKey(d, 'updateMode') ||
    hasDetailKey(d, 'valueField')
  );
}

const TileDetail = memo(function TileDetail({
  defaultOpen = false,
  searchQuery,
  tile
}) {
  const hasContent = tileHasContent(tile);
  const [open, setOpen] = useState(defaultOpen && hasContent);
  const categoryColor = CATEGORY_COLORS[tile.category] || '#6b7280';
  const Icon = TILE_ICONS[tile.type] || IconColumns3;

  return (
    <div className='border-divider overflow-hidden rounded-lg border bg-background'>
      <Button
        className='h-auto w-full justify-start gap-2 px-3 py-2'
        disableRipple={!hasContent}
        variant='light'
        onPress={hasContent ? () => setOpen(!open) : undefined}
      >
        {hasContent ? (
          open ? (
            <IconChevronDown className='size-4 shrink-0 text-muted' />
          ) : (
            <IconChevronRight className='size-4 shrink-0 text-muted' />
          )
        ) : (
          <div className='w-4 shrink-0' />
        )}
        <Icon className='size-4 shrink-0' style={{ color: categoryColor }} />
        <span className='truncate text-sm font-medium'>
          {highlightMatch(tile.name, searchQuery)}
        </span>
        <span
          className='ml-auto shrink-0 rounded-full px-2 py-0.5 text-xs text-white'
          style={{ backgroundColor: categoryColor }}
        >
          {tile.displayType}
        </span>
      </Button>

      {open && hasContent && (
        <div className='border-divider bg-content2 space-y-2 border-t px-3 pb-3'>
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
                  className='border-divider mb-1 rounded border bg-background px-2 py-1 text-xs'
                  key={i}
                >
                  <div className='font-semibold'>
                    {highlightMatch(e.resultField, searchQuery)}
                  </div>
                  <div className='mt-0.5 font-mono break-all text-muted'>
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
                  className='border-divider mb-1 rounded border bg-background px-2 py-1 text-xs'
                  key={i}
                >
                  <div className='font-semibold'>
                    {highlightMatch(a.field, searchQuery)}
                  </div>
                  <div className='mt-0.5 font-mono break-all text-muted'>
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
                  className='border-divider mb-1 overflow-x-auto rounded border bg-background px-2 py-1 font-mono text-xs'
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
              <div className='border-divider rounded border bg-background px-2 py-1 text-xs'>
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
      )}
    </div>
  );
});

function DetailMono({ children }) {
  return (
    <div className='border-divider mb-1 rounded border bg-background px-2 py-1 font-mono text-xs'>
      {children}
    </div>
  );
}

function DetailSection({ children, label }) {
  return (
    <div className='mt-2'>
      <div className='mb-1 text-xs font-semibold text-muted'>{label}</div>
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
  if (entries.length === 0) return null;

  return (
    <DetailSection label='Configuration'>
      {entries.map(([label, value], i) => (
        <div
          className='border-divider mb-1 flex items-center justify-between rounded border bg-background px-2 py-1 text-xs'
          key={i}
        >
          <span className='font-semibold'>{label}</span>
          <span className='font-mono text-muted'>{value}</span>
        </div>
      ))}
    </DetailSection>
  );
}
