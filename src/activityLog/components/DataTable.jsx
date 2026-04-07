import {
  Button,
  Card,
  Chip,
  Dropdown,
  Label,
  Spinner,
  Table,
  Tooltip
} from '@heroui/react';
import {
  IconChevronDown,
  IconColumns,
  IconDownload,
  IconFileTypeCsv,
  IconFileTypeXls,
  IconPlus,
  IconRefresh
} from '@tabler/icons-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AnimatePresence } from 'motion/react';
import { useMemo, useRef, useState } from 'react';

import { AnimatedCheck } from '@/components/AnimatedCheck';
import { exportToCSV, exportToExcel, generateExportFilename } from '@/utils';

/**
 * DataTable Component
 * A feature-rich table using HeroUI v3 Table with @tanstack/react-virtual
 *
 * Column definition format:
 *   {
 *     id: string,                      // unique key, also used as default data accessor
 *     header: string,                  // column header label
 *     cell: (row) => ReactNode,        // render function receiving the row data object
 *     accessor: (row) => any,          // optional: custom value accessor for sorting
 *     allowsSorting: boolean,          // optional: whether sortable (default false)
 *     canHide: boolean,               // optional: appears in visibility toggle (default true)
 *     width: number|string,           // optional: CSS width
 *     minWidth: number|string,        // optional: CSS min-width
 *     maxWidth: number|string,        // optional: CSS max-width
 *   }
 *
 * @param {Object} props
 * @param {Array} props.columns - Column definitions
 * @param {Array} props.data - Row data array
 * @param {String} props.entityName - Name of entity (e.g., "events")
 * @param {Object} props.initialColumnVisibility - { columnId: boolean } map
 * @param {Object} props.initialSorting - { column: string, direction: 'ascending'|'descending' }
 * @param {React.ReactNode} props.customFilters - Custom filter components
 * @param {Object} props.exportConfig - Export configuration
 * @param {Function} props.onRefresh - Refresh callback
 * @param {Boolean} props.isRefreshing - Whether refreshing
 * @param {Function} props.onLoadMore - Infinite scroll callback
 * @param {Boolean} props.hasMore - Whether more data is available
 * @param {React.ReactNode} props.header - Header content rendered above filters
 * @param {Function} props.onAdd - Add new callback
 */
export function DataTable({
  columns = [],
  customFilters = null,
  data = [],
  entityName = 'items',
  exportConfig = null,
  hasMore = false,
  header = null,
  initialColumnVisibility = {},
  initialSorting = null,
  isRefreshing = false,
  onAdd,
  onLoadMore,
  onRefresh = null
}) {
  const [sortDescriptor, setSortDescriptor] = useState(initialSorting);
  const [hiddenColumns, setHiddenColumns] = useState(
    () =>
      new Set(
        Object.entries(initialColumnVisibility)
          .filter(([, visible]) => !visible)
          .map(([id]) => id)
      )
  );
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const isLoadingMoreRef = useRef(false);

  const tableContainerRef = useRef(null);

  const visibleColumns = useMemo(
    () => columns.filter((c) => !hiddenColumns.has(c.id)),
    [columns, hiddenColumns]
  );

  const toggleableColumns = useMemo(
    () => columns.filter((c) => c.canHide !== false),
    [columns]
  );

  const sortedData = useMemo(() => {
    if (!sortDescriptor?.column) return data;
    const col = columns.find((c) => c.id === sortDescriptor.column);
    if (!col) return data;
    const accessor = col.accessor || ((row) => row[col.id]);
    return [...data].sort((a, b) => {
      const aVal = accessor(a);
      const bVal = accessor(b);
      let cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDescriptor.direction === 'descending' ? -cmp : cmp;
    });
  }, [data, sortDescriptor, columns]);

  const rowVirtualizer = useVirtualizer({
    count: sortedData.length,
    estimateSize: () => 53,
    getScrollElement: () => tableContainerRef?.current,
    measureElement: (element) => element?.getBoundingClientRect().height,
    overscan: 10
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  const handleLoadMore = () => {
    if (isLoadingMoreRef.current || !onLoadMore) return;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    Promise.resolve(onLoadMore()).finally(() => {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    });
  };

  const handleExport = async (format) => {
    if (!exportConfig?.enabled) return;

    setIsExporting(true);
    try {
      let exportData;
      if (exportConfig.onFetchAllData) {
        exportData = await exportConfig.onFetchAllData();
      } else {
        exportData = sortedData;
      }

      const filename =
        exportConfig.filename || generateExportFilename(entityName);

      if (format === 'csv') {
        exportToCSV(exportData, visibleColumns, filename);
      } else if (format === 'xlsx') {
        await exportToExcel(exportData, visibleColumns, filename);
      }
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Card className='flex min-h-0 w-full flex-1 flex-col'>
      <Card.Header>
        <div className='px-1 py-2'>{header}</div>
        <div className='items-between flex w-full flex-col justify-center gap-1 sm:flex-row sm:items-center sm:justify-between'>
          <div className='flex w-full items-center gap-1 sm:justify-between'>
            <div className='flex flex-1 flex-row flex-wrap justify-start gap-1'>
              {customFilters}
            </div>
          </div>
          <div className='flex flex-row items-center justify-end gap-1'>
            {/* Column Visibility Dropdown */}
            <Dropdown>
              <Button variant='tertiary'>
                <IconColumns stroke={1.5} />
                Columns
                <Chip color='accent' size='sm' variant='soft'>
                  {
                    toggleableColumns.filter((c) => !hiddenColumns.has(c.id))
                      .length
                  }
                  /{toggleableColumns.length}
                </Chip>
              </Button>
              <Dropdown.Popover>
                <Dropdown.Menu
                  selectionMode='multiple'
                  onSelectionChange={(keys) => {
                    setHiddenColumns(
                      new Set(
                        toggleableColumns
                          .filter((c) => !keys.has(c.id))
                          .map((c) => c.id)
                      )
                    );
                  }}
                  selectedKeys={
                    new Set(
                      toggleableColumns
                        .filter((c) => !hiddenColumns.has(c.id))
                        .map((c) => c.id)
                    )
                  }
                >
                  {toggleableColumns.map((col) => (
                    <Dropdown.Item
                      id={col.id}
                      key={col.id}
                      textValue={col.header}
                    >
                      <Dropdown.ItemIndicator>
                        {({ isSelected }) => (
                          <AnimatePresence>
                            {isSelected && (
                              <AnimatedCheck
                                className='text-muted'
                                stroke={1.5}
                              />
                            )}
                          </AnimatePresence>
                        )}
                      </Dropdown.ItemIndicator>
                      <Label>{col.header}</Label>
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>

            {/* Export Dropdown */}
            {exportConfig?.enabled && (
              <Tooltip closeDelay={0} delay={400}>
                <Dropdown>
                  <Button
                    isIconOnly
                    isDisabled={isExporting || data.length === 0}
                    isPending={isExporting}
                    variant='tertiary'
                  >
                    {({ isPending }) =>
                      isPending ? (
                        <Spinner color='currentColor' size='sm' />
                      ) : (
                        <IconDownload stroke={1.5} />
                      )
                    }
                  </Button>
                  <Dropdown.Popover>
                    <Dropdown.Menu onAction={(key) => handleExport(key)}>
                      <Dropdown.Item id='csv' textValue='Export as CSV'>
                        <IconFileTypeCsv stroke={1.5} />
                        <Label>Export as CSV</Label>
                      </Dropdown.Item>
                      <Dropdown.Item id='xlsx' textValue='Export as Excel'>
                        <IconFileTypeXls stroke={1.5} />
                        <Label>Export as Excel</Label>
                      </Dropdown.Item>
                    </Dropdown.Menu>
                  </Dropdown.Popover>
                </Dropdown>
                <Tooltip.Content>Export</Tooltip.Content>
              </Tooltip>
            )}

            {/* Refresh Button */}
            {onRefresh && (
              <Tooltip closeDelay={0} delay={400}>
                <Button
                  isIconOnly
                  isDisabled={isRefreshing}
                  isPending={isRefreshing}
                  variant='tertiary'
                  onPress={onRefresh}
                >
                  {({ isPending }) =>
                    isPending ? (
                      <Spinner color='currentColor' size='sm' />
                    ) : (
                      <IconRefresh stroke={1.5} />
                    )
                  }
                </Button>
                <Tooltip.Content>Refresh</Tooltip.Content>
              </Tooltip>
            )}
          </div>

          {onAdd && (
            <div className='flex items-center gap-1'>
              <Button onPress={onAdd}>
                <IconPlus stroke={1.5} />
                Add New
              </Button>
            </div>
          )}
        </div>
      </Card.Header>

      <Card.Content className='h-0 min-h-0 flex-1 overflow-hidden rounded-lg'>
        <Table className='h-full' variant='secondary'>
          <Table.ScrollContainer
            className='h-full overflow-auto overscroll-y-contain'
            ref={tableContainerRef}
          >
            <Table.Content
              aria-label={entityName}
              sortDescriptor={sortDescriptor}
              onSortChange={setSortDescriptor}
            >
              <Table.Header className='sticky top-0 z-10'>
                {visibleColumns.map((col, index) => (
                  <Table.Column
                    allowsSorting={!!col.allowsSorting}
                    id={col.id}
                    isRowHeader={index === 0}
                    key={col.id}
                    style={{
                      maxWidth: col.maxWidth,
                      minWidth: col.minWidth,
                      width: col.width
                    }}
                  >
                    {col.allowsSorting
                      ? ({ sortDirection }) => (
                          <SortableHeader sortDirection={sortDirection}>
                            {col.header}
                          </SortableHeader>
                        )
                      : col.header}
                  </Table.Column>
                ))}
              </Table.Header>
              <Table.Body
                renderEmptyState={() => (
                  <p className='py-8 text-center text-sm text-muted'>
                    No results found
                  </p>
                )}
              >
                {virtualItems.length > 0 && (
                  <Table.Row
                    id='spacer-top'
                    key='spacer-top'
                    style={{ height: virtualItems[0].start }}
                  >
                    <Table.Cell
                      className='p-0'
                      colSpan={visibleColumns.length}
                    />
                  </Table.Row>
                )}
                {virtualItems.map((virtualRow) => {
                  const row = sortedData[virtualRow.index];
                  return (
                    <Table.Row
                      data-index={virtualRow.index}
                      id={virtualRow.index}
                      key={virtualRow.index}
                      ref={(node) => rowVirtualizer.measureElement(node)}
                    >
                      {visibleColumns.map((col) => (
                        <Table.Cell
                          key={col.id}
                          style={{
                            maxWidth: col.maxWidth,
                            minWidth: col.minWidth,
                            width: col.width
                          }}
                        >
                          {col.cell(row)}
                        </Table.Cell>
                      ))}
                    </Table.Row>
                  );
                })}
                {virtualItems.length > 0 && (
                  <Table.Row
                    id='spacer-bottom'
                    key='spacer-bottom'
                    style={{
                      height:
                        totalSize - virtualItems[virtualItems.length - 1].end
                    }}
                  >
                    <Table.Cell
                      className='p-0'
                      colSpan={visibleColumns.length}
                    />
                  </Table.Row>
                )}
                {onLoadMore && hasMore && (
                  <Table.LoadMore
                    isLoading={isLoadingMore}
                    onLoadMore={handleLoadMore}
                  >
                    <Table.LoadMoreContent>
                      <Spinner size='sm' />
                    </Table.LoadMoreContent>
                  </Table.LoadMore>
                )}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      </Card.Content>
    </Card>
  );
}

function SortableHeader({ children, sortDirection }) {
  return (
    <span className='flex items-center justify-between'>
      {children}
      {sortDirection && (
        <IconChevronDown
          stroke={1.5}
          className={`size-3 transition-transform duration-100 ${
            sortDirection === 'ascending' ? 'rotate-180' : ''
          }`}
        />
      )}
    </span>
  );
}
