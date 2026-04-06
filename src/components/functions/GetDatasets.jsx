import { Button, Dropdown, Label, Spinner, Tooltip } from '@heroui/react';
import { IconDatabase } from '@tabler/icons-react';

import { useLaunchView, useLongPress } from '@/hooks';

export function GetDatasets({
  currentContext,
  isDisabled,
  onCollapseActions,
  onStatusUpdate
}) {
  const { isPending, launch } = useLaunchView();
  const { LongPressOverlay, pressProps } = useLongPress();

  const objectType = currentContext?.domoObject?.typeId;

  let dropdownItems = [];
  if (objectType === 'DATA_APP_VIEW') {
    dropdownItems = [{ id: 'getAppDatasets', label: 'Get App DataSets' }];
  } else if (objectType === 'WORKSHEET_VIEW') {
    dropdownItems = [{ id: 'getAppDatasets', label: 'Get Worksheet DataSets' }];
  }

  const longPressDisabled =
    isDisabled || !currentContext?.domoObject?.id || dropdownItems.length === 0;

  const handleAction = async (key) => {
    if (key !== 'getAppDatasets') return;

    const parentId = currentContext?.domoObject?.parentId;
    if (!parentId) {
      onStatusUpdate?.('Error', 'Could not determine parent app ID', 'danger');
      return;
    }

    await launch({
      appId: parentId,
      currentContext,
      onCollapseActions,
      onStatusUpdate,
      type: 'getDatasets'
    });
  };

  let buttonText;
  switch (objectType) {
    case 'CARD':
      buttonText = 'Get Card DataSets';
      break;
    case 'DATA_SOURCE':
      buttonText = 'Get Views';
      break;
    case 'DATAFLOW_TYPE':
      buttonText = 'Get DataFlow DataSets';
      break;
    default:
      buttonText = 'Get DataSets';
  }

  return (
    <Dropdown isDisabled={longPressDisabled} trigger='longPress'>
      <Tooltip closeDelay={0} delay={400}>
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
              type: 'getDatasets'
            })
          }
          {...(longPressDisabled ? {} : pressProps)}
        >
          {({ isPending: pending }) =>
            pending ? (
              <Spinner color='currentColor' size='sm' />
            ) : (
              <>
                <IconDatabase stroke={1.5} /> {buttonText}
                <LongPressOverlay />
              </>
            )
          }
        </Button>
        {!longPressDisabled && (
          <Tooltip.Content placement='bottom'>
            <span className='italic'>Hold for more options</span>
          </Tooltip.Content>
        )}
      </Tooltip>
      <Dropdown.Popover className='w-fit min-w-48' placement='bottom'>
        <Dropdown.Menu onAction={handleAction}>
          {dropdownItems.map((item) => (
            <Dropdown.Item id={item.id} key={item.id} textValue={item.label}>
              <IconDatabase className='size-5 shrink-0' stroke={1.5} />
              <Label>{item.label}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
