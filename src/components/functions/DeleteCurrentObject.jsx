import { useState } from 'react';
import {
  AlertDialog,
  Button,
  Checkbox,
  Chip,
  Label,
  Spinner,
  Tooltip,
  useOverlayState
} from '@heroui/react';
import { IconTrash } from '@tabler/icons-react';
import { deletePageAndAllCards } from '@/services';
import { openSidepanel } from '@/utils';

export function DeleteCurrentObject({
  currentContext,
  onStatusUpdate,
  isDisabled
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const state = useOverlayState({});

  const supportedTypes = [
    'ACCESS_TOKEN',
    'APP',
    'BEAST_MODE_FORMULA',
    'PAGE',
    'MAGNUM_COLLECTION'
  ];

  const handleDelete = async () => {
    if (!currentContext?.domoObject) {
      onStatusUpdate?.('Error', 'No object to delete', 'danger');
      return;
    }

    const { typeId, id } = currentContext.domoObject;

    setIsDeleting(true);

    try {
      if (typeId === 'PAGE' || typeId === 'DATA_APP_VIEW') {
        const pageId = parseInt(id);
        const pageType = typeId;
        const appId =
          typeId === 'DATA_APP_VIEW' &&
          currentContext.domoObject.metadata?.parent?.id
            ? parseInt(currentContext.domoObject.metadata.parent.id)
            : null;

        // For regular pages, check pre-fetched child pages
        if (pageType === 'PAGE') {
          let childPages =
            currentContext.domoObject.metadata?.details?.childPages;

          // Three states:
          // 1. undefined/null: Not yet checked for child pages - need to wait
          // 2. []: Checked and found no child pages - safe to delete
          // 3. [...]: Has child pages - cannot delete

          if (childPages === undefined || childPages === null) {
            console.log(
              '[DeleteCurrentObject] Child pages not yet loaded, waiting...'
            );

            // Poll for child pages to be loaded (max 5 seconds)
            const maxAttempts = 50; // 50 * 100ms = 5 seconds
            let attempts = 0;

            const checkChildPages = async () => {
              while (attempts < maxAttempts) {
                attempts++;
                await new Promise((resolve) => setTimeout(resolve, 100));

                // Re-fetch the current context to get updated child pages
                const response = await chrome.runtime.sendMessage({
                  type: 'GET_TAB_CONTEXT',
                  tabId: currentContext.tabId
                });

                if (
                  response?.success &&
                  response?.context?.domoObject?.metadata?.details
                    ?.childPages !== undefined
                ) {
                  childPages =
                    response.context.domoObject.metadata.details.childPages;
                  console.log(
                    '[DeleteCurrentObject] Child pages loaded:',
                    childPages.length
                  );
                  break;
                }
              }

              if (childPages === undefined || childPages === null) {
                console.log(
                  '[DeleteCurrentObject] Timeout waiting for child pages'
                );
                onStatusUpdate?.(
                  'Error',
                  'Timeout while checking for child pages. Please try again.',
                  'danger',
                  3000
                );
                setIsDeleting(false);
                return false;
              }

              return true;
            };

            const loaded = await checkChildPages();
            if (!loaded) return;
          }

          if (childPages.length > 0) {
            console.log(
              '[DeleteCurrentObject] Page has child pages:',
              childPages.length
            );

            const isSidepanel = window.location.pathname.includes('/sidepanel');

            // Store child pages data
            chrome.storage.local.set({
              sidepanelDataList: {
                type: 'childPagesWarning',
                pageId,
                appId,
                pageType,
                childPages,
                currentContext: currentContext?.toJSON?.() || currentContext,
                tabId: currentContext?.tabId || null,
                timestamp: Date.now(),
                statusShown: isSidepanel
              }
            });

            if (isSidepanel) {
              // If we're in the sidepanel, just call onStatusUpdate directly
              onStatusUpdate?.(
                'Cannot Delete Page',
                `This page has **${childPages.length} child page${childPages.length !== 1 ? 's' : ''}**. Please delete or reassign the child pages first.`,
                'warning',
                0
              );
            } else {
              openSidepanel();
              window.close();
              // If we're in the popup, send message to sidepanel
              console.log(
                '[DeleteCurrentObject] Sending SHOW_STATUS message to sidepanel'
              );
              chrome.runtime
                .sendMessage({
                  type: 'SHOW_STATUS',
                  title: 'Cannot Delete Page',
                  description: `This page has **${childPages.length} child page${childPages.length !== 1 ? 's' : ''}**. View them in the sidepanel.`,
                  status: 'warning',
                  timeout: 0
                })
                .then(() => {
                  console.log(
                    '[DeleteCurrentObject] SHOW_STATUS message sent successfully'
                  );
                })
                .catch((error) => {
                  console.log(
                    '[DeleteCurrentObject] SHOW_STATUS message failed, showing in popup instead:',
                    error
                  );
                  // If sidepanel is not open, show in popup instead
                  onStatusUpdate?.(
                    'Cannot Delete Page',
                    `This page has ${childPages.length} child pages. View them in the sidepanel.`,
                    'warning'
                  );
                });
            }

            // Close the dialog after showing status
            state.close();
            setIsDeleting(false);
            return;
          }
        }

        // No child pages, proceed with deletion
        // await deletePageAndAllCards({
        //   pageId,
        //   pageType,
        //   appId,
        //   setStatus: onStatusUpdate,
        //   tabId: currentContext.tabId,
        //   currentContext,
        //   skipChildPageCheck: true // Skip the check since we already did it
        // });
        console.log('Here a delete would happen...');
        onStatusUpdate?.(
          'Not Implemented',
          `Delete functionality for ${typeId} is not implemented yet. Please check back in a future release.`,
          'warning'
        );
        state.close();
      } else {
        onStatusUpdate?.(
          'Not Implemented',
          `Delete functionality for ${typeId} is not implemented yet. Please check back in a future release.`,
          'warning'
        );
        state.close();
      }
    } catch (error) {
      console.error('Error deleting object:', error);
      onStatusUpdate?.(
        'Error',
        error.message || 'Failed to delete object',
        'danger'
      );
      state.close();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog isOpen={state.isOpen} onOpenChange={state.setOpen}>
      <Tooltip
        delay={400}
        closeDelay={0}
        isDisabled={isDisabled || !currentContext?.domoObject}
        //   !supportedTypes.includes(currentContext?.domoObject?.typeId)
      >
        <Button
          variant='tertiary'
          fullWidth
          isIconOnly
          isDisabled={
            isDisabled || !currentContext?.domoObject
            // !supportedTypes.includes(currentContext?.domoObject?.typeId)
          }
        >
          <IconTrash size={4} className='text-danger' />
        </Button>
        <Tooltip.Content>
          Delete{' '}
          <span className='font-semibold'>
            {currentContext?.domoObject?.metadata?.name || ''}
          </span>{' '}
          <Chip size='sm' variant='soft' color='accent'>
            {currentContext?.domoObject?.metadata?.parent
              ? `${currentContext?.domoObject?.metadata?.parent.objectType.name} > ${currentContext?.domoObject?.typeName}`
              : `${currentContext?.domoObject?.typeName} (${currentContext?.domoObject?.typeId})`}
          </Chip>
        </Tooltip.Content>
      </Tooltip>
      <AlertDialog.Backdrop>
        <AlertDialog.Container placement='center'>
          <AlertDialog.Dialog>
            <div
              className={`absolute top-[0px] left-[0px] h-[5px] w-full bg-danger`}
            />
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              {/* <AlertDialog.Icon status='danger' /> */}
              <AlertDialog.Heading>
                Delete {currentContext?.domoObject?.typeName}
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              Are you sure you want to delete the{' '}
              <span className='font-semibold lowercase'>
                {currentContext?.domoObject?.typeName}
              </span>{' '}
              <span className='font-bold'>
                {currentContext?.domoObject?.metadata?.name || ''} (ID:{' '}
                {currentContext?.domoObject?.id})
              </span>{' '}
              permanently?
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button
                slot='close'
                variant='tertiary'
                size='sm'
                isDisabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant='danger'
                size='sm'
                className='uppercase'
                onPress={handleDelete}
                isPending={isDeleting}
              >
                {({ isPending }) => (
                  <>
                    {isPending ? (
                      <Spinner color='currentColor' size='sm' />
                    ) : (
                      `Delete ${currentContext?.domoObject?.typeName}`
                    )}
                  </>
                )}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}
