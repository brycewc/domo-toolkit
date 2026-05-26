import { Button, Chip, Dropdown, Label, Tooltip } from '@heroui/react';
import { useEffect, useState } from 'react';

import { useLongPress } from '@/hooks/useLongPress';
import { useStatusBar } from '@/hooks/useStatusBar';
import { buildPfilterUrl, getAllFilters } from '@/services/filters';
import IconClipboardCopy from '@icons/clipboard-copy.svg?react';
import IconFunnel from '@icons/funnel.svg?react';

import { AnimatedCheck } from '../AnimatedCheck';
import { AnimatedX } from '../AnimatedX';

export function CopyFilteredUrl({ currentContext, isDisabled }) {
  const [isCopied, setIsCopied] = useState(false);
  const [isFailed, setIsFailed] = useState(false);
  const [filterCount, setFilterCount] = useState(0);
  const { LongPressOverlay, pressProps } = useLongPress();
  const { showStatus } = useStatusBar();

  const typeId = currentContext?.domoObject?.typeId;
  const isSupported = typeId === 'PAGE' || typeId === 'DATA_APP_VIEW' || typeId === 'CARD';

  const longPressDisabled = isDisabled || !isSupported;

  useEffect(() => {
    let isMounted = true;

    const updateFilterDetection = async () => {
      if (!currentContext?.domoObject?.id || !isSupported) {
        setFilterCount(0);
        return;
      }

      try {
        const { allFilters } = await getAllFilters({
          pageId: typeId === 'CARD' ? null : currentContext.domoObject.id,
          tabId: currentContext.tabId
        });

        if (isMounted) {
          setFilterCount(allFilters.length);
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
      const objectId = currentContext.domoObject.id;
      const currentUrl = resolveCurrentUrl(currentContext, typeId, objectId);

      const { allFilters } = await getAllFilters({
        pageId: typeId === 'CARD' ? null : objectId,
        tabId: currentContext.tabId
      });

      setFilterCount(allFilters.length);

      const filteredUrl = buildPfilterUrl(currentUrl, objectId, allFilters);
      await navigator.clipboard.writeText(filteredUrl);

      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);

      if (allFilters.length === 0) {
        showStatus('No Filters Active', 'Copied base URL without filters', 'warning', 3000);
      } else {
        showStatus(
          'Success',
          `Captured ${allFilters.length} filter${allFilters.length !== 1 ? 's' : ''} and copied URL`,
          'success',
          3000
        );
      }
    } catch (_error) {
      showStatus('Error', 'Failed to detect filters', 'danger', 3000);
    }
  };

  const handleAction = async (key) => {
    if (key !== 'pfilters') return;
    if (!currentContext?.domoObject?.id || !isSupported) return;

    try {
      const objectId = currentContext.domoObject.id;
      const currentUrl = resolveCurrentUrl(currentContext, typeId, objectId);

      const { allFilters } = await getAllFilters({
        pageId: typeId === 'CARD' ? null : objectId,
        tabId: currentContext.tabId
      });

      setFilterCount(allFilters.length);

      if (allFilters.length === 0) {
        setIsFailed(true);
        setTimeout(() => setIsFailed(false), 2000);
        showStatus('No Filters Active', 'No pfilters to copy', 'danger', 3000);
        return;
      }

      const filteredUrl = buildPfilterUrl(currentUrl, objectId, allFilters);
      const urlObj = new URL(filteredUrl);
      await navigator.clipboard.writeText(urlObj.search);

      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);

      showStatus(
        'Success',
        `Copied pfilters param with ${allFilters.length} filter${allFilters.length !== 1 ? 's' : ''}`,
        'success',
        3000
      );
    } catch (_error) {
      showStatus('Error', 'Failed to copy filter params', 'danger', 3000);
    }
  };

  return (
    <Dropdown isDisabled={longPressDisabled} trigger='longPress'>
      <Tooltip closeDelay={100} delay={800}>
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
          {filterCount > 0 && (
            <Chip
              className='h-5 w-5 items-center justify-center rounded-full'
              color='accent'
              size='sm'
              variant='soft'
            >
              {filterCount}
            </Chip>
          )}
          <LongPressOverlay />
        </Button>
        <Tooltip.Content
          className='flex max-w-60 flex-col items-center justify-center px-1 py-0.5 text-center text-wrap break-normal'
          offset={4}
        >
          <span>Copy filtered URL (pfilter)</span>
          {!longPressDisabled && <span className='italic'>Hold for more options</span>}
        </Tooltip.Content>
      </Tooltip>
      <Dropdown.Popover className='w-fit min-w-60' placement='bottom'>
        <Dropdown.Menu onAction={handleAction}>
          <Dropdown.Item id='pfilters' textValue='Copy pfilters param only'>
            <IconClipboardCopy className='size-5 shrink-0' />
            <Label>Copy pfilters param only</Label>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

function resolveCurrentUrl(currentContext, typeId, objectId) {
  if (
    typeId === 'CARD' &&
    currentContext.url.includes('page/') &&
    !currentContext.url.includes('kpis')
  ) {
    return currentContext.url + '/kpis/details/' + objectId;
  }
  if (currentContext.url.includes('app-studio')) {
    return currentContext.domoObject.url;
  }
  return currentContext.url;
}
