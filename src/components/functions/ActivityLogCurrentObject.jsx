import { useState, useEffect } from 'react';
import {
  Button,
  ButtonGroup,
  IconChevronDown,
  Description,
  Dropdown,
  Label
} from '@heroui/react';
import { getCardsForObject, getPagesForCards, getChildPages } from '@/services';
import {
  IconChartBar,
  IconCopy,
  IconFileDescription
} from '@tabler/icons-react';

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

          // Map to IDs and store as array of objects with type and id
          const cardObjects = cardIds.map((card) => ({
            type: 'CARD',
            id: String(card.id)
          }));

          activityLogObjects = cardObjects;
          activityLogType = 'child-cards';
          message = `Navigating to activity log for ${cards.length} cards on ${objectName}`;
          break;
        case 'child-pages':
          activityLogType = 'child-pages';
          // Handle differently based on object type
          if (currentContext?.domoObject.typeId === 'DATA_SOURCE') {
            // For datasets: Get all cards, then get all pages those cards appear on
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
              return;
            }

            // Then get all pages that those cards appear on
            const pages = await getPagesForCards(cards.map((card) => card.id));

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
    <ButtonGroup className='min-w-fit flex-1 basis-[49%]'>
      <Button
        variant='tertiary'
        onPress={handleClick}
        isDisabled={isDisabled}
        // className={!isDropdownDisabled ? 'pl-10' : ''}
        isPending={isLoading}
        fullWidth
      >
        <IconFileDescription size={4} />
        Activity Log
      </Button>
      {!isDropdownDisabled && (
        <Dropdown>
          <Button
            variant='tertiary'
            isIconOnly
            aria-label='More options'
            isDisabled={isDropdownDisabled}
          >
            <IconChevronDown size={4} />
          </Button>
          <Dropdown.Popover
            className='w-full max-w-[290px]'
            placement='bottom end'
          >
            <Dropdown.Menu onAction={handleClick}>
              <Dropdown.Item id='child-cards' textValue='Child cards'>
                <div className='flex h-8 items-start justify-center pt-px'>
                  <IconChartBar size={4} className='size-4 shrink-0' />
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
                  <IconCopy size={4} className='size-4 shrink-0' />
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
      )}
    </ButtonGroup>
  );
}
