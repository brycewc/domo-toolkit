import { Button, Tooltip } from '@heroui/react';

import IconLineage from '@icons/lineage.svg?react';
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

      // Open in the same window (preserves incognito context), right after the launching tab
      const tab = await chrome.tabs.get(currentContext.tabId);
      chrome.tabs.create({
        index: tab.index + 1,
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
    <Tooltip closeDelay={100} delay={600}>
      <Button
        fullWidth
        className='min-w-36 flex-1 whitespace-normal'
        isDisabled={isDisabled}
        variant='tertiary'
        onPress={handlePress}
      >
        <IconLineage />
        View Lineage
      </Button>
      <Tooltip.Content
        className='flex max-w-60 flex-col items-center justify-center px-1 py-0.5 text-center text-wrap break-normal'
        offset={4}
      >
        Open lineage visualization for this object
      </Tooltip.Content>
    </Tooltip>
  );
}
