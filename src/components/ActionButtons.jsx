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
import { useEffect, useRef, useState } from 'react';

import {
  ActivityLogCurrentObject,
  CardErrors,
  ClearCookies,
  Copy,
  CopyFilteredUrl,
  DataRepair,
  DeleteCurrentObject,
  Export,
  GetCards,
  GetDatasets,
  GetOtherPages,
  GetPages,
  GetViewInputs,
  LockCards,
  NavigateToCopiedObject,
  RemoveEmptyStringsFromQuickFilters,
  ShareWithSelf,
  UpdateDataflowDetails,
  UpdateOwner
} from '@/components';
import { isSidepanel, openSidepanel } from '@/utils';

export function ActionButtons({
  collapsable = false,
  currentContext,
  defaultExpanded,
  isLoading,
  onStatusUpdate
}) {
  const navigateToCopiedRef = useRef();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded ?? !collapsable);

  useEffect(() => {
    if (defaultExpanded === false) {
      setIsExpanded(false);
    }
  }, [defaultExpanded]);

  const isDomoPage = currentContext?.isDomoPage ?? false;
  const typeId = currentContext?.domoObject?.typeId;
  const details = currentContext?.domoObject?.metadata?.details;
  const availableActions = getAvailableActions(typeId, details);
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
                  navigateToCopiedRef={navigateToCopiedRef}
                  onStatusUpdate={onStatusUpdate}
                />
                <ShareWithSelf
                  currentContext={currentContext}
                  isDisabled={!isDomoPage}
                  onStatusUpdate={onStatusUpdate}
                />
                <ActivityLogCurrentObject
                  currentContext={currentContext}
                  onStatusUpdate={onStatusUpdate}
                />
                <NavigateToCopiedObject
                  currentContext={currentContext}
                  ref={navigateToCopiedRef}
                  onStatusUpdate={onStatusUpdate}
                />
                <ClearCookies
                  currentContext={currentContext}
                  isDisabled={!isDomoPage}
                  onStatusUpdate={onStatusUpdate}
                />
                <DeleteCurrentObject
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
                      const tabs = await chrome.tabs.query({
                        url: `${optionsUrl}*`
                      });
                      const settingsTab = tabs.find((t) => {
                        const hash = new URL(t.url).hash.slice(1);
                        return !hash || hash === 'settings' || hash === 'favicon';
                      });
                      if (settingsTab) {
                        await chrome.tabs.update(settingsTab.id, {
                          active: true,
                          url: `${optionsUrl}#settings`
                        });
                        await chrome.windows.update(settingsTab.windowId, {
                          focused: true
                        });
                      } else {
                        chrome.tabs.create({
                          url: `${optionsUrl}#settings`
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
                <CardErrors
                  currentContext={currentContext}
                  isDisabled={!isDomoPage}
                  onCollapseActions={
                    collapsable ? () => setIsExpanded(false) : undefined
                  }
                  onStatusUpdate={onStatusUpdate}
                />
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
                {availableActions.has('getPages') && (
                  <GetPages
                    currentContext={currentContext}
                    isDisabled={!isDomoPage}
                    onCollapseActions={
                      collapsable ? () => setIsExpanded(false) : undefined
                    }
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('getOtherPages') && (
                  <GetOtherPages
                    currentContext={currentContext}
                    isDisabled={!isDomoPage}
                    onCollapseActions={
                      collapsable ? () => setIsExpanded(false) : undefined
                    }
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('dataRepair') && (
                  <DataRepair
                    currentContext={currentContext}
                    isDisabled={!isDomoPage}
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
                {availableActions.has('updateDataflowDetails') && (
                  <UpdateDataflowDetails
                    currentContext={currentContext}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('updateOwner') && (
                  <UpdateOwner
                    currentContext={currentContext}
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
                {availableActions.has('removeEmptyStrings') && (
                  <RemoveEmptyStringsFromQuickFilters
                    currentContext={currentContext}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
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
function getAvailableActions(typeId, details) {
  const actions = new Set();

  if (
    [
      'DATA_APP_VIEW',
      'DATA_SOURCE',
      'PAGE',
      'REPORT_BUILDER_VIEW',
      'WORKSHEET_VIEW'
    ].includes(typeId)
  ) {
    actions.add('getCards');
    actions.add('lockCards');
  }

  if (
    ['CARD', 'DATA_APP_VIEW', 'DATA_SOURCE', 'DATAFLOW_TYPE', 'PAGE'].includes(
      typeId
    )
  ) {
    actions.add('getDatasets');
  }

  if (['CARD', 'DATA_APP_VIEW', 'DATA_SOURCE', 'PAGE'].includes(typeId)) {
    actions.add('getPages');
  }

  if (['DATA_APP_VIEW', 'PAGE', 'WORKSHEET_VIEW'].includes(typeId)) {
    actions.add('getOtherPages');
  }

  if (typeId === 'DATA_SOURCE') {
    actions.add('getViewInputs');
    actions.add('dataRepair');
  }

  if (['CARD', 'DATA_APP_VIEW', 'PAGE'].includes(typeId)) {
    actions.add('copyFilteredUrl');
  }

  if (typeId === 'DATAFLOW_TYPE') {
    actions.add('updateDataflowDetails');
  }

  if (['ALERT', 'WORKFLOW_MODEL'].includes(typeId)) {
    actions.add('updateOwner');
  }

  if (['CARD', 'CODEENGINE_PACKAGE'].includes(typeId)) {
    actions.add('export');
  }

  if (typeId === 'CARD' && details?.type !== 'domoapp') {
    actions.add('removeEmptyStrings');
  }

  return actions;
}
