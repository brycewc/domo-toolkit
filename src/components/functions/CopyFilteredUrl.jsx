import { useState } from 'react';
import { Button, Tooltip } from '@heroui/react';
import { IconCheck, IconFilterShare } from '@tabler/icons-react';
import { getAllFilters, buildPfilterUrl } from '@/services';

export function CopyFilteredUrl({ currentContext, onStatusUpdate, isDisabled }) {
  const [isCopied, setIsCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const isPage =
    currentContext?.domoObject?.typeId === 'PAGE' ||
    currentContext?.domoObject?.typeId === 'DATA_APP_VIEW';

  const handleCopyFilteredUrl = async () => {
    if (!currentContext?.domoObject?.id || !isPage) return;

    setIsLoading(true);

    try {
      const pageId = currentContext.domoObject.id;
      const currentUrl = currentContext.url;

      // Get all filters (URL + page filters)
      const { allFilters, hasFilters } = await getAllFilters({
        url: currentUrl,
        pageId,
        tabId: currentContext.tabId
      });

      if (!hasFilters) {
        onStatusUpdate?.(
          'No Filters',
          'No filters are currently active on this page',
          'warning',
          3000
        );
        setIsLoading(false);
        return;
      }

      // Build the filtered URL
      const filteredUrl = buildPfilterUrl(currentUrl, pageId, allFilters);

      // Copy to clipboard
      await navigator.clipboard.writeText(filteredUrl);

      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);

      onStatusUpdate?.(
        'Copied',
        `Copied URL with ${allFilters.length} filter${allFilters.length !== 1 ? 's' : ''}`,
        'success',
        2000
      );
    } catch (error) {
      console.error('Failed to copy filtered URL:', error);
      onStatusUpdate?.(
        'Error',
        'Failed to detect filters',
        'error',
        3000
      );
    } finally {
      setIsLoading(false);
    }
  };

  const buttonDisabled = isDisabled || !isPage || isLoading;

  return (
    <Tooltip delay={400} closeDelay={0}>
      <Button
        variant='secondary'
        size='sm'
        onPress={handleCopyFilteredUrl}
        isDisabled={buttonDisabled}
        isLoading={isLoading}
      >
        {isCopied ? <IconCheck size={16} /> : <IconFilterShare size={16} />}
        <span>Copy Filtered URL</span>
      </Button>
      <Tooltip.Content className='flex flex-col items-center text-center'>
        {isPage ? (
          <>
            <span>Copy page URL with current filters</span>
            <span className='text-xs text-foreground-500'>
              Captures URL and filter card filters
            </span>
          </>
        ) : (
          <span>Only available on pages</span>
        )}
      </Tooltip.Content>
    </Tooltip>
  );
}
