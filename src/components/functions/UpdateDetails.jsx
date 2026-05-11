import { Button, Tooltip } from '@heroui/react';

import { ObjectTypeIcon } from '@/components/ObjectTypeIcon';
import { useLaunchView } from '@/hooks/useLaunchView';

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
  const tooltip = TOOLTIPS_BY_TYPE[typeId] || `Edit this ${typeName.toLowerCase()}'s details`;

  return (
    <Tooltip closeDelay={100} delay={600}>
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
      <Tooltip.Content
        className='flex max-w-60 flex-col items-center justify-center px-1 py-0.5 text-center text-wrap break-normal'
        offset={4}
      >
        {tooltip}
      </Tooltip.Content>
    </Tooltip>
  );
}
