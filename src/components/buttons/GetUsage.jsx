import { Button, Spinner, Tooltip } from '@heroui/react';

import { useLaunchView } from '@/hooks/useLaunchView';
import IconContentSearch from '@icons/content-search.svg?react';

export function GetUsage({ currentContext, isDisabled, onStatusUpdate }) {
  const { isPending, launch } = useLaunchView();

  return (
    <Tooltip>
      <Button
        fullWidth
        className='min-w-36 flex-1 whitespace-normal'
        isDisabled={isDisabled}
        isPending={isPending}
        variant='tertiary'
        onPress={() =>
          launch({
            currentContext,
            onStatusUpdate,
            type: 'getUsage'
          })
        }
      >
        {({ isPending: pending }) =>
          pending ? (
            <Spinner color='currentColor' size='sm' />
          ) : (
            <>
              <IconContentSearch />
              Get Usage
            </>
          )
        }
      </Button>
      <Tooltip.Content className='max-w-60' offset={4}>
        List the workflows and custom apps that use this package
      </Tooltip.Content>
    </Tooltip>
  );
}
