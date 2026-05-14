import {
  Button,
  Chip,
  Dropdown,
  Label,
  Spinner,
  Table,
  TableLayout,
  Tooltip,
  Virtualizer
} from '@heroui/react';
import { AnimatePresence } from 'motion/react';
import { useMemo, useState } from 'react';

import { AnimatedCheck } from '@/components/AnimatedCheck';
import { exportToCSV, exportToExcel, generateExportFilename } from '@/utils/exportData';
import IconAddColumn from '@icons/add-column.svg?react';
import IconChevronDown from '@icons/chevron-down.svg?react';
import IconCsv from '@icons/csv.svg?react';
import IconDownload from '@icons/download.svg?react';
import IconExcel from '@icons/excel.svg?react';
import IconPlus from '@icons/plus.svg?react';
import IconSync from '@icons/sync.svg?react';

const ROW_HEIGHT = 53;
const HEADING_HEIGHT = 40;

/**
 * DataTable Component
 * A feature-rich table using HeroUI v3 Table with its built-in Virtualizer + TableLayout.
 *
 * Column definition format:
 *   {
 *     id: string,                      // unique key, also used as default data accessor
 *     header: string,                  // column header label
 *     cell: (row) => ReactNode,        // render function receiving the row data object
 *     accessor: (row) => any,          // optional: custom value accessor for sorting
 *     allowsSorting: boolean,          // optional: whether sortable (default false)
 *     manualSort: boolean,             // optional: when true and this column is the active
 *                                      //   sort, skip local sort (parent has sorted upstream)
 *     canHide: boolean,               // optional: appears in visibility toggle (default true)
 *     width: number|string,           // optional: CSS width
 *     minWidth: number|string,        // optional: CSS min-width
 *     maxWidth: number|string,        // optional: CSS max-width
 *   }
 *
 * Row height is fixed at ROW_HEIGHT — cell content that overflows should be truncated
 * and exposed via the title attribute rather than wrapped.
 *
 * Sort state can be controlled (parent passes `sortDescriptor` + `onSortChange`) or
 * uncontrolled (DataTable owns the state, seeded by `initialSorting`).
 *
 * @param {Object} props
 * @param {Array} props.columns - Column definitions
 * @param {Array} props.data - Row data array
 * @param {Function} props.getRowId - Optional: (row, index) => stable row id
 * @param {String} props.entityName - Name of entity (e.g., "events")
 * @param {Object} props.initialColumnVisibility - { columnId: boolean } map
 * @param {Object} props.initialSorting - { column: string, direction: 'ascending'|'descending' } (uncontrolled mode)
 * @param {Object} props.sortDescriptor - Controlled sort state (pair with onSortChange)
 * @param {Function} props.onSortChange - Controlled sort change handler
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
  getRowId,
  hasMore = false,
  header = null,
  initialColumnVisibility = {},
  initialSorting = null,
  isRefreshing = false,
  onAdd,
  onLoadMore,
  onRefresh = null,
  onSortChange,
  sortDescriptor: controlledSortDescriptor
}) {
  const [uncontrolledSortDescriptor, setUncontrolledSortDescriptor] = useState(initialSorting);
  const isSortControlled = controlledSortDescriptor !== undefined && onSortChange !== undefined;
  const sortDescriptor = isSortControlled ? controlledSortDescriptor : uncontrolledSortDescriptor;
  const setSortDescriptor = isSortControlled ? onSortChange : setUncontrolledSortDescriptor;
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

  const visibleColumns = useMemo(
    () => columns.filter((c) => !hiddenColumns.has(c.id)),
    [columns, hiddenColumns]
  );

  const toggleableColumns = useMemo(() => columns.filter((c) => c.canHide !== false), [columns]);

  const sortedData = useMemo(() => {
    if (!sortDescriptor?.column) return data;
    const col = columns.find((c) => c.id === sortDescriptor.column);
    // manualSort means the parent has already sorted (e.g. server-side); the
    // sortDescriptor is just for UI affordance, don't re-sort locally.
    if (!col || col.manualSort) return data;
    const accessor = col.accessor || ((row) => row[col.id]);
    return [...data].sort((a, b) => {
      const aVal = accessor(a);
      const bVal = accessor(b);
      let cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDescriptor.direction === 'descending' ? -cmp : cmp;
    });
  }, [data, sortDescriptor, columns]);

  const items = useMemo(
    () =>
      sortedData.map((row, i) => ({
        id: getRowId ? getRowId(row, i) : (row.id ?? i),
        row
      })),
    [sortedData, getRowId]
  );

  const firstColumnId = visibleColumns[0]?.id;

  const handleLoadMore = () => {
    if (isLoadingMore || !onLoadMore) return;
    setIsLoadingMore(true);
    Promise.resolve(onLoadMore()).finally(() => {
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

      const filename = exportConfig.filename || generateExportFilename(entityName);

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
    <div className='flex min-h-0 w-full flex-1 flex-col gap-2 p-4'>
      <div className='p-1'>{header}</div>
      <div className='items-between flex w-full flex-col justify-center gap-1 sm:flex-row sm:items-center sm:justify-between'>
        <div className='flex w-full items-center gap-1 sm:justify-between'>
          <div className='flex flex-1 flex-row flex-wrap justify-start gap-1'>{customFilters}</div>
        </div>
        <div className='flex flex-row items-center justify-end gap-1'>
          {/* Column Visibility Dropdown */}
          <Dropdown>
            <Button variant='tertiary'>
              <IconAddColumn />
              Columns
              <Chip color='accent' size='sm' variant='soft'>
                {toggleableColumns.filter((c) => !hiddenColumns.has(c.id)).length}/
                {toggleableColumns.length}
              </Chip>
            </Button>
            <Dropdown.Popover>
              <Dropdown.Menu
                selectionMode='multiple'
                onSelectionChange={(keys) => {
                  setHiddenColumns(
                    new Set(toggleableColumns.filter((c) => !keys.has(c.id)).map((c) => c.id))
                  );
                }}
                selectedKeys={
                  new Set(
                    toggleableColumns.filter((c) => !hiddenColumns.has(c.id)).map((c) => c.id)
                  )
                }
              >
                {toggleableColumns.map((col) => (
                  <Dropdown.Item id={col.id} key={col.id} textValue={col.header}>
                    <Dropdown.ItemIndicator>
                      {({ isSelected }) => (
                        <AnimatePresence>
                          {isSelected && <AnimatedCheck className='text-muted' stroke={1.5} />}
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
                      <IconDownload />
                    )
                  }
                </Button>
                <Dropdown.Popover>
                  <Dropdown.Menu onAction={(key) => handleExport(key)}>
                    <Dropdown.Item id='csv' textValue='Export as CSV'>
                      <IconCsv />
                      <Label>Export as CSV</Label>
                    </Dropdown.Item>
                    <Dropdown.Item id='xlsx' textValue='Export as Excel'>
                      <IconExcel />
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
                    <IconSync />
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
              <IconPlus />
              Add New
            </Button>
          </div>
        )}
      </div>

      <div className='relative flex h-0 min-h-0 flex-1 flex-col'>
        <Virtualizer
          layout={TableLayout}
          layoutOptions={{
            headingHeight: HEADING_HEIGHT,
            rowHeight: ROW_HEIGHT
          }}
        >
          <Table className='h-full'>
            <Table.ScrollContainer className='overflow-auto overscroll-y-contain'>
              <Table.Content
                aria-label={entityName}
                sortDescriptor={sortDescriptor}
                onSortChange={setSortDescriptor}
              >
                <Table.Header className='h-full w-full' columns={visibleColumns}>
                  {(column) => (
                    <Table.Column
                      allowsSorting={!!column.allowsSorting}
                      id={column.id}
                      isRowHeader={column.id === firstColumnId}
                      maxWidth={column.maxWidth}
                      minWidth={column.minWidth}
                      width={column.width}
                    >
                      {column.allowsSorting
                        ? ({ sortDirection }) => (
                            <SortableHeader sortDirection={sortDirection}>
                              {column.header}
                            </SortableHeader>
                          )
                        : column.header}
                    </Table.Column>
                  )}
                </Table.Header>
                <Table.Body>
                  <Table.Collection dependencies={[visibleColumns]} items={items}>
                    {(item) => (
                      <Table.Row columns={visibleColumns} dependencies={[visibleColumns]}>
                        {(column) => (
                          <Table.Cell className='flex h-full items-center'>
                            {column.cell(item.row)}
                          </Table.Cell>
                        )}
                      </Table.Row>
                    )}
                  </Table.Collection>
                  {onLoadMore && hasMore && items.length > 0 && (
                    <Table.LoadMore isLoading={isLoadingMore} onLoadMore={handleLoadMore}>
                      <Table.LoadMoreContent>
                        <Spinner size='md' />
                      </Table.LoadMoreContent>
                    </Table.LoadMore>
                  )}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        </Virtualizer>
        {items.length === 0 && (
          <div className='pointer-events-none absolute inset-x-0 top-10 bottom-0 flex items-center justify-center'>
            <p className='text-sm text-muted'>No results found</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SortableHeader({ children, sortDirection }) {
  return (
    <span className='flex h-full items-center justify-between'>
      {children}
      {sortDirection && (
        <IconChevronDown
          className={`size-3 transition-transform duration-100 ${
            sortDirection === 'ascending' ? 'rotate-180' : ''
          }`}
        />
      )}
    </span>
  );
}
