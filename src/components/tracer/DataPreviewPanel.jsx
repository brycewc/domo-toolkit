import { CloseButton, Spinner, Table } from '@heroui/react';
import { IconAlertCircle, IconTable } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getDatasetPreview } from '@/services';

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
      className='flex shrink-0 flex-col border-t border-divider bg-background'
      ref={panelRef}
      style={{ height: heightValue.current }}
    >
      {/* Resize handle */}
      <div
        className='flex h-1.5 shrink-0 cursor-ns-resize items-center justify-center hover:bg-content2'
        onPointerDown={handlePointerDown}
      >
        <div className='h-0.5 w-8 rounded-full bg-divider' />
      </div>

      <div className='flex shrink-0 items-center gap-2 border-b border-divider bg-content2 px-4 py-2'>
        <IconTable className='size-4 text-accent' />
        <span className='truncate text-sm font-semibold'>
          {datasetName}
        </span>
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
        <div className='min-h-0 flex-1 overflow-auto [&_.table__cell]:px-2 [&_.table__cell]:py-1 [&_.table__column]:px-2 [&_.table__column]:py-1.5'>
          <Table variant='secondary'>
            <Table.ScrollContainer>
              <Table.Content aria-label={`Preview of ${datasetName}`}>
                <Table.Header className='sticky top-0 z-10'>
                  <Table.Column
                    className='w-12 bg-content2'
                    id='row_num'
                  >
                    #
                  </Table.Column>
                  {headers.map((header, idx) => (
                    <Table.Column
                      id={`col_${idx}`}
                      isRowHeader={idx === 0}
                      key={idx}
                    >
                      {header}
                    </Table.Column>
                  ))}
                </Table.Header>
                <Table.Body>
                  {rows.map((row, rowIdx) => (
                    <Table.Row id={rowIdx} key={rowIdx}>
                      <Table.Cell className='bg-content2 text-xs text-muted'>
                        {rowIdx + 1}
                      </Table.Cell>
                      {headers.map((_, colIdx) => (
                        <Table.Cell key={colIdx}>
                          {row[colIdx] == null ||
                          row[colIdx] === '' ||
                          row[colIdx] === 'null' ? (
                            <span className='text-muted italic'>null</span>
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
        <div className='flex flex-1 items-center justify-center text-muted'>
          <p>No data available</p>
        </div>
      )}
    </div>
  );
}
