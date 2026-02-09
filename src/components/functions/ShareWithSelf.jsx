import { useState } from 'react';
import { Button, Spinner, Tooltip } from '@heroui/react';
import { IconUserPlus } from '@tabler/icons-react';
import { shareWithSelf } from '@/services';
import { isSidepanel } from '@/utils';

/**
 * ShareWithSelf component - Shares the current object with the current user
 * Supports: DATA_SOURCE (accounts), PAGE, DATA_APP, DATA_APP_VIEW, and APP (custom app designs)
 */
export function ShareWithSelf({ currentContext, onStatusUpdate, isDisabled }) {
  const [isSharing, setIsSharing] = useState(false);

  const handleShare = async () => {
    setIsSharing(true);

    try {
      // Validate current object
      if (
        !currentContext?.domoObject ||
        !currentContext.domoObject.id ||
        !currentContext.domoObject.typeId
      ) {
        onStatusUpdate?.(
          'No Object Detected',
          'Please navigate to a valid Domo object and try again',
          'danger'
        );
        setIsSharing(false);
        return;
      }

      // Check if object type is supported
      const supportedTypes = [
        'DATA_SOURCE',
        'PAGE',
        'DATA_APP',
        'DATA_APP_VIEW',
        'APP'
      ];
      if (!supportedTypes.includes(currentContext.domoObject.typeId)) {
        onStatusUpdate?.(
          'Unsupported Object Type',
          `Share with Self is not supported for ${currentContext.domoObject.typeName}. Supported types: DataSet, Page, Studio App, App Studio Page, Custom App Design.`,
          'danger'
        );
        setIsSharing(false);
        return;
      }

      // For DATA_SOURCE, verify we have the accountId in metadata
      if (currentContext.domoObject.typeId === 'DATA_SOURCE') {
        if (!currentContext.domoObject.metadata?.details?.accountId) {
          onStatusUpdate?.(
            'Missing Account Information',
            'DataSet account information not found. Please refresh and try again.',
            'danger'
          );
          setIsSharing(false);
          return;
        }
      }

      // Call the shareWithSelf service function
      await shareWithSelf({
        object: currentContext.domoObject,
        userId: currentContext.user?.id,
        setStatus: onStatusUpdate
      });
      chrome.tabs.reload(currentContext?.tabId);

      const inSidepanel = isSidepanel();
      if (!inSidepanel) window.close();
    } catch (error) {
      // Error is already handled in shareWithSelf, but catch here in case
      console.error('Error in ShareWithSelf component:', error);
    } finally {
      setIsSharing(false);
    }
  };

  // Disable button if:
  // 1. Explicitly disabled via prop
  // 2. Currently sharing
  // 3. No current object
  // 4. Object type is not supported
  const supportedTypes = [
    'DATA_SOURCE',
    'PAGE',
    'DATA_APP',
    'DATA_APP_VIEW',
    'APP'
  ];
  const isSupportedType =
    currentContext?.domoObject?.typeId &&
    supportedTypes.includes(currentContext.domoObject.typeId);
  const buttonDisabled =
    isDisabled || isSharing || !currentContext?.domoObject || !isSupportedType;

  return (
    <Tooltip delay={400} closeDelay={0} disabled={!buttonDisabled}>
      <Button
        variant='tertiary'
        fullWidth
        isIconOnly
        onPress={handleShare}
        isDisabled={buttonDisabled}
      >
        {isSharing ? (
          <Spinner size='sm' color='currentColor' />
        ) : (
          <IconUserPlus stroke={1.5} />
        )}
      </Button>
      <Tooltip.Content>
        {currentContext?.domoObject?.typeId === 'DATA_SOURCE' ? (
          <>
            Share <span className='font-semibold'>dataset account</span> with
            yourself
          </>
        ) : (
          <>
            Share{' '}
            <span className='font-semibold lowercase'>
              {currentContext?.domoObject?.name}
            </span>{' '}
            with yourself
          </>
        )}
      </Tooltip.Content>
    </Tooltip>
  );
}
