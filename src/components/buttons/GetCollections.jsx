import { Button, Dropdown, Label, Spinner, Tooltip } from '@heroui/react';

import { useLaunchView } from '@/hooks/useLaunchView';
import { useLongPress } from '@/hooks/useLongPress';
import IconDataCollection from '@icons/data-collection.svg?react';

export function GetCollections({ currentContext, isDisabled, onStatusUpdate }) {
  const { isPending, launch } = useLaunchView();
  const { LongPressOverlay, pressProps } = useLongPress();

  const objectType = currentContext?.domoObject?.typeId;

  let dropdownItems = [];
  if (objectType === 'DATA_APP_VIEW') {
    dropdownItems = [{ id: 'getAppCollections', label: 'Get App Collections' }];
  } else if (objectType === 'WORKSHEET_VIEW') {
    dropdownItems = [{ id: 'getAppCollections', label: 'Get Worksheet Collections' }];
  }

  const longPressDisabled = isDisabled || !currentContext?.domoObject?.id || dropdownItems.length === 0;

  const handleAction = async (key) => {
    if (key !== 'getAppCollections') return;

    const parentId = currentContext?.domoObject?.parentId;
    if (!parentId) {
      onStatusUpdate?.('Error', 'Could not determine parent app ID', 'danger');
      return;
    }

    await launch({
      appId: parentId,
      currentContext,
      onStatusUpdate,
      type: 'getCollections'
    });
  };

  let tooltipText;
  switch (objectType) {
    case 'APP':
    case 'RYUU_APP':
      tooltipText = 'List AppDB collections used by each instance of this app design';
      break;
    case 'CARD':
      tooltipText = 'List AppDB collections this app uses';
      break;
    case 'DATA_SCIENCE_NOTEBOOK':
      tooltipText = 'List AppDB collections attached to this Jupyter workspace';
      break;
    case 'MAGNUM_COLLECTION':
      tooltipText = "List every AppDB collection in this collection's datastore";
      break;
    default:
      tooltipText = 'List AppDB collections used by the app cards on this page';
  }

  return (
    <Dropdown isDisabled={longPressDisabled} trigger='longPress'>
      <Tooltip>
        <Button
          fullWidth
          className='relative min-w-36 flex-1 overflow-visible whitespace-normal'
          isDisabled={isDisabled}
          isPending={isPending}
          variant='tertiary'
          onPress={() =>
            launch({
              currentContext,
              onStatusUpdate,
              type: 'getCollections'
            })
          }
          {...(longPressDisabled ? {} : pressProps)}
        >
          {({ isPending: pending }) =>
            pending ? (
              <Spinner color='currentColor' size='sm' />
            ) : (
              <>
                <IconDataCollection /> Get Collections
                <LongPressOverlay />
              </>
            )
          }
        </Button>
        <Tooltip.Content className='max-w-60' offset={4}>
          <span>{tooltipText}</span>
          {!longPressDisabled && <span className='italic'>Hold for more options</span>}
        </Tooltip.Content>
      </Tooltip>
      <Dropdown.Popover className='w-fit min-w-48' placement='bottom'>
        <Dropdown.Menu onAction={handleAction}>
          {dropdownItems.map((item) => (
            <Dropdown.Item id={item.id} key={item.id} textValue={item.label}>
              <IconDataCollection className='size-4 shrink-0' />
              <Label>{item.label}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
