import { Button, Tooltip } from '@heroui/react';

import { useStatusBar } from '@/hooks/useStatusBar';
import { syncAppDbDatastore } from '@/services/appDb';
import { createTemplateDataset } from '@/services/approvals';
import IconSync from '@icons/sync.svg?react';

export function Sync({ currentContext, isDisabled }) {
  const { showPromiseStatus } = useStatusBar();
  const isApprovalTemplate = currentContext?.domoObject?.typeId === 'TEMPLATE';

  const label = isApprovalTemplate ? 'Create DataSet' : 'Sync Datastore';
  const tooltipText = isApprovalTemplate
    ? 'Create the dataset for this approval template'
    : 'Trigger a manual sync of the parent AppDB datastore (affects every collection in the datastore)';

  const handlePress = () => {
    if (isApprovalTemplate) {
      const templateId = currentContext?.domoObject?.id;
      if (!templateId) return;
      const tabId = currentContext.tabId;
      const templateName = currentContext.domoObject.metadata?.name || 'this approval template';
      // The mutation reports only success, so the reload is what refreshes the
      // cached details with the new dataset's ID.
      showPromiseStatus(createTemplateDataset({ tabId, templateId }).then(() => chrome.tabs.reload(tabId)), {
        error: (err) => `Failed to create the dataset for **${templateName}**: ${err.message}`,
        loading: `Creating the dataset for **${templateName}**...`,
        success: () => `Created the dataset for **${templateName}**`
      });
      return;
    }

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
    <Tooltip>
      <Button
        fullWidth
        className='min-w-36 flex-1 whitespace-normal'
        isDisabled={isDisabled}
        variant='tertiary'
        onPress={handlePress}
      >
        <IconSync /> {label}
      </Button>
      <Tooltip.Content className='max-w-60' offset={4}>
        {tooltipText}
      </Tooltip.Content>
    </Tooltip>
  );
}
