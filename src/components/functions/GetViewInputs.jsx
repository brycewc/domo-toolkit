import { Button, Spinner } from '@heroui/react';
import { IconDatabase } from '@tabler/icons-react';
import { useState } from 'react';

import { getDatasetsForView, isViewType } from '@/services';
import { isSidepanel, openSidepanel, storeSidepanelData } from '@/utils';

export function GetViewInputs({
  currentContext,
  isDisabled,
  onCollapseActions,
  onStatusUpdate
}) {
  const [isLoading, setIsLoading] = useState(false);

  const handleGetViewInputs = async () => {
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

      const objectType = currentContext.domoObject.typeId;
      const objectId = currentContext.domoObject.id;

      if (objectType !== 'DATA_SOURCE') {
        onStatusUpdate?.(
          'Invalid Object Type',
          `This function only works on datasets. Current object is: ${currentContext.domoObject.typeName}`,
          'danger'
        );
        setIsLoading(false);
        return;
      }

      const details = currentContext.domoObject.metadata?.details;
      if (!isViewType(details)) {
        onStatusUpdate?.(
          'Not a View',
          'This dataset is not a DataSet View or DataFusion. Only views have underlying datasets.',
          'warning'
        );
        setIsLoading(false);
        return;
      }

      if (!isSidepanel()) {
        await storeSidepanelData({
          currentContext,
          type: 'getViewInputs'
        });
        openSidepanel();
        return;
      }

      const datasets = await getDatasetsForView({
        datasetId: objectId,
        tabId: currentContext?.tabId
      });

      if (!datasets || datasets.length === 0) {
        onStatusUpdate?.(
          'No DataSets Found',
          'No underlying datasets found in this view.',
          'warning',
          3000
        );
        setIsLoading(false);
        return;
      }

      if (onCollapseActions) {
        await storeSidepanelData({
          message: 'Loading datasets used in view...',
          timestamp: Date.now(),
          type: 'loading'
        });

        onCollapseActions();
        await new Promise((resolve) => setTimeout(resolve, 175));
      }

      await storeSidepanelData({
        currentContext,
        datasets,
        statusShown: true,
        type: 'getViewInputs'
      });
    } catch (error) {
      console.error('[GetViewInputs] Error:', error);
      onStatusUpdate?.(
        'Error',
        error.message || 'Failed to get datasets used in view',
        'danger'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const objectType = currentContext?.domoObject?.typeId;
  const details = currentContext?.domoObject?.metadata?.details;
  if (objectType !== 'DATA_SOURCE' || !isViewType(details)) return null;

  return (
    <Button
      fullWidth
      className='min-w-36 flex-1 whitespace-normal'
      isDisabled={isDisabled}
      isPending={isLoading}
      variant='tertiary'
      onPress={handleGetViewInputs}
    >
      {({ isPending }) => {
        if (isPending) {
          return <Spinner color='currentColor' size='sm' />;
        }

        return (
          <>
            <IconDatabase stroke={1.5} /> Get DataSets Used in View
          </>
        );
      }}
    </Button>
  );
}
