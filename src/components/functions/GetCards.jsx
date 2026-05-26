import { Button, Dropdown, Label, Spinner, Tooltip } from '@heroui/react';

import { useLaunchView } from '@/hooks/useLaunchView';
import { useLongPress } from '@/hooks/useLongPress';
import { waitForCards } from '@/utils/cardHelpers';
import IconCard from '@icons/card.svg?react';

// Types that have cards pre-fetched in background
const PRE_FETCHED_TYPES = ['DATA_APP_VIEW', 'DATA_SOURCE', 'PAGE', 'WORKSHEET_VIEW'];

const FORMS_AND_QUEUES_TYPES = ['DATA_APP_VIEW', 'PAGE', 'REPORT_BUILDER_VIEW', 'WORKSHEET_VIEW'];

export function GetCards({ currentContext, isDisabled, onCollapseActions, onStatusUpdate }) {
  const { isPending, launch } = useLaunchView();
  const { LongPressOverlay, pressProps } = useLongPress();

  const domoObject = currentContext?.domoObject;
  const objectType = domoObject?.typeId;

  let dropdownItems = [];
  if (objectType === 'DATA_APP_VIEW') {
    dropdownItems = [{ id: 'getParentCards', label: 'Get App Cards' }];
  } else if (objectType === 'WORKSHEET_VIEW') {
    dropdownItems = [{ id: 'getParentCards', label: 'Get Worksheet Cards' }];
  }

  const longPressDisabled = isDisabled || !domoObject?.id || dropdownItems.length === 0;

  const handleAction = async (key) => {
    if (key !== 'getParentCards') return;

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
      type: 'getCards'
    });
  };

  return (
    <Dropdown isDisabled={longPressDisabled} trigger='longPress'>
      <Tooltip closeDelay={100} delay={800}>
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
              preCheck: PRE_FETCHED_TYPES.includes(objectType)
                ? async () => {
                    const result = await waitForCards(currentContext);
                    if (!result.success) return null;
                    if (
                      result.cards?.length === 0 &&
                      result.forms?.length === 0 &&
                      result.queues?.length === 0
                    ) {
                      const typeName =
                        currentContext.domoObject.typeName?.toLowerCase() || 'object';
                      const hasFormsAndQueues = FORMS_AND_QUEUES_TYPES.includes(objectType);
                      return {
                        empty: true,
                        message: hasFormsAndQueues
                          ? `No cards, forms, or queues found on this ${typeName}.`
                          : `No cards found on this ${typeName}.`,
                        title: hasFormsAndQueues ? 'No Items Found' : 'No Cards Found'
                      };
                    }
                    return null;
                  }
                : undefined,
              type: 'getCards'
            })
          }
          {...(longPressDisabled ? {} : pressProps)}
        >
          {({ isPending: pending }) =>
            pending ? (
              <Spinner color='currentColor' size='sm' />
            ) : (
              <>
                <IconCard /> Get Cards
                <LongPressOverlay />
              </>
            )
          }
        </Button>
        <Tooltip.Content
          className='flex max-w-60 flex-col items-center justify-center px-1 py-0.5 text-center text-wrap break-normal'
          offset={4}
        >
          <span>List all cards on this object</span>
          {!longPressDisabled && <span className='italic'>Hold for more options</span>}
        </Tooltip.Content>
      </Tooltip>
      <Dropdown.Popover className='w-fit min-w-48' placement='bottom'>
        <Dropdown.Menu onAction={handleAction}>
          {dropdownItems.map((item) => (
            <Dropdown.Item id={item.id} key={item.id} textValue={item.label}>
              <IconCard className='size-5 shrink-0' />
              <Label>{item.label}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
