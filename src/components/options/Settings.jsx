import { Button, Description, Form, Input, Label, ListBox, Select, Separator, Switch, TextField } from '@heroui/react';
import { toast } from '@heroui/react';
import { useEffect, useState } from 'react';

import { usePerInstanceSettings } from '@/hooks/usePerInstanceSettings';
import IconCheck from '@icons/check.svg?react';
import IconChevronDown from '@icons/chevron-down.svg?react';
import IconSave from '@icons/save.svg?react';

const DEFAULT_SETTINGS = {
  autoClearCookiesOn431: true,
  clearCookiesButtonBehavior: 'preserve',
  defaultDomoInstance: '',
  iconColor: 'blue',
  removeDomoTitleSuffix: false,
  showClearCookiesButton: false,
  themePreference: 'system'
};

const TRACKED_KEYS = Object.keys(DEFAULT_SETTINGS);

export function Settings() {
  const [developerMode, setDeveloperMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { clear: clearPerInstance, settings: perInstanceSettings, update: updatePerInstance } = usePerInstanceSettings();

  // Store all settings in a single state object for extensibility
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  // Track original settings to detect changes
  const [originalSettings, setOriginalSettings] = useState(DEFAULT_SETTINGS);

  useEffect(() => {
    // Load all settings from storage
    chrome.storage.sync.get(TRACKED_KEYS, (result) => {
      const loadedSettings = { ...DEFAULT_SETTINGS };
      for (const key of TRACKED_KEYS) {
        if (result[key] !== undefined) loadedSettings[key] = result[key];
      }
      setSettings(loadedSettings);
      setOriginalSettings(loadedSettings);
      setIsLoading(false);
    });

    if (import.meta.env.DEV) {
      chrome.storage.local.get(['developerMode'], (result) => {
        setDeveloperMode(result.developerMode ?? false);
      });
    }

    // Listen for storage changes (e.g., from other tabs or extension pages)
    const handleStorageChange = (changes, areaName) => {
      if (areaName !== 'sync') return;

      const applyChanges = (prev) => {
        let hasChanges = false;
        const updated = { ...prev };
        for (const key of TRACKED_KEYS) {
          if (changes[key] !== undefined) {
            updated[key] = changes[key].newValue ?? DEFAULT_SETTINGS[key];
            hasChanges = true;
          }
        }
        return hasChanges ? updated : prev;
      };

      setSettings(applyChanges);
      setOriginalSettings(applyChanges);
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

  const handleIconColorChange = (value) => {
    setSettings((prev) => ({
      ...prev,
      iconColor: value
    }));
  };

  const handleRemoveDomoSuffixChange = (value) => {
    setSettings((prev) => ({
      ...prev,
      removeDomoTitleSuffix: value
    }));
  };

  const handleDefaultInstanceChange = (value) => {
    setSettings((prev) => ({
      ...prev,
      defaultDomoInstance: value
    }));
  };

  const handleAutoClearChange = (value) => {
    setSettings((prev) => ({
      ...prev,
      autoClearCookiesOn431: value
    }));
  };

  const handleShowButtonChange = (value) => {
    setSettings((prev) => ({
      ...prev,
      showClearCookiesButton: value
    }));
  };

  const handleButtonBehaviorChange = (value) => {
    setSettings((prev) => ({
      ...prev,
      clearCookiesButtonBehavior: value
    }));
  };

  const handleDeveloperModeChange = (isSelected) => {
    setDeveloperMode(isSelected);
    chrome.storage.local.set({ developerMode: isSelected });
  };

  // Check if settings have changed
  const hasChanges = JSON.stringify(settings) !== JSON.stringify(originalSettings);

  const showStatus = (title, description, status = 'accent', timeout = 3000) => {
    toast(title, { description, timeout: timeout || 0, variant: status });
  };

  if (isLoading) {
    return null;
  }

  return (
    <div className='flex h-full min-h-[calc(100vh-10)] w-xl flex-col gap-2 py-4'>
      <Form className='flex flex-col gap-2' onSubmit={handleSubmit}>
        <Select className='w-50' placeholder='System' value={settings.themePreference} onChange={handleThemeChange}>
          <Label>Theme</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator>
              <IconChevronDown />
            </Select.Indicator>
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item id='system' textValue='System'>
                System
                <ListBox.ItemIndicator>{({ isSelected }) => (isSelected ? <IconCheck /> : null)}</ListBox.ItemIndicator>
              </ListBox.Item>
              <ListBox.Item id='light' textValue='Light'>
                Light
                <ListBox.ItemIndicator>{({ isSelected }) => (isSelected ? <IconCheck /> : null)}</ListBox.ItemIndicator>
              </ListBox.Item>
              <ListBox.Item id='dark' textValue='Dark'>
                Dark
                <ListBox.ItemIndicator>{({ isSelected }) => (isSelected ? <IconCheck /> : null)}</ListBox.ItemIndicator>
              </ListBox.Item>
            </ListBox>
          </Select.Popover>
          <Description className='w-lg'>
            System, light, or dark theme (applies to popup, side panel, and options pages)
          </Description>
        </Select>
        <Select className='w-50' value={settings.iconColor} onChange={handleIconColorChange}>
          <Label>Extension Icon</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator>
              <IconChevronDown />
            </Select.Indicator>
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item id='blue' textValue='Domo Blue'>
                <span className='flex flex-row items-center gap-2'>
                  <img alt='' className='h-4 w-4' src='/toolkit-16.png' />
                  Domo Blue
                </span>
                <ListBox.ItemIndicator>{({ isSelected }) => (isSelected ? <IconCheck /> : null)}</ListBox.ItemIndicator>
              </ListBox.Item>
              <ListBox.Item id='black' textValue='Black'>
                <span className='flex flex-row items-center gap-2'>
                  <img alt='' className='h-4 w-4' src='/toolkit-black-16.png' />
                  Black
                </span>
                <ListBox.ItemIndicator>{({ isSelected }) => (isSelected ? <IconCheck /> : null)}</ListBox.ItemIndicator>
              </ListBox.Item>
              <ListBox.Item id='white' textValue='White'>
                <span className='flex flex-row items-center gap-2'>
                  <img alt='' className='h-4 w-4' src='/toolkit-white-16.png' />
                  White
                </span>
                <ListBox.ItemIndicator>{({ isSelected }) => (isSelected ? <IconCheck /> : null)}</ListBox.ItemIndicator>
              </ListBox.Item>
            </ListBox>
          </Select.Popover>
          <Description className='w-lg'>
            Choose the toolbar icon color. Useful when a custom browser theme makes the default hard to see.
          </Description>
        </Select>
        <TextField className='w-50' onChange={handleDefaultInstanceChange}>
          <Label>Default Domo Instance</Label>
          <Input placeholder='Enter an instance' value={settings.defaultDomoInstance} />
          <Description className='w-lg'>
            This is used when navigating to copied objects from non-Domo websites. Enter without .domo.com (e.g., company for
            company.domo.com)
          </Description>
        </TextField>
        <Switch isSelected={settings.removeDomoTitleSuffix} onChange={handleRemoveDomoSuffixChange}>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <Switch.Content>
            <Label>{'Remove " - Domo" from tab titles'}</Label>
            <Description className='w-lg'>
              When the extension renames a Domo tab to the object name, it leaves off the {'" - Domo"'} suffix. This also
              changes the title used as link text when copying a filtered URL.
            </Description>
          </Switch.Content>
        </Switch>
        <Separator className='my-2' />
        <Switch isSelected={settings.autoClearCookiesOn431} onChange={handleAutoClearChange}>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <Switch.Content>
            <Label>Auto-clear cookies on 431 errors</Label>
            <Description className='w-lg'>
              When a Domo page returns HTTP 431, automatically clear cookies and preserve the last 2 instances.
            </Description>
          </Switch.Content>
        </Switch>
        <Switch isSelected={settings.showClearCookiesButton} onChange={handleShowButtonChange}>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <Switch.Content>
            <Label>Show clear cookies button</Label>
            <Description className='w-lg'>
              Adds a manual clear-cookies button to the popup action bar. Useful as a fallback when auto-clearing fails or
              when you want to clear cookies without a 431 error.
            </Description>
          </Switch.Content>
        </Switch>
        <Select
          className='w-50'
          isDisabled={!settings.showClearCookiesButton}
          value={settings.clearCookiesButtonBehavior}
          onChange={handleButtonBehaviorChange}
        >
          <Label>Clear cookies button behavior</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator>
              <IconChevronDown />
            </Select.Indicator>
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item id='preserve' textValue='Preserve last 2 instances'>
                Preserve last 2 instances
                <ListBox.ItemIndicator>{({ isSelected }) => (isSelected ? <IconCheck /> : null)}</ListBox.ItemIndicator>
              </ListBox.Item>
              <ListBox.Item id='all' textValue='Clear all Domo cookies'>
                Clear all Domo cookies
                <ListBox.ItemIndicator>{({ isSelected }) => (isSelected ? <IconCheck /> : null)}</ListBox.ItemIndicator>
              </ListBox.Item>
            </ListBox>
          </Select.Popover>
          <Description className='w-lg'>
            What the button does on click. Preserve keeps the DA-SID cookies for your two most-recently-used instances; All
            wipes every Domo cookie.
          </Description>
        </Select>
        <div className='pt-1'>
          <Button isDisabled={!hasChanges} type='submit' variant='primary'>
            <IconSave />
            Save Settings
          </Button>
        </div>
      </Form>

      <Separator className='my-2' />
      <div className='flex w-lg flex-col gap-2'>
        <Label>Per-Instance Settings</Label>
        <Description className='w-lg'>
          Stored locally on this device, populated automatically when you use features like the DomoStats Activity Log
          source. Manage or clear them here.
        </Description>
        {Object.keys(perInstanceSettings).length === 0 ? (
          <p className='text-sm text-muted'>No instance settings stored yet.</p>
        ) : (
          Object.entries(perInstanceSettings)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([instance, instanceSettings]) => (
              <div className='flex flex-col gap-2 rounded-lg border border-border p-2' key={instance}>
                <div className='flex items-center justify-between gap-2'>
                  <span className='truncate font-semibold' title={`${instance}.domo.com`}>
                    {instance}.domo.com
                  </span>
                  <Button size='sm' variant='ghost' onPress={() => clearPerInstance(instance)}>
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
                      onChange={(v) => updatePerInstance(instance, 'preferActivityLogDataset', v)}
                    >
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                      <Switch.Content>
                        <Label>Always use DomoStats Activity Log dataset</Label>
                        <Description>
                          When enabled, the Activity Log opens in DomoStats mode by default for this instance.
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
        <div className='pb-4'>
          <Separator className='my-2' />
          <Switch isSelected={developerMode} onChange={handleDeveloperModeChange}>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            <Switch.Content>
              <Label>Developer Mode</Label>
              <Description className='w-xl'>
                Enables dev-only tools like full context tab and the dev action in the action bar
              </Description>
            </Switch.Content>
          </Switch>
        </div>
      )}
    </div>
  );
}
