import {
  DataTable,
  createCheckboxColumn,
  createUserColumn,
  createRoleColumn,
  createStatusColumn
} from './DataTable';

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
    <div className='p-6'>
      <DataTable
        columns={columns}
        data={exampleUsers}
        onAdd={handleAddNew}
        onRowAction={handleRowAction}
        searchPlaceholder='Search...'
        entityName='users'
      />
    </div>
  );
}
