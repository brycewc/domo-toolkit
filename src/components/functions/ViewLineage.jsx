import { Button, Tooltip } from '@heroui/react';
import { IconBinaryTree } from '@tabler/icons-react';

export function ViewLineage({ currentContext, onStatusUpdate }) {
  const isDisabled =
    !currentContext?.domoObject?.id ||
    !['DATA_SOURCE', 'DATAFLOW_TYPE'].includes(currentContext?.domoObject?.typeId);

  const handlePress = async () => {
    if (!currentContext?.domoObject) return;

    try {
      await chrome.storage.session.set({
        lineageEntityId: currentContext.domoObject.id,
        lineageEntityType: currentContext.domoObject.typeId,
        lineageInstance: currentContext.instance,
        lineageObjectName:
          currentContext.domoObject.metadata?.name ||
          `${currentContext.domoObject.typeName} ${currentContext.domoObject.id}`,
        lineageTabId: currentContext.tabId
      });

      onStatusUpdate?.('Opening Lineage', 'Loading pipeline lineage visualization...', 'success');

      // Open in the same window (preserves incognito context)
      const tab = await chrome.tabs.get(currentContext.tabId);
      chrome.tabs.create({
        url: chrome.runtime.getURL('src/options/index.html#lineage'),
        windowId: tab.windowId
      });

      window.close();
    } catch (err) {
      console.error('Error opening lineage viewer:', err);
      onStatusUpdate?.('Error', `Failed to open lineage viewer: ${err.message}`, 'danger');
    }
  };

  return (
    <Tooltip closeDelay={0} delay={400}>
      <Button
        fullWidth
        className='min-w-36 flex-1 whitespace-normal'
        isDisabled={isDisabled}
        variant='tertiary'
        onPress={handlePress}
      >
        <IconBinaryTree stroke={1.5} />
        View Lineage
      </Button>
      <Tooltip.Content className='flex flex-col items-center text-wrap break-normal'>
        Open lineage visualization for this object
      </Tooltip.Content>
    </Tooltip>
  );
}
