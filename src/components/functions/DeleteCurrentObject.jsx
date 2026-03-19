import {
  AlertDialog,
  Button,
  Dropdown,
  Label,
  Tooltip,
  useOverlayState
} from '@heroui/react';
import { IconTrash, IconX } from '@tabler/icons-react';
import { useState } from 'react';

import { useLongPress } from '@/components';
import { useStatusBar } from '@/hooks';
import {
  deleteDataflowAndOutputs,
  deleteObject,
  deletePageAndAllCards,
  getCardsForObject,
  getChildPages
} from '@/services';
import {
  executeInPage,
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
  const { LongPressOverlay, pressProps } = useLongPress({
    color: 'bg-danger-soft-hover'
  });
  const dialogState = useOverlayState({});
  const appDialogState = useOverlayState({});
  const { showPromiseStatus } = useStatusBar();

  const typeId = currentContext?.domoObject?.typeId;

  const supportedTypes = [
    'ACCESS_TOKEN',
    'APP',
    'BEAST_MODE_FORMULA',
    'DATA_APP_VIEW',
    'DATAFLOW_TYPE',
    'PAGE',
    'MAGNUM_COLLECTION',
    'TEMPLATE',
    'VARIABLE',
    'WORKFLOW_MODEL'
  ];

  const hasAppDeleteAction =
    (typeId === 'DATA_APP_VIEW' || typeId === 'WORKSHEET_VIEW') &&
    !!currentContext?.domoObject?.parentId;

  const appLabel = typeId === 'WORKSHEET_VIEW' ? 'Worksheet' : 'App';

  const appName =
    currentContext?.domoObject?.metadata?.parent?.name ||
    `${appLabel} ${currentContext?.domoObject?.parentId}`;

  const handleDelete = async () => {
    if (!currentContext?.domoObject) {
      onStatusUpdate?.('Error', 'No object to delete', 'danger');
      return;
    }

    const { id, typeId } = currentContext.domoObject;
    const objectName = currentContext.domoObject.metadata?.name || id;

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
          onStatusUpdate?.('Error', result.error, 'danger', 5000);
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
        success: (result) =>
          result.statusDescription || `**${objectName}** deleted`
      });

      promise.finally(() => setIsDeleting(false));
      return;
    }

    // DATAFLOW_TYPE: delete output datasets first, then the dataflow
    if (typeId === 'DATAFLOW_TYPE') {
      const outputs =
        currentContext.domoObject.metadata?.details?.outputs || [];

      setIsDeleting(true);

      const promise = deleteDataflowAndOutputs({
        dataflowId: id,
        outputs,
        tabId: currentContext.tabId
      }).then((result) => {
        dialogState.close();
        if (!result.success) {
          if (result.datasetsFailed > 0) {
            throw new Error(
              `Failed to delete ${result.datasetsFailed} of ${result.datasetsFailed + result.datasetsDeleted} output dataset${result.datasetsFailed + result.datasetsDeleted !== 1 ? 's' : ''}. Dataflow was not deleted.`
            );
          }
          throw new Error(
            `Output datasets deleted, but dataflow deletion failed (HTTP ${result.statusCode}).`
          );
        }
        return result;
      });

      showPromiseStatus(promise, {
        error: (err) => err.message || 'Failed to delete dataflow',
        loading: `Deleting **${objectName}** and ${outputs.length} output dataset${outputs.length !== 1 ? 's' : ''}…`,
        success: () =>
          `**${objectName}** and ${outputs.length} output dataset${outputs.length !== 1 ? 's' : ''} deleted`
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
        success: (result) =>
          result.statusDescription || `**${objectName}** deleted`
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

  const handleDeleteApp = async () => {
    const appId = currentContext?.domoObject?.parentId;
    if (!appId) {
      onStatusUpdate?.('Error', 'Could not determine parent app ID', 'danger');
      return;
    }

    const tabId = currentContext.tabId;

    setIsDeleting(true);

    const promise = (async () => {
      // Get all pages in the app
      const pages = await getChildPages({
        appId: parseInt(appId),
        pageId: parseInt(currentContext.domoObject.id),
        pageType: typeId,
        tabId
      });

      // Collect cards from all pages
      const allCardIds = new Set();
      const pageIds = [
        currentContext.domoObject.id,
        ...pages.map((p) => p.pageId)
      ];
      for (const pageId of pageIds) {
        const cards = await getCardsForObject({
          objectId: pageId,
          objectType: typeId,
          tabId
        });
        for (const card of cards) {
          allCardIds.add(card.id);
        }
      }

      // Bulk delete all cards
      const cardCount = allCardIds.size;
      if (cardCount > 0) {
        await executeInPage(
          async (cardIds) => {
            const res = await fetch(
              `/api/content/v1/cards/bulk?cardIds=${cardIds}`,
              { method: 'DELETE' }
            );
            if (!res.ok) {
              throw new Error(
                `Failed to delete cards. HTTP status: ${res.status}`
              );
            }
          },
          [[...allCardIds].join(',')],
          tabId
        );
      }

      // Delete the app
      await executeInPage(
        async (appId) => {
          const res = await fetch(`/api/content/v1/dataapps/${appId}`, {
            method: 'DELETE'
          });
          if (!res.ok) {
            throw new Error(`Failed to delete app. HTTP status: ${res.status}`);
          }
        },
        [appId],
        tabId
      );

      appDialogState.close();
      return { cardCount };
    })();

    showPromiseStatus(promise, {
      error: (err) =>
        err.message || `Failed to delete ${appLabel.toLowerCase()}`,
      loading: `Deleting **${appName}** and all its cards…`,
      success: (result) =>
        `**${appName}** and ${result.cardCount} card${result.cardCount !== 1 ? 's' : ''} deleted`
    });

    promise.finally(() => setIsDeleting(false));
  };

  const handleDropdownAction = (key) => {
    if (key === 'deleteApp') {
      appDialogState.open();
    }
  };

  const isDeleteForbidden = (() => {
    const typeId = currentContext?.domoObject?.typeId;
    const userRights = currentContext?.user?.metadata?.USER_RIGHTS || [];
    const isOwner = currentContext?.domoObject?.metadata?.isOwner;

    if (typeId === 'DATAFLOW_TYPE') {
      return !isOwner && !userRights.includes('dataflow.admin');
    }
    if (typeId === 'WORKFLOW_MODEL') {
      const permValues =
        currentContext?.domoObject?.metadata?.permission?.values || [];
      const hasDeletePerm =
        permValues.includes('ADMIN') || permValues.includes('DELETE');
      return (
        !isOwner && !hasDeletePerm && !userRights.includes('workflow.admin')
      );
    }
    if (typeId === 'BEAST_MODE_FORMULA' || typeId === 'VARIABLE') {
      return !isOwner && !userRights.includes('content.admin');
    }
    if (typeId === 'DATA_APP_VIEW' || typeId === 'PAGE') {
      return !isOwner && !userRights.includes('content.admin');
    }
    if (typeId === 'TEMPLATE') {
      return !isOwner && !userRights.includes('approvalcenter.admin');
    }
    if (typeId === 'MAGNUM_COLLECTION') {
      const userId = currentContext?.user?.id;
      const userPerms = (
        currentContext?.domoObject?.metadata?.permission?.USER || []
      ).find((u) => String(u.id) === String(userId));
      const hasDeletePerm =
        userPerms?.permissions?.includes('ADMIN') ||
        userPerms?.permissions?.includes('DELETE');
      return (
        !isOwner && !hasDeletePerm && !userRights.includes('datastore.admin')
      );
    }
    return false;
  })();

  const isDeleteDisabled =
    isDisabled ||
    !currentContext?.domoObject ||
    !supportedTypes.includes(currentContext?.domoObject?.typeId) ||
    (currentContext?.domoObject?.typeId === 'DATAFLOW_TYPE' &&
      currentContext?.domoObject?.metadata?.details?.deleted === true) ||
    isDeleteForbidden;

  const deleteButton = (
    <Button
      fullWidth
      isIconOnly
      className='relative overflow-visible'
      isDisabled={isDeleteDisabled}
      variant='tertiary'
      {...(hasAppDeleteAction ? pressProps : {})}
    >
      {({ isDisabled }) => (
        <>
          <IconTrash className={isDisabled ? '' : 'text-danger'} stroke={1.5} />
          <LongPressOverlay />
        </>
      )}
    </Button>
  );

  return (
    <>
      <AlertDialog
        isOpen={dialogState.isOpen}
        onOpenChange={dialogState.setOpen}
      >
        <Dropdown
          isDisabled={!hasAppDeleteAction || isDeleteDisabled}
          trigger='longPress'
        >
          <Tooltip closeDelay={0} delay={400} isDisabled={isDeleteDisabled}>
            {deleteButton}
            {hasAppDeleteAction && !isDeleteDisabled ? (
              <Tooltip.Content placement='bottom'>
                <span className='italic'>Hold for more options</span>
              </Tooltip.Content>
            ) : (
              <Tooltip.Content>
                Delete{' '}
                <span className='lowercase'>
                  {currentContext?.domoObject?.typeName || 'object'}
                </span>{' '}
                <span className='font-semibold'>
                  {currentContext?.domoObject?.metadata?.name || ''}
                </span>{' '}
                {typeId === 'PAGE' || typeId === 'DATA_APP_VIEW'
                  ? 'and all its cards'
                  : typeId === 'DATAFLOW_TYPE'
                    ? 'and all its output datasets'
                    : ''}
              </Tooltip.Content>
            )}
          </Tooltip>
          <Dropdown.Popover className='w-fit min-w-60' placement='bottom'>
            <Dropdown.Menu onAction={handleDropdownAction}>
              <Dropdown.Item
                id='deleteApp'
                textValue={`Delete ${appLabel} and All Cards`}
              >
                <IconTrash
                  className='size-5 shrink-0 text-danger'
                  stroke={1.5}
                />
                <Label>Delete {appLabel} and All Cards</Label>
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
        <AlertDialog.Backdrop>
          <AlertDialog.Container className='p-1' placement='top'>
            <AlertDialog.Dialog className='p-2 pt-3'>
              <div className='absolute top-0 left-0 h-1.25 w-full bg-danger' />
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
                {typeId === 'PAGE' || typeId === 'DATA_APP_VIEW' ? (
                  <span className='italic'>
                    and{' '}
                    {currentContext?.domoObject?.metadata?.cardCount ||
                      'all its'}{' '}
                    cards{' '}
                  </span>
                ) : typeId === 'DATAFLOW_TYPE' ? (
                  <span className='italic'>
                    and{' '}
                    {currentContext?.domoObject?.metadata?.details?.outputs
                      ?.length || 'all its'}{' '}
                    output dataset
                    {currentContext?.domoObject?.metadata?.details?.outputs
                      ?.length !== 1
                      ? 's'
                      : ''}{' '}
                  </span>
                ) : (
                  ''
                )}
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
                  {typeId === 'PAGE' || typeId === 'DATA_APP_VIEW'
                    ? ' and All Cards'
                    : typeId === 'DATAFLOW_TYPE'
                      ? ' and All Outputs'
                      : ''}
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>

      <AlertDialog
        isOpen={appDialogState.isOpen}
        onOpenChange={appDialogState.setOpen}
      >
        <AlertDialog.Backdrop>
          <AlertDialog.Container className='p-1' placement='top'>
            <AlertDialog.Dialog className='p-2 pt-3'>
              <div className='absolute top-0 left-0 h-1.25 w-full bg-danger' />
              <AlertDialog.CloseTrigger
                className='absolute top-3 right-2'
                variant='ghost'
              >
                <IconX stroke={1.5} />
              </AlertDialog.CloseTrigger>
              <AlertDialog.Header>
                <AlertDialog.Heading>
                  Delete {appLabel} and All Cards
                </AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                Are you sure you want to delete the entire{' '}
                {appLabel.toLowerCase()}{' '}
                <span className='font-bold'>
                  {appName} (ID: {currentContext?.domoObject?.parentId})
                </span>
                ,{' '}
                <span className='italic'>
                  all its pages, and all cards on those pages
                </span>{' '}
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
                  onPress={handleDeleteApp}
                >
                  Delete {appLabel} and All Cards
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </>
  );
}
