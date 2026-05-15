import { Button, ButtonGroup, Card, Disclosure, Skeleton, Tooltip } from '@heroui/react';
import { useEffect, useState } from 'react';

import { ActivityLog } from '@/components/functions/ActivityLog';
import { ApiErrors } from '@/components/functions/ApiErrors';
import { CancelStreamExecution } from '@/components/functions/CancelStreamExecution';
import { ClearCookies } from '@/components/functions/ClearCookies';
import { Copy } from '@/components/functions/Copy';
import { CopyColorRules } from '@/components/functions/CopyColorRules';
import { CopyFilteredUrl } from '@/components/functions/CopyFilteredUrl';
import { DataRepair } from '@/components/functions/DataRepair';
import { DeleteObject } from '@/components/functions/DeleteObject';
import { DevMenu } from '@/components/functions/DevMenu';
import { DirectSignOn } from '@/components/functions/DirectSignOn';
import { Duplicate } from '@/components/functions/Duplicate';
import { Export } from '@/components/functions/Export';
import { GetCardPages } from '@/components/functions/GetCardPages';
import { GetCards } from '@/components/functions/GetCards';
import { GetChildPages } from '@/components/functions/GetChildPages';
import { GetDatasets } from '@/components/functions/GetDatasets';
import { GetOwnedObjects } from '@/components/functions/GetOwnedObjects';
import { GetViewInputs } from '@/components/functions/GetViewInputs';
import { LockCards } from '@/components/functions/LockCards';
import { MigrateDownstreamContent } from '@/components/functions/MigrateDownstreamContent';
import { NavigateToCopiedObject } from '@/components/functions/NavigateToCopiedObject';
import { RemoveEmptyStringsFromQuickFilters } from '@/components/functions/RemoveEmptyStringsFromQuickFilters';
import { SetStreamToManual } from '@/components/functions/SetStreamToManual';
import { ShareWithSelf } from '@/components/functions/ShareWithSelf';
import { SyncJSDocFromSource } from '@/components/functions/SyncJSDocFromSource';
import { TransferOwnership } from '@/components/functions/TransferOwnership';
import { UpdateCodeEngineVersions } from '@/components/functions/UpdateCodeEngineVersions';
import { UpdateDetails } from '@/components/functions/UpdateDetails';
import { UpdateOwner } from '@/components/functions/UpdateOwner';
import { ViewLineage } from '@/components/functions/ViewLineage';
import { getAvailableActions } from '@/utils/availableActions';
import { isSidepanel, openSidepanel } from '@/utils/sidepanel';
import IconChevronDown from '@icons/chevron-down.svg?react';
import IconGear from '@icons/gear.svg?react';
import IconRightRailFill from '@icons/right-rail-fill.svg?react';

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
                <ActivityLog currentContext={currentContext} onStatusUpdate={onStatusUpdate} />
                <NavigateToCopiedObject
                  currentContext={currentContext}
                  onStatusUpdate={onStatusUpdate}
                />
                <DeleteObject
                  currentContext={currentContext}
                  isDisabled={!isDomoPage}
                  onStatusUpdate={onStatusUpdate}
                />
                <ClearCookies
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
                      const optionsUrl = chrome.runtime.getURL('src/options/index.html');
                      const currentWindow = await chrome.windows.getCurrent();
                      const tabs = await chrome.tabs.query({
                        url: `${optionsUrl}*`,
                        windowId: currentWindow.id
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
                      } else {
                        const [activeTab] = await chrome.tabs.query({
                          active: true,
                          windowId: currentWindow.id
                        });
                        chrome.tabs.create({
                          index: activeTab ? activeTab.index + 1 : undefined,
                          url: `${optionsUrl}#settings`,
                          windowId: currentWindow.id
                        });
                      }
                      if (!isSidepanel()) window.close();
                    }}
                  >
                    <IconGear />
                  </Button>
                  <Tooltip.Content
                    className='flex max-w-60 flex-col items-center justify-center px-1 py-0.5 text-center text-wrap break-normal'
                    offset={4}
                  >
                    Extension settings
                  </Tooltip.Content>
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
                        <IconChevronDown />
                      </Disclosure.Indicator>
                    </Button>

                    <Tooltip.Content
                      className='flex max-w-60 flex-col items-center justify-center px-1 py-0.5 text-center text-wrap break-normal'
                      offset={4}
                    >
                      Expand
                    </Tooltip.Content>
                  </Tooltip>
                ) : (
                  <Tooltip closeDelay={0} delay={400}>
                    <Button fullWidth isIconOnly variant='tertiary' onPress={openSidepanel}>
                      <IconRightRailFill />
                    </Button>
                    <Tooltip.Content
                      className='flex max-w-60 flex-col items-center justify-center px-1 py-0.5 text-center text-wrap break-normal'
                      offset={4}
                    >
                      Open side panel
                    </Tooltip.Content>
                  </Tooltip>
                )}
              </ButtonGroup>
            </Disclosure.Heading>
            <Disclosure.Content className='flex h-full w-full flex-col items-center justify-center gap-1'>
              <div className='flex w-full flex-wrap items-stretch justify-center gap-1 not-empty:mt-1 empty:hidden'>
                {availableActions.has('getCards') && (
                  <GetCards
                    currentContext={currentContext}
                    isDisabled={!isDomoPage}
                    onCollapseActions={collapsable ? () => setIsExpanded(false) : undefined}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('getDatasets') && (
                  <GetDatasets
                    currentContext={currentContext}
                    isDisabled={!isDomoPage}
                    onCollapseActions={collapsable ? () => setIsExpanded(false) : undefined}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('getChildPages') && (
                  <GetChildPages
                    currentContext={currentContext}
                    isDisabled={!isDomoPage}
                    onCollapseActions={collapsable ? () => setIsExpanded(false) : undefined}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('getCardPages') && (
                  <GetCardPages
                    currentContext={currentContext}
                    isDisabled={!isDomoPage}
                    onCollapseActions={collapsable ? () => setIsExpanded(false) : undefined}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('getViewInputs') && (
                  <GetViewInputs
                    currentContext={currentContext}
                    isDisabled={!isDomoPage}
                    onCollapseActions={collapsable ? () => setIsExpanded(false) : undefined}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('viewLineage') && (
                  <ViewLineage currentContext={currentContext} onStatusUpdate={onStatusUpdate} />
                )}
                {availableActions.has('dataRepair') && (
                  <DataRepair currentContext={currentContext} isDisabled={!isDomoPage} />
                )}
                {availableActions.has('updateDetails') && (
                  <UpdateDetails currentContext={currentContext} onStatusUpdate={onStatusUpdate} />
                )}
                {availableActions.has('copyColorRules') && (
                  <CopyColorRules currentContext={currentContext} onStatusUpdate={onStatusUpdate} />
                )}
                {availableActions.has('migrateDownstreamContent') && (
                  <MigrateDownstreamContent
                    currentContext={currentContext}
                    onCollapseActions={collapsable ? () => setIsExpanded(false) : undefined}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('transferOwnership') && (
                  <TransferOwnership
                    currentContext={currentContext}
                    onCollapseActions={collapsable ? () => setIsExpanded(false) : undefined}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('getOwnedObjects') && (
                  <GetOwnedObjects
                    currentContext={currentContext}
                    onCollapseActions={collapsable ? () => setIsExpanded(false) : undefined}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('duplicate') && (
                  <Duplicate
                    currentContext={currentContext}
                    onCollapseActions={collapsable ? () => setIsExpanded(false) : undefined}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('updateOwner') && (
                  <UpdateOwner currentContext={currentContext} onStatusUpdate={onStatusUpdate} />
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
                {availableActions.has('cancelStreamExecution') && (
                  <CancelStreamExecution currentContext={currentContext} isDisabled={!isDomoPage} />
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
                    onCollapseActions={collapsable ? () => setIsExpanded(false) : undefined}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('syncJSDocFromSource') && (
                  <SyncJSDocFromSource
                    currentContext={currentContext}
                    isDisabled={!isDomoPage}
                    onCollapseActions={collapsable ? () => setIsExpanded(false) : undefined}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                <ApiErrors
                  currentContext={currentContext}
                  isDisabled={!isDomoPage}
                  onCollapseActions={collapsable ? () => setIsExpanded(false) : undefined}
                  onStatusUpdate={onStatusUpdate}
                />
                {availableActions.has('removeEmptyStrings') && (
                  <RemoveEmptyStringsFromQuickFilters
                    currentContext={currentContext}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('directSignOn') && (
                  <DirectSignOn currentContext={currentContext} isDisabled={!isDomoPage} />
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
