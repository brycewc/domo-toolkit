import { Button, Tooltip } from '@heroui/react';

import { launchView } from '@/utils/sidepanel';
import IconDoubleChevronUp from '@icons/double-chevron-up.svg?react';

export function UpdateTriggerVersions({ currentContext, isDisabled, onCollapseActions, onStatusUpdate }) {
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
            type: 'updateTriggerVersions'
          })
        }
      >
        <IconDoubleChevronUp /> Update Trigger Versions
      </Button>
      <Tooltip.Content className='max-w-60' offset={4}>
        Repoint this workflow's alert triggers to a new version
      </Tooltip.Content>
    </Tooltip>
  );
}
