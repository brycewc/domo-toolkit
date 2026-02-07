import { useState } from 'react';
import { Button, Spinner } from '@heroui/react';
import {
  waitForCards,
  isSidepanel,
  showStatus,
  storeSidepanelData,
  openSidepanel
} from '@/utils';
import { getCardsForObject } from '@/services';
import { IconChartBar } from '@tabler/icons-react';

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
  onStatusUpdate,
  isDisabled,
  onCollapseActions
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

      let cards;

      if (PRE_FETCHED_TYPES.includes(objectType)) {
        const result = await waitForCards(currentContext);
        if (!result.success) {
          onStatusUpdate?.('Error', result.error, 'danger', 3000);
          setIsLoading(false);
          return;
        }
        cards = result.cards;
      } else {
        cards = await getCardsForObject({
          objectId: currentContext.domoObject.id,
          objectType,
          tabId: currentContext?.tabId
        });
      }

      if (!cards || cards.length === 0) {
        onStatusUpdate?.(
          'No Cards Found',
          'No cards found for this object.',
          'warning',
          3000
        );
        setIsLoading(false);
        return;
      }

      const inSidepanel = isSidepanel();

      if (onCollapseActions) {
        await storeSidepanelData({
          type: 'loading',
          message: 'Loading cards...',
          timestamp: Date.now()
        });

        onCollapseActions();
        await new Promise((resolve) => setTimeout(resolve, 175));
      }

      if (!inSidepanel) {
        openSidepanel();
        await showStatus({
          onStatusUpdate,
          title: 'Opening Sidepanel',
          description: 'Loading cards...',
          status: 'success',
          timeout: 2000,
          inSidepanel
        });
      }

      await storeSidepanelData({
        type: 'getCards',
        currentContext,
        cards,
        statusShown: true
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
      variant='tertiary'
      fullWidth
      onPress={handleGetCards}
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
            <IconChartBar stroke={1.5} /> Get Cards
          </>
        );
      }}
    </Button>
  );
}
