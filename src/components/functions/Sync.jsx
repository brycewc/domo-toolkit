import { Button, Tooltip } from '@heroui/react';

import { useStatusBar } from '@/hooks/useStatusBar';
import { syncAppDbDatastore } from '@/services/appDb';
import { launchView } from '@/utils/sidepanel';
import IconSync from '@icons/sync.svg?react';

export function Sync({
  currentContext,
  isDisabled,
  onCollapseActions,
  onStatusUpdate
}) {
  const { showPromiseStatus } = useStatusBar();
  const typeId = currentContext?.domoObject?.typeId;
  const isAppDbCollection = typeId === 'MAGNUM_COLLECTION';

  const label = isAppDbCollection ? 'Sync Datastore' : 'Sync JSDoc to Package';
  const tooltipText = isAppDbCollection
    ? 'Trigger a manual sync of the parent AppDB datastore (affects every collection in the datastore)'
    : 'Generate the package definition from JSDoc in the IDE source and release a new version';

  const handlePress = () => {
    if (isAppDbCollection) {
      const datastoreId = currentContext?.domoObject?.parentId;
      if (!datastoreId) return;
      const collectionName =
        currentContext.domoObject.metadata?.name || `Collection ${currentContext.domoObject.id}`;
      showPromiseStatus(
        syncAppDbDatastore({ datastoreId, tabId: currentContext.tabId }),
        {
          error: (err) => `Failed to sync datastore for **${collectionName}**: ${err.message}`,
          loading: `Syncing AppDB datastore for **${collectionName}**...`,
          success: () => `Sync started for AppDB datastore of **${collectionName}**`
        }
      );
      return;
    }
    launchView({
      currentContext,
      onCollapseActions,
      onStatusUpdate,
      type: 'syncJSDocFromSource'
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
        <IconSync /> {label}
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
