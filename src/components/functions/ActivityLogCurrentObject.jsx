import { useState, useEffect } from 'react';
import {
  Button,
  ButtonGroup,
  IconChevronDown,
  Description,
  Dropdown,
  Label
} from '@heroui/react';
import { getCardsForObject } from '@/services/cards';
import { getPagesForCards, getChildPages } from '@/services/pages';

export function ActivityLogCurrentObject({ currentContext, onStatusUpdate }) {
  const [isLoading, setIsLoading] = useState(false);

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

    console.log(currentContext);

    setIsLoading(true);

    let activityLogObjects = [];
    let activityLogType = '';
    let message = '';
    const objectName =
      currentContext?.domoObject.metadata?.name ??
      `${currentContext?.domoObject.typeName} ${currentContext?.domoObject.id}`;

    try {
      switch (key) {
        case 'child-cards':
          // Get all cards for the current object
          const cardIds = await getCardsForObject({
            objectId: currentContext?.domoObject.id,
            objectType: currentContext?.domoObject.typeId
          });

          if (!cardIds || cardIds.length === 0) {
            onStatusUpdate?.(
              'No Cards Found',
              `No cards found on ${objectName}`,
              'warning'
            );
            setIsLoading(false);
            return;
          }

          // Store as array of objects with type and id
          const cardObjects = cardIds.map((id) => ({
            type: 'CARD',
            id: String(id)
          }));

          activityLogObjects = cardObjects;
          activityLogType = 'child-cards';
          message = `Navigating to activity log for ${cardIds.length} cards on ${objectName}`;
          break;
        case 'child-pages':
          activityLogType = 'child-pages';
          // Handle differently based on object type
          if (currentContext?.domoObject.typeId === 'DATA_SOURCE') {
            // For datasets: Get all cards, then get all pages those cards appear on
            const cardIds = await getCardsForObject({
              objectId: currentContext?.domoObject.id,
              objectType: currentContext?.domoObject.typeId
            });

            if (!cardIds || cardIds.length === 0) {
              onStatusUpdate?.(
                'No Cards Found',
                `No cards found on ${objectName}`,
                'warning'
              );
              return;
            }

            // Then get all pages that those cards appear on
            const pages = await getPagesForCards(cardIds);

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
            // For pages: Get child pages directly
            const childPages = await getChildPages({
              pageId: parseInt(currentContext?.domoObject.id),
              appId:
                currentContext?.domoObject.typeId === 'DATA_APP_VIEW'
                  ? currentContext?.domoObject.parentId
                    ? parseInt(currentContext?.domoObject.parentId)
                    : null
                  : null,
              pageType: currentContext?.domoObject.typeId
            });

            if (!childPages || childPages.length === 0) {
              onStatusUpdate?.(
                'No Child Pages Found',
                `No child pages found for ${currentContext?.domoObject.typeName} ${currentContext?.domoObject.id}`,
                'warning'
              );
              return;
            }

            const childPageObjects = childPages.map((p) => ({
              type: currentContext?.domoObject.typeId,
              id: String(p.pageId)
            }));

            activityLogObjects = childPageObjects;

            message = `Navigating to activity log for ${childPageObjects.length} child pages`;
          }
          return;
        default:
          activityLogObjects = [
            {
              type: currentContext?.domoObject.typeId,
              id: currentContext?.domoObject.id,
              name: currentContext?.domoObject.metadata?.name || ''
            }
          ];
          activityLogType = 'single-object';
          message = `Navigating to activity log for ${currentContext?.domoObject.typeName} ${currentContext?.domoObject.id}`;
          break;
      }

      await chrome.storage.local.set({
        activityLogTabId: currentContext?.tabId,
        activityLogObjects: activityLogObjects,
        activityLogType: activityLogType,
        activityLogInstance: currentContext?.instance
      });

      onStatusUpdate?.('Opening Activity Log', message, 'success');

      // Open the options page with the activity log tab
      const optionsUrl = chrome.runtime.getURL(
        'src/options/index.html#activity-log'
      );

      await chrome.tabs.create({ url: optionsUrl });
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

  const isDisabled = !currentContext?.domoObject?.id || isLoading;
  const isDropdownDisabled =
    isDisabled ||
    !['PAGE', 'DATA_APP_VIEW', 'DATA_SOURCE'].includes(
      currentContext?.domoObject?.typeId
    );

  return (
    <div className='flex flex-col gap-2'>
      <ButtonGroup>
        <Button
          onPress={handleClick}
          isDisabled={isDisabled}
          className='w-full'
          isPending={isLoading}
        >
          <span className={!isDropdownDisabled ? 'pl-10' : ''}>
            Activity Log
          </span>
        </Button>
        {!isDropdownDisabled && (
          <Dropdown>
            <Button
              isIconOnly
              aria-label='More options'
              isDisabled={isDropdownDisabled}
            >
              <IconChevronDown className='h-4 w-4' />
            </Button>
            <Dropdown.Popover className='max-w-[290px]' placement='bottom end'>
              <Dropdown.Menu onAction={handleClick}>
                <Dropdown.Item
                  className='flex flex-col items-start gap-1'
                  id='child-cards'
                  textValue='Child cards'
                >
                  <Label>Child cards</Label>
                  <Description className='text-xs'>
                    View activity log for all cards on this{' '}
                    {currentContext?.domoObject?.typeName?.toLowerCase() ||
                      'object'}
                  </Description>
                </Dropdown.Item>
                <Dropdown.Item
                  className='flex flex-col items-start gap-1'
                  id='child-pages'
                  textValue='Child pages'
                >
                  <Label>Child pages</Label>
                  <Description className='text-xs'>
                    View activity log for all pages containing cards from this{' '}
                    {currentContext?.domoObject?.typeName?.toLowerCase() ||
                      'object'}
                  </Description>
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        )}
      </ButtonGroup>
    </div>
  );
}
