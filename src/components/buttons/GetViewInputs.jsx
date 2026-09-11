import { Button, Tooltip } from '@heroui/react';

import { isFusionType, isViewOrFusionType } from '@/services/datasets';
import { launchView } from '@/utils/sidepanel';
import IconCompass from '@icons/compass.svg?react';

export function GetViewInputs({ currentContext, isDisabled, onStatusUpdate }) {
  const objectType = currentContext?.domoObject?.typeId;
  const details = currentContext?.domoObject?.metadata?.details;
  if (objectType !== 'DATA_SOURCE' || !isViewOrFusionType(details)) return null;

  const label = isFusionType(details) ? 'Fusion' : 'View';

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
            onStatusUpdate,
            type: 'getViewInputs'
          })
        }
      >
        <IconCompass /> Get {label} Inputs
      </Button>
      <Tooltip.Content className='max-w-60' offset={4}>
        List the input datasets used in this {label.toLowerCase()}
      </Tooltip.Content>
    </Tooltip>
  );
}
