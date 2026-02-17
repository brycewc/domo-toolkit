import { useRef, useState } from 'react';
import { Button, ButtonGroup, Card, Disclosure, Tooltip } from '@heroui/react';
import {
  IconChevronDown,
  IconHelp,
  IconLayoutSidebarRightExpand,
  IconSettings
} from '@tabler/icons-react';
import {
  ActivityLogCurrentObject,
  ClearCookies,
  Copy,
  CopyFilteredUrl,
  DataRepair,
  DeleteCurrentObject,
  GetCards,
  GetDatasets,
  GetOtherPages,
  GetPages,
  NavigateToCopiedObject,
  RemoveEmptyStringsFromQuickFilters,
  ShareWithSelf,
  UpdateDataflowDetails,
  UpdateOwner
} from '@/components';
import { openSidepanel, isSidepanel } from '@/utils';

export function ActionButtons({
  currentContext,
  isLoadingCurrentContext,
  collapsable = false,
  onStatusUpdate
}) {
  const navigateToCopiedRef = useRef();
  const [isExpanded, setIsExpanded] = useState(!collapsable);

  const isDomoPage = currentContext?.isDomoPage ?? false;

  return (
    <Card className='w-full shrink-0 p-0'>
      <Card.Content className='p-2'>
        <Disclosure
          isExpanded={isExpanded}
          onExpandedChange={setIsExpanded}
          className='flex w-full flex-col'
        >
          <Disclosure.Heading className='w-full'>
            <ButtonGroup fullWidth>
              <Copy
                currentContext={currentContext}
                onStatusUpdate={onStatusUpdate}
                isDisabled={!isDomoPage}
                navigateToCopiedRef={navigateToCopiedRef}
              />
              <ShareWithSelf
                currentContext={currentContext}
                onStatusUpdate={onStatusUpdate}
                isDisabled={!isDomoPage}
              />
              <ClearCookies
                currentContext={currentContext}
                onStatusUpdate={onStatusUpdate}
                isDisabled={!isDomoPage}
              />
              <DeleteCurrentObject
                currentContext={currentContext}
                onStatusUpdate={onStatusUpdate}
                isDisabled={!isDomoPage}
              />
              <Tooltip delay={400} closeDelay={0}>
                <Button
                  variant='tertiary'
                  fullWidth
                  isIconOnly
                  onPress={() => {
                    window.open(
                      'https://github.com/brycewc/domo-toolkit/issues',
                      '_blank'
                    );
                  }}
                >
                  <IconHelp stroke={1.5} />
                </Button>
                <Tooltip.Content>
                  Report an issue or request a feature
                </Tooltip.Content>
              </Tooltip>
              <Tooltip delay={400} closeDelay={0}>
                <Button
                  variant='tertiary'
                  fullWidth
                  isIconOnly
                  onPress={() => {
                    chrome.runtime.openOptionsPage();
                    if (!isSidepanel()) window.close();
                  }}
                >
                  <IconSettings stroke={1.5} />
                </Button>
                <Tooltip.Content>Extension settings</Tooltip.Content>
              </Tooltip>
              {collapsable ? (
                <Tooltip delay={400} closeDelay={0}>
                  <Button
                    variant='tertiary'
                    slot='trigger'
                    fullWidth
                    isIconOnly
                  >
                    <Disclosure.Indicator>
                      <IconChevronDown stroke={1.5} />
                    </Disclosure.Indicator>
                  </Button>

                  <Tooltip.Content>Expand</Tooltip.Content>
                </Tooltip>
              ) : (
                <Tooltip delay={400} closeDelay={0}>
                  <Button
                    variant='tertiary'
                    fullWidth
                    isIconOnly
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
            <div className='mt-1 flex w-full flex-wrap place-items-center items-center justify-center gap-1'>
              <ActivityLogCurrentObject
                currentContext={currentContext}
                onStatusUpdate={onStatusUpdate}
              />
              <NavigateToCopiedObject
                ref={navigateToCopiedRef}
                currentContext={currentContext}
                onStatusUpdate={onStatusUpdate}
              />
            </div>
            <div className='flex w-full flex-wrap place-items-center items-center justify-center gap-1 empty:hidden'>
              {(currentContext?.domoObject?.typeId === 'PAGE' ||
                currentContext?.domoObject?.typeId === 'DATA_APP_VIEW' ||
                currentContext?.domoObject?.typeId === 'REPORT_BUILDER_VIEW' ||
                currentContext?.domoObject?.typeId === 'WORKSHEET_VIEW' ||
                currentContext?.domoObject?.typeId === 'DATA_SOURCE') && (
                <GetCards
                  currentContext={currentContext}
                  onStatusUpdate={onStatusUpdate}
                  isDisabled={!isDomoPage}
                  onCollapseActions={
                    collapsable ? () => setIsExpanded(false) : undefined
                  }
                />
              )}
              {(currentContext?.domoObject?.typeId === 'PAGE' ||
                currentContext?.domoObject?.typeId === 'DATA_APP_VIEW' ||
                currentContext?.domoObject?.typeId === 'DATAFLOW_TYPE' ||
                currentContext?.domoObject?.typeId === 'DATA_SOURCE') && (
                <GetDatasets
                  currentContext={currentContext}
                  onStatusUpdate={onStatusUpdate}
                  isDisabled={!isDomoPage}
                  onCollapseActions={
                    collapsable ? () => setIsExpanded(false) : undefined
                  }
                />
              )}
              {(currentContext?.domoObject?.typeId === 'PAGE' ||
                currentContext?.domoObject?.typeId === 'DATA_APP_VIEW' ||
                currentContext?.domoObject?.typeId === 'CARD' ||
                currentContext?.domoObject?.typeId === 'DATA_SOURCE') && (
                <GetPages
                  currentContext={currentContext}
                  onStatusUpdate={onStatusUpdate}
                  isDisabled={!isDomoPage}
                  onCollapseActions={
                    collapsable ? () => setIsExpanded(false) : undefined
                  }
                />
              )}
              {(currentContext?.domoObject?.typeId === 'PAGE' ||
                currentContext?.domoObject?.typeId === 'DATA_APP_VIEW' ||
                currentContext?.domoObject?.typeId === 'WORKSHEET_VIEW') && (
                <GetOtherPages
                  currentContext={currentContext}
                  onStatusUpdate={onStatusUpdate}
                  isDisabled={!isDomoPage}
                  onCollapseActions={
                    collapsable ? () => setIsExpanded(false) : undefined
                  }
                />
              )}
              {currentContext?.domoObject?.typeId === 'DATA_SOURCE' && (
                <DataRepair
                  currentContext={currentContext}
                  isDisabled={!isDomoPage}
                />
              )}
              {(currentContext?.domoObject?.typeId === 'PAGE' ||
                currentContext?.domoObject?.typeId === 'DATA_APP_VIEW' ||
                currentContext?.domoObject?.typeId === 'CARD') && (
                <CopyFilteredUrl
                  currentContext={currentContext}
                  onStatusUpdate={onStatusUpdate}
                  isDisabled={!isDomoPage}
                />
              )}
              {currentContext?.domoObject?.typeId === 'DATAFLOW_TYPE' && (
                <UpdateDataflowDetails
                  currentContext={currentContext}
                  onStatusUpdate={onStatusUpdate}
                />
              )}
              {(currentContext?.domoObject?.typeId === 'ALERT' ||
                currentContext?.domoObject?.typeId === 'WORKFLOW_MODEL') && (
                <UpdateOwner
                  currentContext={currentContext}
                  onStatusUpdate={onStatusUpdate}
                />
              )}
              {currentContext?.domoObject?.typeId === 'CARD' &&
                currentContext?.domoObject?.metadata?.details?.type !==
                  'domoapp' && (
                  <RemoveEmptyStringsFromQuickFilters
                    currentContext={currentContext}
                    onStatusUpdate={onStatusUpdate}
                  />
                )}
            </div>
          </Disclosure.Content>
        </Disclosure>
      </Card.Content>
    </Card>
  );
}
