import { useState } from 'react';
import {
  AlertDialog,
  Button,
  Tooltip,
  useOverlayState
} from '@heroui/react';
import { IconTrash, IconX } from '@tabler/icons-react';
import { deletePageAndAllCards, deleteObject } from '@/services';
import { useStatusBar } from '@/hooks';
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

    const { typeId, id } = currentContext.domoObject;
    const typeName = currentContext.domoObject.typeName;
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
            type: 'childPagesWarning',
            currentContext,
            childPages: result.childPages,
            statusShown: inSidepanel
          });

          await showStatus({
            onStatusUpdate,
            title: 'Cannot Delete Page',
            description: inSidepanel
              ? `This page has **${result.childPages.length} child page${result.childPages.length !== 1 ? 's' : ''}**. Please delete or reassign the child pages first.`
              : `This page has **${result.childPages.length} child page${result.childPages.length !== 1 ? 's' : ''}**. View them in the sidepanel.`,
            status: 'warning',
            timeout: 0,
            inSidepanel
          });

          dialogState.close();
          return;
        }
      }

      setIsDeleting(true);

      const promise = deletePageAndAllCards({
        pageId,
        pageType,
        appId,
        tabId: currentContext.tabId,
        currentContext,
        skipChildPageCheck: true
      }).then((result) => {
        dialogState.close();
        return result;
      });

      showPromiseStatus(promise, {
        loading: `Deleting **${objectName}** and its cards…`,
        success: (result) => result.statusDescription || `**${objectName}** deleted`,
        error: (err) => err.message || 'Failed to delete object'
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
        loading: `Deleting **${objectName}**…`,
        success: (result) => result.statusDescription || `**${objectName}** deleted`,
        error: (err) => err.message || 'Failed to delete object'
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
                isDisabled={isDeleting}
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
