import { Button, Chip, Dropdown, Label, Tooltip } from '@heroui/react';
import { IconClipboard, IconFilterShare } from '@tabler/icons-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import { AnimatedCheck, AnimatedX } from '@/components';
import { useStatusBar } from '@/hooks';
import { buildPfilterUrl, getAllFilters } from '@/services';

const LONG_PRESS_DURATION = 1000;
const LONG_PRESS_SECONDS = LONG_PRESS_DURATION / 1000;

export function CopyFilteredUrl({ currentContext, isDisabled }) {
  const [isCopied, setIsCopied] = useState(false);
  const [isFailed, setIsFailed] = useState(false);
  const [filterCount, setFilterCount] = useState(0);
  const [heldFilters, setHeldFilters] = useState([]);
  const [hasNewFilters, setHasNewFilters] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const holdTimeoutRef = useRef(null);
  const { showStatus } = useStatusBar();

  const typeId = currentContext?.domoObject?.typeId;
  const isSupported =
    typeId === 'PAGE' || typeId === 'DATA_APP_VIEW' || typeId === 'CARD';

  const longPressDisabled = isDisabled || !isSupported;

  useEffect(() => {
    let isMounted = true;

    const updateFilterDetection = async () => {
      if (!currentContext?.domoObject?.id || !isSupported) {
        setFilterCount(0);
        setHasNewFilters(false);
        return;
      }

      try {
        const { allFilters } = await getAllFilters({
          pageId: typeId === 'CARD' ? null : currentContext.domoObject.id,
          tabId: currentContext.tabId,
          url: currentContext.url
        });

        if (isMounted) {
          setFilterCount(allFilters.length);

          if (heldFilters.length !== allFilters.length) {
            setHasNewFilters(heldFilters.length > 0 && allFilters.length > 0);
          } else if (allFilters.length > 0) {
            const heldStr = JSON.stringify(
              [...heldFilters].sort((a, b) => a.column.localeCompare(b.column))
            );
            const detectedStr = JSON.stringify(
              [...allFilters].sort((a, b) => a.column.localeCompare(b.column))
            );
            setHasNewFilters(heldStr !== detectedStr);
          } else {
            setHasNewFilters(false);
          }
        }
      } catch (error) {
        console.warn(
          '[CopyFilteredUrl] Failed to pre-fetch filter count:',
          error
        );
      }
    };

    updateFilterDetection();

    return () => {
      isMounted = false;
    };
  }, [currentContext, isSupported, typeId, heldFilters]);

  const handlePressStart = () => {
    setIsHolding(true);
    holdTimeoutRef.current = setTimeout(() => {
      setIsHolding(false);
    }, LONG_PRESS_DURATION);
  };

  const handlePressEnd = () => {
    setIsHolding(false);
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
  };

  const handleCopyFilteredUrl = async () => {
    if (!currentContext?.domoObject?.id || !isSupported) return;

    try {
      const objectId = currentContext.domoObject.id;
      const currentUrl = resolveCurrentUrl(currentContext, typeId, objectId);

      const { allFilters } = await getAllFilters({
        pageId: typeId === 'CARD' ? null : objectId,
        tabId: currentContext.tabId,
        url: currentUrl
      });

      setHeldFilters(allFilters);
      setFilterCount(allFilters.length);
      setHasNewFilters(false);

      const filteredUrl = buildPfilterUrl(currentUrl, objectId, allFilters);
      await navigator.clipboard.writeText(filteredUrl);

      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);

      if (allFilters.length === 0) {
        showStatus(
          'No Filters Active',
          'Copied base URL without filters',
          'warning',
          3000
        );
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
        tabId: currentContext.tabId,
        url: currentUrl
      });

      setHeldFilters(allFilters);
      setFilterCount(allFilters.length);
      setHasNewFilters(false);

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
      <Tooltip closeDelay={0} delay={400}>
        <Button
          fullWidth
          className={`min-w-36 flex-1 whitespace-normal ${hasNewFilters ? 'animate-pulse' : ''}`}
          isDisabled={isDisabled || !isSupported}
          variant='tertiary'
          onPress={handleCopyFilteredUrl}
          onPressEnd={longPressDisabled ? undefined : handlePressEnd}
          onPressStart={longPressDisabled ? undefined : handlePressStart}
        >
          {isFailed ? (
            <AnimatedX />
          ) : isCopied ? (
            <AnimatedCheck />
          ) : (
            <IconFilterShare stroke={1.5} />
          )}
          Copy Filtered URL
          {filterCount > 0 && (
            <Chip
              className='absolute top-1 right-1 h-5 min-w-5 justify-center rounded-3xl'
              color='accent'
              size='sm'
              variant='soft'
            >
              {filterCount}
            </Chip>
          )}
          <AnimatePresence>
            {isHolding && (
              <motion.div
                animate={{ opacity: 1 }}
                className='pointer-events-none absolute inset-0 overflow-hidden rounded-md'
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                initial={{ opacity: 0 }}
              >
                <motion.div
                  animate={{ scale: 1 }}
                  className='absolute top-1/2 left-1/2 aspect-square w-[200%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-soft-hover'
                  initial={{ scale: 0 }}
                  transition={{ duration: LONG_PRESS_SECONDS, ease: 'linear' }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </Button>
        <Tooltip.Content className='flex flex-col items-center text-center'>
          <span>Copy Filtered URL</span>
          {!longPressDisabled && (
            <span className='italic'>Hold for more options</span>
          )}
        </Tooltip.Content>
      </Tooltip>
      <Dropdown.Popover className='w-fit min-w-48' placement='bottom left'>
        <Dropdown.Menu onAction={handleAction}>
          <Dropdown.Item id='pfilters' textValue='Copy pfilters param only'>
            <IconClipboard className='size-4 shrink-0' />
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
