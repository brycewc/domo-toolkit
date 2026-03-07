import {
  IconAlertCircle,
  IconLoader2,
  IconTable,
  IconX
} from '@tabler/icons-react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable
} from '@tanstack/react-table';
import { useEffect, useMemo, useState } from 'react';

import { executeInPage } from '@/utils';

const MAX_VISIBLE_ROWS = 100;

/**
 * Bottom panel showing dataset preview with TanStack Table
 * @param {Object} props
 * @param {string} props.datasetId - Dataset ID to preview
 * @param {string} props.datasetName - Dataset display name
 * @param {number} [props.tabId] - Chrome tab ID
 * @param {Function} props.onClose - Close handler
 */
export function DataPreviewPanel({ datasetId, datasetName, onClose, tabId }) {
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

  const displayHeaders = useMemo(() => {
    if (!preview) return [];
    return preview.headers;
  }, [preview]);

  const columns = useMemo(() => {
    return displayHeaders.map((header, idx) => ({
      accessorFn: (row) => row[idx],
      header: header,
      id: `col_${idx}`
    }));
  }, [displayHeaders]);

  const table = useReactTable({
    columns,
    data: preview?.rows ?? [],
    getCoreRowModel: getCoreRowModel()
  });

  const totalRows = preview?.rows.length ?? 0;
  const columnCount = displayHeaders.length;

  return (
    <div
      className='flex h-[300px] flex-col border-t bg-white'
      style={{ contain: 'strict' }}
    >
      <div className='flex shrink-0 items-center gap-2 border-b bg-slate-50 px-4 py-2'>
        <IconTable className='h-4 w-4 text-blue-500' />
        <span className='truncate text-sm font-semibold text-slate-700'>
          {datasetName}
        </span>
        {preview && (
          <span className='ml-2 text-xs text-slate-400'>
            {columnCount} columns &middot; {totalRows} rows (preview)
          </span>
        )}
        <button
          aria-label='Close preview'
          className='ml-auto rounded p-1 transition-colors hover:bg-slate-200'
          onClick={onClose}
        >
          <IconX className='h-4 w-4 text-slate-400' />
        </button>
      </div>

      {loading && (
        <div className='flex flex-1 items-center justify-center text-slate-400'>
          <IconLoader2 className='mr-2 h-6 w-6 animate-spin' />
          <span>Loading preview...</span>
        </div>
      )}

      {error && (
        <div className='flex flex-1 items-center justify-center text-red-500'>
          <IconAlertCircle className='mr-2 h-5 w-5' />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && preview && (
        <div className='flex-1 overflow-auto'>
          <table className='w-full border-collapse text-sm'>
            <thead className='sticky top-0 z-10 bg-slate-100'>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      className='border-r border-b px-3 py-2 text-left font-semibold text-slate-700 last:border-r-0'
                      key={header.id}
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
                <tr className='hover:bg-slate-50' key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td
                      className='border-r border-b px-3 py-1.5 text-slate-600 last:border-r-0'
                      key={cell.id}
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
        <div className='flex flex-1 items-center justify-center text-slate-400'>
          <p>No data available</p>
        </div>
      )}
    </div>
  );
}

async function getDataPreview(datasetId, tabId = null) {
  return await executeInPage(
    async (datasetId, limit) => {
      const response = await fetch(`/api/query/v1/execute/${datasetId}`, {
        body: JSON.stringify({ sql: `SELECT * FROM table LIMIT ${limit}` }),
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch preview: HTTP ${response.status}`);
      }

      const data = await response.json();
      const headers = data.columns || [];
      const rows = data.rows || [];

      return { headers, rows };
    },
    [datasetId, MAX_VISIBLE_ROWS],
    tabId
  );
}
