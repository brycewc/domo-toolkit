import { useState, useMemo, useRef, useEffect } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Button,
  Card,
  Checkbox,
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
  data = [],
  onAdd,
  onRowAction,
  searchPlaceholder = 'Search...',
  entityName = 'items',
  initialSorting = [],
  initialColumnVisibility = {},
  enableSelection = true,
  enableSearch = true,
  onLoadMore,
  customFilters = null,
  exportConfig = null,
  onRefresh = null,
  isRefreshing = false
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
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter
    },
    enableRowSelection: enableSelection,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  const { rows } = table.getRowModel();

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef?.current,
    estimateSize: () => 53, // Estimated row height in pixels
    overscan: 10, // Number of rows to render outside of the visible area
    measureElement: (element) => element?.getBoundingClientRect().height
  });

  // Trigger onLoadMore when scrolling near the end
  useEffect(() => {
    const scrollElement = tableContainerRef.current;

    console.log('[DataTable] Setting up scroll listener', {
      hasScrollElement: !!scrollElement,
      hasOnLoadMore: !!onLoadMore
    });

    if (!scrollElement || !onLoadMore) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollElement;
      const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;

      console.log('[DataTable] Scroll event fired', {
        scrollTop,
        scrollHeight,
        clientHeight,
        scrollPercentage: (scrollPercentage * 100).toFixed(2) + '%',
        isLoadingMore,
        threshold: '80%'
      });

      if (isLoadingMore) {
        console.log('[DataTable] Already loading more, skipping...');
        return;
      }

      // Load more when scrolled 80% down
      if (scrollPercentage > 0.8) {
        console.log('[DataTable] Triggering onLoadMore...');
        setIsLoadingMore(true);
        Promise.resolve(onLoadMore()).finally(() => {
          console.log('[DataTable] onLoadMore completed');
          setIsLoadingMore(false);
        });
      }
    };

    scrollElement.addEventListener('scroll', handleScroll);

    // Log initial scroll state
    const { scrollTop, scrollHeight, clientHeight } = scrollElement;
    console.log('[DataTable] Initial scroll state', {
      scrollTop,
      scrollHeight,
      clientHeight,
      canScroll: scrollHeight > clientHeight
    });

    return () => {
      console.log('[DataTable] Removing scroll listener');
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
                name='search'
                value={globalFilter ?? ''}
                onChange={setGlobalFilter}
                fullWidth
                variant='secondary'
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
                </Button>
                <Dropdown.Popover>
                  <Dropdown.Menu
                    selectionMode='multiple'
                    selectedKeys={
                      new Set(
                        toggleableColumns
                          .filter((col) => col.getIsVisible())
                          .map((col) => col.id)
                      )
                    }
                    onSelectionChange={(keys) => {
                      toggleableColumns.forEach((column) => {
                        column.toggleVisibility(keys.has(column.id));
                      });
                    }}
                  >
                    {toggleableColumns.map((column) => (
                      <Dropdown.Item
                        id={column.id}
                        textValue={column.columnDef.header}
                      >
                        <Dropdown.ItemIndicator>
                          {({ isSelected }) =>
                            isSelected ? <AnimatedCheck stroke={1.5} /> : null
                          }
                        </Dropdown.ItemIndicator>
                        <Label>{column.columnDef.header}</Label>
                      </Dropdown.Item>
                    ))}
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>

              {/* Export Dropdown */}
              {exportConfig?.enabled && (
                <Tooltip delay={400} closeDelay={0}>
                  <Dropdown>
                    <Button
                      variant='tertiary'
                      isDisabled={isExporting || data.length === 0}
                      isPending={isExporting}
                      isIconOnly
                    >
                      {({ isPending }) =>
                        isPending ? (
                          <Spinner size='sm' color='currentColor' />
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
                <Tooltip delay={400} closeDelay={0}>
                  <Button
                    variant='tertiary'
                    onPress={onRefresh}
                    isDisabled={isRefreshing}
                    isPending={isRefreshing}
                    isIconOnly
                  >
                    {({ isPending }) =>
                      isPending ? (
                        <Spinner size='sm' color='currentColor' />
                      ) : (
                        <IconRefresh stroke={1.5} />
                      )
                    }
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
                <Button variant='secondary' isDisabled={selectedCount === 0}>
                  Actions ({selectedCount})
                  <IconChevronDown
                    stroke={1.5}
                    className='size-4 text-foreground'
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
          ref={tableContainerRef}
          className='max-h-[calc(100vh-15rem)] overflow-auto overscroll-y-contain'
        >
          <table className='w-full'>
            <thead className='sticky top-0 z-10 bg-background'>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className='p-3 text-left text-xs font-medium tracking-wider uppercase'
                      style={{
                        width: header.column.columnDef.size,
                        minWidth: header.column.columnDef.minSize,
                        maxWidth: header.column.columnDef.maxSize
                      }}
                    >
                      {header.isPlaceholder ? null : (
                        <div
                          className={`flex items-center gap-2 ${
                            header.column.getCanSort()
                              ? 'cursor-pointer select-none'
                              : ''
                          }`}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                          {header.column.getCanSort() && (
                            <span className='text-muted'>
                              {header.column.getIsSorted() === 'asc' ? (
                                <IconChevronDown
                                  stroke={1.5}
                                  className='size-4 rotate-180 text-foreground'
                                />
                              ) : header.column.getIsSorted() === 'desc' ? (
                                <IconChevronDown
                                  stroke={1.5}
                                  className='size-4 text-foreground'
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
                    colSpan={columns.length}
                    className='p-3 text-center text-muted'
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
                        key={row.id}
                        className={`divide-x divide-default transition-colors hover:bg-surface/30 ${
                          virtualRow.index % 2 === 0
                            ? 'bg-transparent'
                            : 'bg-surface/10'
                        }`}
                        data-index={virtualRow.index}
                        ref={(node) => rowVirtualizer.measureElement(node)}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td
                            key={cell.id}
                            className='px-3 py-2'
                            style={{
                              width: cell.column.columnDef.size,
                              minWidth: cell.column.columnDef.minSize,
                              maxWidth: cell.column.columnDef.maxSize
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

/**
 * Helper function to create a checkbox column for row selection
 * Use this as the first column in your columns array
 */
function createCheckboxColumn() {
  return {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        isSelected={table.getIsAllRowsSelected()}
        isIndeterminate={table.getIsSomeRowsSelected()}
        onChange={(value) => table.toggleAllRowsSelected(value)}
      >
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
      </Checkbox>
    ),
    cell: ({ row }) => (
      <Checkbox
        isSelected={row.getIsSelected()}
        isDisabled={!row.getCanSelect()}
        onChange={(value) => row.toggleSelected(value)}
      >
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
      </Checkbox>
    ),
    enableSorting: false,
    enableHiding: false
  };
}
