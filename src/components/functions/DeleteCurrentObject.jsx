import { useState } from 'react';
import {
  AlertDialog,
  Button,
  Checkbox,
  Chip,
  Label,
  Spinner,
  Tooltip
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
          const childPages =
            currentContext.domoObject.metadata?.details?.childPages || [];

          if (childPages.length > 0) {
            // Open sidepanel first (while user gesture is valid)
            openSidepanel();

            // Then store child pages data
            chrome.storage.local.set({
              sidepanelDataList: {
                type: 'childPagesWarning',
                pageId,
                appId,
                pageType,
                childPages,
                currentContext: currentContext?.toJSON?.() || currentContext,
                tabId: currentContext?.tabId || null,
                timestamp: Date.now()
              }
            });

            onStatusUpdate?.(
              'Cannot Delete Page',
              `This page has ${childPages.length} child pages. View them in the sidepanel.`,
              'warning'
            );

            // window.close(); // Close popup after opening sidepanel
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
      } else {
        onStatusUpdate?.(
          'Not Implemented',
          `Delete functionality for ${typeId} is not implemented yet. Please check back in a future release.`,
          'warning'
        );
      }
    } catch (error) {
      console.error('Error deleting object:', error);
      onStatusUpdate?.(
        'Error',
        error.message || 'Failed to delete object',
        'danger'
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog>
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
          isPending={isDeleting}
        >
          {({ isPending }) => (
            <>
              {isPending ? (
                <Spinner size='sm' />
              ) : (
                <IconTrash size={4} className='text-danger' />
              )}
            </>
          )}
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
              <Button slot='close' variant='tertiary' size='sm'>
                Cancel
              </Button>
              <Button
                slot='close'
                variant='danger'
                size='sm'
                className='uppercase'
                onPress={handleDelete}
                isLoading={isDeleting}
              >
                Delete {currentContext?.domoObject?.typeName}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}
