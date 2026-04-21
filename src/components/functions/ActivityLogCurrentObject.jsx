import { Button, Description, Dropdown, Label, Tooltip } from '@heroui/react';
import { IconChartBar, IconLogs, IconSitemap, IconStack2 } from '@tabler/icons-react';
import { useState } from 'react';

import { useLongPress } from '@/hooks';
import { getCardsForObject, getPagesForCards, getSubpageIds } from '@/services';
import { waitForChildPages } from '@/utils';

export function ActivityLogCurrentObject({ currentContext, onStatusUpdate }) {
  const [isLoading, setIsLoading] = useState(false);
  const { LongPressOverlay, pressProps } = useLongPress();

  const userRights = currentContext?.user?.metadata?.USER_RIGHTS || [];
  const isDisabled = !currentContext?.domoObject?.id || isLoading || !userRights.includes('audit');
  const typeId = currentContext?.domoObject?.typeId;
  const longPressEnabled =
    !isDisabled && ['DATA_APP_VIEW', 'DATA_SOURCE', 'DATAFLOW_TYPE', 'PAGE'].includes(typeId);
  const hasChildPages = ['DATA_APP_VIEW', 'PAGE'].includes(typeId);

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
          let pages = currentContext?.domoObject?.metadata?.context?.cardPages;

          if (!pages) {
            const cards = await getCardsForObject({
              metadata: currentContext?.domoObject.metadata,
              objectId: currentContext?.domoObject.id,
              objectType: currentContext?.domoObject.typeId,
              tabId: currentContext?.tabId
            });

            if (!cards || cards.length === 0) {
              onStatusUpdate?.('No Cards Found', `No cards found on ${objectName}`, 'warning');
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
                'warning',
                5000
              );
            } else {
              onStatusUpdate?.(
                `No Valid Pages Found on ${currentContext?.domoObject?.typeName}`,
                `Cards on ${objectName} are only used on Overview, Favorites, or Shared pages`,
                'warning',
                5000
              );
            }
            setIsLoading(false);
            return;
          }

          activityLogObjects = validPages;
          message = `Navigating to activity log for ${validPages.length} pages containing cards from ${objectName}`;
          break;
        }
        case 'cards': {
          const cards = await getCardsForObject({
            metadata: currentContext?.domoObject.metadata,
            objectId: currentContext?.domoObject.id,
            objectType: currentContext?.domoObject.typeId,
            tabId: currentContext?.tabId
          });

          if (!cards || cards.length === 0) {
            onStatusUpdate?.('No Cards Found', `No cards found on ${objectName}`, 'warning', 5000);
            setIsLoading(false);
            return;
          }

          activityLogObjects = cards.map((card) => ({
            id: String(card.id),
            type: 'CARD'
          }));
          activityLogType = 'cards';
          activityLogType = 'cards';
          message = `Navigating to activity log for ${cards.length} cards on ${objectName}`;
          break;
        }
        case 'child-pages': {
          activityLogType = 'child-pages';
          let childPageIds;

          if (currentContext?.domoObject.typeId === 'PAGE') {
            const subpageIds = await getSubpageIds({
              pageId: parseInt(currentContext.domoObject.id),
              tabId: currentContext.tabId
            });
            childPageIds = (subpageIds || []).filter((id) => id >= 0);
          } else {
            const result = await waitForChildPages(currentContext);

            if (!result.success) {
              onStatusUpdate?.('Error', result.error, 'danger', 5000);
              setIsLoading(false);
              return;
            }

            childPageIds = (result.childPages || [])
              .filter((p) => Number(p.pageId) >= 0)
              .map((p) => Number(p.pageId));
          }

          if (childPageIds.length === 0) {
            onStatusUpdate?.(
              'No Child Pages Found',
              `No child pages found for ${currentContext?.domoObject.typeName} ${currentContext?.domoObject.id}`,
              'warning',
              5000
            );
            setIsLoading(false);
            return;
          }

          activityLogObjects = childPageIds.map((id) => ({
            id: String(id),
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
      onStatusUpdate?.('Error', `Failed to open activity log: ${err.message}`, 'danger', 5000);
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
          {...(longPressEnabled ? pressProps : {})}
          {...(longPressEnabled ? pressProps : {})}
        >
          <IconLogs stroke={1.5} />
          <LongPressOverlay />
          <LongPressOverlay />
        </Button>
        <Tooltip.Content className='flex flex-col items-center text-center'>
          <span>Activity log</span>
          {longPressEnabled && <span className='italic'>Hold for more options</span>}
        </Tooltip.Content>
      </Tooltip>
      <Dropdown.Popover className='min-w-90' placement='bottom'>
        <Dropdown.Menu onAction={handleClick}>
          <Dropdown.Item id='cards' textValue='Cards'>
            <div className='flex h-fit items-start justify-start gap-2'>
              <IconChartBar className='size-5 shrink-0' stroke={1.5} />
              <div className='flex flex-col'>
                <Label>Cards</Label>
                <Description className='text-xs'>
                  View activity log for all cards on this{' '}
                  {currentContext?.domoObject?.typeName?.toLowerCase() || 'object'}
                </Description>
              </div>
            </div>
          </Dropdown.Item>
          <Dropdown.Item id='card-pages' textValue='Card Pages'>
            <div className='flex h-fit items-start justify-start gap-2'>
              <IconStack2 className='size-5 shrink-0' stroke={1.5} />
              <div className='flex flex-col'>
                <Label>Card Pages</Label>
                <Description className='text-xs'>
                  View activity log for pages where cards from this{' '}
                  {currentContext?.domoObject?.typeName?.toLowerCase() || 'object'} appear
                </Description>
              </div>
            </div>
          </Dropdown.Item>
          {hasChildPages && (
            <Dropdown.Item id='child-pages' textValue='Child Pages'>
              <div className='flex h-fit items-start justify-start gap-2'>
                <IconSitemap className='size-5 shrink-0' stroke={1.5} />
                <div className='flex flex-col'>
                  <Label>Child Pages</Label>
                  <Description className='text-xs'>
                    View activity log for hierarchical child pages
                  </Description>
                </div>
              </div>
            </Dropdown.Item>
          )}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
