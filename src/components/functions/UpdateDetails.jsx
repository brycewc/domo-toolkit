import { Button, Tooltip } from '@heroui/react';

import { ObjectTypeIcon } from '@/components';
import { useLaunchView } from '@/hooks';

// Per-type tooltip describing what fields the Update Details view edits.
// Falls back to a generic message for any type without an entry here.
const TOOLTIPS_BY_TYPE = {
  DATA_SOURCE: "Edit this dataset's user defined type",
  DATAFLOW_TYPE: "Edit this dataflow's name and description"
};

export function UpdateDetails({ currentContext, onStatusUpdate }) {
  const { isPending, launch } = useLaunchView();
  const typeId = currentContext?.domoObject?.typeId;
  const typeName = currentContext?.domoObject?.typeName || 'Object';
  const label = `Update ${typeName} Details`;
  const tooltip =
    TOOLTIPS_BY_TYPE[typeId] || `Edit this ${typeName.toLowerCase()}'s details`;

  return (
    <Tooltip closeDelay={100} delay={400}>
      <Button
        fullWidth
        className='min-w-36 flex-1 whitespace-normal'
        isPending={isPending}
        variant='tertiary'
        onPress={() =>
          launch({
            currentContext,
            onStatusUpdate,
            type: 'updateDetails'
          })
        }
      >
        <ObjectTypeIcon typeId={typeId} />
        {label}
      </Button>
      <Tooltip.Content className='flex flex-col items-center text-wrap break-normal'>
        {tooltip}
      </Tooltip.Content>
    </Tooltip>
  );
}
