import { Button, Tooltip } from '@heroui/react';
import { IconFileCode } from '@tabler/icons-react';

import { launchView } from '@/utils';

export function SyncJSDocFromSource({
  currentContext,
  isDisabled,
  onCollapseActions,
  onStatusUpdate
}) {
  return (
    <Tooltip closeDelay={100} delay={600}>
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
            type: 'syncJSDocFromSource'
          })
        }
      >
        <IconFileCode stroke={1.5} /> Sync JSDoc to Package
      </Button>
      <Tooltip.Content className='flex max-w-60 flex-col items-center justify-center px-1 py-0.5 text-center text-wrap break-normal'>
        Generate the package definition from JSDoc in the IDE source and release a new version
      </Tooltip.Content>
    </Tooltip>
  );
}
