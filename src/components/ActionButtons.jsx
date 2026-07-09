import { Button, ButtonGroup, Card, Disclosure, Skeleton, Tooltip } from '@heroui/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { ActivityLog } from '@/components/functions/ActivityLog';
import { ApiErrors } from '@/components/functions/ApiErrors';
import { CancelStreamExecution } from '@/components/functions/CancelStreamExecution';
import { ClearCookies } from '@/components/functions/ClearCookies';
import { Copy } from '@/components/functions/Copy';
import { CopyColorRules } from '@/components/functions/CopyColorRules';
import { CopyFilteredUrl } from '@/components/functions/CopyFilteredUrl';
import { DataRepair } from '@/components/functions/DataRepair';
import { DeleteObject } from '@/components/functions/DeleteObject';
import { DeleteUnusedBeastModes } from '@/components/functions/DeleteUnusedBeastModes';
import { DevMenu } from '@/components/functions/DevMenu';
import { DirectSignOn } from '@/components/functions/DirectSignOn';
import { Duplicate } from '@/components/functions/Duplicate';
import { Export } from '@/components/functions/Export';
import { Generate } from '@/components/functions/Generate';
import { GetBeastModes } from '@/components/functions/GetBeastModes';
import { GetCardPages } from '@/components/functions/GetCardPages';
import { GetCards } from '@/components/functions/GetCards';
import { GetChildPages } from '@/components/functions/GetChildPages';
import { GetDatasets } from '@/components/functions/GetDatasets';
import { GetOwnedObjects } from '@/components/functions/GetOwnedObjects';
import { GetViewInputs } from '@/components/functions/GetViewInputs';
import { GetWorkspaces } from '@/components/functions/GetWorkspaces';
import { InspectDataflow } from '@/components/functions/InspectDataflow';
import { ManageCardLocks } from '@/components/functions/ManageCardLocks';
import { ManageTags } from '@/components/functions/ManageTags';
import { MigrateDownstreamContent } from '@/components/functions/MigrateDownstreamContent';
import { NavigateToCopiedObject } from '@/components/functions/NavigateToCopiedObject';
import { RemapColumns } from '@/components/functions/RemapColumns';
import { RemoveEmptyStringsFromQuickFilters } from '@/components/functions/RemoveEmptyStringsFromQuickFilters';
import { SetStreamToManual } from '@/components/functions/SetStreamToManual';
import { ShareWithSelf } from '@/components/functions/ShareWithSelf';
import { SwapAccount } from '@/components/functions/SwapAccount';
import { Sync } from '@/components/functions/Sync';
import { TransferApproval } from '@/components/functions/TransferApproval';
import { TransferOwnership } from '@/components/functions/TransferOwnership';
import { UpdateDetails } from '@/components/functions/UpdateDetails';
import { UpdateOwner } from '@/components/functions/UpdateOwner';
import { UpdateTriggerVersions } from '@/components/functions/UpdateTriggerVersions';
import { UpdateWorkflowActionVersions } from '@/components/functions/UpdateWorkflowActionVersions';
import { ViewLineage } from '@/components/functions/ViewLineage';
import { ACTION_BAR_COLLAPSED_EVENT } from '@/hooks/useViewReady';
import { getAvailableActions } from '@/utils/availableActions';
import { isSidepanel, openSidepanel } from '@/utils/sidepanel';
import IconChevronDown from '@icons/chevron-down.svg?react';
import IconGear from '@icons/gear.svg?react';
import IconRightRailFill from '@icons/right-rail-fill.svg?react';

export function ActionButtons({
  activeViewReady = false,
  collapsable = false,
  currentContext,
  hasActiveView = false,
  isLoading,
  onStatusUpdate
}) {
  const [isExpanded, setIsExpanded] = useState(!collapsable || !(hasActiveView && activeViewReady));
  const [hasExpandableActions, setHasExpandableActions] = useState(false);
  const contentRef = useRef(null);

  // Reconcile the bar with the active view as it changes (collapsable mode only;
  // the popup's bar is always open):
  //   - No view open (home): expand so the action buttons are visible.
  //   - The active view has settled: collapse to hand the space to its results.
  //   - A view is still loading: leave the bar as-is. This lets a manual expand
  //     before launching an action survive until the new view renders, while a
  //     reload or drill from a collapsed bar never flashes open.
  useEffect(() => {
    if (!collapsable) return;
    if (!hasActiveView) {
      setIsExpanded(true);
    } else if (activeViewReady) {
      setIsExpanded(false);
    }
  }, [activeViewReady, collapsable, hasActiveView]);

  // Under reduced motion the collapse is instant, so no height transition (and thus
  // no `onTransitionEnd`) fires. Signal the collapse "finished" here instead, so
  // views holding their content until the bar closes still get released.
  useEffect(() => {
    if (!isExpanded && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      document.dispatchEvent(new Event(ACTION_BAR_COLLAPSED_EVENT));
    }
  }, [isExpanded]);

  // Whether the panel has anything to show is measured from the rendered DOM,
  // not from getAvailableActions alone: ApiErrors and DevMenu render outside of
  // getAvailableActions (DevMenu manages its own visibility without re-rendering
  // this component), so the count would otherwise miss them and leave the expand
  // toggle disabled when one of them is the only available action.
  useLayoutEffect(() => {
    const node = contentRef.current;
    if (!node) return;
    const update = () => setHasExpandableActions(node.childElementCount > 0);
    update();
    const observer = new MutationObserver(update);
    observer.observe(node, { childList: true });
    return () => observer.disconnect();
  }, [isLoading]);

  const isDomoPage = currentContext?.isDomoPage ?? false;
  const availableActions = getAvailableActions(currentContext);

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
          <Disclosure className='flex w-full flex-col' isExpanded={isExpanded} onExpandedChange={setIsExpanded}>
            <Disclosure.Heading className='w-full'>
              <ButtonGroup fullWidth>
                <Copy currentContext={currentContext} isDisabled={!isDomoPage} onStatusUpdate={onStatusUpdate} />
                <ShareWithSelf currentContext={currentContext} isDisabled={!isDomoPage} onStatusUpdate={onStatusUpdate} />
                <ActivityLog currentContext={currentContext} onStatusUpdate={onStatusUpdate} />
                <NavigateToCopiedObject currentContext={currentContext} onStatusUpdate={onStatusUpdate} />
                <DeleteObject currentContext={currentContext} isDisabled={!isDomoPage} onStatusUpdate={onStatusUpdate} />
                <ClearCookies currentContext={currentContext} isDisabled={!isDomoPage} onStatusUpdate={onStatusUpdate} />
                <Tooltip delay={200}>
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
                        return (
                          !hash ||
                          hash === 'general-settings' ||
                          hash === 'favicon-preferences' ||
                          hash === 'per-instance-settings'
                        );
                      });
                      if (settingsTab) {
                        await chrome.tabs.update(settingsTab.id, {
                          active: true,
                          url: `${optionsUrl}#general-settings`
                        });
                      } else {
                        const [activeTab] = await chrome.tabs.query({
                          active: true,
                          windowId: currentWindow.id
                        });
                        chrome.tabs.create({
                          index: activeTab ? activeTab.index + 1 : undefined,
                          openerTabId: activeTab?.id,
                          url: `${optionsUrl}#general-settings`,
                          windowId: currentWindow.id
                        });
                      }
                      if (!isSidepanel()) window.close();
                    }}
                  >
                    <IconGear />
                  </Button>
                  <Tooltip.Content className='max-w-60' offset={4}>
                    Extension settings
                  </Tooltip.Content>
                </Tooltip>
                {collapsable ? (
                  <Tooltip delay={200}>
                    <Button fullWidth isIconOnly isDisabled={!hasExpandableActions} slot='trigger' variant='tertiary'>
                      <Disclosure.Indicator>
                        <IconChevronDown />
                      </Disclosure.Indicator>
                    </Button>

                    <Tooltip.Content className='max-w-60' offset={4}>
                      Expand
                    </Tooltip.Content>
                  </Tooltip>
                ) : (
                  <Tooltip delay={200}>
                    <Button fullWidth isIconOnly variant='tertiary' onPress={openSidepanel}>
                      <IconRightRailFill />
                    </Button>
                    <Tooltip.Content className='max-w-60' offset={4}>
                      Open side panel
                    </Tooltip.Content>
                  </Tooltip>
                )}
              </ButtonGroup>
            </Disclosure.Heading>
            <Disclosure.Content
              className='flex h-full w-full flex-col items-center justify-center gap-1'
              onTransitionEnd={(e) => {
                // Signal views holding their content that the collapse finished, so
                // they mount into the settled layout. Only the height transition,
                // and only when collapsed (not on expand).
                if (e.propertyName === 'height' && !isExpanded) {
                  document.dispatchEvent(new Event(ACTION_BAR_COLLAPSED_EVENT));
                }
              }}
            >
              <div
                className='flex w-full flex-wrap place-items-center items-center justify-center gap-1 not-empty:mt-1 empty:hidden'
                ref={contentRef}
              >
                <ApiErrors
                  currentContext={currentContext}
                  isDisabled={!isDomoPage}
                  onStatusUpdate={onStatusUpdate}
                />
                {availableActions.has('getCards') && (
                  <GetCards
                    currentContext={currentContext}
                    isDisabled={!isDomoPage}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('getDatasets') && (
                  <GetDatasets
                    currentContext={currentContext}
                    isDisabled={!isDomoPage}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('getChildPages') && (
                  <GetChildPages
                    currentContext={currentContext}
                    isDisabled={!isDomoPage}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('getCardPages') && (
                  <GetCardPages
                    currentContext={currentContext}
                    isDisabled={!isDomoPage}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('getBeastModes') && (
                  <GetBeastModes
                    currentContext={currentContext}
                    isDisabled={!isDomoPage}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('getWorkspaces') && (
                  <GetWorkspaces
                    currentContext={currentContext}
                    isDisabled={!isDomoPage}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('getViewInputs') && (
                  <GetViewInputs
                    currentContext={currentContext}
                    isDisabled={!isDomoPage}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('viewLineage') && (
                  <ViewLineage currentContext={currentContext} onStatusUpdate={onStatusUpdate} />
                )}
                {availableActions.has('inspectDataflow') && (
                  <InspectDataflow
                    currentContext={currentContext}
                    isDisabled={!isDomoPage}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('updateOwner') && (
                  <UpdateOwner currentContext={currentContext} onStatusUpdate={onStatusUpdate} />
                )}
                {availableActions.has('transferApproval') && (
                  <TransferApproval
                    currentContext={currentContext}
                    isDisabled={!isDomoPage}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('updateDetails') && (
                  <UpdateDetails currentContext={currentContext} onStatusUpdate={onStatusUpdate} />
                )}
                {availableActions.has('manageTags') && (
                  <ManageTags
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
                {availableActions.has('dataRepair') && (
                  <DataRepair currentContext={currentContext} isDisabled={!isDomoPage} />
                )}
                {availableActions.has('migrateDownstreamContent') && (
                  <MigrateDownstreamContent
                    currentContext={currentContext}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('remapColumns') && (
                  <RemapColumns
                    currentContext={currentContext}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('transferOwnership') && (
                  <TransferOwnership
                    currentContext={currentContext}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('getOwnedObjects') && (
                  <GetOwnedObjects
                    currentContext={currentContext}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('duplicate') && (
                  <Duplicate
                    currentContext={currentContext}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('export') && (
                  <Export currentContext={currentContext} isDisabled={!isDomoPage} onStatusUpdate={onStatusUpdate} />
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
                {availableActions.has('swapAccount') && (
                  <SwapAccount
                    currentContext={currentContext}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('updateWorkflowActionVersions') && (
                  <UpdateWorkflowActionVersions
                    currentContext={currentContext}
                    isDisabled={!isDomoPage}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('updateTriggerVersions') && (
                  <UpdateTriggerVersions
                    currentContext={currentContext}
                    isDisabled={!isDomoPage}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('generate') && (
                  <Generate
                    currentContext={currentContext}
                    isDisabled={!isDomoPage}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('sync') && (
                  <Sync
                    currentContext={currentContext}
                    isDisabled={!isDomoPage}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
                {availableActions.has('removeEmptyStrings') && (
                  <RemoveEmptyStringsFromQuickFilters currentContext={currentContext} onStatusUpdate={onStatusUpdate} />
                )}
                {availableActions.has('directSignOn') && (
                  <DirectSignOn currentContext={currentContext} isDisabled={!isDomoPage} />
                )}
                {availableActions.has('copyColorRules') && (
                  <CopyColorRules currentContext={currentContext} onStatusUpdate={onStatusUpdate} />
                )}
                {availableActions.has('manageCardLocks') && (
                  <ManageCardLocks currentContext={currentContext} isDisabled={!isDomoPage} onStatusUpdate={onStatusUpdate} />
                )}
                {availableActions.has('deleteUnusedBeastModes') && (
                  <DeleteUnusedBeastModes
                    currentContext={currentContext}
                    isDisabled={!isDomoPage}
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
