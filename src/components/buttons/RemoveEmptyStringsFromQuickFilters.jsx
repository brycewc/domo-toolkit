import { Button, Tooltip } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';

import { useStatusBar } from '@/hooks/useStatusBar';
import { getCardDefinition, updateCardDefinition } from '@/services/cards';
import IconCancel from '@icons/cancel.svg?react';

export function RemoveEmptyStringsFromQuickFilters({ currentContext, onStatusUpdate }) {
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
      onStatusUpdate?.('No Definition Found', `No definition found for card **${cardId}**`, 'warning');
      return;
    }

    const removed = countEmptyStringFilters(definition);
    removeEmptyStringFilters(definition);

    const promise = updateCardDefinition({ cardId, definition, tabId }).then(() => {
      setEmptyCount(0);
      definitionRef.current = null;
      chrome.tabs.reload(tabId);
      return removed;
    });

    showPromiseStatus(promise, {
      error: () => `Failed to remove empty strings from card **${cardId}** quick filters`,
      loading: `Removing empty strings from card **${cardId}**…`,
      success: (count) => `Removed ${count} empty string quick filter${count === 1 ? '' : 's'} from card **${cardId}**`
    });
  };

  return (
    <Tooltip>
      <Button
        fullWidth
        className='min-w-36 flex-1 whitespace-normal'
        isDisabled={emptyCount === null}
        variant='tertiary'
        onPress={handleClick}
      >
        <IconCancel />
        Remove Empty String Filters
      </Button>
      <Tooltip.Content className='max-w-60' offset={4}>
        Sets the default of contains quick filters to nothing instead of an empty string, so that null values will show
        instead of being filtered out. Currently affects {emptyCount} filter
        {emptyCount === 1 ? '' : 's'} on this card.
      </Tooltip.Content>
    </Tooltip>
  );
}

function collectFilterGroups(definition) {
  const { controls, subscriptions } = definition?.definition ?? {};
  const groups = Array.isArray(controls) ? [controls] : [];
  if (subscriptions && typeof subscriptions === 'object') {
    Object.values(subscriptions).forEach((subscription) => {
      if (Array.isArray(subscription?.filters)) groups.push(subscription.filters);
    });
  }
  return groups;
}

function countEmptyStringFilters(definition) {
  const columns = new Set();
  collectFilterGroups(definition).forEach((group) => {
    group.forEach((filter) => {
      if (isEmptyStringFilter(filter)) columns.add(filter.column ?? filter.formulaId ?? filter);
    });
  });
  return columns.size;
}

function isEmptyStringFilter(filter) {
  return Array.isArray(filter?.values) && filter.values.length === 1 && filter.values[0] === '';
}

function removeEmptyStringFilters(definition) {
  const { controls, subscriptions } = definition?.definition ?? {};

  if (Array.isArray(controls)) {
    controls.forEach((control) => {
      if (isEmptyStringFilter(control)) control.values = [];
    });
  }

  if (subscriptions && typeof subscriptions === 'object') {
    Object.values(subscriptions).forEach((subscription) => {
      if (!Array.isArray(subscription?.filters)) return;
      subscription.filters = subscription.filters.filter((filter) => !isEmptyStringFilter(filter));
    });
  }
}
