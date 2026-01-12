import { useTheme } from '@/hooks';
import { DataTableExample } from '@/components';
import './App.css';

export default function App() {
  // Apply theme
  useTheme();

  return (
    <div className='flex w-auto min-w-md flex-col gap-2 bg-background p-2'>
      <DataTableExample />
    </div>
  );
}
