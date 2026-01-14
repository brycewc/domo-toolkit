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

/**
 * Get all activity log object types for a given object type
 * Some object types map to multiple activity log types
 */
function getActivityLogTypes(objectType) {
  switch (objectType) {
    case 'BEAST_MODE_FORMULA':
      return ['BEAST_MODE_FORMULA', 'VARIABLE'];
    case 'DATA_SOURCE':
      return [
        'DATA_SOURCE',
        'DATASET',
        'VIEW',
        'VIEW_ADVANCED_EDITOR',
        'DUPLICATED_DATA_SOURCE'
      ];
    case 'APP':
      return ['APP', 'RYUU_APP'];
    case 'CODEENGINE_PACKAGE':
      return ['CODEENGINE_PACKAGE', 'FUNCTION'];
    case 'GOAL':
      return ['GOAL', 'OBJECTIVE'];
    default:
      return [objectType];
  }
}

export function ActivityLogCurrentObject({ currentObject, onStatusUpdate }) {
  const [activityLogConfig, setActivityLogConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDropdownLoading, setIsDropdownLoading] = useState(false);

  // Load activity log configuration for the current instance
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true
        });

        if (!tab || !tab.url || !tab.url.includes('domo.com')) {
          setActivityLogConfig(null);
          return;
        }

        // Get the instance from the current tab
        const url = new URL(tab.url);
        const instance = url.hostname.replace('.domo.com', '');

        // Load the activity log configs
        chrome.storage.sync.get(['activityLogConfigs'], (result) => {
          const configs = result.activityLogConfigs || [];
          const config = configs.find((c) => c.instance === instance);
          setActivityLogConfig(config || null);
        });
      } catch (err) {
        console.error('Error loading activity log config:', err);
        setActivityLogConfig(null);
      }
    };

    loadConfig();
  }, [currentObject]);

  const handleClick = async () => {
    if (!currentObject || !currentObject.id || !currentObject.objectType) {
      onStatusUpdate?.(
        'No Object Detected',
        'Navigate to a Domo object page to use this feature',
        'warning'
      );
      return;
    }

    if (!activityLogConfig) {
      onStatusUpdate?.(
        'Configuration Required',
        'Please configure the activity log settings for this instance in Settings',
        'warning'
      );
      return;
    }

    setIsLoading(true);

    try {
      // Get active tab
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      });

      if (!tab || !tab.url || !tab.url.includes('domo.com')) {
        onStatusUpdate?.(
          'Not on Domo Page',
          'Please open a Domo page first',
          'warning'
        );
        setIsLoading(false);
        return;
      }

      const baseUrl = new URL(tab.url).origin;

      // Get all activity log types for this object type
      const objectTypes = getActivityLogTypes(currentObject.typeId);

      // Build pfilters array
      const pfilters = [
        {
          column: activityLogConfig.objectTypeColumn,
          operand: 'IN',
          values: objectTypes
        },
        {
          column: activityLogConfig.objectIdColumn,
          operand: 'IN',
          values: [currentObject.id]
        }
      ];

      // Build the activity log URL
      const activityLogUrl = `${baseUrl}/kpis/details/${
        activityLogConfig.cardId
      }?pfilters=${encodeURIComponent(JSON.stringify(pfilters))}`;

      // Copy ID to clipboard
      // await navigator.clipboard.writeText(currentObject?.id);

      // Navigate to the activity log
      await chrome.tabs.create({ url: activityLogUrl });

      onStatusUpdate?.(
        'Opening Activity Log',
        `Navigating to activity log for ${currentObject.typeName} ${currentObject.id}`,
        'success'
      );
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

  const handleDropdownAction = async (key) => {
    if (!currentObject || !currentObject.id || !currentObject.objectType) {
      onStatusUpdate?.(
        'No Object Detected',
        'Navigate to a Domo object page to use this feature',
        'warning'
      );
      return;
    }

    if (!activityLogConfig) {
      onStatusUpdate?.(
        'Configuration Required',
        'Please configure the activity log settings for this instance in Settings',
        'warning'
      );
      return;
    }

    setIsDropdownLoading(true);

    try {
      // Get active tab
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      });

      if (!tab || !tab.url || !tab.url.includes('domo.com')) {
        onStatusUpdate?.(
          'Not on Domo Page',
          'Please open a Domo page first',
          'warning'
        );
        setIsDropdownLoading(false);
        return;
      }

      const baseUrl = new URL(tab.url).origin;

      if (key === 'child-cards') {
        // Get all cards for the current object
        const cardIds = await getCardsForObject({
          objectId: currentObject.id,
          objectType: currentObject.typeId
        });

        if (!cardIds || cardIds.length === 0) {
          onStatusUpdate?.(
            'No Cards Found',
            `No cards found on ${currentObject.typeName} ${currentObject.id}`,
            'warning'
          );
          return;
        }

        // Build pfilters for cards
        const pfilters = [
          {
            column: activityLogConfig.objectTypeColumn,
            operand: 'IN',
            values: ['CARD']
          },
          {
            column: activityLogConfig.objectIdColumn,
            operand: 'IN',
            values: cardIds.map(String)
          }
        ];

        // Build and open the activity log URL
        const activityLogUrl = `${baseUrl}/kpis/details/${
          activityLogConfig.cardId
        }?pfilters=${encodeURIComponent(JSON.stringify(pfilters))}`;

        await chrome.tabs.create({ url: activityLogUrl });

        onStatusUpdate?.(
          'Opening Activity Log',
          `Navigating to activity log for ${cardIds.length} cards on ${currentObject.typeName}`,
          'success'
        );
      } else if (key === 'child-pages') {
        // Handle differently based on object type
        if (currentObject.typeId === 'DATA_SOURCE') {
          // For datasets: Get all cards, then get all pages those cards appear on
          const cardIds = await getCardsForObject({
            objectId: currentObject.id,
            objectType: currentObject.typeId
          });

          if (!cardIds || cardIds.length === 0) {
            onStatusUpdate?.(
              'No Cards Found',
              `No cards found on ${currentObject.typeName} ${currentObject.id}`,
              'warning'
            );
            return;
          }

          // Then get all pages that those cards appear on
          const { pageIds, objectTypes } = await getPagesForCards(cardIds);

          if (!pageIds || pageIds.length === 0) {
            onStatusUpdate?.(
              'No Pages Found',
              `Cards are not used on any pages`,
              'warning'
            );
            return;
          }

          // Get unique object types for the filter
          const uniqueObjectTypes = [...new Set(objectTypes)];

          // Build pfilters for pages
          const pfilters = [
            {
              column: activityLogConfig.objectTypeColumn,
              operand: 'IN',
              values: uniqueObjectTypes
            },
            {
              column: activityLogConfig.objectIdColumn,
              operand: 'IN',
              values: pageIds
            }
          ];

          // Build and open the activity log URL
          const activityLogUrl = `${baseUrl}/kpis/details/${
            activityLogConfig.cardId
          }?pfilters=${encodeURIComponent(JSON.stringify(pfilters))}`;

          await chrome.tabs.create({ url: activityLogUrl });

          onStatusUpdate?.(
            'Opening Activity Log',
            `Navigating to activity log for ${pageIds.length} pages`,
            'success'
          );
        } else if (
          currentObject.typeId === 'PAGE' ||
          currentObject.typeId === 'DATA_APP_VIEW'
        ) {
          // For pages: Get child pages directly
          const childPages = await getChildPages({
            pageId: parseInt(currentObject.id),
            appId:
              currentObject.typeId === 'DATA_APP_VIEW'
                ? currentObject.parentId
                  ? parseInt(currentObject.parentId)
                  : null
                : null,
            pageType: currentObject.typeId
          });

          if (!childPages || childPages.length === 0) {
            onStatusUpdate?.(
              'No Child Pages Found',
              `No child pages found for ${currentObject.typeName} ${currentObject.id}`,
              'warning'
            );
            return;
          }

          const pageIds = childPages.map((p) => String(p.pageId));

          // Build pfilters for pages
          const pfilters = [
            {
              column: activityLogConfig.objectTypeColumn,
              operand: 'IN',
              values: [currentObject.typeId]
            },
            {
              column: activityLogConfig.objectIdColumn,
              operand: 'IN',
              values: pageIds
            }
          ];

          // Build and open the activity log URL
          const activityLogUrl = `${baseUrl}/kpis/details/${
            activityLogConfig.cardId
          }?pfilters=${encodeURIComponent(JSON.stringify(pfilters))}`;

          await chrome.tabs.create({ url: activityLogUrl });

          onStatusUpdate?.(
            'Opening Activity Log',
            `Navigating to activity log for ${pageIds.length} child pages`,
            'success'
          );
        }
      }
    } catch (err) {
      console.error('Error opening activity log:', err);
      onStatusUpdate?.(
        'Error',
        `Failed to open activity log: ${err.message}`,
        'danger'
      );
    } finally {
      setIsDropdownLoading(false);
    }
  };

  const getButtonText = () => {
    if (!currentObject?.id) {
      return 'Activity Log Current: N/A';
    }
    if (!activityLogConfig) {
      return 'Activity Log: Not Configured';
    }
    return `Activity Log Current ${
      currentObject.typeName || currentObject.typeId
    }`;
  };

  const isDisabled = !currentObject?.id || !activityLogConfig || isLoading;
  const isDropdownDisabled =
    !currentObject?.id ||
    !activityLogConfig ||
    isLoading ||
    isDropdownLoading ||
    !['PAGE', 'DATA_APP_VIEW', 'DATA_SOURCE'].includes(currentObject?.typeId);

  return (
    <div className='flex flex-col gap-2'>
      <ButtonGroup>
        <Button
          onPress={handleClick}
          isDisabled={isDisabled}
          className='w-full'
          isPending={isLoading}
        >
          Activity Log
        </Button>
        {!isDropdownDisabled && (
          <Dropdown>
            <Button
              isIconOnly
              aria-label='More options'
              isDisabled={isDropdownDisabled}
              isPending={isDropdownLoading}
            >
              <IconChevronDown className='h-4 w-4' />
            </Button>
            <Dropdown.Popover className='max-w-[290px]' placement='bottom end'>
              <Dropdown.Menu onAction={handleDropdownAction}>
                <Dropdown.Item
                  className='flex flex-col items-start gap-1'
                  id='child-cards'
                  textValue='Child cards'
                >
                  <Label>Child cards</Label>
                  <Description className='text-xs'>
                    View activity log for all cards on this{' '}
                    {currentObject?.typeName?.toLowerCase() || 'object'}
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
                    {currentObject?.typeName?.toLowerCase() || 'object'}
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
