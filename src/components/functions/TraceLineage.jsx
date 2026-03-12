import { Button } from '@heroui/react';
import { IconBinaryTree } from '@tabler/icons-react';

import { isSidepanel } from '@/utils';

export function TraceLineage({ currentContext, onStatusUpdate }) {
  const isDisabled =
    !currentContext?.domoObject?.id ||
    !['DATA_SOURCE', 'DATAFLOW_TYPE'].includes(
      currentContext?.domoObject?.typeId
    );

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

      onStatusUpdate?.(
        'Opening Lineage',
        'Loading pipeline lineage visualization...',
        'success'
      );

      const optionsUrl = chrome.runtime.getURL(
        'src/options/index.html#lineage'
      );
      window.open(optionsUrl, '_blank', 'noopener,noreferrer');

      if (!isSidepanel()) window.close();
    } catch (err) {
      console.error('Error opening lineage viewer:', err);
      onStatusUpdate?.(
        'Error',
        `Failed to open lineage viewer: ${err.message}`,
        'danger'
      );
    }
  };

  return (
    <Button
      fullWidth
      className='min-w-36 flex-1 whitespace-normal'
      isDisabled={isDisabled}
      variant='tertiary'
      onPress={handlePress}
    >
      <IconBinaryTree stroke={1.5} />
      Trace Lineage
    </Button>
  );
}
