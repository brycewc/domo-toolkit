import { useState, useEffect, useRef } from 'react';
import { Button } from '@heroui/react';
import { IconXboxX } from '@tabler/icons-react';
import { getCardDefinition, updateCardDefinition } from '@/services';
import { useStatusBar } from '@/hooks';

function countEmptyStringFilters(definition) {
  if (!Array.isArray(definition?.definition?.controls)) return 0;
  return definition.definition.controls.filter(
    (control) =>
      Array.isArray(control.values) &&
      control.values.length === 1 &&
      control.values[0] === ''
  ).length;
}

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
        chrome.tabs.reload(tabId);
        return removed;
      }
    );

    showPromiseStatus(promise, {
      loading: `Removing empty strings from card **${cardId}**…`,
      success: (count) =>
        `Removed ${count} empty string quick filter${count === 1 ? '' : 's'} from card **${cardId}**`,
      error: () =>
        `Failed to remove empty strings from card **${cardId}** quick filters`
    });
  };

  return (
    <Button
      variant='tertiary'
      onPress={handleClick}
      isDisabled={emptyCount === null}
      fullWidth
      className='min-w-fit flex-1 basis-[48%]'
    >
      <IconXboxX stroke={1.5} />
      Remove Empty Strings from Quick Filters
    </Button>
  );
}
