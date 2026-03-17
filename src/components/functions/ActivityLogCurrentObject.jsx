import { Button, Description, Dropdown, Label, Tooltip } from '@heroui/react';
import {
  IconChartBar,
  IconCopy,
  IconFileDescription,
  IconStack2
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

  const userRights = currentContext?.user?.metadata?.USER_RIGHTS || [];
  const isDisabled = !currentContext?.domoObject?.id || isLoading || !userRights.includes('audit');
  const typeId = currentContext?.domoObject?.typeId;
  const longPressEnabled =
    !isDisabled &&
    ['DATA_APP_VIEW', 'DATA_SOURCE', 'DATAFLOW_TYPE', 'PAGE'].includes(typeId);
  const hasChildPages = ['DATA_APP_VIEW', 'PAGE'].includes(typeId);

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
        case 'card-pages': {
          activityLogType = 'card-pages';
          let pages =
            currentContext?.domoObject?.metadata?.details?.cardPages;

          if (!pages) {
            const cards = await getCardsForObject({
              metadata: currentContext?.domoObject.metadata,
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
              setIsLoading(false);
              return;
            }

            const result = await getPagesForCards(
              cards.map((card) => card.id),
              currentContext?.tabId
            );
            pages = result.pages;
          }

          const validPages = pages.filter((p) => Number(p.id) >= 0);

          if (validPages.length === 0) {
            if (pages.length === 0) {
              onStatusUpdate?.(
                `No Pages Found on ${currentContext?.domoObject?.typeName}`,
                `Cards on ${objectName} are not used on any pages`,
                'warning'
              );
            } else {
              onStatusUpdate?.(
                `No Valid Pages Found on ${currentContext?.domoObject?.typeName}`,
                `Cards on ${objectName} are only used on Overview, Favorites, or Shared pages`,
                'warning'
              );
            }
            setIsLoading(false);
            return;
          }

          activityLogObjects = validPages;
          message = `Navigating to activity log for ${validPages.length} pages containing cards from ${objectName}`;
          break;
        }
        case 'child-cards': {
          const cards = await getCardsForObject({
            metadata: currentContext?.domoObject.metadata,
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
            setIsLoading(false);
            return;
          }

          activityLogObjects = cards.map((card) => ({
            id: String(card.id),
            type: 'CARD'
          }));
          activityLogType = 'child-cards';
          message = `Navigating to activity log for ${cards.length} cards on ${objectName}`;
          break;
        }
        case 'child-pages': {
          activityLogType = 'child-pages';
          const result = await waitForChildPages(currentContext);

          if (!result.success) {
            onStatusUpdate?.('Error', result.error, 'danger');
            setIsLoading(false);
            return;
          }

          const childPages = (result.childPages || []).filter(
            (p) => Number(p.pageId) >= 0
          );

          if (childPages.length === 0) {
            onStatusUpdate?.(
              'No Child Pages Found',
              `No child pages found for ${currentContext?.domoObject.typeName} ${currentContext?.domoObject.id}`,
              'warning'
            );
            setIsLoading(false);
            return;
          }

          activityLogObjects = childPages.map((p) => ({
            id: String(p.pageId),
            type: currentContext?.domoObject.typeId
          }));
          message = `Navigating to activity log for ${activityLogObjects.length} child pages`;
          break;
        }
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

      // Open the options page in the same window (preserves incognito context)
      const tab = await chrome.tabs.get(currentContext.tabId);
      chrome.tabs.create({
        url: chrome.runtime.getURL('src/options/index.html#activity-log'),
        windowId: tab.windowId
      });
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
          {hasChildPages && (
            <Dropdown.Item id='child-pages' textValue='Child pages'>
              <div className='flex h-8 items-start justify-center pt-px'>
                <IconCopy className='size-4 shrink-0' stroke={1.5} />
              </div>
              <div className='flex flex-col'>
                <Label>Child pages</Label>
                <Description className='text-xs'>
                  View activity log for hierarchical child pages
                </Description>
              </div>
            </Dropdown.Item>
          )}
          <Dropdown.Item id='card-pages' textValue='Card pages'>
            <div className='flex h-8 items-start justify-center pt-px'>
              <IconStack2 className='size-4 shrink-0' stroke={1.5} />
            </div>
            <div className='flex flex-col'>
              <Label>Card pages</Label>
              <Description className='text-xs'>
                View activity log for pages where cards from this{' '}
                {currentContext?.domoObject?.typeName?.toLowerCase() ||
                  'object'}{' '}
                appear
              </Description>
            </div>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
