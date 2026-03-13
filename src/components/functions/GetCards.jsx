import { Button, Spinner } from '@heroui/react';
import { IconChartBar } from '@tabler/icons-react';
import { useState } from 'react';

import { getCardsForObject } from '@/services';
import {
  isSidepanel,
  openSidepanel,
  storeSidepanelData,
  waitForCards
} from '@/utils';

const VALID_TYPES = [
  'PAGE',
  'DATA_APP_VIEW',
  'REPORT_BUILDER_VIEW',
  'WORKSHEET_VIEW',
  'DATA_SOURCE'
];

// Types that have cards pre-fetched in background
const PRE_FETCHED_TYPES = [
  'PAGE',
  'DATA_APP_VIEW',
  'DATA_SOURCE',
  'WORKSHEET_VIEW'
];

export function GetCards({
  currentContext,
  isDisabled,
  onCollapseActions,
  onStatusUpdate
}) {
  const [isLoading, setIsLoading] = useState(false);

  const handleGetCards = async () => {
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

      if (!VALID_TYPES.includes(objectType)) {
        onStatusUpdate?.(
          'Invalid Object Type',
          `This function does not support ${currentContext.domoObject.typeName}.`,
          'danger'
        );
        setIsLoading(false);
        return;
      }

      // Popup: hand off intent to sidepanel immediately, no API calls
      if (!isSidepanel()) {
        await storeSidepanelData({
          currentContext,
          type: 'getCards'
        });
        openSidepanel();
        return;
      }

      // Sidepanel: fetch data, then display
      let cards;
      let forms = [];
      let queues = [];

      if (PRE_FETCHED_TYPES.includes(objectType)) {
        const result = await waitForCards(currentContext);
        if (!result.success) {
          onStatusUpdate?.('Error', result.error, 'danger', 3000);
          setIsLoading(false);
          return;
        }
        cards = result.cards;
        forms = result.forms;
        queues = result.queues;
      } else {
        cards = await getCardsForObject({
          objectId: currentContext.domoObject.id,
          objectType,
          tabId: currentContext?.tabId
        });
      }

      if (
        (!cards || cards.length === 0) &&
        (!forms || forms.length === 0) &&
        (!queues || queues.length === 0)
      ) {
        const typeName =
          currentContext.domoObject.typeName?.toLowerCase() || 'object';
        const hasFormsAndQueues = [
          'DATA_APP_VIEW',
          'PAGE',
          'REPORT_BUILDER_VIEW',
          'WORKSHEET_VIEW'
        ].includes(objectType);
        onStatusUpdate?.(
          hasFormsAndQueues ? 'No Items Found' : 'No Cards Found',
          hasFormsAndQueues
            ? `No cards, forms, or queues found on this ${typeName}.`
            : `No cards found on this ${typeName}.`,
          'warning',
          3000
        );
        setIsLoading(false);
        return;
      }

      if (onCollapseActions) {
        await storeSidepanelData({
          message: 'Loading cards...',
          timestamp: Date.now(),
          type: 'loading'
        });

        onCollapseActions();
        await new Promise((resolve) => setTimeout(resolve, 175));
      }

      await storeSidepanelData({
        cards,
        currentContext,
        forms,
        queues,
        statusShown: true,
        type: 'getCards'
      });
    } catch (error) {
      console.error('[GetCards] Error:', error);
      onStatusUpdate?.(
        'Error',
        error.message || 'Failed to get cards',
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
      onPress={handleGetCards}
    >
      {({ isPending }) => {
        if (isPending) {
          return <Spinner color='currentColor' size='sm' />;
        }

        return (
          <>
            <IconChartBar stroke={1.5} /> Get Cards
          </>
        );
      }}
    </Button>
  );
}
