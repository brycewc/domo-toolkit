import { useState, useEffect, useMemo } from 'react';
import {
  IconX,
  IconSearch,
  IconExternalLink,
  IconLoader2,
  IconArrowsSplit,
  IconChevronDown,
  IconChevronRight,
  IconFilter,
  IconGitMerge,
  IconCalculator,
  IconCode,
  IconColumns3
} from '@tabler/icons-react';
import { parseDataflow, searchTiles } from '@/services';
import { executeInPage } from '@/utils';

async function getDataflow(dataflowId, tabId = null) {
  return await executeInPage(
    async (dataflowId) => {
      const response = await fetch(
        `/api/dataprocessing/v1/dataflows/${dataflowId}`,
        {
          method: 'GET',
          credentials: 'include'
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
  Filtering: IconFilter,
  Joining: IconGitMerge,
  Expressions: IconCalculator,
  Code: IconCode
};

const CATEGORY_COLORS = {
  'Data I/O': '#6366f1',
  'Transformation': '#8b5cf6',
  'Aggregation': '#ec4899',
  'Joining': '#f59e0b',
  'Filtering': '#10b981',
  'Normalization': '#06b6d4',
  'Expressions': '#f97316',
  'Code': '#64748b',
  'Advanced': '#84cc16'
};

function highlightMatch(text, query) {
  if (!query || !text) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 px-0.5 rounded">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function TileDetail({ tile, searchQuery, defaultOpen = false }) {
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
    <div className="border rounded-lg bg-white overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 transition-colors"
      >
        {open ? (
          <IconChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
        ) : (
          <IconChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        )}
        <Icon className="w-4 h-4 shrink-0" style={{ color: categoryColor }} />
        <span className="text-sm font-medium text-slate-700 truncate">
          {highlightMatch(tile.name, searchQuery)}
        </span>
        <span
          className="ml-auto text-xs px-2 py-0.5 rounded-full text-white shrink-0"
          style={{ backgroundColor: categoryColor }}
        >
          {tile.displayType}
        </span>
      </button>

      {open && hasContent && (
        <div className="px-3 pb-3 space-y-2 border-t bg-slate-50">
          {tile.filters.length > 0 && (
            <div className="mt-2">
              <div className="text-xs font-semibold text-slate-500 mb-1">
                Filters
              </div>
              {tile.filters.map((f, i) => (
                <div
                  key={i}
                  className="text-xs font-mono bg-white rounded px-2 py-1 mb-1 border"
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
            <div className="mt-2">
              <div className="text-xs font-semibold text-slate-500 mb-1">
                Join Keys
              </div>
              {tile.joins.map((j, i) => (
                <div
                  key={i}
                  className="text-xs font-mono bg-white rounded px-2 py-1 mb-1 border"
                >
                  {highlightMatch(j.leftKey, searchQuery)} ={' '}
                  {highlightMatch(j.rightKey, searchQuery)}
                  <span className="text-slate-400 ml-2">({j.joinType})</span>
                </div>
              ))}
            </div>
          )}

          {tile.expressions.length > 0 && (
            <div className="mt-2">
              <div className="text-xs font-semibold text-slate-500 mb-1">
                Expressions
              </div>
              {tile.expressions.map((e, i) => (
                <div
                  key={i}
                  className="text-xs bg-white rounded px-2 py-1 mb-1 border"
                >
                  <div className="font-semibold text-slate-600">
                    {highlightMatch(e.resultField, searchQuery)}
                  </div>
                  <div className="font-mono text-slate-500 mt-0.5 break-all">
                    {highlightMatch(e.expression, searchQuery)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tile.sql.length > 0 && (
            <div className="mt-2">
              <div className="text-xs font-semibold text-slate-500 mb-1">
                SQL
              </div>
              {tile.sql.map((s, i) => (
                <pre
                  key={i}
                  className="text-xs font-mono bg-white rounded px-2 py-1 mb-1 border overflow-x-auto"
                >
                  {highlightMatch(s.query, searchQuery)}
                </pre>
              ))}
            </div>
          )}

          {tile.columns.length > 0 && (
            <div className="mt-2">
              <div className="text-xs font-semibold text-slate-500 mb-1">
                Columns ({tile.columns.length})
              </div>
              <div className="text-xs text-slate-600 bg-white rounded px-2 py-1 border">
                {tile.columns.map((c) => highlightMatch(c, searchQuery)).reduce((acc, col, i) => {
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

/**
 * Right panel for inspecting ETL dataflow tiles
 * @param {Object} props
 * @param {string} props.dataflowId - Dataflow ID to inspect
 * @param {number} [props.tabId] - Chrome tab ID
 * @param {Function} props.onClose - Close handler
 */
export function ETLInspector({ dataflowId, tabId, onClose }) {
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
      <div className="h-full flex flex-col bg-white border-l">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="font-semibold text-slate-700">Loading ETL...</span>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded"
          >
            <IconX className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <IconLoader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      </div>
    );
  }

  if (error || !dataflow) {
    return (
      <div className="h-full flex flex-col bg-white border-l">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="font-semibold text-slate-700">ETL Inspector</span>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded"
          >
            <IconX className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center text-red-500">
          <p>{error || 'No data available'}</p>
        </div>
      </div>
    );
  }

  const instanceDomain = typeof window !== 'undefined' 
    ? window.location.hostname.replace('.domo.com', '') 
    : null;
  const domoUrl = instanceDomain
    ? `https://${instanceDomain}.domo.com/datacenter/dataflows/${dataflow.id}`
    : null;

  return (
    <div className="h-full flex flex-col bg-white border-l">
      <div className="px-4 py-3 border-b shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <IconArrowsSplit className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="font-semibold text-slate-700 truncate">
              {dataflow.name}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {domoUrl && (
              <a
                href={domoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 hover:bg-slate-100 rounded text-blue-500"
                title="Open in Domo"
              >
                <IconExternalLink className="w-4 h-4" />
              </a>
            )}
            <button
              onClick={onClose}
              className="p-1 hover:bg-slate-100 rounded"
            >
              <IconX className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>
        <div className="text-xs text-slate-400 mt-1">
          {dataflow.tiles.length} tiles &middot; ID: {dataflow.id}
        </div>
      </div>

      <div className="px-4 py-2 border-b shrink-0">
        <div className="relative">
          <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search tiles (column, expression, value...)"
            value={tileSearch}
            onChange={(e) => setTileSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
        {tileSearch && (
          <div className="text-xs text-slate-400 mt-1">
            {filteredTiles.length} of {dataflow.tiles.length} tiles match
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {Array.from(groupedTiles.entries()).map(([category, tiles]) => (
          <div key={category}>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              {category} ({tiles.length})
            </h3>
            <div className="space-y-1.5">
              {tiles.map((tile) => (
                <TileDetail
                  key={tile.id}
                  tile={tile}
                  searchQuery={tileSearch || undefined}
                  defaultOpen={!!tileSearch}
                />
              ))}
            </div>
          </div>
        ))}

        {filteredTiles.length === 0 && (
          <div className="text-center text-slate-400 py-8">
            <p>No tiles match "{tileSearch}"</p>
          </div>
        )}
      </div>
    </div>
  );
}
