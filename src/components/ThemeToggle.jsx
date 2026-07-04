import { ToggleButton, ToggleButtonGroup } from '@heroui/react';
import { useEffect, useState } from 'react';

import IconComputer from '@icons/computer.svg?react';
import IconMoon from '@icons/moon.svg?react';
import IconSun from '@icons/sun.svg?react';

/**
 * Icon-only segmented control for quickly switching the extension theme.
 * Reads and writes the `themePreference` key in chrome.storage.sync directly,
 * so it is self-contained and can be dropped into any extension surface. The
 * live theme repaint is handled by the useTheme hook's storage listener.
 */
export function ThemeToggle({ className }) {
  const [preference, setPreference] = useState('system');

  useEffect(() => {
    chrome.storage.sync.get(['themePreference'], (result) => {
      setPreference(result.themePreference || 'system');
    });

    const handleStorageChange = (changes, areaName) => {
      if (areaName === 'sync' && changes.themePreference) {
        setPreference(changes.themePreference.newValue || 'system');
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const handleSelectionChange = (keys) => {
    const value = [...keys][0];
    if (!value) {
      return;
    }
    setPreference(value);
    chrome.storage.sync.set({ themePreference: value });
  };

  return (
    <ToggleButtonGroup
      disallowEmptySelection
      className={className}
      selectedKeys={new Set([preference])}
      selectionMode='single'
      size='sm'
      onSelectionChange={handleSelectionChange}
    >
      <ToggleButton isIconOnly aria-label='System theme' id='system'>
        <IconComputer />
      </ToggleButton>
      <ToggleButton isIconOnly aria-label='Light theme' id='light'>
        <ToggleButtonGroup.Separator />
        <IconSun />
      </ToggleButton>
      <ToggleButton isIconOnly aria-label='Dark theme' id='dark'>
        <ToggleButtonGroup.Separator />
        <IconMoon />
      </ToggleButton>
    </ToggleButtonGroup>
  );
}
