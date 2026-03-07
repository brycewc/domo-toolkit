import { CloseButton, Spinner, Table } from '@heroui/react';
import { IconAlertCircle, IconTable } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { executeInPage } from '@/utils';

const MAX_VISIBLE_ROWS = 100;
const DEFAULT_HEIGHT = 300;
const MIN_HEIGHT = 120;
const MAX_HEIGHT_RATIO = 0.7;

/**
 * Bottom panel showing dataset preview with HeroUI Table.
 * Supports vertical resizing via a drag handle at the top edge.
 * Height is managed locally to avoid re-rendering the parent tree.
 *
 * @param {Object} props
 * @param {React.RefObject<Map>} [props.cacheRef] - Shared cache for preview data across sessions
 * @param {string} props.datasetId - Dataset ID to preview
 * @param {string} props.datasetName - Dataset display name
 * @param {React.RefObject<number>} [props.heightRef] - Ref for persisting height across previews
 * @param {number} [props.tabId] - Chrome tab ID
 * @param {Function} props.onClose - Close handler
 */
export function DataPreviewPanel({
  cacheRef,
  datasetId,
  datasetName,
  heightRef,
  onClose,
  tabId
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
        const data = await getDataPreview(datasetId, tabId);
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
  }, [cacheRef, datasetId, tabId]);

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
    <div
      ref={panelRef}
      className='flex shrink-0 flex-col border-t bg-white'
      style={{ height: heightValue.current }}
    >
      {/* Resize handle */}
      <div
        className='flex h-1.5 shrink-0 cursor-ns-resize items-center justify-center hover:bg-slate-200'
        onPointerDown={handlePointerDown}
      >
        <div className='h-0.5 w-8 rounded-full bg-slate-300' />
      </div>

      <div className='flex shrink-0 items-center gap-2 border-b bg-slate-50 px-4 py-2'>
        <IconTable className='h-4 w-4 text-blue-500' />
        <span className='truncate text-sm font-semibold text-slate-700'>
          {datasetName}
        </span>
        {preview && (
          <span className='ml-2 text-xs text-slate-400'>
            {headers.length} columns &middot; {rows.length} rows (preview)
          </span>
        )}
        <CloseButton className='ml-auto' size='sm' onPress={onClose} />
      </div>

      {loading && (
        <div className='flex flex-1 items-center justify-center gap-2 text-slate-400'>
          <Spinner size='sm' />
          <span>Loading preview...</span>
        </div>
      )}

      {error && (
        <div className='flex flex-1 items-center justify-center text-red-500'>
          <IconAlertCircle className='mr-2 h-5 w-5' />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className='min-h-0 flex-1 overflow-auto [&_.table__cell]:px-2 [&_.table__cell]:py-1 [&_.table__column]:px-2 [&_.table__column]:py-1.5'>
          <Table variant='secondary'>
            <Table.ScrollContainer>
              <Table.Content aria-label={`Preview of ${datasetName}`}>
                <Table.Header className='sticky top-0 z-10'>
                  <Table.Column className='bg-slate-50' id='row_num' style={{ width: 48 }}>#</Table.Column>
                  {headers.map((header, idx) => (
                    <Table.Column id={`col_${idx}`} isRowHeader={idx === 0} key={idx}>
                      {header}
                    </Table.Column>
                  ))}
                </Table.Header>
                <Table.Body>
                  {rows.map((row, rowIdx) => (
                    <Table.Row id={rowIdx} key={rowIdx}>
                      <Table.Cell className='bg-slate-50 text-xs text-slate-400'>
                        {rowIdx + 1}
                      </Table.Cell>
                      {headers.map((_, colIdx) => (
                        <Table.Cell key={colIdx}>
                          {row[colIdx] == null || row[colIdx] === '' || row[colIdx] === 'null' ? (
                            <span className='text-slate-400 italic'>null</span>
                          ) : (
                            String(row[colIdx])
                          )}
                        </Table.Cell>
                      ))}
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
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
