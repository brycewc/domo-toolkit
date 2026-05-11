import { Button, Spinner, Tooltip } from '@heroui/react';

import { useLaunchView } from '@/hooks/useLaunchView';
import { waitForCards } from '@/utils/cardHelpers';
import IconCard from '@icons/card.svg?react';

// Types that have cards pre-fetched in background
const PRE_FETCHED_TYPES = ['DATA_APP_VIEW', 'DATA_SOURCE', 'PAGE', 'WORKSHEET_VIEW'];

const FORMS_AND_QUEUES_TYPES = ['DATA_APP_VIEW', 'PAGE', 'REPORT_BUILDER_VIEW', 'WORKSHEET_VIEW'];

export function GetCards({ currentContext, isDisabled, onCollapseActions, onStatusUpdate }) {
  const { isPending, launch } = useLaunchView();
  const objectType = currentContext?.domoObject?.typeId;

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
            preCheck: PRE_FETCHED_TYPES.includes(objectType)
              ? async () => {
                  const result = await waitForCards(currentContext);
                  if (!result.success) return null;
                  if (
                    result.cards?.length === 0 &&
                    result.forms?.length === 0 &&
                    result.queues?.length === 0
                  ) {
                    const typeName = currentContext.domoObject.typeName?.toLowerCase() || 'object';
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
      >
        {({ isPending: pending }) =>
          pending ? (
            <Spinner color='currentColor' size='sm' />
          ) : (
            <>
              <IconCard /> Get Cards
            </>
          )
        }
      </Button>
      <Tooltip.Content
        className='flex max-w-60 flex-col items-center justify-center px-1 py-0.5 text-center text-wrap break-normal'
        offset={4}
      >
        List all cards on this object
      </Tooltip.Content>
    </Tooltip>
  );
}
