import { Button, Tooltip } from '@heroui/react';
import { IconXboxX } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';

import { useStatusBar } from '@/hooks';
import { getCardDefinition, updateCardDefinition } from '@/services';

export function RemoveEmptyStringsFromQuickFilters({
  currentContext,
  onStatusUpdate
}) {
  const [emptyCount, setEmptyCount] = useState(null);
  const definitionRef = useRef(null);
  const cardId = currentContext?.domoObject?.id;
  const tabId = currentContext?.tabId;
  const { showPromiseStatus } = useStatusBar();

  useEffect(() => {
    definitionRef.current = null;
    setEmptyCount(null);

    if (!cardId) return;

    let cancelled = false;

    (async () => {
      try {
        const def = await getCardDefinition({ cardId, tabId });
        if (cancelled) return;
        definitionRef.current = def;
        setEmptyCount(def ? countEmptyStringFilters(def) : 0);
      } catch {
        if (!cancelled) setEmptyCount(0);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cardId, tabId]);

  if (!cardId || !emptyCount) return null;

  const handleClick = () => {
    const definition = definitionRef.current;
    if (!definition) {
      onStatusUpdate?.(
        'No Definition Found',
        `No definition found for card **${cardId}**`,
        'warning'
      );
      return;
    }

    let removed = 0;
    definition.definition.controls.forEach((control) => {
      if (
        Array.isArray(control.values) &&
        control.values.length === 1 &&
        control.values[0] === ''
      ) {
        control.values = [];
        removed++;
      }
    });

    const promise = updateCardDefinition({ cardId, definition, tabId }).then(
      () => {
        setEmptyCount(0);
        definitionRef.current = null;
        chrome.tabs.reload(tabId);
        return removed;
      }
    );

    showPromiseStatus(promise, {
      error: () =>
        `Failed to remove empty strings from card **${cardId}** quick filters`,
      loading: `Removing empty strings from card **${cardId}**…`,
      success: (count) =>
        `Removed ${count} empty string quick filter${count === 1 ? '' : 's'} from card **${cardId}**`
    });
  };

  return (
    <Tooltip closeDelay={0} delay={400}>
      <Button
        fullWidth
        className='min-w-36 flex-1 whitespace-normal'
        isDisabled={emptyCount === null}
        variant='tertiary'
        onPress={handleClick}
      >
        <IconXboxX stroke={1.5} />
        Fix Empty String Filters
      </Button>
      <Tooltip.Content className='break-normal'>
        Sets the default of contains quick filters to nothing instead of an
        empty string, so that null values will show instead of being filtered
        out. Currently affects {emptyCount} filter{emptyCount === 1 ? '' : 's'}{' '}
        on this card.
      </Tooltip.Content>
    </Tooltip>
  );
}

function countEmptyStringFilters(definition) {
  if (!Array.isArray(definition?.definition?.controls)) return 0;
  return definition.definition.controls.filter(
    (control) =>
      Array.isArray(control.values) &&
      control.values.length === 1 &&
      control.values[0] === ''
  ).length;
}
