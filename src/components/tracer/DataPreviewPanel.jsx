import { CloseButton, Spinner } from '@heroui/react';
import { IconAlertCircle, IconTable } from '@tabler/icons-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getDatasetPreview } from '@/services';

const DEFAULT_HEIGHT = 300;
const MIN_HEIGHT = 120;
const MAX_HEIGHT_RATIO = 0.7;
const ROW_HEIGHT = 28;

const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

/**
 * Bottom panel showing dataset preview with virtualized rows.
 * Supports vertical resizing via a drag handle at the top edge.
 * Height is managed locally to avoid re-rendering the parent tree.
 *
 * @param {Object} props
 * @param {React.RefObject<Map>} [props.cacheRef] - Shared cache for preview data across sessions
 * @param {string} props.datasetId - Dataset ID to preview
 * @param {string} props.datasetName - Dataset display name
 * @param {React.RefObject<number>} [props.heightRef] - Ref for persisting height across previews
 * @param {Function} [props.resolveTabId] - Async function that resolves a valid tab ID
 * @param {Function} props.onClose - Close handler
 */
export function DataPreviewPanel({
  cacheRef,
  datasetId,
  datasetName,
  heightRef,
  onClose,
  resolveTabId
}) {
  const cached = cacheRef?.current?.get(datasetId);
  const [preview, setPreview] = useState(cached ?? null);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState(null);
  const panelRef = useRef(null);
  const dragRef = useRef(null);
  const heightValue = useRef(heightRef?.current ?? DEFAULT_HEIGHT);

  useEffect(() => {
    if (cached) return;

    let cancelled = false;

    async function fetchData() {
      try {
        const tabId = await resolveTabId?.();
        const data = await getDatasetPreview(datasetId, tabId);
        if (!cancelled) {
          cacheRef?.current?.set(datasetId, data);
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
  }, [cacheRef, datasetId, resolveTabId]);

  useEffect(() => {
    return () => {
      if (dragRef.current?.cleanup) dragRef.current.cleanup();
    };
  }, []);

  const handlePointerDown = useCallback(
    (e) => {
      e.preventDefault();
      const startY = e.clientY;
      const startHeight = panelRef.current.getBoundingClientRect().height;
      const maxH = window.innerHeight * MAX_HEIGHT_RATIO;

      const onMove = (ev) => {
        const delta = startY - ev.clientY;
        const next = Math.round(
          Math.max(MIN_HEIGHT, Math.min(maxH, startHeight + delta))
        );
        if (panelRef.current) {
          panelRef.current.style.height = `${next}px`;
        }
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        document.body.style.cursor = '';
        dragRef.current = null;
        if (panelRef.current) {
          const h =
            parseInt(panelRef.current.style.height, 10) || DEFAULT_HEIGHT;
          heightValue.current = h;
          if (heightRef) heightRef.current = h;
        }
      };

      document.body.style.cursor = 'ns-resize';
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      dragRef.current = { cleanup: onUp };
    },
    [heightRef]
  );

  const headers = useMemo(() => preview?.headers ?? [], [preview]);
  const rows = useMemo(() => preview?.rows ?? [], [preview]);

  return (
    <div
      className='border-divider flex shrink-0 flex-col border-t bg-background'
      ref={panelRef}
      style={{ height: heightValue.current }}
    >
      {/* Resize handle */}
      <div
        className='hover:bg-content2 flex h-1.5 shrink-0 cursor-ns-resize items-center justify-center'
        onPointerDown={handlePointerDown}
      >
        <div className='bg-divider h-0.5 w-8 rounded-full' />
      </div>

      <div className='border-divider bg-content2 flex shrink-0 items-center gap-2 border-b px-4 py-2'>
        <IconTable className='size-4 text-accent' />
        <span className='truncate text-sm font-semibold'>{datasetName}</span>
        {preview && (
          <span className='ml-2 text-xs text-muted'>
            {headers.length} columns &middot; {rows.length} rows (preview)
          </span>
        )}
        <CloseButton className='ml-auto' size='sm' onPress={onClose} />
      </div>

      {loading && (
        <div className='flex flex-1 items-center justify-center gap-2 text-muted'>
          <Spinner size='sm' />
          <span>Loading preview...</span>
        </div>
      )}

      {error && (
        <div className='flex flex-1 items-center justify-center text-danger'>
          <IconAlertCircle className='mr-2 size-5' />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <VirtualTable datasetName={datasetName} headers={headers} rows={rows} />
      )}

      {!loading && !error && rows.length === 0 && (
        <div className='flex flex-1 items-center justify-center text-muted'>
          <p>No data available</p>
        </div>
      )}
    </div>
  );
}

function formatCellValue(value) {
  if (typeof value === 'string' && ISO_DATETIME_RE.test(value)) {
    const date = new Date(value + 'Z');
    if (!isNaN(date)) {
      const datePart = date.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
      const timePart = date.toLocaleTimeString(undefined, {
        hour: 'numeric',
        hour12: true,
        minute: '2-digit',
        second: '2-digit'
      });
      return `${datePart} ${timePart}`;
    }
  }
  return String(value);
}

function VirtualTable({ datasetName, headers, rows }) {
  const scrollRef = useRef(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => ROW_HEIGHT,
    getScrollElement: () => scrollRef.current,
    overscan: 10
  });

  const virtualItems = virtualizer.getVirtualItems();
  const colCount = headers.length + 1;
  const topPad = virtualItems[0]?.start ?? 0;
  const bottomPad =
    virtualItems.length > 0
      ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
      : 0;

  return (
    <div className='min-h-0 flex-1 overflow-auto' ref={scrollRef}>
      <table
        aria-label={`Preview of ${datasetName}`}
        className='min-w-full border-separate border-spacing-0 text-xs'
      >
        <thead className='sticky top-0 z-10'>
          <tr>
            <th className='bg-neutral-200 px-2 py-1.5 text-left font-semibold whitespace-nowrap'>
              #
            </th>
            {headers.map((header, idx) => (
              <th
                className='bg-neutral-200 px-2 py-1.5 text-left font-semibold whitespace-nowrap'
                key={idx}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {topPad > 0 && (
            <tr>
              <td colSpan={colCount} style={{ height: topPad, padding: 0 }} />
            </tr>
          )}
          {virtualItems.map((virtualRow) => {
            const row = rows[virtualRow.index];
            return (
              <tr
                className='border-divider border-b'
                key={virtualRow.index}
                style={{ height: ROW_HEIGHT }}
              >
                <td className='bg-neutral-200 px-2 py-1 text-muted'>
                  {virtualRow.index + 1}
                </td>
                {headers.map((_, colIdx) => (
                  <td className='px-2 py-1 whitespace-nowrap' key={colIdx}>
                    {row[colIdx] == null ||
                    row[colIdx] === '' ||
                    row[colIdx] === 'null' ? (
                      <span className='text-muted italic'>null</span>
                    ) : (
                      formatCellValue(row[colIdx])
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
          {bottomPad > 0 && (
            <tr>
              <td
                colSpan={colCount}
                style={{ height: bottomPad, padding: 0 }}
              />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
