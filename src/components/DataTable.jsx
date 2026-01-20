import { useState, useMemo, useRef, useEffect } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Button,
  ButtonGroup,
  Card,
  Checkbox,
  Chip,
  Dropdown,
  Label,
  IconChevronDown,
  IconChevronRight,
  SearchField
} from '@heroui/react';
import { IconFilter, IconColumns, IconPlus } from '@tabler/icons-react';

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
  customFilters = null
}) {
  const [sorting, setSorting] = useState(initialSorting);
  const [columnFilters, setColumnFilters] = useState([]);
  const [columnVisibility, setColumnVisibility] = useState(
    initialColumnVisibility
  );
  const [rowSelection, setRowSelection] = useState({});
  const [globalFilter, setGlobalFilter] = useState('');

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
    if (!scrollElement || !onLoadMore) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollElement;
      const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;

      // Load more when scrolled 80% down
      if (scrollPercentage > 0.8) {
        onLoadMore();
      }
    };

    scrollElement.addEventListener('scroll', handleScroll);
    return () => scrollElement.removeEventListener('scroll', handleScroll);
  }, [onLoadMore]);

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

  return (
    <Card className='h-fit max-h-[calc(100vh-10rem)] w-full'>
      <Card.Header>
        {/* Top Controls Bar */}
        <div className='items-between flex flex-col justify-center gap-1 sm:flex-row sm:items-center sm:justify-between'>
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
              >
                <SearchField.Group className='rounded-4xl'>
                  <SearchField.SearchIcon />
                  <SearchField.Input placeholder={searchPlaceholder} />
                  <SearchField.ClearButton />
                </SearchField.Group>
              </SearchField>
            )}

            {/* Custom Filters */}
            <div className='flex flex-row justify-start gap-1'>
              {customFilters}
            </div>

            {/* Column Visibility Dropdown */}
            <Dropdown>
              <Button variant='tertiary'>
                <IconColumns className='size-4' />
                Columns
                <IconChevronDown className='size-4 text-foreground' />
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
                      <Dropdown.ItemIndicator />
                      <Label>{column.columnDef.header}</Label>
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          </div>

          {/* Bulk Actions & Add New Buttons */}
          <div className='flex items-center gap-1'>
            {/* Bulk Actions Button - Only show if selection is enabled */}
            {enableSelection && hasSelectColumn && (
              <Dropdown>
                <Button variant='secondary' isDisabled={selectedCount === 0}>
                  Actions ({selectedCount})
                  <IconChevronDown className='size-4 text-foreground' />
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
                <IconPlus className='size-4' />
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
        <div ref={tableContainerRef} className='overflow-auto'>
          <table className='w-full'>
            <thead className='sticky top-0 z-10 bg-background'>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className='p-3 text-left text-xs font-medium tracking-wider uppercase'
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
                                <IconChevronDown className='size-4 rotate-180 text-foreground' />
                              ) : header.column.getIsSorted() === 'desc' ? (
                                <IconChevronDown className='size-4 text-foreground' />
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
                          <td key={cell.id} className='p-3'>
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
export function createCheckboxColumn() {
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
