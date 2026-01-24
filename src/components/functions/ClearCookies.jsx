import { useEffect, useState } from 'react';
import { Button, Spinner, Tooltip } from '@heroui/react';
import { IconCookieOff } from '@tabler/icons-react';

export function ClearCookies({ currentContext, onStatusUpdate, isDisabled }) {
  const [isClearingCookies, setIsClearingCookies] = useState(false);
  const [currentDomain, setCurrentDomain] = useState(null);

  useEffect(() => {
    if (currentContext?.url) {
      const domain = new URL(currentContext.url).hostname;
      setCurrentDomain(domain);
    }
  }, [currentContext]);

  const clearCookies = async () => {
    setIsClearingCookies(true);

    try {
      if (!currentContext?.url) {
        onStatusUpdate?.('Error', 'Could not get active tab', 'danger');
        setIsClearingCookies(false);
        return;
      }

      // Get all cookies
      const domoCookies = await chrome.cookies.getAll({
        domain: currentDomain
      });

      // Remove each cookie
      let removedCount = 0;
      const errors = [];

      const removePromises = domoCookies.map(async (cookie) => {
        try {
          // Clean up domain (remove leading dot if present)
          let domain = cookie.domain;
          if (domain.startsWith('.')) {
            domain = domain.substring(1);
          }

          // Construct proper URL
          const protocol = cookie.secure ? 'https:' : 'http:';
          const cookieUrl = `${protocol}//${domain}${cookie.path}`;

          const result = await chrome.cookies.remove({
            url: cookieUrl,
            name: cookie.name,
            storeId: cookie.storeId
          });

          if (result) {
            removedCount++;
          } else {
            errors.push(`Failed to remove: ${cookie.name}`);
          }
        } catch (err) {
          errors.push(`${cookie.name}: ${err.message}`);
        }
      });

      await Promise.all(removePromises);

      // Show result message
      if (errors.length === 0) {
        onStatusUpdate?.(
          'Cookies Cleared',
          `Successfully cleared ${removedCount} cookie${
            removedCount !== 1 ? 's' : ''
          } for ${currentDomain}`,
          'success'
        );
      } else {
        onStatusUpdate?.(
          'Partial Success',
          `Cleared ${removedCount} cookie${
            removedCount !== 1 ? 's' : ''
          }, but ${errors.length} error${
            errors.length !== 1 ? 's' : ''
          } occurred`,
          'warning'
        );
      }

      setIsClearingCookies(false);
    } catch (error) {
      onStatusUpdate?.('Error', error.message, 'danger');
      setIsClearingCookies(false);
    }
  };

  return (
    <Tooltip delay={400} closeDelay={0}>
      <Button
        variant='tertiary'
        fullWidth
        isIconOnly
        onPress={clearCookies}
        isPending={isClearingCookies}
        isDisabled={isDisabled}
      >
        {({ isPending }) => (
          <>
            {isPending ? (
              <Spinner color='currentColor' size='sm' />
            ) : (
              <IconCookieOff size={4} className='text-danger' />
            )}
          </>
        )}
      </Button>
      <Tooltip.Content>
        Clear cookies for{' '}
        <span className='font-semibold lowercase'>{currentDomain}</span>
      </Tooltip.Content>
    </Tooltip>
  );
}
