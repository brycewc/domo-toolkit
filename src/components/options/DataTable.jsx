import {
  Button,
  Card,
  Chip,
  Dropdown,
  Label,
  SearchField,
  Spinner,
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
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AnimatePresence } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { exportToCSV, exportToExcel, generateExportFilename } from '@/utils';

import { AnimatedCheck } from './../AnimatedCheck';

/**
 * DataTable Component
 * A feature-rich table component using TanStack Table with HeroUI v3 styling
 *
 * Features:
 * - Column sorting
 * - Global search/filtering
 * - Column visibility toggle
 * - Multi-row selection
 * - Pagination with customizable page size
 * - Action filtering
 * - Responsive design with Tailwind CSS
 *
 * @param {Object} props
 * @param {Array} props.columns - Table column definitions (TanStack Table format)
 * @param {Array} props.data - Table data array
 * @param {Function} props.onAdd - Callback when "Add New" button is clicked
 * @param {Function} props.onRowAction - Callback when row action is selected
 * @param {String} props.searchPlaceholder - Placeholder text for search input
 * @param {String} props.entityName - Name of entity (e.g., "users", "items")
 * @param {Boolean} props.enableSelection - Enable row selection checkboxes (default: true)
 * @param {Object} props.initialColumnVisibility - Initial column visibility state
 * @param {Boolean} props.enableSearch - Enable search field (default: true)
 * @param {React.ReactNode} props.customFilters - Custom filter components to render
 * @param {Object} props.exportConfig - Export configuration
 * @param {Boolean} props.exportConfig.enabled - Enable export functionality
 * @param {String} props.exportConfig.filename - Base filename for exports
 * @param {Function} props.exportConfig.onFetchAllData - Async function to fetch all data for export (returns Promise<Array>)
 * @param {Function} props.onRefresh - Callback when refresh button is clicked
 * @param {Boolean} props.isRefreshing - Whether the table is currently refreshing
 */
export function DataTable({
  columns = [],
  customFilters = null,
  data = [],
  enableSearch = true,
  enableSelection = true,
  entityName = 'items',
  exportConfig = null,
  initialColumnVisibility = {},
  initialSorting = [],
  isRefreshing = false,
  onAdd,
  onLoadMore,
  onRefresh = null,
  onRowAction,
  searchPlaceholder = 'Search...'
}) {
  const [sorting, setSorting] = useState(initialSorting);
  const [columnFilters, setColumnFilters] = useState([]);
  const [columnVisibility, setColumnVisibility] = useState(
    initialColumnVisibility
  );
  const [rowSelection, setRowSelection] = useState({});
  const [globalFilter, setGlobalFilter] = useState('');
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const tableContainerRef = useRef(null);

  const table = useReactTable({
    columns,
    data,
    enableRowSelection: enableSelection,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    state: {
      columnFilters,
      columnVisibility,
      globalFilter,
      rowSelection,
      sorting
    }
  });

  const { rows } = table.getRowModel();

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => 53, // Estimated row height in pixels
    getScrollElement: () => tableContainerRef?.current,
    measureElement: (element) => element?.getBoundingClientRect().height,
    overscan: 10 // Number of rows to render outside of the visible area
  });

  // Trigger onLoadMore when scrolling near the end
  useEffect(() => {
    const scrollElement = tableContainerRef.current;

    if (!scrollElement || !onLoadMore) return;

    const handleScroll = () => {
      const { clientHeight, scrollHeight, scrollTop } = scrollElement;
      const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;

      if (isLoadingMore) {
        return;
      }

      // Load more when scrolled 80% down
      if (scrollPercentage > 0.8) {
        setIsLoadingMore(true);
        Promise.resolve(onLoadMore()).finally(() => {
          setIsLoadingMore(false);
        });
      }
    };

    scrollElement.addEventListener('scroll', handleScroll);

    return () => {
      scrollElement.removeEventListener('scroll', handleScroll);
    };
  }, [onLoadMore, isLoadingMore]);

  const selectedCount = Object.keys(rowSelection).length;
  const totalCount = data.length;

  // Check if there's a select column (checkbox column)
  const hasSelectColumn = useMemo(() => {
    return table.getAllColumns().some((column) => column.id === 'select');
  }, [table]);

  // Get all column IDs that can be toggled
  const toggleableColumns = table
    .getAllColumns()
    .filter((column) => column.getCanHide() && column.id !== 'select');

  // Get visible columns for export (excluding select column)
  const getVisibleColumnsForExport = () => {
    return table
      .getAllColumns()
      .filter((col) => col.getIsVisible() && col.id !== 'select')
      .map((col) => col.columnDef);
  };

  // Handle export
  const handleExport = async (format) => {
    if (!exportConfig?.enabled) return;

    setIsExporting(true);
    try {
      // Get data to export - either fetch all or use current filtered data
      let exportData;
      if (exportConfig.onFetchAllData) {
        // Fetch all data (paginate through API)
        exportData = await exportConfig.onFetchAllData();
      } else {
        // Use currently filtered/visible data
        exportData = table
          .getFilteredRowModel()
          .rows.map((row) => row.original);
      }

      const visibleColumns = getVisibleColumnsForExport();
      const filename =
        exportConfig.filename || generateExportFilename(entityName);

      if (format === 'csv') {
        exportToCSV(exportData, visibleColumns, filename);
      } else if (format === 'xlsx') {
        exportToExcel(exportData, visibleColumns, filename);
      }
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Card className='h-fit w-full'>
      <Card.Header>
        {/* Top Controls Bar */}
        <div className='items-between flex w-full flex-col justify-center gap-1 sm:flex-row sm:items-center sm:justify-between'>
          <div
            className={`flex items-center gap-1 ${
              enableSelection && hasSelectColumn
                ? 'flex-1'
                : 'sm:w-full sm:justify-between'
            }`}
          >
            {/* Search Input */}
            {enableSearch && (
              <SearchField
                fullWidth
                name='search'
                value={globalFilter ?? ''}
                variant='secondary'
                onChange={setGlobalFilter}
              >
                <SearchField.Group className='rounded-4xl'>
                  <SearchField.SearchIcon />
                  <SearchField.Input placeholder={searchPlaceholder} />
                  <SearchField.ClearButton />
                </SearchField.Group>
              </SearchField>
            )}

            {/* Custom Filters */}
            <div className='flex flex-1 flex-row justify-start gap-1'>
              {customFilters}
            </div>

            <div className='flex flex-row items-center justify-end gap-1'>
              {/* Column Visibility Dropdown */}
              <Dropdown>
                <Button variant='tertiary'>
                  <IconColumns stroke={1.5} />
                  Columns
                  <Chip color='accent' size='sm' variant='soft'>
                    {
                      toggleableColumns.filter((col) => col.getIsVisible())
                        .length
                    }
                    /{toggleableColumns.length}
                  </Chip>
                </Button>
                <Dropdown.Popover>
                  <Dropdown.Menu
                    selectionMode='multiple'
                    onSelectionChange={(keys) => {
                      toggleableColumns.forEach((column) => {
                        column.toggleVisibility(keys.has(column.id));
                      });
                    }}
                    selectedKeys={
                      new Set(
                        toggleableColumns
                          .filter((col) => col.getIsVisible())
                          .map((col) => col.id)
                      )
                    }
                  >
                    {toggleableColumns.map((column) => (
                      <Dropdown.Item
                        id={column.id}
                        textValue={column.columnDef.header}
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
                        <Label>{column.columnDef.header}</Label>
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
                        )}
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
                      )}
                  </Button>
                  <Tooltip.Content>Refresh</Tooltip.Content>
                </Tooltip>
              )}
            </div>
          </div>

          {/* Bulk Actions & Add New Buttons */}
          <div className='flex items-center gap-1'>
            {/* Bulk Actions Button - Only show if selection is enabled */}
            {enableSelection && hasSelectColumn && (
              <Dropdown>
                <Button isDisabled={selectedCount === 0} variant='secondary'>
                  Actions ({selectedCount})
                  <IconChevronDown
                    className='size-4 text-foreground'
                    stroke={1.5}
                  />
                </Button>
                <Dropdown.Popover>
                  <Dropdown.Menu
                    onAction={(key) => {
                      if (onRowAction) {
                        const selectedRows = table
                          .getFilteredSelectedRowModel()
                          .rows.map((row) => row.original);
                        onRowAction(key, selectedRows);
                      }
                    }}
                  >
                    <Dropdown.Item id='edit' textValue='Edit'>
                      <Label>Edit</Label>
                    </Dropdown.Item>
                    <Dropdown.Item id='duplicate' textValue='Duplicate'>
                      <Label>Duplicate</Label>
                    </Dropdown.Item>
                    <Dropdown.Item
                      id='delete'
                      textValue='Delete'
                      variant='danger'
                    >
                      <Label>Delete</Label>
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>
            )}

            {/* Add New Button */}
            {onAdd && (
              <Button onPress={onAdd}>
                <IconPlus stroke={1.5} />
                Add New
              </Button>
            )}
          </div>
        </div>
        {/* Selection Count - Only show if selection is enabled */}
        {enableSelection && hasSelectColumn && (
          <div className='text-sm text-muted'>
            {selectedCount} of {totalCount} selected
          </div>
        )}
      </Card.Header>
      {/* Table */}
      <Card.Content className='overflow-hidden rounded-lg border border-default'>
        <div
          className='max-h-[calc(100vh-15rem)] overflow-auto overscroll-y-contain'
          ref={tableContainerRef}
        >
          <table className='w-full'>
            <thead className='sticky top-0 z-10 bg-background'>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      className='p-3 text-left text-xs font-medium tracking-wider uppercase'
                      key={header.id}
                      style={{
                        maxWidth: header.column.columnDef.maxSize,
                        minWidth: header.column.columnDef.minSize,
                        width: header.column.columnDef.size
                      }}
                    >
                      {header.isPlaceholder ? null : (
                        <div
                          onClick={header.column.getToggleSortingHandler()}
                          className={`flex items-center gap-2 ${
                            header.column.getCanSort()
                              ? 'cursor-pointer select-none'
                              : ''
                          }`}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                          {header.column.getCanSort() && (
                            <span className='text-muted'>
                              {header.column.getIsSorted() === 'asc' ? (
                                <IconChevronDown
                                  className='size-4 rotate-180 text-foreground'
                                  stroke={1.5}
                                />
                              ) : header.column.getIsSorted() === 'desc' ? (
                                <IconChevronDown
                                  className='size-4 text-foreground'
                                  stroke={1.5}
                                />
                              ) : (
                                <div className='size-4' />
                              )}
                            </span>
                          )}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className='divide-y divide-default'>
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td
                    className='p-3 text-center text-muted'
                    colSpan={columns.length}
                  >
                    No results found
                  </td>
                </tr>
              ) : (
                <>
                  {rowVirtualizer.getVirtualItems().length > 0 && (
                    <tr
                      style={{
                        height: `${rowVirtualizer.getVirtualItems()[0].start}px`
                      }}
                    >
                      <td colSpan={columns.length} />
                    </tr>
                  )}
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const row = rows[virtualRow.index];
                    return (
                      <tr
                        data-index={virtualRow.index}
                        key={row.id}
                        ref={(node) => rowVirtualizer.measureElement(node)}
                        className={`divide-x divide-default transition-colors hover:bg-surface/30 ${
                          virtualRow.index % 2 === 0
                            ? 'bg-transparent'
                            : 'bg-surface/10'
                        }`}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td
                            className='px-3 py-2'
                            key={cell.id}
                            style={{
                              maxWidth: cell.column.columnDef.maxSize,
                              minWidth: cell.column.columnDef.minSize,
                              width: cell.column.columnDef.size
                            }}
                          >
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext()
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  {rowVirtualizer.getVirtualItems().length > 0 && (
                    <tr
                      style={{
                        height: `${
                          rowVirtualizer.getTotalSize() -
                          rowVirtualizer.getVirtualItems()[
                            rowVirtualizer.getVirtualItems().length - 1
                          ].end
                        }px`
                      }}
                    >
                      <td colSpan={columns.length} />
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </Card.Content>
    </Card>
  );
}
