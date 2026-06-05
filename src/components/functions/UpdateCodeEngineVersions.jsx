import { Button, Tooltip } from '@heroui/react';

import { launchView } from '@/utils/sidepanel';
import IconPackage from '@icons/package.svg?react';

export function UpdateCodeEngineVersions({ currentContext, isDisabled, onCollapseActions, onStatusUpdate }) {
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
            type: 'updateCodeEngineVersions'
          })
        }
      >
        <IconPackage /> Update Code Engine Versions
      </Button>
      <Tooltip.Content className='max-w-60' offset={4}>
        Update code engine package versions on cards
      </Tooltip.Content>
    </Tooltip>
  );
}
