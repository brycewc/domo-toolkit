import { Button, Chip, Dropdown, Label, Tooltip } from '@heroui/react';
import { useEffect, useState } from 'react';

import { useLongPress } from '@/hooks/useLongPress';
import { useStatusBar } from '@/hooks/useStatusBar';
import { buildPfilterUrl, getAllFilters } from '@/services/filters';
import { buildPvariablesUrl, getPageVariables } from '@/services/pageVariables';
import { copyToClipboard } from '@/utils/copyToClipboard';
import IconClipboardCopy from '@icons/clipboard-copy.svg?react';
import IconFunnel from '@icons/funnel.svg?react';
import IconReset from '@icons/reset.svg?react';

import { AnimatedCheck } from '../AnimatedCheck';
import { AnimatedX } from '../AnimatedX';

export function CopyFilteredUrl({ currentContext, isDisabled }) {
  const [isCopied, setIsCopied] = useState(false);
  const [isFailed, setIsFailed] = useState(false);
  const [filterCount, setFilterCount] = useState(0);
  const [variableCount, setVariableCount] = useState(0);
  const { LongPressOverlay, pressProps } = useLongPress();
  const { showStatus } = useStatusBar();

  const typeId = currentContext?.domoObject?.typeId;
  const isSupported = typeId === 'PAGE' || typeId === 'DATA_APP_VIEW' || typeId === 'CARD';

  const longPressDisabled = isDisabled || !isSupported;
  const capturedCount = filterCount + variableCount;

  useEffect(() => {
    let isMounted = true;

    const updateFilterDetection = async () => {
      if (!currentContext?.domoObject?.id || !isSupported) {
        setFilterCount(0);
        setVariableCount(0);
        return;
      }

      try {
        const { allFilters, changedVariables } = await captureFiltersAndVariables(currentContext, typeId);

        if (isMounted) {
          setFilterCount(allFilters.length);
          setVariableCount(Object.keys(changedVariables).length);
        }
      } catch (error) {
        console.warn('[CopyFilteredUrl] Failed to pre-fetch filter count:', error);
      }
    };

    updateFilterDetection();

    return () => {
      isMounted = false;
    };
  }, [currentContext, isSupported, typeId]);

  const handleCopyFilteredUrl = async () => {
    if (!currentContext?.domoObject?.id || !isSupported) return;

    try {
      const { allFilters, changedVariables, filteredUrl } = await captureFiltersAndVariables(currentContext, typeId);
      const changedCount = Object.keys(changedVariables).length;

      setFilterCount(allFilters.length);
      setVariableCount(changedCount);

      const tabTitle = await getTabTitle(currentContext.tabId);
      const linkText = tabTitle || currentContext.domoObject?.metadata?.name?.trim() || filteredUrl;
      await copyUrlAsLink(filteredUrl, linkText);

      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);

      if (allFilters.length === 0 && changedCount === 0) {
        showStatus('No Filters or Variables Active', 'Copied base URL without filters', 'warning', 3000);
      } else {
        showStatus(
          'Success',
          `Captured ${describeCapture(allFilters.length, changedCount)} and copied URL`,
          'success',
          3000
        );
      }
    } catch (_error) {
      showStatus('Error', 'Failed to detect filters', 'danger', 3000);
    }
  };

  const handleAction = (key) => {
    if (key === 'apply') {
      handleApplyFilters();
    } else if (key === 'pfilters') {
      handleCopyPfilters();
    }
  };

  const handleApplyFilters = async () => {
    if (!currentContext?.domoObject?.id || !isSupported) return;

    try {
      const { allFilters, changedVariables, filteredUrl } = await captureFiltersAndVariables(currentContext, typeId);
      const changedCount = Object.keys(changedVariables).length;

      setFilterCount(allFilters.length);
      setVariableCount(changedCount);

      if (allFilters.length === 0 && changedCount === 0) {
        setIsFailed(true);
        setTimeout(() => setIsFailed(false), 2000);
        showStatus('No Filters or Variables Active', 'Nothing to apply', 'danger', 3000);
        return;
      }

      chrome.tabs.update(currentContext.tabId, { url: filteredUrl });

      showStatus(
        'Applying Filters',
        `Reloading this tab with ${describeCapture(allFilters.length, changedCount)}`,
        'success',
        3000
      );
    } catch (_error) {
      showStatus('Error', 'Failed to apply filters', 'danger', 3000);
    }
  };

  const handleCopyPfilters = async () => {
    if (!currentContext?.domoObject?.id || !isSupported) return;

    try {
      const { allFilters, changedVariables, filteredUrl } = await captureFiltersAndVariables(currentContext, typeId);
      const changedCount = Object.keys(changedVariables).length;

      setFilterCount(allFilters.length);
      setVariableCount(changedCount);

      if (allFilters.length === 0 && changedCount === 0) {
        setIsFailed(true);
        setTimeout(() => setIsFailed(false), 2000);
        showStatus('No Filters or Variables Active', 'No params to copy', 'danger', 3000);
        return;
      }

      const urlObj = new URL(filteredUrl);
      await copyToClipboard(urlObj.search, currentContext.tabId);

      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);

      showStatus('Success', `Copied params with ${describeCapture(allFilters.length, changedCount)}`, 'success', 3000);
    } catch (_error) {
      showStatus('Error', 'Failed to copy filter params', 'danger', 3000);
    }
  };

  return (
    <Dropdown isDisabled={longPressDisabled} trigger='longPress'>
      <Tooltip>
        <Button
          fullWidth
          className='min-w-36 flex-1 whitespace-normal'
          isDisabled={isDisabled || !isSupported}
          variant='tertiary'
          onPress={handleCopyFilteredUrl}
          {...(longPressDisabled ? {} : pressProps)}
        >
          {isFailed ? <AnimatedX /> : isCopied ? <AnimatedCheck /> : <IconFunnel />}
          Copy Filters
          {capturedCount > 0 && (
            <Chip className='h-5 w-5 items-center justify-center rounded-full' color='accent' size='sm' variant='soft'>
              {capturedCount}
            </Chip>
          )}
          <LongPressOverlay />
        </Button>
        <Tooltip.Content className='max-w-60' offset={4}>
          <span>Copy filtered URL (pfilters and pvariables)</span>
          {!longPressDisabled && <span className='italic'>Hold for more options</span>}
        </Tooltip.Content>
      </Tooltip>
      <Dropdown.Popover className='w-fit min-w-70' placement='bottom'>
        <Dropdown.Menu onAction={handleAction}>
          <Dropdown.Item id='apply' textValue='Apply filters here and refresh'>
            <IconReset className='size-4 shrink-0' />
            <Label>Apply filters here and reload</Label>
          </Dropdown.Item>
          <Dropdown.Item id='pfilters' textValue='Copy filter and variable params only'>
            <IconClipboardCopy className='size-4 shrink-0' />
            <Label>Copy filter and variable params only</Label>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

async function captureFiltersAndVariables(currentContext, typeId) {
  const objectId = currentContext.domoObject.id;
  const currentUrl = resolveCurrentUrl(currentContext, typeId, objectId);
  const scope = {
    cardId: typeId === 'CARD' ? objectId : null,
    pageId: typeId === 'CARD' ? null : objectId,
    tabId: currentContext.tabId
  };

  const [{ allFilters }, { changedVariables }] = await Promise.all([getAllFilters(scope), getPageVariables(scope)]);

  const filteredUrl = buildPvariablesUrl(buildPfilterUrl(currentUrl, objectId, allFilters), changedVariables);

  return { allFilters, changedVariables, filteredUrl };
}

async function copyUrlAsLink(url, text) {
  const escapeHtml = (value) =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const html = `<a href="${escapeHtml(url)}">${escapeHtml(text)}</a>`;
  const item = new ClipboardItem({
    'text/html': new Blob([html], { type: 'text/html' }),
    'text/plain': new Blob([url], { type: 'text/plain' })
  });
  await navigator.clipboard.write([item]);
}

function describeCapture(filterCount, variableCount) {
  const parts = [];
  if (filterCount > 0) {
    parts.push(`${filterCount} filter${filterCount !== 1 ? 's' : ''}`);
  }
  if (variableCount > 0) {
    parts.push(`${variableCount} variable${variableCount !== 1 ? 's' : ''}`);
  }
  return parts.join(' and ');
}

async function getTabTitle(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    return tab?.title?.trim() || null;
  } catch {
    return null;
  }
}

function resolveCurrentUrl(currentContext, typeId, objectId) {
  if (typeId === 'CARD' && currentContext.url.includes('page/') && !currentContext.url.includes('kpis')) {
    return currentContext.url + '/kpis/details/' + objectId;
  }
  if (currentContext.url.includes('app-studio')) {
    return currentContext.domoObject.url;
  }
  return currentContext.url;
}
