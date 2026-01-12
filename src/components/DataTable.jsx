import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table';
import { useState, useMemo } from 'react';
import {
  Avatar,
  Button,
  Checkbox,
  Chip,
  Dropdown,
  Input,
  Label,
  IconChevronDown,
  IconChevronRight
} from '@heroui/react';
import {
  IconFilter,
  IconColumns,
  IconPlus,
  IconSearch
} from '@tabler/icons-react';

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
 * - Status filtering
 * - Responsive design with Tailwind CSS
 *
 * @param {Object} props
 * @param {Array} props.columns - Table column definitions (TanStack Table format)
 * @param {Array} props.data - Table data array
 * @param {Function} props.onAdd - Callback when "Add New" button is clicked
 * @param {Function} props.onRowAction - Callback when row action is selected
 * @param {String} props.searchPlaceholder - Placeholder text for search input
 * @param {String} props.entityName - Name of entity (e.g., "users", "items")
 */
export function DataTable({
  columns = [],
  data = [],
  onAdd,
  onRowAction,
  searchPlaceholder = 'Search...',
  entityName = 'items'
}) {
  const [sorting, setSorting] = useState([]);
  const [columnFilters, setColumnFilters] = useState([]);
  const [columnVisibility, setColumnVisibility] = useState({});
  const [rowSelection, setRowSelection] = useState({});
  const [globalFilter, setGlobalFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState(new Set());
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 5
  });

  // Filter data by status if status filter is active
  const filteredData = useMemo(() => {
    if (statusFilter.size === 0) return data;
    return data.filter((row) => {
      if (!row.status) return true;
      return statusFilter.has(row.status.toLowerCase());
    });
  }, [data, statusFilter]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
      pagination
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  const selectedCount = Object.keys(rowSelection).length;
  const totalCount = filteredData.length;

  // Get unique status values for filter
  const statusOptions = useMemo(() => {
    const statuses = new Set();
    data.forEach((row) => {
      if (row.status) statuses.add(row.status.toLowerCase());
    });
    return Array.from(statuses);
  }, [data]);

  // Get all column IDs that can be toggled
  const toggleableColumns = table
    .getAllColumns()
    .filter((column) => column.getCanHide() && column.id !== 'select');

  const handleStatusFilterChange = (keys) => {
    setStatusFilter(keys);
  };

  return (
    <div className='w-full space-y-4'>
      {/* Top Controls Bar */}
      <div className='flex items-center justify-between gap-4'>
        <div className='flex flex-1 items-center gap-3'>
          {/* Search Input */}
          <div className='relative max-w-sm flex-1'>
            <IconSearch className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2' />
            <Input
              placeholder={searchPlaceholder}
              value={globalFilter ?? ''}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className='w-full pl-9'
            />
          </div>

          {/* Status Filter Dropdown */}
          {statusOptions.length > 0 && (
            <Dropdown>
              <Button variant='tertiary'>
                <IconFilter className='size-4' />
                Status
                <IconChevronDown className='size-4 text-foreground' />
              </Button>
              <Dropdown.Popover>
                <Dropdown.Menu
                  selectionMode='multiple'
                  selectedKeys={statusFilter}
                  onSelectionChange={handleStatusFilterChange}
                >
                  {statusOptions.map((status) => (
                    <Dropdown.Item id={status} textValue={status}>
                      <Dropdown.ItemIndicator />
                      <Label className='capitalize'>{status}</Label>
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          )}

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
        <div className='flex items-center gap-2'>
          {/* Bulk Actions Button */}
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
                <Dropdown.Item id='delete' textValue='Delete' variant='danger'>
                  <Label>Delete</Label>
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>

          {/* Add New Button */}
          {onAdd && (
            <Button onPress={onAdd}>
              <Plus className='size-4' />
              Add New
            </Button>
          )}
        </div>
      </div>

      {/* Total Count */}
      <div className='text-sm text-muted'>
        Total {totalCount} {entityName}
      </div>

      {/* Table */}
      <div className='overflow-hidden rounded-lg border border-default bg-background'>
        <div className='overflow-x-auto'>
          <table className='w-full'>
            <thead className='bg-overlay'>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className='px-4 py-3 text-left text-xs font-medium tracking-wider text-muted uppercase'
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
                    className='px-4 py-8 text-center text-muted'
                  >
                    No results found
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className='transition-colors hover:bg-surface/30'
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className='px-4 py-4 whitespace-nowrap'>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Controls Bar */}
      <div className='flex items-center justify-between'>
        {/* Selection Count */}
        <div className='text-sm text-muted'>
          {selectedCount} of {totalCount} selected
        </div>

        {/* Pagination */}
        <div className='flex items-center gap-6'>
          {/* Rows Per Page */}
          <div className='flex items-center gap-2'>
            <span className='text-sm text-muted'>Rows per page:</span>
            <Dropdown>
              <Button variant='ghost' size='sm'>
                {table.getState().pagination.pageSize}
                <IconChevronDown className='size-4 text-foreground' />
              </Button>
              <Dropdown.Popover>
                <Dropdown.Menu
                  selectionMode='single'
                  selectedKeys={
                    new Set([String(table.getState().pagination.pageSize)])
                  }
                  onSelectionChange={(keys) => {
                    const size = Number(Array.from(keys)[0]);
                    table.setPageSize(size);
                  }}
                >
                  {[5, 10, 20, 50].map((pageSize) => (
                    <Dropdown.Item
                      id={String(pageSize)}
                      textValue={String(pageSize)}
                    >
                      <Dropdown.ItemIndicator type='dot' />
                      <Label>{pageSize}</Label>
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          </div>

          {/* Page Numbers */}
          <div className='flex items-center gap-1'>
            {Array.from({ length: table.getPageCount() }, (_, i) => i).map(
              (pageIndex) => (
                <Button
                  variant={
                    pageIndex === table.getState().pagination.pageIndex
                      ? 'primary'
                      : 'ghost'
                  }
                  key={pageIndex}
                  onClick={() => table.setPageIndex(pageIndex)}
                  className='size-10 rounded-lg text-sm font-medium transition-colors'
                >
                  {pageIndex + 1}
                </Button>
              )
            )}
          </div>

          {/* Previous/Next Buttons */}
          <div className='flex items-center gap-2'>
            <Button
              variant='tertiary'
              size='sm'
              onPress={() => table.previousPage()}
              isDisabled={!table.getCanPreviousPage()}
            >
              <IconChevronRight className='size-4 rotate-180 text-foreground' />
              Previous
            </Button>
            <Button
              variant='tertiary'
              size='sm'
              onPress={() => table.nextPage()}
              isDisabled={!table.getCanNextPage()}
            >
              Next
              <IconChevronRight className='size-4 text-foreground' />
            </Button>
          </div>
        </div>
      </div>
    </div>
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
        isSelected={table.getIsAllPageRowsSelected()}
        isIndeterminate={table.getIsSomePageRowsSelected()}
        onChange={table.getToggleAllPageRowsSelectedHandler()}
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
        onChange={row.getToggleSelectedHandler()}
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

/**
 * Helper function to create a user column with avatar and email
 */
export function createUserColumn({
  accessorKey = 'name',
  emailKey = 'email',
  avatarKey = 'avatar'
} = {}) {
  return {
    accessorKey,
    header: 'Name',
    cell: ({ row }) => {
      const name = row.getValue(accessorKey);
      const email = row.original[emailKey];
      const avatarSrc = row.original[avatarKey];
      const initials =
        name
          ?.split(' ')
          .map((n) => n[0])
          .join('')
          .toUpperCase() || '?';

      return (
        <div className='flex items-center gap-3'>
          <Avatar size='sm'>
            {avatarSrc && <Avatar.Image src={avatarSrc} alt={name} />}
            <Avatar.Fallback>{initials}</Avatar.Fallback>
          </Avatar>
          <div className='flex flex-col'>
            <span className='text-sm font-medium'>{name}</span>
            {email && <span className='text-xs text-muted'>{email}</span>}
          </div>
        </div>
      );
    }
  };
}

/**
 * Helper function to create a role column with title and subtitle
 */
export function createRoleColumn({
  accessorKey = 'role',
  subtitleKey = 'department'
} = {}) {
  return {
    accessorKey,
    header: 'Role',
    cell: ({ row }) => {
      const role = row.getValue(accessorKey);
      const subtitle = row.original[subtitleKey];

      return (
        <div className='flex flex-col'>
          <span className='text-sm font-medium'>{role}</span>
          {subtitle && <span className='text-xs text-muted'>{subtitle}</span>}
        </div>
      );
    }
  };
}

/**
 * Helper function to create a status column with colored chips
 */
export function createStatusColumn({ accessorKey = 'status' } = {}) {
  const statusColorMap = {
    active: 'success',
    paused: 'danger',
    vacation: 'warning',
    pending: 'warning',
    inactive: 'default'
  };

  return {
    accessorKey,
    header: 'Status',
    cell: ({ row }) => {
      const status = row.getValue(accessorKey);
      const statusLower = status?.toLowerCase() || '';
      const color = statusColorMap[statusLower] || 'default';

      return (
        <Chip color={color} variant='soft' className='capitalize'>
          {status}
        </Chip>
      );
    }
  };
}
