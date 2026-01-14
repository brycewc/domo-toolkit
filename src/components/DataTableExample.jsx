import { DataTable, createCheckboxColumn } from './DataTable';
import { Avatar, Chip } from '@heroui/react';

// Example data matching the screenshot
const exampleUsers = [
  {
    id: 1,
    name: 'Jane Fisher',
    email: 'jane.fisher@example.com',
    avatar: 'https://i.pravatar.cc/150?img=1',
    role: 'Sr. Dev',
    department: 'Development',
    status: 'Active'
  },
  {
    id: 2,
    name: 'Kristen Copper',
    email: 'kristen.cooper@example.com',
    avatar: 'https://i.pravatar.cc/150?img=2',
    role: 'S. Manager',
    department: 'Sales',
    status: 'Active'
  },
  {
    id: 3,
    name: 'Zoey Lang',
    email: 'zoey.lang@example.com',
    avatar: 'https://i.pravatar.cc/150?img=3',
    role: 'Tech Lead',
    department: 'Development',
    status: 'Paused'
  },
  {
    id: 4,
    name: 'William Howard',
    email: 'william.howard@example.com',
    avatar: 'https://i.pravatar.cc/150?img=4',
    role: 'C.M.',
    department: 'Marketing',
    status: 'Vacation'
  },
  {
    id: 5,
    name: 'Tony Reichert',
    email: 'tony.reichert@example.com',
    avatar: 'https://i.pravatar.cc/150?img=5',
    role: 'CEO',
    department: 'Management',
    status: 'Active'
  },
  {
    id: 6,
    name: 'Emily Chen',
    email: 'emily.chen@example.com',
    avatar: 'https://i.pravatar.cc/150?img=6',
    role: 'Designer',
    department: 'Design',
    status: 'Active'
  },
  {
    id: 7,
    name: 'Michael Brown',
    email: 'michael.brown@example.com',
    avatar: 'https://i.pravatar.cc/150?img=7',
    role: 'Developer',
    department: 'Development',
    status: 'Paused'
  },
  {
    id: 8,
    name: 'Sarah Davis',
    email: 'sarah.davis@example.com',
    avatar: 'https://i.pravatar.cc/150?img=8',
    role: 'Manager',
    department: 'Operations',
    status: 'Active'
  },
  {
    id: 9,
    name: 'James Wilson',
    email: 'james.wilson@example.com',
    avatar: 'https://i.pravatar.cc/150?img=9',
    role: 'Analyst',
    department: 'Data',
    status: 'Vacation'
  },
  {
    id: 10,
    name: 'Lisa Anderson',
    email: 'lisa.anderson@example.com',
    avatar: 'https://i.pravatar.cc/150?img=10',
    role: 'Coordinator',
    department: 'Marketing',
    status: 'Active'
  },
  {
    id: 11,
    name: 'Robert Taylor',
    email: 'robert.taylor@example.com',
    avatar: 'https://i.pravatar.cc/150?img=11',
    role: 'Engineer',
    department: 'Development',
    status: 'Active'
  },
  {
    id: 12,
    name: 'Jennifer Martinez',
    email: 'jennifer.martinez@example.com',
    avatar: 'https://i.pravatar.cc/150?img=12',
    role: 'Support Lead',
    department: 'Support',
    status: 'Paused'
  },
  {
    id: 13,
    name: 'David Garcia',
    email: 'david.garcia@example.com',
    avatar: 'https://i.pravatar.cc/150?img=13',
    role: 'Product Manager',
    department: 'Product',
    status: 'Active'
  },
  {
    id: 14,
    name: 'Maria Rodriguez',
    email: 'maria.rodriguez@example.com',
    avatar: 'https://i.pravatar.cc/150?img=14',
    role: 'QA Engineer',
    department: 'Quality',
    status: 'Vacation'
  },
  {
    id: 15,
    name: 'Christopher Lee',
    email: 'christopher.lee@example.com',
    avatar: 'https://i.pravatar.cc/150?img=15',
    role: 'DevOps',
    department: 'Operations',
    status: 'Active'
  },
  {
    id: 16,
    name: 'Amanda White',
    email: 'amanda.white@example.com',
    avatar: 'https://i.pravatar.cc/150?img=16',
    role: 'HR Manager',
    department: 'Human Resources',
    status: 'Active'
  },
  {
    id: 17,
    name: 'Daniel Harris',
    email: 'daniel.harris@example.com',
    avatar: 'https://i.pravatar.cc/150?img=17',
    role: 'Sales Rep',
    department: 'Sales',
    status: 'Paused'
  },
  {
    id: 18,
    name: 'Jessica Clark',
    email: 'jessica.clark@example.com',
    avatar: 'https://i.pravatar.cc/150?img=18',
    role: 'Content Writer',
    department: 'Marketing',
    status: 'Active'
  },
  {
    id: 19,
    name: 'Matthew Lewis',
    email: 'matthew.lewis@example.com',
    avatar: 'https://i.pravatar.cc/150?img=19',
    role: 'Architect',
    department: 'Development',
    status: 'Vacation'
  },
  {
    id: 20,
    name: 'Ashley Walker',
    email: 'ashley.walker@example.com',
    avatar: 'https://i.pravatar.cc/150?img=20',
    role: 'Consultant',
    department: 'Strategy',
    status: 'Active'
  }
];

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

export function DataTableExample() {
  // Define columns using helper functions
  const columns = [
    createCheckboxColumn(),
    createUserColumn(),
    createRoleColumn(),
    createStatusColumn()
  ];

  const handleAddNew = () => {
    console.log('Add new user clicked');
    alert('Add new user functionality');
  };

  const handleRowAction = (action, selectedRows) => {
    console.log(
      `Action "${action}" on ${selectedRows.length} user(s):`,
      selectedRows
    );
    const names = selectedRows.map((user) => user.name).join(', ');
    alert(`Action "${action}" on: ${names}`);
  };

  return (
    <DataTable
      columns={columns}
      data={exampleUsers}
      onAdd={handleAddNew}
      onRowAction={handleRowAction}
      searchPlaceholder='Search...'
      entityName='users'
    />
  );
}
