import { Button, Tooltip } from '@heroui/react';

import { launchView } from '@/utils/sidepanel';
import IconCompass from '@icons/compass.svg?react';

const DERIVED_TYPES = ['DATA_FUSION', 'DATA_MODEL', 'VIEW'];

export function GetViewInputs({ currentContext, isDisabled, onStatusUpdate }) {
  const objectType = currentContext?.domoObject?.typeId;
  if (!DERIVED_TYPES.includes(objectType)) return null;

  const label = currentContext?.domoObject?.typeName ?? 'View';

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
