import { useState, useEffect } from 'react';
import {
  Button,
  ComboBox,
  Description,
  Form,
  Input,
  Label,
  ListBox,
  Select,
  TextField
} from '@heroui/react';
import { StatusBar } from './../StatusBar';
import { AnimatedCheck } from './../AnimatedCheck';
import { IconChevronDown, IconDeviceFloppy } from '@tabler/icons-react';

export function AppSettings({ theme = 'system' }) {
  const [isLoading, setIsLoading] = useState(true);

  // Store all settings in a single state object for extensibility
  const [settings, setSettings] = useState({
    themePreference: theme,
    defaultDomoInstance: '',
    defaultClearCookiesHandling: 'default'
  });

  // Track original settings to detect changes
  const [originalSettings, setOriginalSettings] = useState({
    themePreference: theme,
    defaultDomoInstance: '',
    defaultClearCookiesHandling: 'default'
  });

  const [statusBar, setStatusBar] = useState({
    title: '',
    description: '',
    status: 'accent',
    timeout: 3000,
    visible: false
  });

  useEffect(() => {
    // Load all settings from storage
    chrome.storage.sync.get(
      ['themePreference', 'defaultDomoInstance', 'defaultClearCookiesHandling'],
      (result) => {
        const loadedSettings = {
          themePreference: result.themePreference || theme || 'system',
          defaultDomoInstance: result.defaultDomoInstance || '',
          defaultClearCookiesHandling:
            result.defaultClearCookiesHandling || 'default'
        };
        setSettings(loadedSettings);
        setOriginalSettings(loadedSettings);
        setIsLoading(false);
      }
    );

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

  // Check if settings have changed
  const hasChanges =
    JSON.stringify(settings) !== JSON.stringify(originalSettings);

  const showStatus = (
    title,
    description,
    status = 'accent',
    timeout = 3000
  ) => {
    setStatusBar({ title, description, status, timeout, visible: true });
  };

  const hideStatus = () => {
    setStatusBar((prev) => ({ ...prev, visible: false }));
  };

  if (isLoading) {
    return null;
  }

  return (
    <div className='flex h-full min-h-[calc(100vh-20)] w-md flex-col gap-2 pt-4'>
      <Form onSubmit={handleSubmit} className='flex flex-col gap-2'>
        <Select
          value={settings.themePreference}
          onChange={handleThemeChange}
          className='w-40'
          placeholder={theme}
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
                <ListBox.ItemIndicator />
              </ListBox.Item>
              <ListBox.Item id='light' textValue='Light'>
                Light
                <ListBox.ItemIndicator />
              </ListBox.Item>
              <ListBox.Item id='dark' textValue='Dark'>
                Dark
                <ListBox.ItemIndicator />
              </ListBox.Item>
            </ListBox>
          </Select.Popover>
        </Select>
        <TextField onChange={handleDefaultInstanceChange} className='w-40'>
          <Label>Default Domo Instance</Label>
          <Input
            placeholder='Enter an instance'
            value={settings.defaultDomoInstance}
          />
          <Description className='w-md'>
            This is used when navigating to copied objects from non-Domo
            websites. Enter without .domo.com (e.g., company for
            company.domo.com).
          </Description>
        </TextField>
        <Select
          value={settings.defaultClearCookiesHandling}
          onChange={handleClearCookiesHandlingChange}
          className='w-40'
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
              <ListBox.Item id='default' textValue='Default'>
                Default
                <ListBox.ItemIndicator />
              </ListBox.Item>
              <ListBox.Item id='all' textValue='All'>
                All
                <ListBox.ItemIndicator />
              </ListBox.Item>
              <ListBox.Item id='auto' textValue='Auto'>
                Auto
                <ListBox.ItemIndicator />
              </ListBox.Item>
            </ListBox>
          </Select.Popover>
          <Description className='w-lg'>
            <p>
              Default: Preserve last 2 instances (only manual, no
              auto-clearing).
            </p>
            <p>All: Clear all Domo cookies (only manual, no auto-clearing).</p>
            <p>Auto: Clear cookies on 431 errors, preserve last 2 instances.</p>
          </Description>
        </Select>
        <div className='pt-1'>
          <Button type='submit' variant='primary' isDisabled={!hasChanges}>
            <IconDeviceFloppy />
            Save Settings
          </Button>
        </div>
      </Form>
      {statusBar.visible && (
        <StatusBar
          title={statusBar.title}
          description={statusBar.description}
          status={statusBar.status}
          timeout={statusBar.timeout}
          onClose={hideStatus}
        />
      )}
    </div>
  );
}
