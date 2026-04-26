import { Button, Spinner, Tooltip } from '@heroui/react';
import { IconChartBar } from '@tabler/icons-react';

import { useLaunchView } from '@/hooks';
import { waitForCards } from '@/utils';

// Types that have cards pre-fetched in background
const PRE_FETCHED_TYPES = ['DATA_APP_VIEW', 'DATA_SOURCE', 'PAGE', 'WORKSHEET_VIEW'];

const FORMS_AND_QUEUES_TYPES = ['DATA_APP_VIEW', 'PAGE', 'REPORT_BUILDER_VIEW', 'WORKSHEET_VIEW'];

export function GetCards({ currentContext, isDisabled, onCollapseActions, onStatusUpdate }) {
  const { isPending, launch } = useLaunchView();
  const objectType = currentContext?.domoObject?.typeId;

  return (
    <Tooltip closeDelay={100} delay={400}>
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
              <IconChartBar stroke={1.5} /> Get Cards
            </>
          )
        }
      </Button>
      <Tooltip.Content className='flex flex-col items-center text-wrap break-normal'>
        List all cards on this object
      </Tooltip.Content>
    </Tooltip>
  );
}
