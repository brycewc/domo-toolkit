import { Button, Dropdown, Label } from '@heroui/react';
import { IconCode, IconSparkles } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import { showReleaseToast } from '@/hooks';

const DEV_ACTIONS = [
  {
    icon: IconSparkles,
    id: 'releaseToast',
    label: 'Test Release Toast'
  }
];

export function DevMenu() {
  const [developerMode, setDeveloperMode] = useState(false);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    chrome.storage.local.get(['developerMode'], (result) => {
      setDeveloperMode(result.developerMode ?? false);
    });

    const handleStorageChange = (changes, areaName) => {
      if (areaName === 'local' && changes.developerMode !== undefined) {
        setDeveloperMode(changes.developerMode.newValue ?? false);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  if (!import.meta.env.DEV || !developerMode) return null;

  const handleAction = (key) => {
    switch (key) {
      case 'releaseToast':
        showReleaseToast();
        break;
      default:
        break;
    }
  };

  return (
    <Dropdown>
      <Button
        fullWidth
        className='min-w-36 flex-1 whitespace-normal'
        variant='tertiary'
      >
        <IconCode stroke={1.5} />
        Dev
      </Button>
      <Dropdown.Popover className='w-fit min-w-40' placement='bottom'>
        <Dropdown.Menu onAction={handleAction}>
          {DEV_ACTIONS.map((action) => (
            <Dropdown.Item
              id={action.id}
              key={action.id}
              textValue={action.label}
            >
              <action.icon className='size-4 shrink-0' stroke={1.5} />
              <Label>{action.label}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
