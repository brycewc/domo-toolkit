import { Button, Tooltip } from '@heroui/react';
import { IconBrandSafari } from '@tabler/icons-react';

import { isViewType } from '@/services';
import { launchView } from '@/utils';

export function GetViewInputs({ currentContext, isDisabled, onCollapseActions, onStatusUpdate }) {
  const objectType = currentContext?.domoObject?.typeId;
  const details = currentContext?.domoObject?.metadata?.details;
  if (objectType !== 'DATA_SOURCE' || !isViewType(details)) return null;

  return (
    <Tooltip closeDelay={100} delay={600}>
      <Button
        fullWidth
        className='min-w-36 flex-1 whitespace-normal'
        isDisabled={isDisabled}
        variant='tertiary'
        onPress={() =>
          launchView({
            currentContext,
            onCollapseActions,
            onStatusUpdate,
            type: 'getViewInputs'
          })
        }
      >
        <IconBrandSafari stroke={1.5} /> Get View Inputs
      </Button>
      <Tooltip.Content className='flex max-w-60 flex-col items-center justify-center px-1 py-0.5 text-center text-wrap break-normal'>
        List the input datasets used in this view
      </Tooltip.Content>
    </Tooltip>
  );
}
