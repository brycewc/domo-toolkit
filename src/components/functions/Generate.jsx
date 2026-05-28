import { Button, Tooltip } from '@heroui/react';

import { launchView } from '@/utils/sidepanel';
import IconMagic from '@icons/magic.svg?react';

export function Generate({ currentContext, isDisabled, onCollapseActions, onStatusUpdate }) {
  const typeId = currentContext?.domoObject?.typeId;
  const isAppDbCollection = typeId === 'MAGNUM_COLLECTION';

  const label = isAppDbCollection ? 'Generate Schema' : 'Generate Definition from JSDoc';
  const tooltipText = isAppDbCollection
    ? 'Infer a column schema from the most recent 100 documents, edit it, and apply (Sync produces DataSet columns from the saved schema)'
    : 'Generate/sync the code engine package definition from JSDoc in the code';
  const viewType = isAppDbCollection ? 'generateSchema' : 'generatePackageDefinitionFromJSDoc';

  return (
    <Tooltip closeDelay={100} delay={800}>
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
            type: viewType
          })
        }
      >
        <IconMagic /> {label}
      </Button>
      <Tooltip.Content
        className='flex max-w-60 flex-col items-center justify-center px-1 py-0.5 text-center text-wrap break-normal'
        offset={4}
      >
        {tooltipText}
      </Tooltip.Content>
    </Tooltip>
  );
}
