import { useState, useEffect } from 'react';
import {
  Button,
  ComboBox,
  Description,
  Form,
  Input,
  Label,
  ListBox,
  Select
} from '@heroui/react';
import { StatusBar } from '@/components';
import { EXCLUDED_INSTANCES } from '@/utils';

export function AppSettings({ theme = 'system' }) {
  // Store all settings in a single state object for extensibility
  const [settings, setSettings] = useState({
    themePreference: theme,
    defaultDomoInstance: ''
  });

  // Track original settings to detect changes
  const [originalSettings, setOriginalSettings] = useState({
    themePreference: theme,
    defaultDomoInstance: ''
  });

  // Track visited Domo instances for the ComboBox
  const [visitedInstances, setVisitedInstances] = useState([]);

  const [isClearing, setIsClearing] = useState(false);

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
      ['themePreference', 'defaultDomoInstance', 'visitedDomoInstances'],
      (result) => {
        const loadedSettings = {
          themePreference: result.themePreference || theme || 'system',
          defaultDomoInstance: result.defaultDomoInstance || ''
        };
        setSettings(loadedSettings);
        setOriginalSettings(loadedSettings);
        setVisitedInstances(result.visitedDomoInstances || []);
      }
    );

    // Listen for storage changes
    const handleStorageChange = (changes, areaName) => {
      if (areaName === 'sync') {
        const updatedSettings = { ...settings };
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

        if (changes.visitedDomoInstances) {
          setVisitedInstances(changes.visitedDomoInstances.newValue || []);
        }

        if (hasChanges) {
          setSettings(updatedSettings);
          setOriginalSettings(updatedSettings);
        }
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

  const handleClearInstances = async () => {
    setIsClearing(true);

    try {
      // Clear visited instances from storage
      await chrome.storage.sync.set({ visitedDomoInstances: [] });

      // Update local state
      setVisitedInstances([]);

      // Also clear the default instance if it was one of the visited instances
      if (visitedInstances.includes(settings.defaultDomoInstance)) {
        const clearedSettings = {
          ...settings,
          defaultDomoInstance: ''
        };
        setSettings(clearedSettings);
        setOriginalSettings(clearedSettings);
        await chrome.storage.sync.set({ defaultDomoInstance: '' });
      }

      showStatus('All visited instances cleared successfully!', '', 'success');
    } catch (error) {
      showStatus('Error', 'Failed to clear visited instances.', 'danger');
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className='flex flex-col gap-2 pt-4'>
      <Form onSubmit={handleSubmit} className='flex flex-col gap-2'>
        <Select
          value={settings.themePreference}
          onChange={handleThemeChange}
          className='w-[10rem]'
          placeholder={theme}
        >
          <Label>Theme</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
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
        <ComboBox
          allowsCustomValue
          inputValue={settings.defaultDomoInstance}
          onInputChange={handleDefaultInstanceChange}
          className='w-[28rem]'
        >
          <Label>Default Domo Instance</Label>
          <ComboBox.InputGroup>
            <Input placeholder='Search or enter instance (e.g., company for company.domo.com)' />
            <ComboBox.Trigger />
          </ComboBox.InputGroup>
          <ComboBox.Popover>
            <ListBox>
              {visitedInstances.filter(
                (instance) => !EXCLUDED_INSTANCES.includes(instance)
              ).length === 0 ? (
                <ListBox.Item
                  id='_no_instances'
                  textValue='No instances visited yet'
                >
                  No instances visited yet
                </ListBox.Item>
              ) : (
                visitedInstances
                  .filter((instance) => !EXCLUDED_INSTANCES.includes(instance))
                  .map((instance) => (
                    <ListBox.Item
                      key={instance}
                      id={instance}
                      textValue={instance}
                    >
                      {instance}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))
              )}
            </ListBox>
          </ComboBox.Popover>
          <Description>
            Select a previously visited instance or enter a custom one. This
            will be used when navigating to copied objects from non-Domo
            websites.
          </Description>
        </ComboBox>
        <Button type='submit' variant='primary' isDisabled={!hasChanges}>
          Save Settings
        </Button>
      </Form>
      <Button
        variant='danger'
        onPress={handleClearInstances}
        isPending={isClearing}
        isDisabled={visitedInstances.length === 0}
      >
        {isClearing ? 'Clearing...' : 'Clear All Visited Instances'}
      </Button>
      <div className='min-h-[5rem]'>
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
    </div>
  );
}
