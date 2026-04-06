import { Button } from '@heroui/react';
import { IconPackages } from '@tabler/icons-react';

import { launchView } from '@/utils';

export function UpdateCodeEngineVersions({
  currentContext,
  isDisabled,
  onCollapseActions,
  onStatusUpdate
}) {
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
          type: 'updateCodeEngineVersions'
        })
      }
    >
      <IconPackages stroke={1.5} /> Update Code Engine Versions
    </Button>
  );
}
