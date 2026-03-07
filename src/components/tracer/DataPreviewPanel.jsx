import { useState, useEffect, useMemo } from 'react';
import {
  IconTable,
  IconX,
  IconLoader2,
  IconAlertCircle
} from '@tabler/icons-react';
import { executeInPage } from '@/utils';
import {
  useReactTable,
  getCoreRowModel,
  flexRender
} from '@tanstack/react-table';

const MAX_VISIBLE_ROWS = 100;

async function getDataPreview(datasetId, tabId = null) {
  return await executeInPage(
    async (datasetId) => {
      const response = await fetch(
        `/api/data/v3/datasources/${datasetId}/data?limit=100`,
        {
          method: 'GET',
          credentials: 'include'
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch preview: HTTP ${response.status}`);
      }

      const data = await response.json();
      
      const headers = data.columns?.map((col) => col.name) || [];
      const rows = data.rows || [];

      return { headers, rows };
    },
    [datasetId],
    tabId
  );
}

/**
 * Bottom panel showing dataset preview with TanStack Table
 * @param {Object} props
 * @param {string} props.datasetId - Dataset ID to preview
 * @param {string} props.datasetName - Dataset display name
 * @param {number} [props.tabId] - Chrome tab ID
 * @param {Function} props.onClose - Close handler
 */
export function DataPreviewPanel({
  datasetId,
  datasetName,
  tabId,
  onClose
}) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const data = await getDataPreview(datasetId, tabId);
        if (!cancelled) {
          setPreview(data);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[DataPreviewPanel] Failed to fetch preview:', err);
          setError(err.message || 'Failed to load preview');
          setLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [datasetId, tabId]);

  const visibleRows = useMemo(() => {
    if (!preview) return [];
    return preview.rows.slice(0, MAX_VISIBLE_ROWS);
  }, [preview]);

  const displayHeaders = useMemo(() => {
    if (!preview) return [];
    if (preview.headers.length > 0) return preview.headers;
    const colCount = preview.rows[0]?.length ?? 0;
    return Array.from({ length: colCount }, (_, i) => `Column ${i + 1}`);
  }, [preview]);

  const columns = useMemo(() => {
    return displayHeaders.map((header, idx) => ({
      id: `col_${idx}`,
      header: header,
      accessorFn: (row) => row[idx]
    }));
  }, [displayHeaders]);

  const table = useReactTable({
    data: visibleRows,
    columns,
    getCoreRowModel: getCoreRowModel()
  });

  const totalRows = preview?.rows.length ?? 0;
  const columnCount = displayHeaders.length;

  return (
    <div
      className="h-[300px] border-t bg-white flex flex-col"
      style={{ contain: 'strict' }}
    >
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-slate-50 shrink-0">
        <IconTable className="w-4 h-4 text-blue-500" />
        <span className="font-semibold text-sm text-slate-700 truncate">
          {datasetName}
        </span>
        {preview && (
          <span className="text-xs text-slate-400 ml-2">
            {columnCount} columns &middot; {totalRows} rows (preview)
          </span>
        )}
        <button
          onClick={onClose}
          className="ml-auto p-1 rounded hover:bg-slate-200 transition-colors"
          aria-label="Close preview"
        >
          <IconX className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {loading && (
        <div className="flex-1 flex items-center justify-center text-slate-400">
          <IconLoader2 className="w-6 h-6 animate-spin mr-2" />
          <span>Loading preview...</span>
        </div>
      )}

      {error && (
        <div className="flex-1 flex items-center justify-center text-red-500">
          <IconAlertCircle className="w-5 h-5 mr-2" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && preview && (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-slate-100 sticky top-0 z-10">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-3 py-2 text-left font-semibold text-slate-700 border-b border-r last:border-r-0"
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="px-3 py-1.5 border-b border-r last:border-r-0 text-slate-600"
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && (!preview || totalRows === 0) && (
        <div className="flex-1 flex items-center justify-center text-slate-400">
          <p>No data available</p>
        </div>
      )}
    </div>
  );
}
