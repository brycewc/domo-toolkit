import { DataList } from '@/components';
export function DataListExample() {
  const items = [
    {
      id: '647407590',
      label: 'MajorDomo',
      metadata: 'ID: 647407590',
      children: [
        {
          id: '1',
          label: '2024 Twelve Days of Data Results',
          url: '/pages/1',
          count: 13
        },
        { id: '2', label: 'Admin Dashboard', url: '/pages/2', count: 31 },
        {
          id: '3',
          label: 'Docs',
          count: 4,
          children: [
            { id: '3-1', label: 'Approvals', url: '/docs/approvals' },
            { id: '3-2', label: 'Duplicate Accounts', url: '/docs/duplicates' }
          ]
        }
      ]
    }
  ];
  return (
    <DataList
      items={items}
      title='Page Hierarchy'
      onItemClick={(item) => navigateToPage(item)}
      onItemAction={(action, item) => handleAction(action, item)}
    />
  );
}
