import { Button, Spinner } from '@heroui/react';
import { IconPackages } from '@tabler/icons-react';
import { useState } from 'react';

import {
  isSidepanel,
  openSidepanel,
  storeSidepanelData,
  waitForDefinition
} from '@/utils';

export function UpdateCodeEngineVersions({
  currentContext,
  isDisabled,
  onCollapseActions,
  onStatusUpdate
}) {
  const [isLoading, setIsLoading] = useState(false);

  const handlePress = async () => {
    setIsLoading(true);

    try {
      if (!currentContext?.domoObject) {
        onStatusUpdate?.(
          'No Object Detected',
          'Please navigate to a Domo page and try again',
          'danger'
        );
        setIsLoading(false);
        return;
      }

      if (currentContext.domoObject.typeId !== 'WORKFLOW_MODEL_VERSION') {
        onStatusUpdate?.(
          'Invalid Object Type',
          'This function only supports Workflow Model Versions.',
          'danger'
        );
        setIsLoading(false);
        return;
      }

      // Popup: hand off intent to sidepanel immediately
      if (!isSidepanel()) {
        await storeSidepanelData({
          currentContext,
          type: 'updateCodeEngineVersions'
        });
        openSidepanel();
        return;
      }

      // Sidepanel: wait for definition, validate, then open view
      const result = await waitForDefinition(currentContext);
      if (!result.success) {
        onStatusUpdate?.('Error', result.error, 'danger', 3000);
        setIsLoading(false);
        return;
      }

      const { definition } = result;
      const codeEngineTiles = (definition.designElements || []).filter(
        (el) =>
          el.data?.taskType === 'nebulaFunction' && el.data?.metadata?.packageId
      );

      if (codeEngineTiles.length === 0) {
        onStatusUpdate?.(
          'No Code Engine Packages',
          'This workflow version does not use any code engine functions.',
          'warning',
          3000
        );
        setIsLoading(false);
        return;
      }

      if (onCollapseActions) {
        await storeSidepanelData({
          message: 'Loading code engine packages...',
          timestamp: Date.now(),
          type: 'loading'
        });

        onCollapseActions();
        await new Promise((resolve) => setTimeout(resolve, 175));
      }

      await storeSidepanelData({
        currentContext,
        definition,
        timestamp: Date.now(),
        type: 'updateCodeEngineVersions'
      });
    } catch (error) {
      console.error('[UpdateCodeEngineVersions] Error:', error);
      onStatusUpdate?.(
        'Error',
        error.message || 'Failed to load code engine packages',
        'danger'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      fullWidth
      className='min-w-36 flex-1 whitespace-normal'
      isDisabled={isDisabled}
      isPending={isLoading}
      variant='tertiary'
      onPress={handlePress}
    >
      {({ isPending }) => {
        if (isPending) {
          return <Spinner color='currentColor' size='sm' />;
        }

        return (
          <>
            <IconPackages stroke={1.5} /> Update Code Engine Versions
          </>
        );
      }}
    </Button>
  );
}
