import {
  Button,
  ButtonGroup,
  Card,
  Disclosure,
  Skeleton,
  Tooltip
} from '@heroui/react';
import {
  IconChevronDown,
  IconLayoutSidebarRightExpand,
  IconSettings
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import { isSidepanel, openSidepanel } from '@/utils';

import {
  ActivityLog,
  ApiErrors,
  ClearCookies,
  Copy,
  CopyFilteredUrl,
  DataRepair,
  DeleteObject,
  DevMenu,
  DirectSignOn,
  Duplicate,
  Export,
  GetCardPages,
  GetCards,
  GetChildPages,
  GetDatasets,
  GetOwnedObjects,
  GetViewInputs,
  LockCards,
  NavigateToCopiedObject,
  RemoveEmptyStringsFromQuickFilters,
  SetStreamToManual,
  ShareWithSelf,
  TransferOwnership,
  UpdateCodeEngineVersions,
  UpdateDetails,
  UpdateOwner,
  ViewLineage
} from './functions';

export function ActionButtons({
  collapsable = false,
  currentContext,
  defaultExpanded,
  isLoading,
  onStatusUpdate
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded ?? !collapsable);

  useEffect(() => {
    if (defaultExpanded === false) {
      setIsExpanded(false);
    }
  }, [defaultExpanded]);

  const isDomoPage = currentContext?.isDomoPage ?? false;
  const availableActions = getAvailableActions(currentContext);
  const hasExpandableActions = availableActions.size > 0;

  return (
    <Card className='w-full shrink-0 p-0'>
      <Card.Content className='p-2'>
        {isLoading ? (
          <div className='skeleton--shimmer relative flex w-full gap-0 divide-x overflow-hidden'>
            {Array.from({ length: 7 }, (_, i) => (
              <Skeleton
                animationType='none'
                className='h-9 max-w-full flex-1 first:rounded-l-3xl last:rounded-r-3xl'
                key={i}
              />
            ))}
          </div>
        ) : (
          <Disclosure
            className='flex w-full flex-col'
            isExpanded={isExpanded}
            onExpandedChange={setIsExpanded}
          >
            <Disclosure.Heading className='w-full'>
              <ButtonGroup fullWidth>
                <Copy
                  currentContext={currentContext}
                  isDisabled={!isDomoPage}
                  onStatusUpdate={onStatusUpdate}
                />
                <ShareWithSelf
                  currentContext={currentContext}
                  isDisabled={!isDomoPage}
                  onStatusUpdate={onStatusUpdate}
                />
                <ActivityLog
                  currentContext={currentContext}
                  onStatusUpdate={onStatusUpdate}
                />
                <NavigateToCopiedObject
                  currentContext={currentContext}
                  onStatusUpdate={onStatusUpdate}
                />
                <ClearCookies
                  currentContext={currentContext}
                  isDisabled={!isDomoPage}
                  onStatusUpdate={onStatusUpdate}
                />
                <DeleteObject
                  currentContext={currentContext}
                  isDisabled={!isDomoPage}
                  onStatusUpdate={onStatusUpdate}
                />
                <Tooltip closeDelay={0} delay={400}>
                  <Button
                    fullWidth
                    isIconOnly
                    variant='tertiary'
                    onPress={async () => {
                      const optionsUrl = chrome.runtime.getURL(
                        'src/options/index.html'
                      );
                      const currentWindow = await chrome.windows.getCurrent();
                      const tabs = await chrome.tabs.query({
                        url: `${optionsUrl}*`,
                        windowId: currentWindow.id
                      });
                      const settingsTab = tabs.find((t) => {
                        const hash = new URL(t.url).hash.slice(1);
                        return (
                          !hash || hash === 'settings' || hash === 'favicon'
                        );
                      });
                      if (settingsTab) {
                        await chrome.tabs.update(settingsTab.id, {
                          active: true,
                          url: `${optionsUrl}#settings`
                        });
                      } else {
                        chrome.tabs.create({
                          url: `${optionsUrl}#settings`,
                          windowId: currentWindow.id
                        });
                      }
                      if (!isSidepanel()) window.close();
                    }}
                  >
                    <IconSettings stroke={1.5} />
                  </Button>
                  <Tooltip.Content>Extension settings</Tooltip.Content>
                </Tooltip>
                {collapsable ? (
                  <Tooltip closeDelay={0} delay={400}>
                    <Button
                      fullWidth
                      isIconOnly
                      isDisabled={!hasExpandableActions}
                      slot='trigger'
                      variant='tertiary'
                    >
                      <Disclosure.Indicator>
                        <IconChevronDown stroke={1.5} />
                      </Disclosure.Indicator>
                    </Button>

                    <Tooltip.Content>Expand</Tooltip.Content>
                  </Tooltip>
                ) : (
                  <Tooltip closeDelay={0} delay={400}>
                    <Button
                      fullWidth
                      isIconOnly
                      variant='tertiary'
                      onPress={openSidepanel}
                    >
                      <IconLayoutSidebarRightExpand stroke={1.5} />
                    </Button>
                    <Tooltip.Content>Open side panel</Tooltip.Content>
                  </Tooltip>
                )}
              </ButtonGroup>
            </Disclosure.Heading>
            <Disclosure.Content className='flex h-full w-full flex-col items-center justify-center gap-1'>
              <div className='flex w-full flex-wrap place-items-center items-center justify-center gap-1 not-empty:mt-1 empty:hidden'>
                {availableActions.has('getCards') && (
                  <GetCards
                    currentContext={currentContext}
                    isDisabled={!isDomoPage}
                    onCollapseActions={
                      collapsable ? () => setIsExpanded(false) : undefined
                    }
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('getDatasets') && (
                  <GetDatasets
                    currentContext={currentContext}
                    isDisabled={!isDomoPage}
                    onCollapseActions={
                      collapsable ? () => setIsExpanded(false) : undefined
                    }
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('getChildPages') && (
                  <GetChildPages
                    currentContext={currentContext}
                    isDisabled={!isDomoPage}
                    onCollapseActions={
                      collapsable ? () => setIsExpanded(false) : undefined
                    }
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('getCardPages') && (
                  <GetCardPages
                    currentContext={currentContext}
                    isDisabled={!isDomoPage}
                    onCollapseActions={
                      collapsable ? () => setIsExpanded(false) : undefined
                    }
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('viewLineage') && (
                  <ViewLineage
                    currentContext={currentContext}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('dataRepair') && (
                  <DataRepair
                    currentContext={currentContext}
                    isDisabled={!isDomoPage}
                  />
                )}
                {availableActions.has('directSignOn') && (
                  <DirectSignOn
                    currentContext={currentContext}
                    isDisabled={!isDomoPage}
                  />
                )}
                {availableActions.has('getViewInputs') && (
                  <GetViewInputs
                    currentContext={currentContext}
                    isDisabled={!isDomoPage}
                    onCollapseActions={
                      collapsable ? () => setIsExpanded(false) : undefined
                    }
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('updateDetails') && (
                  <UpdateDetails
                    currentContext={currentContext}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('transferOwnership') && (
                  <TransferOwnership
                    currentContext={currentContext}
                    onCollapseActions={
                      collapsable ? () => setIsExpanded(false) : undefined
                    }
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('getOwnedObjects') && (
                  <GetOwnedObjects
                    currentContext={currentContext}
                    onCollapseActions={
                      collapsable ? () => setIsExpanded(false) : undefined
                    }
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('duplicate') && (
                  <Duplicate
                    currentContext={currentContext}
                    onCollapseActions={
                      collapsable ? () => setIsExpanded(false) : undefined
                    }
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('updateOwner') && (
                  <UpdateOwner
                    currentContext={currentContext}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('lockCards') && (
                  <LockCards
                    currentContext={currentContext}
                    isDisabled={!isDomoPage}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('copyFilteredUrl') && (
                  <CopyFilteredUrl
                    currentContext={currentContext}
                    isDisabled={!isDomoPage}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('export') && (
                  <Export
                    currentContext={currentContext}
                    isDisabled={!isDomoPage}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('setStreamToManual') && (
                  <SetStreamToManual
                    currentContext={currentContext}
                    isDisabled={!isDomoPage}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('updateCodeEngineVersions') && (
                  <UpdateCodeEngineVersions
                    currentContext={currentContext}
                    isDisabled={!isDomoPage}
                    onCollapseActions={
                      collapsable ? () => setIsExpanded(false) : undefined
                    }
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                <ApiErrors
                  currentContext={currentContext}
                  isDisabled={!isDomoPage}
                  onCollapseActions={
                    collapsable ? () => setIsExpanded(false) : undefined
                  }
                  onStatusUpdate={onStatusUpdate}
                />
                {availableActions.has('removeEmptyStrings') && (
                  <RemoveEmptyStringsFromQuickFilters
                    currentContext={currentContext}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                <DevMenu />
              </div>
            </Disclosure.Content>
          </Disclosure>
        )}
      </Card.Content>
    </Card>
  );
}

/**
 * Determine which expandable action buttons are available for the current context.
 * Returns a Set of action keys. Used for both rendering and disabling the expand trigger.
 */
function getAvailableActions(currentContext) {
  const actions = new Set();
  const typeId = currentContext?.domoObject?.typeId;
  const metadata = currentContext?.domoObject?.metadata;
  const details = metadata?.details;
  const url = currentContext?.url;
  const userRights = currentContext?.user?.metadata?.USER_RIGHTS || [];
  if (
    [
      'DATA_APP_VIEW',
      'DATA_SOURCE',
      'DATAFLOW_TYPE',
      'PAGE',
      'REPORT_BUILDER_VIEW',
      'WORKSHEET_VIEW'
    ].includes(typeId)
  ) {
    actions.add('getCards');
    if (userRights.includes('content.admin')) {
      actions.add('lockCards');
    }
  }

  if (
    [
      'CARD',
      'DATA_APP_VIEW',
      'DATA_SOURCE',
      'DATAFLOW_TYPE',
      'PAGE',
      'WORKSHEET_VIEW'
    ].includes(typeId)
  ) {
    actions.add('getDatasets');
  }

  if (['DATA_APP_VIEW', 'PAGE', 'WORKSHEET_VIEW'].includes(typeId)) {
    actions.add('getChildPages');
  }

  if (
    [
      'CARD',
      'DATA_APP_VIEW',
      'DATA_SOURCE',
      'DATAFLOW_TYPE',
      'PAGE',
      'WORKSHEET_VIEW'
    ].includes(typeId)
  ) {
    actions.add('getCardPages');
  }

  if (typeId === 'DATA_SOURCE') {
    actions.add('getViewInputs');
    actions.add('dataRepair');
    if (
      details?.streamId &&
      metadata?.parent?.details?.scheduleState !== 'MANUAL'
    ) {
      actions.add('setStreamToManual');
    }
  }

  if (['DATA_SOURCE', 'DATAFLOW_TYPE'].includes(typeId)) {
    actions.add('viewLineage');
  }

  if (['CARD', 'DATA_APP_VIEW', 'PAGE'].includes(typeId)) {
    actions.add('copyFilteredUrl');
  }

  if (typeId === 'DATAFLOW_TYPE') {
    if (metadata?.permission?.mask & 2) {
      actions.add('updateDetails');
    }
  } else if (typeId === 'DATA_SOURCE') {
    if (metadata?.isOwner || userRights.includes('dataset.admin')) {
      actions.add('updateDetails');
    }
  }

  if (['ALERT', 'WORKFLOW_MODEL'].includes(typeId)) {
    actions.add('updateOwner');
  }

  if (
    typeId === 'WORKFLOW_MODEL_VERSION' &&
    !details?.deletedAt &&
    !details?.releasedAt
  ) {
    actions.add('updateCodeEngineVersions');
  }

  if (
    typeId === 'CODEENGINE_PACKAGE_VERSION' &&
    metadata?.context?.workflowModelId
  ) {
    actions.add('updateCodeEngineVersions');
  }

  if (
    ['CARD', 'CODEENGINE_PACKAGE', 'CODEENGINE_PACKAGE_VERSION'].includes(
      typeId
    )
  ) {
    actions.add('export');
  }

  if (typeId === 'CARD' && details?.type !== 'domoapp') {
    actions.add('removeEmptyStrings');
  }

  if (typeId === 'USER') {
    actions.add('transferOwnership');
    actions.add('getOwnedObjects');
    actions.add('duplicate');
  }

  if (
    url?.includes('domo.com/auth/index') &&
    !url?.includes('domoManualLogin=true')
  ) {
    actions.add('directSignOn');
  }

  return actions;
}
