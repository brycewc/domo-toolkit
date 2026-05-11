import { Button, Spinner, Tooltip } from '@heroui/react';

import { useLaunchView } from '@/hooks/useLaunchView';
import { waitForCards } from '@/utils/cardHelpers';
import IconPagesBars from '@icons/pages-bars.svg?react';

const PAGE_LIKE_TYPES = ['DATA_APP_VIEW', 'PAGE', 'WORKSHEET_VIEW'];

export function GetCardPages({ currentContext, isDisabled, onCollapseActions, onStatusUpdate }) {
  const { isPending, launch } = useLaunchView();
  const objectType = currentContext?.domoObject?.typeId;
  const isPageLike = PAGE_LIKE_TYPES.includes(objectType);

  return (
    <Tooltip closeDelay={100} delay={600}>
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
              <IconPagesBars />
              {isPageLike ? 'Get Other Card Pages' : 'Get Card Pages'}
            </>
          )
        }
      </Button>
      <Tooltip.Content
        className='flex max-w-60 flex-col items-center justify-center px-1 py-0.5 text-center text-wrap break-normal'
        offset={4}
      >
        {isPageLike
          ? 'List other pages/apps/worksheets where these cards appear'
          : 'List pages/apps/worksheets where this card appears'}
      </Tooltip.Content>
    </Tooltip>
  );
}
