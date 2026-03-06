import { Button, Spinner } from '@heroui/react';
import { IconDatabase } from '@tabler/icons-react';
import { useState } from 'react';

import {
  getDatasetsForDataflow,
  getDatasetsForPage,
  getDependentDatasets
} from '@/services';
import { isSidepanel, openSidepanel, storeSidepanelData } from '@/utils';

export function GetDatasets({
  currentContext,
  isDisabled,
  onCollapseActions,
  onStatusUpdate
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
        'CARD',
        'DATAFLOW_TYPE',
        'DATA_SOURCE'
      ];
      if (!validTypes.includes(objectType)) {
        onStatusUpdate?.(
          'Invalid Object Type',
          `This function only works on pages, cards, dataflows, and datasets. Current object is: ${currentContext.domoObject.typeName}`,
          'danger'
        );
        setIsLoading(false);
        return;
      }

      // Popup: hand off intent to sidepanel immediately, no API calls
      if (!isSidepanel()) {
        await storeSidepanelData({
          currentContext,
          type: 'getDatasets'
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
      } else if (objectType === 'CARD') {
        datasets =
          currentContext.domoObject.metadata?.details?.datasources || [];
      } else if (objectType === 'DATAFLOW_TYPE') {
        const details = currentContext.domoObject.metadata?.details;
        const result = getDatasetsForDataflow({ details });
        dataflowInputs = result.inputs;
        dataflowOutputs = result.outputs;
        datasets = [...result.inputs, ...result.outputs];
      } else if (objectType === 'DATA_SOURCE') {
        datasets = await getDependentDatasets({
          datasetId: objectId,
          tabId: currentContext?.tabId
        });
      }

      if (!datasets || datasets.length === 0) {
        const message =
          objectType === 'DATAFLOW_TYPE'
            ? 'This dataflow has no input or output datasets.'
            : objectType === 'DATA_SOURCE'
              ? 'No dependent datasets found for this dataset.'
              : objectType === 'CARD'
                ? 'No datasets found for this card.'
                : 'No datasets found for this page.';

        onStatusUpdate?.('No Datasets Found', message, 'warning', 3000);
        setIsLoading(false);
        return;
      }

      if (onCollapseActions) {
        await storeSidepanelData({
          message: 'Loading datasets...',
          timestamp: Date.now(),
          type: 'loading'
        });

        onCollapseActions();
        await new Promise((resolve) => setTimeout(resolve, 175));
      }

      await storeSidepanelData({
        currentContext,
        dataflowInputs,
        dataflowOutputs,
        datasets: objectType === 'DATAFLOW_TYPE' ? null : datasets,
        statusShown: true,
        type: 'getDatasets'
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

  const objectType = currentContext?.domoObject?.typeId;

  let buttonText;
  switch (objectType) {
    case 'CARD':
      buttonText = 'Get Card DataSets';
      break;
    case 'DATA_SOURCE':
      buttonText = 'Get Views';
      break;
    case 'DATAFLOW_TYPE':
      buttonText = 'Get DataFlow DataSets';
      break;
    default:
      buttonText = 'Get DataSets';
  }

  return (
    <Button
      fullWidth
      className='min-w-36 flex-1 whitespace-normal'
      isDisabled={isDisabled}
      isPending={isLoading}
      variant='tertiary'
      onPress={handleGetDatasets}
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
