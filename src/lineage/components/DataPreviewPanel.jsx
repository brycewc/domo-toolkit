import { CloseButton, Spinner, Surface, Table, TableLayout, Virtualizer } from '@heroui/react';
import { IconAlertCircle, IconTable } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getDatasetPreview } from '@/services';

const DEFAULT_HEIGHT = 300;
const MIN_HEIGHT = 120;
const MAX_HEIGHT_RATIO = 0.7;
const ROW_HEIGHT = 32;

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
        const next = Math.round(Math.max(MIN_HEIGHT, Math.min(maxH, startHeight + delta)));
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
          const h = parseInt(panelRef.current.style.height, 10) || DEFAULT_HEIGHT;
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
    <Surface
      className='border-divider flex w-full shrink-0 flex-col border-t'
      ref={panelRef}
      style={{ height: heightValue.current }}
      variant='default'
    >
      {/* Resize handle */}
      <div
        className='flex h-1.5 shrink-0 cursor-ns-resize items-center justify-center'
        onPointerDown={handlePointerDown}
      >
        <div className='h-0.5 w-8 rounded-full bg-surface' />
      </div>

      <div className='flex h-8 shrink-0 items-center gap-2 px-4 pt-0.5 pb-2'>
        <IconTable size={14} />
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
          <IconAlertCircle size={16} stroke={1.5} />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className='min-h-0 min-w-0 flex-1'>
          <VirtualTable datasetName={datasetName} headers={headers} rows={rows} />
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className='flex flex-1 items-center justify-center text-muted'>
          <p>No data available</p>
        </div>
      )}
    </Surface>
  );
}

function displayLength(value) {
  if (value == null) return 4; // "null"
  if (value === '') return 12; // "empty string"
  return formatCellValue(value).length;
}

function estimateColumnWidths(headers, rows) {
  const charWidth = 7;
  const padding = 10;
  const minWidth = 60;
  const maxWidth = 350;

  return headers.map((header, i) => {
    let longest = header.length;
    for (const row of rows) {
      const val = row[i];
      const len = displayLength(val);
      if (len > longest) longest = len;
    }
    return Math.max(minWidth, Math.min(maxWidth, longest * charWidth + padding));
  });
}

function formatCell(value) {
  if (value == null) {
    return <span className='text-muted italic'>null</span>;
  }
  if (value === '') {
    return <span className='text-muted italic'>empty string</span>;
  }
  return formatCellValue(value);
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
  const columnWidths = useMemo(() => estimateColumnWidths(headers, rows), [headers, rows]);
  const columns = useMemo(
    () =>
      headers.map((header, i) => ({
        id: `col-${i}`,
        index: i,
        name: header,
        width: columnWidths[i]
      })),
    [headers, columnWidths]
  );
  const items = useMemo(() => rows.map((row, i) => ({ id: i, row })), [rows]);
  const totalWidth = 30 + columnWidths.reduce((sum, w) => sum + w, 0);

  return (
    <Virtualizer
      layout={TableLayout}
      layoutOptions={{
        headingHeight: ROW_HEIGHT,
        rowHeight: ROW_HEIGHT
      }}
    >
      <Table className='h-full w-full'>
        <Table.ScrollContainer className='h-full w-full overflow-auto overscroll-contain'>
          <Table.Content aria-label={`Preview of ${datasetName}`} style={{ minWidth: totalWidth }}>
            <Table.Header className='h-full w-full bg-surface-secondary'>
              <Table.Column
                className='border-divider flex h-full items-center justify-end border-b p-1'
                id='rowNum'
                maxWidth={30}
                minWidth={30}
                width={30}
              >
                #
              </Table.Column>
              <Table.Collection items={columns}>
                {(column) => (
                  <Table.Column
                    className='border-divider flex h-full items-center truncate border-b border-l p-1 text-foreground'
                    id={column.id}
                    minWidth={column.width}
                    title={column.name}
                    width={column.width}
                  >
                    {column.name}
                  </Table.Column>
                )}
              </Table.Collection>
            </Table.Header>
            <Table.Body items={items}>
              {(item) => (
                <Table.Row>
                  <Table.Cell className='border-divider flex h-full items-center justify-end border-b bg-surface-secondary p-1 font-mono text-xs text-muted'>
                    {item.id + 1}
                  </Table.Cell>
                  <Table.Collection items={columns}>
                    {(column) => (
                      <Table.Cell className='border-divider flex h-full items-center border-b border-l p-1'>
                        <span
                          className='truncate font-mono text-xs'
                          title={String(item.row[column.index] ?? 'null')}
                        >
                          {formatCell(item.row[column.index])}
                        </span>
                      </Table.Cell>
                    )}
                  </Table.Collection>
                </Table.Row>
              )}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
    </Virtualizer>
  );
}
