import { Button, Spinner, Tooltip } from '@heroui/react';
import { IconStack2 } from '@tabler/icons-react';

import { useLaunchView } from '@/hooks';
import { waitForCards } from '@/utils';

const PAGE_LIKE_TYPES = ['DATA_APP_VIEW', 'PAGE', 'WORKSHEET_VIEW'];

export function GetCardPages({ currentContext, isDisabled, onCollapseActions, onStatusUpdate }) {
  const { isPending, launch } = useLaunchView();
  const objectType = currentContext?.domoObject?.typeId;
  const isPageLike = PAGE_LIKE_TYPES.includes(objectType);

  return (
    <Tooltip closeDelay={0} delay={400}>
      <Button
        fullWidth
        className='min-w-36 flex-1 whitespace-normal'
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
      >
        {({ isPending: pending }) =>
          pending ? (
            <Spinner color='currentColor' size='sm' />
          ) : (
            <>
              <IconStack2 stroke={1.5} />
              {isPageLike ? 'Get Other Card Pages' : 'Get Card Pages'}
            </>
          )
        }
      </Button>
      <Tooltip.Content className='flex flex-col items-center text-wrap break-normal'>
        {isPageLike
          ? 'List other pages where these cards appear'
          : 'List pages where this card appears'}
      </Tooltip.Content>
    </Tooltip>
  );
}
