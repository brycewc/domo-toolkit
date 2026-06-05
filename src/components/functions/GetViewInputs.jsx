import { Button, Tooltip } from '@heroui/react';

import { isViewType } from '@/services/datasets';
import { launchView } from '@/utils/sidepanel';
import IconCompass from '@icons/compass.svg?react';

export function GetViewInputs({ currentContext, isDisabled, onCollapseActions, onStatusUpdate }) {
  const objectType = currentContext?.domoObject?.typeId;
  const details = currentContext?.domoObject?.metadata?.details;
  if (objectType !== 'DATA_SOURCE' || !isViewType(details)) return null;

  return (
    <Tooltip>
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
        <IconCompass /> Get View Inputs
      </Button>
      <Tooltip.Content className='max-w-60' offset={4}>
        List the input datasets used in this view
      </Tooltip.Content>
    </Tooltip>
  );
}
