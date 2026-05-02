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

import { usePerInstanceSettings } from '@/hooks';

const DEFAULT_SETTINGS = {
  defaultClearCookiesHandling: 'auto',
  defaultDomoInstance: '',
  themePreference: 'system'
};

export function Settings() {
  const [developerMode, setDeveloperMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const {
    clear: clearPerInstance,
    settings: perInstanceSettings,
    update: updatePerInstance
  } = usePerInstanceSettings();

  // Store all settings in a single state object for extensibility
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  // Track original settings to detect changes
  const [originalSettings, setOriginalSettings] = useState(DEFAULT_SETTINGS);

  useEffect(() => {
    // Load all settings from storage
    chrome.storage.sync.get(
      [
        'themePreference',
        'defaultDomoInstance',
        'defaultClearCookiesHandling'
      ],
      (result) => {
        const loadedSettings = {
          defaultClearCookiesHandling:
            result.defaultClearCookiesHandling ||
            DEFAULT_SETTINGS.defaultClearCookiesHandling,
          defaultDomoInstance:
            result.defaultDomoInstance || DEFAULT_SETTINGS.defaultDomoInstance,
          themePreference:
            result.themePreference || DEFAULT_SETTINGS.themePreference
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

      <Separator className='my-2' />
      <div className='flex w-md flex-col gap-2'>
        <Label>Per-Instance Settings</Label>
        <Description className='w-md'>
          Stored locally on this device, populated automatically when you use features
          like the DomoStats Activity Log source. Manage or clear them here.
        </Description>
        {Object.keys(perInstanceSettings).length === 0 ? (
          <p className='text-sm text-muted'>No instance settings stored yet.</p>
        ) : (
          Object.entries(perInstanceSettings)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([instance, instanceSettings]) => (
              <div
                className='flex flex-col gap-2 rounded-lg border border-border p-2'
                key={instance}
              >
                <div className='flex items-center justify-between gap-2'>
                  <span className='truncate font-semibold' title={`${instance}.domo.com`}>
                    {instance}.domo.com
                  </span>
                  <Button
                    size='sm'
                    variant='ghost'
                    onPress={() => clearPerInstance(instance)}
                  >
                    Clear
                  </Button>
                </div>
                {instanceSettings.activityLogDatasetId && (
                  <div className='flex flex-col gap-1 pl-1'>
                    <span className='text-xs text-muted'>Activity Log Dataset ID</span>
                    <code className='truncate text-xs' title={instanceSettings.activityLogDatasetId}>
                      {instanceSettings.activityLogDatasetId}
                    </code>
                    <Switch
                      isSelected={!!instanceSettings.preferActivityLogDataset}
                      onChange={(v) =>
                        updatePerInstance(instance, 'preferActivityLogDataset', v)
                      }
                    >
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                      <Switch.Content>
                        <Label>Always use DomoStats Activity Log dataset</Label>
                        <Description className='w-md'>
                          When enabled, the Activity Log opens in DomoStats mode by default
                          for this instance.
                        </Description>
                      </Switch.Content>
                    </Switch>
                  </div>
                )}
              </div>
            ))
        )}
      </div>

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
                Enables dev-only tools like full context tab and the dev action
                in the action bar
              </Description>
            </Switch.Content>
          </Switch>
        </>
      )}
    </div>
  );
}
