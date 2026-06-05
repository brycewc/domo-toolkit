import { Button, Dropdown, Label, Spinner, Tooltip } from '@heroui/react';

import { useLaunchView } from '@/hooks/useLaunchView';
import { useLongPress } from '@/hooks/useLongPress';
import { waitForCards } from '@/utils/cardHelpers';
import IconPagesBars from '@icons/pages-bars.svg?react';

const PAGE_LIKE_TYPES = ['DATA_APP_VIEW', 'PAGE', 'WORKSHEET_VIEW'];

export function GetCardPages({ currentContext, isDisabled, onCollapseActions, onStatusUpdate }) {
  const { isPending, launch } = useLaunchView();
  const { LongPressOverlay, pressProps } = useLongPress();

  const domoObject = currentContext?.domoObject;
  const objectType = domoObject?.typeId;
  const isPageLike = PAGE_LIKE_TYPES.includes(objectType);

  let dropdownItems = [];
  if (objectType === 'DATA_APP_VIEW') {
    dropdownItems = [{ id: 'getParentCardPages', label: 'Get App Card Pages' }];
  } else if (objectType === 'WORKSHEET_VIEW') {
    dropdownItems = [{ id: 'getParentCardPages', label: 'Get Worksheet Card Pages' }];
  }

  const longPressDisabled = isDisabled || !domoObject?.id || dropdownItems.length === 0;

  const handleAction = async (key) => {
    if (key !== 'getParentCardPages') return;

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
      type: 'getCardPages'
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
              preCheck: isPageLike
                ? async () => {
                    const result = await waitForCards(currentContext);
                    if (!result.success) return null;
                    if (!result.cards?.length) {
                      const objectName =
                        currentContext.domoObject.metadata?.name ||
                        `this ${currentContext.domoObject.typeName?.toLowerCase()}`;
                      return {
                        empty: true,
                        message: `No cards found on ${objectName}`,
                        title: 'No Cards Found'
                      };
                    }
                    return null;
                  }
                : undefined,
              type: 'getCardPages'
            })
          }
          {...(longPressDisabled ? {} : pressProps)}
        >
          {({ isPending: pending }) =>
            pending ? (
              <Spinner color='currentColor' size='sm' />
            ) : (
              <>
                <IconPagesBars />
                {isPageLike ? 'Get Other Card Pages' : 'Get Card Pages'}
                <LongPressOverlay />
              </>
            )
          }
        </Button>
        <Tooltip.Content className='max-w-60' offset={4}>
          <span>
            {isPageLike
              ? 'List other pages (app studio, dashboard, and worksheet) where these cards appear'
              : 'List pages (app studio, dashboard, and worksheet) where this card appears'}
          </span>
          {!longPressDisabled && <span className='italic'>Hold for more options</span>}
        </Tooltip.Content>
      </Tooltip>
      <Dropdown.Popover className='w-fit min-w-48' placement='bottom'>
        <Dropdown.Menu onAction={handleAction}>
          {dropdownItems.map((item) => (
            <Dropdown.Item id={item.id} key={item.id} textValue={item.label}>
              <IconPagesBars className='size-5 shrink-0' />
              <Label>{item.label}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
