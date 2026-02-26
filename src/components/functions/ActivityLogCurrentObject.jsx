import { Button, Description, Dropdown, Label, Tooltip } from '@heroui/react';
import {
  IconChartBar,
  IconCopy,
  IconFileDescription
} from '@tabler/icons-react';
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';

import { getCardsForObject, getPagesForCards } from '@/services';
import { waitForChildPages } from '@/utils';

const LONG_PRESS_DURATION = 1000; // ms - matches HeroUI's default
const LONG_PRESS_SECONDS = LONG_PRESS_DURATION / 1000;

export function ActivityLogCurrentObject({ currentContext, onStatusUpdate }) {
  const [isLoading, setIsLoading] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const holdTimeoutRef = useRef(null);

  const isDisabled = !currentContext?.domoObject?.id || isLoading;
  const longPressEnabled =
    !isDisabled &&
    ['DATA_APP_VIEW', 'DATA_SOURCE', 'PAGE'].includes(
      currentContext?.domoObject?.typeId
    );

  const handlePressStart = () => {
    if (!longPressEnabled) return;
    setIsHolding(true);
    // Clear holding state after long press duration (dropdown will open)
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

  const handleClick = async (key = null) => {
    if (
      !currentContext?.domoObject ||
      !currentContext?.domoObject.id ||
      !currentContext?.domoObject.objectType
    ) {
      onStatusUpdate?.(
        'No Object Detected',
        'Navigate to a Domo object page to use this feature',
        'warning'
      );
      return;
    }

    // console.log(currentContext);

    setIsLoading(true);

    let activityLogObjects;
    let activityLogType;
    let message;
    const objectName =
      currentContext?.domoObject.metadata?.name ??
      `${currentContext?.domoObject.typeName} ${currentContext?.domoObject.id}`;

    try {
      switch (key) {
        case 'child-cards': {
          const cards = await getCardsForObject({
            objectId: currentContext?.domoObject.id,
            objectType: currentContext?.domoObject.typeId
          });

          if (!cards || cards.length === 0) {
            onStatusUpdate?.(
              'No Cards Found',
              `No cards found on ${objectName}`,
              'warning'
            );
            setIsLoading(false);
            return;
          }

          const cardObjects = cards.map((card) => ({
            id: String(card.id),
            type: 'CARD'
          }));

          activityLogObjects = cardObjects;
          activityLogType = 'child-cards';
          message = `Navigating to activity log for ${cards.length} cards on ${objectName}`;
          break;
        }
        case 'child-pages':
          activityLogType = 'child-pages';
          // Handle differently based on object type
          if (currentContext?.domoObject.typeId === 'DATA_SOURCE') {
            // For datasets: Get all cards, then get all pages those cards appear on
            const cards = await getCardsForObject({
              objectId: currentContext?.domoObject.id,
              objectType: currentContext?.domoObject.typeId,
              tabId: currentContext?.tabId
            });

            if (!cards || cards.length === 0) {
              onStatusUpdate?.(
                'No Cards Found',
                `No cards found on ${objectName}`,
                'warning'
              );
              return;
            }

            // Then get all pages that those cards appear on
            const { pages } = await getPagesForCards(
              cards.map((card) => card.id),
              currentContext?.tabId
            );

            if (pages.length === 0) {
              onStatusUpdate?.(
                `No Pages Found on ${currentContext?.domoObject?.typeName}`,
                `Cards on ${objectName} are not used on any pages`,
                'warning'
              );
              setIsLoading(false);
              return;
            }

            activityLogObjects = pages;

            message = `Navigating to activity log for ${pages.length} pages containing cards from ${objectName}`;
          } else if (
            currentContext?.domoObject.typeId === 'PAGE' ||
            currentContext?.domoObject.typeId === 'DATA_APP_VIEW'
          ) {
            // For pages: Use cached childPages from context or wait for them to load
            const result = await waitForChildPages(currentContext);

            if (!result.success) {
              onStatusUpdate?.('Error', result.error, 'danger');
              setIsLoading(false);
              return;
            }

            const childPages = result.childPages;

            if (!childPages || childPages.length === 0) {
              onStatusUpdate?.(
                'No Child Pages Found',
                `No child pages found for ${currentContext?.domoObject.typeName} ${currentContext?.domoObject.id}`,
                'warning'
              );
              setIsLoading(false);
              return;
            }

            const childPageObjects = childPages.map((p) => ({
              id: String(p.pageId),
              type: currentContext?.domoObject.typeId
            }));

            activityLogObjects = childPageObjects;

            message = `Navigating to activity log for ${childPageObjects.length} child pages`;
          }
          break;
        default:
          activityLogObjects = [
            {
              id: currentContext?.domoObject.id,
              name: currentContext?.domoObject.metadata?.name || '',
              type: currentContext?.domoObject.typeId
            }
          ];
          activityLogType = 'single-object';
          message = `Navigating to activity log for ${currentContext?.domoObject.typeName} ${currentContext?.domoObject.id}`;
          break;
      }

      await chrome.storage.session.set({
        activityLogInstance: currentContext?.instance,
        activityLogObjects: activityLogObjects,
        activityLogTabId: currentContext?.tabId,
        activityLogType: activityLogType
      });

      onStatusUpdate?.('Opening Activity Log', message, 'success');

      // Open the options page with the activity log tab
      const optionsUrl = chrome.runtime.getURL(
        'src/options/index.html#activity-log'
      );

      window.open(optionsUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('Error opening activity log:', err);
      onStatusUpdate?.(
        'Error',
        `Failed to open activity log: ${err.message}`,
        'danger'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dropdown isDisabled={!longPressEnabled} trigger='longPress'>
      <Tooltip closeDelay={0} delay={400}>
        <Button
          fullWidth
          isIconOnly
          isDisabled={isDisabled}
          isPending={isLoading}
          variant='tertiary'
          onPress={() => handleClick()}
          onPressEnd={longPressEnabled ? handlePressEnd : undefined}
          onPressStart={longPressEnabled ? handlePressStart : undefined}
        >
          <IconFileDescription stroke={1.5} />
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
          <span>Activity Log</span>
          {longPressEnabled && (
            <span className='italic'>Hold for more options</span>
          )}
        </Tooltip.Content>
      </Tooltip>
      <Dropdown.Popover className='w-full max-w-80' placement='bottom'>
        <Dropdown.Menu onAction={handleClick}>
          <Dropdown.Item id='child-cards' textValue='Child cards'>
            <div className='flex h-8 items-start justify-center pt-px'>
              <IconChartBar className='size-4 shrink-0' stroke={1.5} />
            </div>
            <div className='flex flex-col'>
              <Label>Child cards</Label>
              <Description className='text-xs'>
                View activity log for all cards on this{' '}
                {currentContext?.domoObject?.typeName?.toLowerCase() ||
                  'object'}
              </Description>
            </div>
          </Dropdown.Item>
          <Dropdown.Item id='child-pages' textValue='Child pages'>
            <div className='flex h-8 items-start justify-center pt-px'>
              <IconCopy className='size-4 shrink-0' stroke={1.5} />
            </div>
            <div className='flex flex-col'>
              <Label>Child pages</Label>
              <Description className='text-xs'>
                View activity log for all pages containing cards from this{' '}
                {currentContext?.domoObject?.typeName?.toLowerCase() ||
                  'object'}
              </Description>
            </div>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
