import { useState, useEffect } from 'react';
import { Button, Chip } from '@heroui/react';
import { IconFilterShare } from '@tabler/icons-react';
import { AnimatedCheck } from '@/components';
import { getAllFilters, buildPfilterUrl } from '@/services';
import { useStatusBar } from '@/hooks';

export function CopyFilteredUrl({ currentContext, isDisabled }) {
  const [isCopied, setIsCopied] = useState(false);
  const [filterCount, setFilterCount] = useState(0);
  const [heldFilters, setHeldFilters] = useState([]);
  const [hasNewFilters, setHasNewFilters] = useState(false);
  const { showPromiseStatus } = useStatusBar();

  const typeId = currentContext?.domoObject?.typeId;
  const isSupported =
    typeId === 'PAGE' || typeId === 'DATA_APP_VIEW' || typeId === 'CARD';

  useEffect(() => {
    let isMounted = true;

    const updateFilterDetection = async () => {
      if (!currentContext?.domoObject?.id || !isSupported) {
        setFilterCount(0);
        setHasNewFilters(false);
        return;
      }

      try {
        const { allFilters } = await getAllFilters({
          url: currentContext.url,
          pageId: typeId === 'CARD' ? null : currentContext.domoObject.id,
          tabId: currentContext.tabId
        });

        if (isMounted) {
          setFilterCount(allFilters.length);

          if (heldFilters.length !== allFilters.length) {
            setHasNewFilters(heldFilters.length > 0 && allFilters.length > 0);
          } else if (allFilters.length > 0) {
            const heldStr = JSON.stringify(
              [...heldFilters].sort((a, b) => a.column.localeCompare(b.column))
            );
            const detectedStr = JSON.stringify(
              [...allFilters].sort((a, b) => a.column.localeCompare(b.column))
            );
            setHasNewFilters(heldStr !== detectedStr);
          } else {
            setHasNewFilters(false);
          }
        }
      } catch (error) {
        console.warn(
          '[CopyFilteredUrl] Failed to pre-fetch filter count:',
          error
        );
      }
    };

    updateFilterDetection();

    return () => {
      isMounted = false;
    };
  }, [currentContext, isSupported, typeId, heldFilters]);

  const handleCopyFilteredUrl = () => {
    if (!currentContext?.domoObject?.id || !isSupported) return;

    const promise = (async () => {
      const objectId = currentContext.domoObject.id;
      const currentUrl =
        typeId === 'CARD' &&
        currentContext.url.includes('page/') &&
        !currentContext.url.includes('kpis')
          ? currentContext.url + '/kpis/details/' + objectId
          : currentContext.url.includes('app-studio')
            ? currentContext.domoObject.url
            : currentContext.url;

      const { allFilters } = await getAllFilters({
        url: currentUrl,
        pageId: typeId === 'CARD' ? null : objectId,
        tabId: currentContext.tabId
      });

      setHeldFilters(allFilters);
      setFilterCount(allFilters.length);
      setHasNewFilters(false);

      const filteredUrl = buildPfilterUrl(currentUrl, objectId, allFilters);
      await navigator.clipboard.writeText(filteredUrl);

      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);

      return allFilters.length;
    })();

    showPromiseStatus(promise, {
      loading: 'Detecting filters…',
      success: (count) =>
        count > 0
          ? `Captured ${count} filter${count !== 1 ? 's' : ''} and copied URL`
          : 'Copied Base URL (No filters active)',
      error: () => 'Failed to detect filters'
    });
  };

  return (
    <Button
      variant='tertiary'
      fullWidth
      onPress={handleCopyFilteredUrl}
      isDisabled={isDisabled || !isSupported}
      className={` ${hasNewFilters ? 'animate-pulse' : ''}`}
    >
      {isCopied ? <AnimatedCheck /> : <IconFilterShare stroke={1.5} />}
      Copy Filtered URL
      {filterCount > 0 && (
        <Chip
          size='sm'
          color='accent'
          variant='soft'
          className='absolute top-1 right-1 h-5 min-w-5 justify-center rounded-3xl'
        >
          {filterCount}
        </Chip>
      )}
    </Button>
  );
}
