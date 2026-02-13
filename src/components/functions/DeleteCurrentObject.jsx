import { useState } from 'react';
import {
  AlertDialog,
  Button,
  Spinner,
  Tooltip,
  useOverlayState
} from '@heroui/react';
import { IconTrash, IconX } from '@tabler/icons-react';
import { deletePageAndAllCards, deleteObject } from '@/services';
import {
  waitForChildPages,
  isSidepanel,
  showStatus,
  storeSidepanelData,
  openSidepanel
} from '@/utils';

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
    'DATA_APP_VIEW',
    'PAGE',
    'MAGNUM_COLLECTION',
    'TEMPLATE',
    'WORKFLOW_MODEL'
  ];

  const handleDelete = async () => {
    if (!currentContext?.domoObject) {
      onStatusUpdate?.('Error', 'No object to delete', 'danger');
      return;
    }

    const { typeId, id } = currentContext.domoObject;

    setIsDeleting(true);

    try {
      let deleteResult = null;
      switch (typeId) {
        case 'ACCESS_TOKEN':
        case 'APP':
        case 'BEAST_MODE_FORMULA':
        case 'MAGNUM_COLLECTION':
        case 'TEMPLATE':
        case 'WORKFLOW_MODEL':
          // Use generic deleteObject function
          deleteResult = await deleteObject({
            object: currentContext.domoObject,
            tabId: currentContext.tabId
          });

          // Handle the result and show appropriate status
          if (deleteResult.statusTitle && deleteResult.statusDescription) {
            onStatusUpdate?.(
              deleteResult.statusTitle,
              deleteResult.statusDescription,
              deleteResult.statusType || 'accent'
            );
          }
          state.close();

          if (
            deleteResult.statusType === 'success' &&
            typeId === 'WORKFLOW_MODEL'
          ) {
            chrome.tabs.update(currentContext.tabId, { url: '/workflows' });
          }
          break;

        case 'PAGE':
        case 'DATA_APP_VIEW':
          const pageId = parseInt(id);
          const pageType = typeId;
          const appId =
            typeId === 'DATA_APP_VIEW' && currentContext.domoObject.parentId
              ? parseInt(currentContext.domoObject.parentId)
              : null;

          // For regular pages, check pre-fetched child pages
          if (pageType === 'PAGE') {
            // Wait for child pages to be loaded
            const result = await waitForChildPages(currentContext);

            if (!result.success) {
              onStatusUpdate?.('Error', result.error, 'danger', 3000);
              setIsDeleting(false);
              return;
            }

            const childPages = result.childPages;

            if (childPages.length > 0) {
              console.log(
                '[DeleteCurrentObject] Page has child pages:',
                childPages.length
              );

              const inSidepanel = isSidepanel();

              if (!inSidepanel) openSidepanel();

              // Store child pages data
              await storeSidepanelData({
                type: 'childPagesWarning',
                currentContext,
                childPages,
                statusShown: inSidepanel
              });

              // Show status message
              await showStatus({
                onStatusUpdate,
                title: 'Cannot Delete Page',
                description: inSidepanel
                  ? `This page has **${childPages.length} child page${childPages.length !== 1 ? 's' : ''}**. Please delete or reassign the child pages first.`
                  : `This page has **${childPages.length} child page${childPages.length !== 1 ? 's' : ''}**. View them in the sidepanel.`,
                status: 'warning',
                timeout: 0,
                inSidepanel
              });

              // Close the dialog after showing status
              state.close();
              setIsDeleting(false);
              return;
            }
          }

          // No child pages, proceed with deletion
          deleteResult = await deletePageAndAllCards({
            pageId,
            pageType,
            appId,
            tabId: currentContext.tabId,
            currentContext,
            skipChildPageCheck: true // Skip the check since we already did it
          });

          // Handle the result and show appropriate status
          if (deleteResult.statusTitle && deleteResult.statusDescription) {
            onStatusUpdate?.(
              deleteResult.statusTitle,
              deleteResult.statusDescription,
              deleteResult.statusType || 'accent'
            );
          }

          state.close();
          break;

        default:
          onStatusUpdate?.(
            'Error',
            `Deletion not supported for object type: ${typeId}`,
            'danger'
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
        isDisabled={
          isDisabled ||
          !currentContext?.domoObject ||
          !supportedTypes.includes(currentContext?.domoObject?.typeId)
        }
      >
        <Button
          variant='tertiary'
          fullWidth
          isIconOnly
          isDisabled={
            isDisabled ||
            !currentContext?.domoObject ||
            !supportedTypes.includes(currentContext?.domoObject?.typeId)
          }
        >
          {({ isDisabled }) => (
            <IconTrash
              stroke={1.5}
              className={isDisabled ? '' : 'text-danger'}
            />
          )}
        </Button>
        <Tooltip.Content>
          Delete{' '}
          <span className='lowercase'>
            {currentContext?.domoObject?.typeName || 'object'}
          </span>{' '}
          <span className='font-semibold'>
            {currentContext?.domoObject?.metadata?.name || ''}
          </span>{' '}
          {currentContext?.domoObject?.typeId === 'PAGE' ||
          currentContext?.domoObject?.typeId === 'DATA_APP_VIEW'
            ? `and all its cards`
            : ''}
        </Tooltip.Content>
      </Tooltip>
      <AlertDialog.Backdrop>
        <AlertDialog.Container placement='top' className='p-1'>
          <AlertDialog.Dialog className='p-2 pt-3'>
            <div className={`absolute top-0 left-0 h-1.25 w-full bg-danger`} />
            <AlertDialog.CloseTrigger
              className='absolute top-3 right-2'
              variant='ghost'
            >
              <IconX stroke={1.5} />
            </AlertDialog.CloseTrigger>
            <AlertDialog.Header>
              {/* <AlertDialog.Icon status='danger' /> */}
              <AlertDialog.Heading>
                Delete {currentContext?.domoObject?.typeName}
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              Are you sure you want to delete the{' '}
              <span className='lowercase'>
                {currentContext?.domoObject?.typeName}
              </span>{' '}
              <span className='font-bold'>
                {currentContext?.domoObject?.metadata?.name || ''} (ID:{' '}
                {currentContext?.domoObject?.id})
              </span>{' '}
              {currentContext?.domoObject?.typeId === 'PAGE' ||
              currentContext?.domoObject?.typeId === 'DATA_APP_VIEW'
                ? `and ${currentContext?.domoObject?.metadata?.cardCount || 'all its'} cards `
                : ''}
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
                onPress={handleDelete}
                isPending={isDeleting}
                isIconOnly={isDeleting}
              >
                {({ isPending }) =>
                  isPending ? (
                    <Spinner color='currentColor' size='sm' />
                  ) : (
                    `Delete ${currentContext?.domoObject?.typeName}`
                  )
                }
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}
