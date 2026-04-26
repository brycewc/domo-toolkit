import { Button, Tooltip } from '@heroui/react';
import { IconLock } from '@tabler/icons-react';

import { useStatusBar } from '@/hooks';
import { getCardsForObject, lockCards } from '@/services';
import { waitForCards } from '@/utils';

const VALID_TYPES = [
  'DATA_APP_VIEW',
  'DATA_SOURCE',
  'PAGE',
  'REPORT_BUILDER_VIEW',
  'WORKSHEET_VIEW'
];

const PRE_FETCHED_TYPES = ['DATA_APP_VIEW', 'DATA_SOURCE', 'PAGE', 'WORKSHEET_VIEW'];

export function LockCards({ currentContext, isDisabled }) {
  const { showPromiseStatus, showStatus } = useStatusBar();

  const handleLockCards = async () => {
    if (!currentContext?.domoObject) {
      showStatus('No Object Detected', 'Please navigate to a Domo page and try again', 'danger');
      return;
    }

    const objectType = currentContext.domoObject.typeId;

    if (!VALID_TYPES.includes(objectType)) {
      showStatus(
        'Invalid Object Type',
        `This function does not support ${currentContext.domoObject.typeName}.`,
        'danger'
      );
      return;
    }

    const promise = (async () => {
      let cards;

      if (PRE_FETCHED_TYPES.includes(objectType)) {
        const result = await waitForCards(currentContext);
        if (!result.success) throw new Error(result.error);
        cards = result.cards;
      } else {
        cards = await getCardsForObject({
          objectId: currentContext.domoObject.id,
          objectType,
          tabId: currentContext?.tabId
        });
      }

      if (!cards || cards.length === 0) {
        throw new Error('No cards found for this object');
      }

      const cardIds = cards.map((card) => card.id);
      await lockCards({ cardIds, tabId: currentContext?.tabId });
      return { count: cardIds.length };
    })();

    showPromiseStatus(promise, {
      error: (err) => err.message || 'Failed to lock cards',
      loading: 'Locking cards…',
      success: (data) => `Locked **${data.count}** card${data.count === 1 ? '' : 's'}`
    });
  };

  return (
    <Tooltip closeDelay={0} delay={400}>
      <Button
        fullWidth
        className='min-w-36 flex-1 whitespace-normal'
        isDisabled={isDisabled}
        variant='tertiary'
        onPress={handleLockCards}
      >
        <IconLock stroke={1.5} />
        Lock Cards
      </Button>
      <Tooltip.Content className='flex flex-col items-center text-wrap break-normal'>
        Lock all cards on this object from being edited
      </Tooltip.Content>
    </Tooltip>
  );
}
