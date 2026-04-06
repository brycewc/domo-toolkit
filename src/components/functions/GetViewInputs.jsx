import { Button } from '@heroui/react';
import { IconDatabase } from '@tabler/icons-react';

import { isViewType } from '@/services';
import { launchView } from '@/utils';

export function GetViewInputs({
  currentContext,
  isDisabled,
  onCollapseActions,
  onStatusUpdate
}) {
  const objectType = currentContext?.domoObject?.typeId;
  const details = currentContext?.domoObject?.metadata?.details;
  if (objectType !== 'DATA_SOURCE' || !isViewType(details)) return null;

  return (
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
      <IconDatabase stroke={1.5} /> Get DataSets Used in View
    </Button>
  );
}
