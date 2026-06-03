import { Button, Tooltip } from '@heroui/react';

import { useStatusBar } from '@/hooks/useStatusBar';
import { syncAppDbDatastore } from '@/services/appDb';
import IconSync from '@icons/sync.svg?react';

export function Sync({ currentContext, isDisabled }) {
  const { showPromiseStatus } = useStatusBar();

  const handlePress = () => {
    const datastoreId = currentContext?.domoObject?.parentId;
    if (!datastoreId) return;
    const collectionName = currentContext.domoObject.metadata?.name || `Collection ${currentContext.domoObject.id}`;
    showPromiseStatus(syncAppDbDatastore({ datastoreId, tabId: currentContext.tabId }), {
      error: (err) => `Failed to sync datastore for **${collectionName}**: ${err.message}`,
      loading: `Syncing AppDB datastore for **${collectionName}**...`,
      success: () => `Sync started for AppDB datastore of **${collectionName}**`
    });
  };

  return (
    <Tooltip closeDelay={100} delay={800}>
      <Button
        fullWidth
        className='min-w-36 flex-1 whitespace-normal'
        isDisabled={isDisabled}
        variant='tertiary'
        onPress={handlePress}
      >
        <IconSync /> Sync Datastore
      </Button>
      <Tooltip.Content
        className='flex max-w-60 flex-col items-center justify-center px-1 py-0.5 text-center text-balance break-normal'
        offset={4}
      >
        Trigger a manual sync of the parent AppDB datastore (affects every collection in the datastore)
      </Tooltip.Content>
    </Tooltip>
  );
}
