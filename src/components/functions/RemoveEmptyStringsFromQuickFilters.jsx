import { useState, useEffect, useRef } from 'react';
import { Button, Spinner } from '@heroui/react';
import { IconXboxX } from '@tabler/icons-react';
import { getCardDefinition, updateCardDefinition } from '@/services';

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
  const [isLoading, setIsLoading] = useState(false);
  const [emptyCount, setEmptyCount] = useState(null);
  const definitionRef = useRef(null);
  const cardId = currentContext?.domoObject?.id;
  const tabId = currentContext?.tabId;

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

  const handleClick = async () => {
    setIsLoading(true);

    const definition = definitionRef.current;
    if (!definition) {
      onStatusUpdate?.(
        'No Definition Found',
        `No definition found for card **${cardId}**`,
        'warning'
      );
      setIsLoading(false);
      return;
    }

    // Remove empty string filters from controls
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

    try {
      await updateCardDefinition({ cardId, definition, tabId });
      onStatusUpdate?.(
        'Successfully Updated',
        `Removed ${removed} empty string quick filter${removed === 1 ? '' : 's'} from card **${cardId}**`,
        'success'
      );
      chrome.tabs.reload(tabId);
    } catch {
      onStatusUpdate?.(
        'Update Failed',
        `Failed to remove empty strings from card **${cardId}** quick filters`,
        'danger'
      );
    }
    setIsLoading(false);
  };

  return (
    <Button
      variant='tertiary'
      onPress={() => handleClick()}
      isDisabled={isLoading || emptyCount === null}
      isPending={isLoading}
      fullWidth
      className='min-w-fit flex-1 basis-[48%]'
    >
      {({ isPending }) => {
        if (isPending) {
          return <Spinner color='currentColor' size='sm' />;
        }

        return (
          <>
            <IconXboxX stroke={1.5} />
            Remove Empty Strings from Quick Filters
          </>
        );
      }}
    </Button>
  );
}
