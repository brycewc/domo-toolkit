import {
  Button,
  Description,
  Form,
  Input,
  Label,
  ListBox,
  Select,
  Separator,
  Switch,
  TextField
} from '@heroui/react';
import { toast } from '@heroui/react';
import {
  IconCheck,
  IconChevronDown,
  IconDeviceFloppy
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';

const DEFAULT_SETTINGS = {
  defaultClearCookiesHandling: 'auto',
  defaultDomoInstance: '',
  iconStyle: 'light',
  themePreference: 'system'
};

export function Settings() {
  const [developerMode, setDeveloperMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Store all settings in a single state object for extensibility
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  // Track original settings to detect changes
  const [originalSettings, setOriginalSettings] = useState(DEFAULT_SETTINGS);

  useEffect(() => {
    // Load all settings from storage
    chrome.storage.sync.get(
      [
        'themePreference',
        'iconStyle',
        'defaultDomoInstance',
        'defaultClearCookiesHandling'
      ],
      (result) => {
        const loadedSettings = {
          defaultClearCookiesHandling:
            result.defaultClearCookiesHandling || DEFAULT_SETTINGS.defaultClearCookiesHandling,
          defaultDomoInstance: result.defaultDomoInstance || DEFAULT_SETTINGS.defaultDomoInstance,
          iconStyle: result.iconStyle || DEFAULT_SETTINGS.iconStyle,
          themePreference: result.themePreference || DEFAULT_SETTINGS.themePreference
        };
        setSettings(loadedSettings);
        setOriginalSettings(loadedSettings);
        setIsLoading(false);
      }
    );

    if (import.meta.env.DEV) {
      chrome.storage.local.get(['developerMode'], (result) => {
        setDeveloperMode(result.developerMode ?? false);
      });
    }

    // Listen for storage changes (e.g., from other tabs or extension pages)
    const handleStorageChange = (changes, areaName) => {
      if (areaName === 'sync') {
        // Use functional updates to avoid stale closure issues
        setSettings((prevSettings) => {
          const updatedSettings = { ...prevSettings };
          let hasChanges = false;

          if (changes.themePreference) {
            updatedSettings.themePreference = changes.themePreference.newValue;
            hasChanges = true;
          }

          if (changes.iconStyle) {
            updatedSettings.iconStyle = changes.iconStyle.newValue;
            hasChanges = true;
          }

          if (changes.defaultDomoInstance) {
            updatedSettings.defaultDomoInstance =
              changes.defaultDomoInstance.newValue;
            hasChanges = true;
          }

          if (changes.defaultClearCookiesHandling !== undefined) {
            updatedSettings.defaultClearCookiesHandling =
              changes.defaultClearCookiesHandling.newValue;
            hasChanges = true;
          }

          return hasChanges ? updatedSettings : prevSettings;
        });

        setOriginalSettings((prevOriginal) => {
          const updatedOriginal = { ...prevOriginal };
          let hasChanges = false;

          if (changes.themePreference) {
            updatedOriginal.themePreference = changes.themePreference.newValue;
            hasChanges = true;
          }

          if (changes.iconStyle) {
            updatedOriginal.iconStyle = changes.iconStyle.newValue;
            hasChanges = true;
          }

          if (changes.defaultDomoInstance) {
            updatedOriginal.defaultDomoInstance =
              changes.defaultDomoInstance.newValue;
            hasChanges = true;
          }

          if (changes.defaultClearCookiesHandling !== undefined) {
            updatedOriginal.defaultClearCookiesHandling =
              changes.defaultClearCookiesHandling.newValue;
            hasChanges = true;
          }

          return hasChanges ? updatedOriginal : prevOriginal;
        });
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();

    // Save all settings to storage
    chrome.storage.sync.set(settings, () => {
      setOriginalSettings(settings);
      showStatus('Settings saved successfully!', '', 'success');
    });
  };

  const handleThemeChange = (value) => {
    setSettings((prev) => ({
      ...prev,
      themePreference: value
    }));
  };

  const handleIconStyleChange = (value) => {
    setSettings((prev) => ({
      ...prev,
      iconStyle: value
    }));
  };

  const handleDefaultInstanceChange = (value) => {
    setSettings((prev) => ({
      ...prev,
      defaultDomoInstance: value
    }));
  };

  const handleClearCookiesHandlingChange = (value) => {
    setSettings((prev) => ({
      ...prev,
      defaultClearCookiesHandling: value
    }));
  };

  const handleDeveloperModeChange = (isSelected) => {
    setDeveloperMode(isSelected);
    chrome.storage.local.set({ developerMode: isSelected });
  };

  // Check if settings have changed
  const hasChanges =
    JSON.stringify(settings) !== JSON.stringify(originalSettings);

  const showStatus = (
    title,
    description,
    status = 'accent',
    timeout = 3000
  ) => {
    toast(title, { description, timeout: timeout || 0, variant: status });
  };

  if (isLoading) {
    return null;
  }

  return (
    <div className='flex h-full min-h-[calc(100vh-20)] w-md flex-col gap-2 pt-4'>
      <Form className='flex flex-col gap-2' onSubmit={handleSubmit}>
        <Select
          className='w-40'
          placeholder='System'
          value={settings.themePreference}
          onChange={handleThemeChange}
        >
          <Label>Theme</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator>
              <IconChevronDown stroke={1} />
            </Select.Indicator>
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item id='system' textValue='System'>
                System
                <ListBox.ItemIndicator>
                  {({ isSelected }) =>
                    isSelected ? <IconCheck stroke={1.5} /> : null
                  }
                </ListBox.ItemIndicator>
              </ListBox.Item>
              <ListBox.Item id='light' textValue='Light'>
                Light
                <ListBox.ItemIndicator>
                  {({ isSelected }) =>
                    isSelected ? <IconCheck stroke={1.5} /> : null
                  }
                </ListBox.ItemIndicator>
              </ListBox.Item>
              <ListBox.Item id='dark' textValue='Dark'>
                Dark
                <ListBox.ItemIndicator>
                  {({ isSelected }) =>
                    isSelected ? <IconCheck stroke={1.5} /> : null
                  }
                </ListBox.ItemIndicator>
              </ListBox.Item>
            </ListBox>
          </Select.Popover>
          <Description className='w-lg'>
            System, light, or dark theme (applies to popup, side panel, and
            options pages)
          </Description>
        </Select>
        <Select
          className='w-40'
          value={settings.iconStyle}
          onChange={handleIconStyleChange}
        >
          <Label>Extension Icon</Label>
          <Select.Trigger>
            <Select.Value className='flex items-center gap-2' />
            <Select.Indicator>
              <IconChevronDown stroke={1} />
            </Select.Indicator>
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item id='light' textValue='Light'>
                <img alt='Light' className='h-4 w-4' src='/toolkit-128.png' />
                Light
                <ListBox.ItemIndicator>
                  {({ isSelected }) =>
                    isSelected ? <IconCheck stroke={1.5} /> : null
                  }
                </ListBox.ItemIndicator>
              </ListBox.Item>
              <ListBox.Item id='dark' textValue='Dark'>
                <img
                  alt='Dark'
                  className='h-4 w-4'
                  src='/toolkit-dark-128.png'
                />
                Dark
                <ListBox.ItemIndicator>
                  {({ isSelected }) =>
                    isSelected ? <IconCheck stroke={1.5} /> : null
                  }
                </ListBox.ItemIndicator>
              </ListBox.Item>
            </ListBox>
          </Select.Popover>
          <Description className='w-md'>
            Light or dark extension icon, independent of theme preference
          </Description>
        </Select>
        <TextField className='w-40' onChange={handleDefaultInstanceChange}>
          <Label>Default Domo Instance</Label>
          <Input
            placeholder='Enter an instance'
            value={settings.defaultDomoInstance}
          />
          <Description className='w-md'>
            This is used when navigating to copied objects from non-Domo
            websites. Enter without .domo.com (e.g., company for
            company.domo.com)
          </Description>
        </TextField>
        <Select
          className='w-40'
          value={settings.defaultClearCookiesHandling}
          onChange={handleClearCookiesHandlingChange}
        >
          <Label>Cookie Clearing Behavior</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator>
              <IconChevronDown stroke={1} />
            </Select.Indicator>
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item id='auto' textValue='Auto'>
                Auto
                <ListBox.ItemIndicator>
                  {({ isSelected }) =>
                    isSelected ? <IconCheck stroke={1.5} /> : null
                  }
                </ListBox.ItemIndicator>
              </ListBox.Item>
              <ListBox.Item id='preserve' textValue='Preserve'>
                Preserve
                <ListBox.ItemIndicator>
                  {({ isSelected }) =>
                    isSelected ? <IconCheck stroke={1.5} /> : null
                  }
                </ListBox.ItemIndicator>
              </ListBox.Item>
              <ListBox.Item id='all' textValue='All'>
                All
                <ListBox.ItemIndicator>
                  {({ isSelected }) =>
                    isSelected ? <IconCheck stroke={1.5} /> : null
                  }
                </ListBox.ItemIndicator>
              </ListBox.Item>
            </ListBox>
          </Select.Popover>
          <Description className='w-lg'>
            <p>
              Auto: Clear cookies on 431 errors, preserve last 2 instances
              (removes manual button)
            </p>
            <p>
              Preserve: Preserve last 2 instances (only manual, no
              auto-clearing)
            </p>
            <p>All: Clear all Domo cookies (only manual, no auto-clearing)</p>
          </Description>
        </Select>
        <div className='pt-1'>
          <Button isDisabled={!hasChanges} type='submit' variant='primary'>
            <IconDeviceFloppy />
            Save Settings
          </Button>
        </div>
      </Form>
      {import.meta.env.DEV && (
        <>
          <Separator className='my-2' />
          <Switch
            isSelected={developerMode}
            onChange={handleDeveloperModeChange}
          >
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            <Switch.Content>
              <Label>Developer Mode</Label>
              <Description className='w-md'>
                Enables dev-only tools like Full Context tab and the Dev Menu in
                the action bar
              </Description>
            </Switch.Content>
          </Switch>
        </>
      )}
    </div>
  );
}
