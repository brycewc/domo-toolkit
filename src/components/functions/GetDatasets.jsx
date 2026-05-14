import { Button, Dropdown, Label, Spinner, Tooltip } from '@heroui/react';

import { useLaunchView } from '@/hooks/useLaunchView';
import { useLongPress } from '@/hooks/useLongPress';
import IconDatabase from '@icons/database.svg?react';

export function GetDatasets({ currentContext, isDisabled, onCollapseActions, onStatusUpdate }) {
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
  let label;
  switch (objectType) {
    case 'CARD':
      buttonText = 'Get Card DataSets';
      label = 'List datasets powering this card';
      break;
    case 'DATA_SOURCE':
      buttonText = 'Get Dependent Views';
      label = 'List dataset views dependent on this dataset';
      break;
    case 'DATAFLOW_TYPE':
      buttonText = 'Get DataFlow DataSets';
      label = 'List dataset inputs and outputs for this dataflow';
      break;
    default:
      buttonText = 'Get DataSets';
      label = 'List datasets for this object';
  }

  return (
    <Dropdown isDisabled={longPressDisabled} trigger='longPress'>
      <Tooltip closeDelay={100} delay={600}>
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
                <IconDatabase /> {buttonText}
                <LongPressOverlay />
              </>
            )
          }
        </Button>
        <Tooltip.Content
          className='flex max-w-60 flex-col items-center justify-center px-1 py-0.5 text-center text-wrap break-normal'
          offset={4}
        >
          <span>{label}</span>
          {!longPressDisabled && <span className='italic'>Hold for more options</span>}
        </Tooltip.Content>
      </Tooltip>
      <Dropdown.Popover className='w-fit min-w-48' placement='bottom'>
        <Dropdown.Menu onAction={handleAction}>
          {dropdownItems.map((item) => (
            <Dropdown.Item id={item.id} key={item.id} textValue={item.label}>
              <IconDatabase className='size-5 shrink-0' />
              <Label>{item.label}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
