import {
  Button,
  Description,
  Form,
  Input,
  Label,
  ListBox,
  ScrollShadow,
  Select,
  Separator,
  Switch,
  TextField
} from '@heroui/react';
import { toast } from '@heroui/react';
import { useEffect, useState } from 'react';

import { hasLocalAccess, requestLocalAccess, revokeLocalAccess } from '@/utils/localInstance';
import IconCheck from '@icons/check.svg?react';
import IconChevronDown from '@icons/chevron-down.svg?react';
import IconComputer from '@icons/computer.svg?react';
import IconMoon from '@icons/moon.svg?react';
import IconSave from '@icons/save.svg?react';
import IconSun from '@icons/sun.svg?react';
import IconSync from '@icons/sync.svg?react';

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

export function GeneralSettings() {
  const [isLoading, setIsLoading] = useState(true);

  // Store all settings in a single state object for extensibility
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  // Track original settings to detect changes
  const [originalSettings, setOriginalSettings] = useState(DEFAULT_SETTINGS);

  // Access to locally run Domo instances is a browser permission, not a stored
  // setting, so it lives outside `settings`: it applies the moment it is granted
  // and must not wait for Save (requesting it needs a live user gesture).
  const [hasLocalDevAccess, setHasLocalDevAccess] = useState(false);

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

    // Track the local-instance permission separately, including when it is granted
    // or revoked from Chrome's own extension settings rather than from here.
    hasLocalAccess().then(setHasLocalDevAccess);
    const syncLocalAccess = () => hasLocalAccess().then(setHasLocalDevAccess);
    chrome.permissions.onAdded.addListener(syncLocalAccess);
    chrome.permissions.onRemoved.addListener(syncLocalAccess);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
      chrome.permissions.onAdded.removeListener(syncLocalAccess);
      chrome.permissions.onRemoved.removeListener(syncLocalAccess);
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

  const handleRestoreDefaults = () => {
    setSettings({ ...DEFAULT_SETTINGS });
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

  const handleLocalDevAccessChange = async (value) => {
    if (!value) {
      await revokeLocalAccess();
      setHasLocalDevAccess(false);
      return;
    }

    const granted = await requestLocalAccess();
    setHasLocalDevAccess(granted);
    if (!granted) {
      showStatus('Permission not granted', 'Local Domo instances stay unsupported until you allow access.', 'warning');
    }
  };

  // Check if settings have changed
  const hasChanges = JSON.stringify(settings) !== JSON.stringify(originalSettings);

  // Whether the current form values already match the defaults (nothing to restore)
  const isAtDefaults = JSON.stringify(settings) === JSON.stringify(DEFAULT_SETTINGS);

  // Guard against closing the tab with unsaved settings changes. Browsers ignore
  // any custom message and show their own generic "unsaved changes" confirmation,
  // so calling preventDefault (plus setting returnValue for older engines) is all
  // that's needed to trigger the native Leave/Cancel prompt.
  useEffect(() => {
    if (!hasChanges) {
      return;
    }
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasChanges]);

  const showStatus = (title, description, status = 'accent', timeout = 3000) => {
    toast(title, { description, timeout: timeout || 0, variant: status });
  };

  if (isLoading) {
    return null;
  }

  return (
    <div className='flex h-full min-h-0 w-full flex-col items-center justify-center gap-2 py-4'>
      <Form className='flex min-h-0 w-full flex-1 flex-col items-center gap-2' onSubmit={handleSubmit}>
        <div className='flex w-full shrink-0 flex-row justify-between'>
          <Button isDisabled={!hasChanges} type='submit' variant='primary'>
            <IconSave />
            Save Settings
          </Button>
          <Button isDisabled={isAtDefaults} type='button' variant='secondary' onPress={handleRestoreDefaults}>
            <IconSync />
            Restore Defaults
          </Button>
        </div>
        <ScrollShadow className='min-h-0 flex-1 px-30'>
          <div className='flex w-full flex-col gap-2'>
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
                    <span className='flex flex-row items-center gap-2'>
                      <IconComputer className='h-4 w-4' />
                      System
                    </span>
                    <ListBox.ItemIndicator>{({ isSelected }) => (isSelected ? <IconCheck /> : null)}</ListBox.ItemIndicator>
                  </ListBox.Item>
                  <ListBox.Item id='light' textValue='Light'>
                    <span className='flex flex-row items-center gap-2'>
                      <IconSun className='h-4 w-4' />
                      Light
                    </span>
                    <ListBox.ItemIndicator>{({ isSelected }) => (isSelected ? <IconCheck /> : null)}</ListBox.ItemIndicator>
                  </ListBox.Item>
                  <ListBox.Item id='dark' textValue='Dark'>
                    <span className='flex flex-row items-center gap-2'>
                      <IconMoon className='h-4 w-4' />
                      Dark
                    </span>
                    <ListBox.ItemIndicator>{({ isSelected }) => (isSelected ? <IconCheck /> : null)}</ListBox.ItemIndicator>
                  </ListBox.Item>
                </ListBox>
              </Select.Popover>
              <Description className='w-xl'>
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
                This is used when navigating to copied objects from non-Domo websites. Enter without .domo.com (e.g., company
                for company.domo.com), or a local address with its port (e.g., dev.localhost:9128)
              </Description>
            </TextField>
            <Switch isSelected={settings.removeDomoTitleSuffix} onChange={handleRemoveDomoSuffixChange}>
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                {'Remove " - Domo" from tab titles'}
              </Switch.Content>
              <Description className='w-lg'>
                When the extension renames a Domo tab to the object name, it leaves off the {'" - Domo"'} suffix. This also
                changes the title used as link text when copying a filtered URL.
              </Description>
            </Switch>
            <Separator className='my-2 w-lg' />
            <Switch isSelected={hasLocalDevAccess} onChange={handleLocalDevAccessChange}>
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                Enable on locally run Domo instances
              </Switch.Content>
              <Description className='w-lg'>
                For Domo developers running Domo on their own machine. Turning this on asks the browser for access to
                localhost addresses, then treats a local instance like any other. Applies immediately, no save needed.
              </Description>
            </Switch>
            <Separator className='my-2 w-lg' />
            <Switch isSelected={settings.autoClearCookiesOn431} onChange={handleAutoClearChange}>
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                Auto-clear cookies on 431 errors
              </Switch.Content>
              <Description className='w-lg'>
                When a Domo page returns HTTP 431, automatically clear cookies and preserve the last 2 instances.
              </Description>
            </Switch>
            <Switch isSelected={settings.showClearCookiesButton} onChange={handleShowButtonChange}>
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                Show clear cookies button
              </Switch.Content>
              <Description className='w-lg'>
                Adds a manual clear-cookies button to the popup action bar. Useful as a fallback when auto-clearing fails or
                when you want to clear cookies without a 431 error.
              </Description>
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
                What the button does on click. Preserve keeps the DA-SID cookies for your two most-recently-used instances;
                All wipes every Domo cookie.
              </Description>
            </Select>
          </div>
        </ScrollShadow>
      </Form>
    </div>
  );
}
