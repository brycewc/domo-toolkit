import { useEffect, useState } from 'react';
import { useTheme } from '@/hooks';
import { DataTableExample, DataListExample, GetPagesView } from '@/components';
import './App.css';

export default function App() {
  // Apply theme
  useTheme();

  const [activeView, setActiveView] = useState('default');

  // Listen for storage changes to detect when sidepanel data is set
  useEffect(() => {
    const handleStorageChange = (changes, areaName) => {
      if (areaName === 'local' && changes.sidepanelDataList) {
        const data = changes.sidepanelDataList.newValue;
        if (data?.type === 'getPages') {
          setActiveView('getPages');
        }
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    // Check if there's already sidepanel data on mount
    chrome.storage.local.get(['sidepanelDataList'], (result) => {
      if (result.sidepanelDataList) {
        // Only use it if it's recent (within last 10 seconds)
        const age = Date.now() - (result.sidepanelDataList.timestamp || 0);
        if (age < 10000 && result.sidepanelDataList.type === 'getPages') {
          setActiveView('getPages');
        }
      }
    });

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  // Render the appropriate view
  if (activeView === 'getPages') {
    return (
      <div className='flex min-h-screen w-full flex-col items-center gap-2 p-2'>
        <GetPagesView />
      </div>
    );
  }

  return (
    <div className='flex min-h-screen w-full flex-col items-center gap-2 p-2'>
      <DataTableExample />
      <DataListExample />
    </div>
  );
}
