import {
  AlertDialog,
  Button,
  Tooltip,
  useOverlayState
} from '@heroui/react';
import { IconTrash, IconX } from '@tabler/icons-react';
import { useState } from 'react';

import { useStatusBar } from '@/hooks';
import { deleteObject, deletePageAndAllCards } from '@/services';
import {
  isSidepanel,
  openSidepanel,
  showStatus,
  storeSidepanelData,
  waitForChildPages
} from '@/utils';

export function DeleteCurrentObject({
  currentContext,
  isDisabled,
  onStatusUpdate
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const dialogState = useOverlayState({});
  const { showPromiseStatus } = useStatusBar();

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

    const { id, typeId } = currentContext.domoObject;
    const objectName =
      currentContext.domoObject.metadata?.name || id;

    // PAGE/DATA_APP_VIEW: check for child pages before deleting
    if (typeId === 'PAGE' || typeId === 'DATA_APP_VIEW') {
      const pageId = parseInt(id);
      const pageType = typeId;
      const appId =
        typeId === 'DATA_APP_VIEW' && currentContext.domoObject.parentId
          ? parseInt(currentContext.domoObject.parentId)
          : null;

      if (pageType === 'PAGE') {
        const result = await waitForChildPages(currentContext);

        if (!result.success) {
          onStatusUpdate?.('Error', result.error, 'danger', 3000);
          return;
        }

        if (result.childPages.length > 0) {
          const inSidepanel = isSidepanel();
          if (!inSidepanel) openSidepanel();

          await storeSidepanelData({
            childPages: result.childPages,
            currentContext,
            statusShown: inSidepanel,
            type: 'childPagesWarning'
          });

          await showStatus({
            description: inSidepanel
              ? `This page has **${result.childPages.length} child page${result.childPages.length !== 1 ? 's' : ''}**. Please delete or reassign the child pages first.`
              : `This page has **${result.childPages.length} child page${result.childPages.length !== 1 ? 's' : ''}**. View them in the sidepanel.`,
            inSidepanel,
            onStatusUpdate,
            status: 'warning',
            timeout: 0,
            title: 'Cannot Delete Page'
          });

          dialogState.close();
          return;
        }
      }

      setIsDeleting(true);

      const promise = deletePageAndAllCards({
        appId,
        currentContext,
        pageId,
        pageType,
        skipChildPageCheck: true,
        tabId: currentContext.tabId
      }).then((result) => {
        dialogState.close();
        return result;
      });

      showPromiseStatus(promise, {
        error: (err) => err.message || 'Failed to delete object',
        loading: `Deleting **${objectName}** and its cards…`,
        success: (result) => result.statusDescription || `**${objectName}** deleted`
      });

      promise.finally(() => setIsDeleting(false));
      return;
    }

    // Generic object delete
    if (supportedTypes.includes(typeId)) {
      setIsDeleting(true);

      const promise = deleteObject({
        object: currentContext.domoObject,
        tabId: currentContext.tabId
      }).then((result) => {
        dialogState.close();
        if (result.statusType === 'success' && typeId === 'WORKFLOW_MODEL') {
          chrome.tabs.update(currentContext.tabId, { url: '/workflows' });
        }
        if (result.statusType !== 'success') {
          throw new Error(result.statusDescription || 'Delete failed');
        }
        return result;
      });

      showPromiseStatus(promise, {
        error: (err) => err.message || 'Failed to delete object',
        loading: `Deleting **${objectName}**…`,
        success: (result) => result.statusDescription || `**${objectName}** deleted`
      });

      promise.finally(() => setIsDeleting(false));
      return;
    }

    onStatusUpdate?.(
      'Error',
      `Deletion not supported for object type: ${typeId}`,
      'danger'
    );
    dialogState.close();
  };

  return (
    <AlertDialog isOpen={dialogState.isOpen} onOpenChange={dialogState.setOpen}>
      <Tooltip
        closeDelay={0}
        delay={400}
        isDisabled={
          isDisabled ||
          !currentContext?.domoObject ||
          !supportedTypes.includes(currentContext?.domoObject?.typeId)
        }
      >
        <Button
          fullWidth
          isIconOnly
          variant='tertiary'
          isDisabled={
            isDisabled ||
            !currentContext?.domoObject ||
            !supportedTypes.includes(currentContext?.domoObject?.typeId)
          }
        >
          {({ isDisabled }) => (
            <IconTrash
              className={isDisabled ? '' : 'text-danger'}
              stroke={1.5}
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
            ? 'and all its cards'
            : ''}
        </Tooltip.Content>
      </Tooltip>
      <AlertDialog.Backdrop>
        <AlertDialog.Container className='p-1' placement='top'>
          <AlertDialog.Dialog className='p-2 pt-3'>
            <div className={'absolute top-0 left-0 h-1.25 w-full bg-danger'} />
            <AlertDialog.CloseTrigger
              className='absolute top-3 right-2'
              variant='ghost'
            >
              <IconX stroke={1.5} />
            </AlertDialog.CloseTrigger>
            <AlertDialog.Header>
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
                isDisabled={isDeleting}
                size='sm'
                slot='close'
                variant='tertiary'
              >
                Cancel
              </Button>
              <Button
                isDisabled={isDeleting}
                size='sm'
                variant='danger'
                onPress={handleDelete}
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
