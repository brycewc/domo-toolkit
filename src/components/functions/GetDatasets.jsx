import { useState } from 'react';
import { Button, Spinner } from '@heroui/react';
import { isSidepanel, storeSidepanelData, openSidepanel } from '@/utils';
import {
  getDatasetsForPage,
  getDatasetsForDataflow,
  getDatasetsForView,
  isViewType
} from '@/services';
import { IconDatabase } from '@tabler/icons-react';

export function GetDatasets({
  currentContext,
  onStatusUpdate,
  isDisabled,
  onCollapseActions
}) {
  const [isLoading, setIsLoading] = useState(false);

  const handleGetDatasets = async () => {
    setIsLoading(true);

    try {
      // Validate we have a current object
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

      // Check if the current object is a valid type
      const validTypes = [
        'PAGE',
        'DATA_APP_VIEW',
        'DATAFLOW_TYPE',
        'DATA_SOURCE'
      ];
      if (!validTypes.includes(objectType)) {
        onStatusUpdate?.(
          'Invalid Object Type',
          `This function only works on pages, dataflows, and datasets. Current object is: ${currentContext.domoObject.typeName}`,
          'danger'
        );
        setIsLoading(false);
        return;
      }

      // For DATA_SOURCE, check if it's a view type
      if (objectType === 'DATA_SOURCE') {
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
      }

      // Popup: hand off intent to sidepanel immediately, no API calls
      if (!isSidepanel()) {
        await storeSidepanelData({
          type: 'getDatasets',
          currentContext
        });
        openSidepanel();
        return;
      }

      // Sidepanel: fetch data, then display
      let datasets = [];
      let dataflowInputs = null;
      let dataflowOutputs = null;

      if (objectType === 'PAGE' || objectType === 'DATA_APP_VIEW') {
        datasets = await getDatasetsForPage({
          pageId: objectId,
          tabId: currentContext?.tabId
        });
      } else if (objectType === 'DATAFLOW_TYPE') {
        const details = currentContext.domoObject.metadata?.details;
        const result = getDatasetsForDataflow({ details });
        dataflowInputs = result.inputs;
        dataflowOutputs = result.outputs;
        datasets = [...result.inputs, ...result.outputs];
      } else if (objectType === 'DATA_SOURCE') {
        datasets = await getDatasetsForView({
          datasetId: objectId,
          tabId: currentContext?.tabId
        });
      }

      if (!datasets || datasets.length === 0) {
        const message =
          objectType === 'DATAFLOW_TYPE'
            ? 'This dataflow has no input or output datasets.'
            : objectType === 'DATA_SOURCE'
              ? 'No underlying datasets found in this view.'
              : 'No datasets found for this page.';

        onStatusUpdate?.('No Datasets Found', message, 'warning', 3000);
        setIsLoading(false);
        return;
      }

      if (onCollapseActions) {
        await storeSidepanelData({
          type: 'loading',
          message: 'Loading datasets...',
          timestamp: Date.now()
        });

        onCollapseActions();
        await new Promise((resolve) => setTimeout(resolve, 175));
      }

      await storeSidepanelData({
        type: 'getDatasets',
        currentContext,
        datasets: objectType === 'DATAFLOW_TYPE' ? null : datasets,
        dataflowInputs,
        dataflowOutputs,
        statusShown: true
      });
    } catch (error) {
      console.error('[GetDatasets] Error:', error);
      onStatusUpdate?.(
        'Error',
        error.message || 'Failed to get datasets',
        'danger'
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Determine button text and visibility
  const objectType = currentContext?.domoObject?.typeId;
  const details = currentContext?.domoObject?.metadata?.details;

  // For DATA_SOURCE, only show if it's a view type
  if (objectType === 'DATA_SOURCE' && !isViewType(details)) {
    return null;
  }

  let buttonText = 'Get DataSets';
  if (objectType === 'DATA_SOURCE') {
    buttonText = 'Get DataSets Used in View';
  } else if (objectType === 'DATAFLOW_TYPE') {
    buttonText = 'Get DataFlow DataSets';
  }

  return (
    <Button
      variant='tertiary'
      fullWidth
      onPress={handleGetDatasets}
      isDisabled={isDisabled}
      isPending={isLoading}
      isIconOnly={isLoading}
      className='relative min-w-fit flex-1 basis-[48%] overflow-visible'
    >
      {({ isPending }) => {
        if (isPending) {
          return <Spinner color='currentColor' size='sm' />;
        }

        return (
          <>
            <IconDatabase stroke={1.5} /> {buttonText}
          </>
        );
      }}
    </Button>
  );
}
