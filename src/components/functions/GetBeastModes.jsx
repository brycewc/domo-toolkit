import { Button, Dropdown, Label, Spinner, Tooltip } from '@heroui/react';

import { useLaunchView } from '@/hooks/useLaunchView';
import { useLongPress } from '@/hooks/useLongPress';
import IconBeastMode from '@icons/beast-mode.svg?react';

export function GetBeastModes({ currentContext, isDisabled, onCollapseActions, onStatusUpdate }) {
  const { isPending, launch } = useLaunchView();
  const { LongPressOverlay, pressProps } = useLongPress();

  const domoObject = currentContext?.domoObject;
  const objectType = domoObject?.typeId;

  let dropdownItems = [];
  if (objectType === 'DATA_APP_VIEW') {
    dropdownItems = [{ id: 'getParentBeastModes', label: 'Get App Beast Modes' }];
  } else if (objectType === 'WORKSHEET_VIEW') {
    dropdownItems = [{ id: 'getParentBeastModes', label: 'Get Worksheet Beast Modes' }];
  }

  const longPressDisabled = isDisabled || !domoObject?.id || dropdownItems.length === 0;

  const handleAction = async (key) => {
    if (key !== 'getParentBeastModes') return;

    const parentId = domoObject?.parentId;
    if (!parentId) {
      onStatusUpdate?.('Error', 'Could not determine parent ID', 'danger');
      return;
    }

    await launch({
      currentContext,
      onCollapseActions,
      onStatusUpdate,
      parentId,
      scope: 'parent',
      type: 'getBeastModes'
    });
  };

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
              onCollapseActions,
              onStatusUpdate,
              type: 'getBeastModes'
            })
          }
          {...(longPressDisabled ? {} : pressProps)}
        >
          {({ isPending: pending }) =>
            pending ? (
              <Spinner color='currentColor' size='sm' />
            ) : (
              <>
                <IconBeastMode /> Get Beast Modes
                <LongPressOverlay />
              </>
            )
          }
        </Button>
        <Tooltip.Content className='max-w-60' offset={4}>
          <span>List the Beast Modes tied to this object and where they are used</span>
          {!longPressDisabled && <span className='italic'>Hold for more options</span>}
        </Tooltip.Content>
      </Tooltip>
      <Dropdown.Popover className='w-fit min-w-48' placement='bottom'>
        <Dropdown.Menu onAction={handleAction}>
          {dropdownItems.map((item) => (
            <Dropdown.Item id={item.id} key={item.id} textValue={item.label}>
              <IconBeastMode className='size-4 shrink-0' />
              <Label>{item.label}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
