import { Button, Tooltip } from '@heroui/react';

import { useLaunchView } from '@/hooks/useLaunchView';
import IconPencil from '@icons/pencil.svg?react';

// Per-type tooltip describing what fields the Update Details view edits.
// Falls back to a generic message for any type without an entry here.
const TOOLTIPS_BY_TYPE = {
  DATA_SOURCE: "Edit this dataset's user defined type",
  DATAFLOW_TYPE: "Edit this dataflow's name and description",
  MAGNUM_COLLECTION: 'Rename this AppDB collection',
  USER: "Edit this person's username, the login and SSO identity"
};

export function UpdateDetails({ currentContext, onStatusUpdate }) {
  const { isPending, launch } = useLaunchView();
  const typeId = currentContext?.domoObject?.typeId;
  const typeName = currentContext?.domoObject?.typeName || 'Object';
  const label = `Update ${typeName} Details`;
  const tooltip = TOOLTIPS_BY_TYPE[typeId] || `Edit this ${typeName.toLowerCase()}'s details`;

  return (
    <Tooltip>
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
        <IconPencil />
        {label}
      </Button>
      <Tooltip.Content className='max-w-60' offset={4}>
        {tooltip}
      </Tooltip.Content>
    </Tooltip>
  );
}
