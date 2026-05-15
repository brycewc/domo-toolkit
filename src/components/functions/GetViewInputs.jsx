import { Button, Tooltip } from '@heroui/react';

import { isViewType } from '@/services/datasets';
import { launchView } from '@/utils/sidepanel';
import IconCompass from '@icons/compass.svg?react';

export function GetViewInputs({ currentContext, isDisabled, onCollapseActions, onStatusUpdate }) {
  const objectType = currentContext?.domoObject?.typeId;
  const details = currentContext?.domoObject?.metadata?.details;
  if (objectType !== 'DATA_SOURCE' || !isViewType(details)) return null;

  return (
    <Tooltip closeDelay={100} delay={600}>
      <Button
        fullWidth
        className='h-auto min-h-9 min-w-36 flex-1 whitespace-normal py-1.5'
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
        <IconCompass /> Get View Inputs
      </Button>
      <Tooltip.Content
        className='flex max-w-60 flex-col items-center justify-center px-1 py-0.5 text-center text-wrap break-normal'
        offset={4}
      >
        List the input datasets used in this view
      </Tooltip.Content>
    </Tooltip>
  );
}
