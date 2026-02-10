import { useState, useEffect } from 'react';
import { Button, Tooltip, Chip } from '@heroui/react';
import { IconFilterShare } from '@tabler/icons-react';
import { AnimatedCheck } from '@/components';
import { getAllFilters, buildPfilterUrl } from '@/services';

export function CopyFilteredUrl({
  currentContext,
  onStatusUpdate,
  isDisabled
}) {
  const [isCopied, setIsCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [filterCount, setFilterCount] = useState(0);
  const [heldFilters, setHeldFilters] = useState([]);
  const [hasNewFilters, setHasNewFilters] = useState(false);

  const typeId = currentContext?.domoObject?.typeId;
  const isSupported =
    typeId === 'PAGE' || typeId === 'DATA_APP_VIEW' || typeId === 'CARD';

  // Detect filters whenever context changes to update badge count
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

          // Compare with held filters to see if something changed
          if (heldFilters.length !== allFilters.length) {
            setHasNewFilters(heldFilters.length > 0 && allFilters.length > 0);
          } else if (allFilters.length > 0) {
            // Shallow compare strings
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

  const handleCopyFilteredUrl = async () => {
    if (!currentContext?.domoObject?.id || !isSupported) return;

    setIsLoading(true);

    try {
      const objectId = currentContext.domoObject.id;
      const currentUrl =
        typeId === 'CARD' &&
        currentContext.url.includes('page/') &&
        !currentContext.url.includes('kpis')
          ? currentContext.url + '/kpis/details/' + objectId
          : currentContext.url.includes('app-studio')
            ? currentContext.domoObject.url
            : currentContext.url;

      // Fresh detection on click
      const { allFilters } = await getAllFilters({
        url: currentUrl,
        pageId: typeId === 'CARD' ? null : objectId,
        tabId: currentContext.tabId
      });

      setHeldFilters(allFilters);
      setFilterCount(allFilters.length);
      setHasNewFilters(false);

      // Build the filtered URL
      const filteredUrl = buildPfilterUrl(currentUrl, objectId, allFilters);

      // Copy to clipboard
      await navigator.clipboard.writeText(filteredUrl);

      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);

      const count = allFilters.length;
      onStatusUpdate?.(
        'Captured & Held',
        count > 0
          ? `Captured ${count} filter${count !== 1 ? 's' : ''} and copied URL`
          : 'Copied Base URL (No filters active)',
        'success',
        2000
      );
    } catch (error) {
      console.error('Failed to copy filtered URL:', error);
      onStatusUpdate?.('Error', 'Failed to detect filters', 'error', 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const buttonDisabled = isDisabled || !isSupported || isLoading;

  return (
    <Button
      variant='tertiary'
      fullWidth
      onPress={handleCopyFilteredUrl}
      isDisabled={buttonDisabled}
      isLoading={isLoading}
      isPending={isLoading}
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
