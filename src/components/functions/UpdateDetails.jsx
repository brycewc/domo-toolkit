import { Button, Tooltip } from '@heroui/react';
import { IconArrowFork } from '@tabler/icons-react';

import { useLaunchView } from '@/hooks';

export function UpdateDetails({ currentContext, onStatusUpdate }) {
  const { isPending, launch } = useLaunchView();
  const typeId = currentContext?.domoObject?.typeId;
  const isDataset = typeId === 'DATA_SOURCE';
  const label = isDataset ? 'Update DataSet Details' : 'Update DataFlow Details';
  const tooltip = isDataset
    ? "Edit this dataset's userDefinedType"
    : "Edit this dataflow's name and description";

  return (
    <Tooltip closeDelay={0} delay={400}>
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
        <IconArrowFork className='rotate-180' stroke={1.5} />
        {label}
      </Button>
      <Tooltip.Content>{tooltip}</Tooltip.Content>
    </Tooltip>
  );
}
