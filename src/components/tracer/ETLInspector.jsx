import {
  IconArrowsSplit,
  IconCalculator,
  IconChevronDown,
  IconChevronRight,
  IconCode,
  IconColumns3,
  IconExternalLink,
  IconFilter,
  IconGitMerge,
  IconLoader2,
  IconSearch,
  IconX
} from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';

import { parseDataflow, searchTiles } from '@/services';
import { executeInPage } from '@/utils';

async function getDataflow(dataflowId, tabId = null) {
  return await executeInPage(
    async (dataflowId) => {
      const response = await fetch(
        `/api/dataprocessing/v1/dataflows/${dataflowId}`,
        {
          credentials: 'include',
          method: 'GET'
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch dataflow: HTTP ${response.status}`);
      }

      return response.json();
    },
    [dataflowId],
    tabId
  );
}

const TILE_ICONS = {
  Code: IconCode,
  Expressions: IconCalculator,
  Filtering: IconFilter,
  Joining: IconGitMerge
};

const CATEGORY_COLORS = {
  'Advanced': '#84cc16',
  'Aggregation': '#ec4899',
  'Code': '#64748b',
  'Data I/O': '#6366f1',
  'Expressions': '#f97316',
  'Filtering': '#10b981',
  'Joining': '#f59e0b',
  'Normalization': '#06b6d4',
  'Transformation': '#8b5cf6'
};

/**
 * Right panel for inspecting ETL dataflow tiles
 * @param {Object} props
 * @param {string} props.dataflowId - Dataflow ID to inspect
 * @param {number} [props.tabId] - Chrome tab ID
 * @param {Function} props.onClose - Close handler
 */
export function ETLInspector({ dataflowId, onClose, tabId }) {
  const [dataflow, setDataflow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tileSearch, setTileSearch] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function fetchDataflow() {
      setLoading(true);
      setError(null);
      try {
        const dataflowJSON = await getDataflow(dataflowId, tabId);
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

  const filteredTiles = useMemo(() => {
    if (!dataflow) return [];
    if (!tileSearch.trim()) return dataflow.tiles;

    const matches = searchTiles(dataflow.tiles, tileSearch.trim());
    const matchedIds = new Set(matches.map((m) => m.tile.id));
    return dataflow.tiles.filter((t) => matchedIds.has(t.id));
  }, [dataflow, tileSearch]);

  const groupedTiles = useMemo(() => {
    const groups = new Map();
    for (const tile of filteredTiles) {
      const group = groups.get(tile.category) || [];
      group.push(tile);
      groups.set(tile.category, group);
    }
    return groups;
  }, [filteredTiles]);

  if (loading) {
    return (
      <div className='flex h-full flex-col border-l bg-white'>
        <div className='flex items-center justify-between border-b px-4 py-3'>
          <span className='font-semibold text-slate-700'>Loading ETL...</span>
          <button className='rounded p-1 hover:bg-slate-100' onClick={onClose}>
            <IconX className='h-4 w-4' />
          </button>
        </div>
        <div className='flex flex-1 items-center justify-center'>
          <IconLoader2 className='h-6 w-6 animate-spin text-slate-400' />
        </div>
      </div>
    );
  }

  if (error || !dataflow) {
    return (
      <div className='flex h-full flex-col border-l bg-white'>
        <div className='flex items-center justify-between border-b px-4 py-3'>
          <span className='font-semibold text-slate-700'>ETL Inspector</span>
          <button className='rounded p-1 hover:bg-slate-100' onClick={onClose}>
            <IconX className='h-4 w-4' />
          </button>
        </div>
        <div className='flex flex-1 items-center justify-center text-red-500'>
          <p>{error || 'No data available'}</p>
        </div>
      </div>
    );
  }

  const instanceDomain =
    typeof window !== 'undefined'
      ? window.location.hostname.replace('.domo.com', '')
      : null;
  const domoUrl = instanceDomain
    ? `https://${instanceDomain}.domo.com/datacenter/dataflows/${dataflow.id}`
    : null;

  return (
    <div className='flex h-full flex-col border-l bg-white'>
      <div className='shrink-0 border-b px-4 py-3'>
        <div className='flex items-center justify-between'>
          <div className='flex min-w-0 items-center gap-2'>
            <IconArrowsSplit className='h-4 w-4 shrink-0 text-amber-500' />
            <span className='truncate font-semibold text-slate-700'>
              {dataflow.name}
            </span>
          </div>
          <div className='flex shrink-0 items-center gap-1'>
            {domoUrl && (
              <a
                className='rounded p-1 text-blue-500 hover:bg-slate-100'
                href={domoUrl}
                rel='noopener noreferrer'
                target='_blank'
                title='Open in Domo'
              >
                <IconExternalLink className='h-4 w-4' />
              </a>
            )}
            <button
              className='rounded p-1 hover:bg-slate-100'
              onClick={onClose}
            >
              <IconX className='h-4 w-4 text-slate-400' />
            </button>
          </div>
        </div>
        <div className='mt-1 text-xs text-slate-400'>
          {dataflow.tiles.length} tiles &middot; ID: {dataflow.id}
        </div>
      </div>

      <div className='shrink-0 border-b px-4 py-2'>
        <div className='relative'>
          <IconSearch className='absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400' />
          <input
            className='w-full rounded-md border py-1.5 pr-3 pl-8 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none'
            placeholder='Search tiles (column, expression, value...)'
            type='text'
            value={tileSearch}
            onChange={(e) => setTileSearch(e.target.value)}
          />
        </div>
        {tileSearch && (
          <div className='mt-1 text-xs text-slate-400'>
            {filteredTiles.length} of {dataflow.tiles.length} tiles match
          </div>
        )}
      </div>

      <div className='flex-1 space-y-4 overflow-y-auto px-4 py-3'>
        {Array.from(groupedTiles.entries()).map(([category, tiles]) => (
          <div key={category}>
            <h3 className='mb-2 text-xs font-semibold tracking-wider text-slate-500 uppercase'>
              {category} ({tiles.length})
            </h3>
            <div className='space-y-1.5'>
              {tiles.map((tile) => (
                <TileDetail
                  defaultOpen={!!tileSearch}
                  key={tile.id}
                  searchQuery={tileSearch || undefined}
                  tile={tile}
                />
              ))}
            </div>
          </div>
        ))}

        {filteredTiles.length === 0 && (
          <div className='py-8 text-center text-slate-400'>
            <p>No tiles match "{tileSearch}"</p>
          </div>
        )}
      </div>
    </div>
  );
}

function highlightMatch(text, query) {
  if (!query || !text) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className='rounded bg-yellow-200 px-0.5'>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function TileDetail({ defaultOpen = false, searchQuery, tile }) {
  const [open, setOpen] = useState(defaultOpen);
  const categoryColor = CATEGORY_COLORS[tile.category] || '#6b7280';
  const Icon = TILE_ICONS[tile.category] || IconColumns3;

  const hasContent =
    tile.filters.length > 0 ||
    tile.joins.length > 0 ||
    tile.expressions.length > 0 ||
    tile.sql.length > 0 ||
    tile.columns.length > 0;

  return (
    <div className='overflow-hidden rounded-lg border bg-white'>
      <button
        className='flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-slate-50'
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <IconChevronDown className='h-4 w-4 shrink-0 text-slate-400' />
        ) : (
          <IconChevronRight className='h-4 w-4 shrink-0 text-slate-400' />
        )}
        <Icon className='h-4 w-4 shrink-0' style={{ color: categoryColor }} />
        <span className='truncate text-sm font-medium text-slate-700'>
          {highlightMatch(tile.name, searchQuery)}
        </span>
        <span
          className='ml-auto shrink-0 rounded-full px-2 py-0.5 text-xs text-white'
          style={{ backgroundColor: categoryColor }}
        >
          {tile.displayType}
        </span>
      </button>

      {open && hasContent && (
        <div className='space-y-2 border-t bg-slate-50 px-3 pb-3'>
          {tile.filters.length > 0 && (
            <div className='mt-2'>
              <div className='mb-1 text-xs font-semibold text-slate-500'>
                Filters
              </div>
              {tile.filters.map((f, i) => (
                <div
                  className='mb-1 rounded border bg-white px-2 py-1 font-mono text-xs'
                  key={i}
                >
                  {highlightMatch(
                    `${f.field} ${f.operator} ${f.value}`,
                    searchQuery
                  )}
                </div>
              ))}
            </div>
          )}

          {tile.joins.length > 0 && (
            <div className='mt-2'>
              <div className='mb-1 text-xs font-semibold text-slate-500'>
                Join Keys
              </div>
              {tile.joins.map((j, i) => (
                <div
                  className='mb-1 rounded border bg-white px-2 py-1 font-mono text-xs'
                  key={i}
                >
                  {highlightMatch(j.leftKey, searchQuery)} ={' '}
                  {highlightMatch(j.rightKey, searchQuery)}
                  <span className='ml-2 text-slate-400'>({j.joinType})</span>
                </div>
              ))}
            </div>
          )}

          {tile.expressions.length > 0 && (
            <div className='mt-2'>
              <div className='mb-1 text-xs font-semibold text-slate-500'>
                Expressions
              </div>
              {tile.expressions.map((e, i) => (
                <div
                  className='mb-1 rounded border bg-white px-2 py-1 text-xs'
                  key={i}
                >
                  <div className='font-semibold text-slate-600'>
                    {highlightMatch(e.resultField, searchQuery)}
                  </div>
                  <div className='mt-0.5 font-mono break-all text-slate-500'>
                    {highlightMatch(e.expression, searchQuery)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tile.sql.length > 0 && (
            <div className='mt-2'>
              <div className='mb-1 text-xs font-semibold text-slate-500'>
                SQL
              </div>
              {tile.sql.map((s, i) => (
                <pre
                  className='mb-1 overflow-x-auto rounded border bg-white px-2 py-1 font-mono text-xs'
                  key={i}
                >
                  {highlightMatch(s.query, searchQuery)}
                </pre>
              ))}
            </div>
          )}

          {tile.columns.length > 0 && (
            <div className='mt-2'>
              <div className='mb-1 text-xs font-semibold text-slate-500'>
                Columns ({tile.columns.length})
              </div>
              <div className='rounded border bg-white px-2 py-1 text-xs text-slate-600'>
                {tile.columns
                  .map((c) => highlightMatch(c, searchQuery))
                  .reduce((acc, col, i) => {
                    if (i === 0) return [col];
                    return [...acc, ', ', col];
                  }, [])}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
