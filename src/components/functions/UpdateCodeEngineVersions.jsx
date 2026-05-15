import { Button, Tooltip } from '@heroui/react';

import { launchView } from '@/utils/sidepanel';
import IconPackage from '@icons/package.svg?react';

export function UpdateCodeEngineVersions({
  currentContext,
  isDisabled,
  onCollapseActions,
  onStatusUpdate
}) {
  return (
    <Tooltip closeDelay={100} delay={600}>
      <Button
        fullWidth
        className='h-auto min-h-9 min-w-36 flex-1 whitespace-normal py-1.5'
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
      <Tooltip.Content
        className='flex max-w-60 flex-col items-center justify-center px-1 py-0.5 text-center text-wrap break-normal'
        offset={4}
      >
        Update code engine package versions on cards
      </Tooltip.Content>
    </Tooltip>
  );
}
