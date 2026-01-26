import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  ButtonGroup,
  Card,
  Disclosure,
  IconChevronDown,
  Skeleton,
  Tooltip
} from '@heroui/react';
import {
  IconLayoutSidebarRightExpand,
  IconSettings
} from '@tabler/icons-react';
import {
  ActivityLogCurrentObject,
  ClearCookies,
  Copy,
  ContextFooter,
  DeleteCurrentObject,
  FilterActivityLog,
  GetPages,
  NavigateToCopiedObject,
  StatusBar,
  UpdateDataflowDetails,
  ShareWithSelf
} from '@/components';
import { openSidepanel } from '@/utils';

export function ActionButtons({
  currentContext,
  isLoadingCurrentContext,
  collapsable = false,
  onStatusCallbackReady = null
}) {
  const navigateToCopiedRef = useRef();
  const [isExpanded, setIsExpanded] = useState(!collapsable);
  const [statusBar, setStatusBar] = useState({
    title: '',
    description: '',
    status: 'accent',
    timeout: null,
    visible: false,
    key: Date.now()
  });

  const showStatus = useCallback(
    (title, description, status = 'accent', timeout = 3000) => {
      console.log('[ActionButtons] showStatus called:', {
        title,
        description,
        status,
        timeout,
        key: Date.now()
      });
      setStatusBar({
        title,
        description,
        status,
        timeout,
        visible: true,
        key: Date.now()
      });
    },
    []
  );

  const hideStatus = useCallback(() => {
    console.log('[ActionButtons] hideStatus called');
    setStatusBar((prev) => ({ ...prev, visible: false }));
  }, []);

  // Provide the showStatus callback to parent component when it mounts/changes
  useEffect(() => {
    if (onStatusCallbackReady) {
      onStatusCallbackReady(showStatus);
    }
  }, [onStatusCallbackReady, showStatus]);

  const isDomoPage = currentContext?.isDomoPage ?? false;

  return (
    <div className='flex w-full min-w-xs flex-col items-start justify-start gap-1 p-1'>
      <Card className='h-full w-full p-0'>
        <Card.Content className='flex w-full flex-col gap-1 p-2'>
          {isLoadingCurrentContext ? (
            <>
              <Skeleton className='h-10 w-full rounded-4xl' />
              <Skeleton className='h-10 w-full rounded-4xl' />
              <Skeleton className='h-10 w-full rounded-4xl' />
              <Skeleton className='from-bg-foreground/10 h-[6rem] w-full rounded-4xl bg-linear-to-r to-accent/10' />
            </>
          ) : (
            <Disclosure
              isExpanded={isExpanded}
              onExpandedChange={setIsExpanded}
              className='flex w-full flex-col gap-1'
            >
              <Disclosure.Heading className='flex w-full flex-col gap-1'>
                <ButtonGroup fullWidth>
                  <Copy
                    currentContext={currentContext}
                    showStatus={showStatus}
                    isDisabled={!isDomoPage}
                    navigateToCopiedRef={navigateToCopiedRef}
                  />
                  <ShareWithSelf
                    currentContext={currentContext}
                    onStatusUpdate={showStatus}
                    isDisabled={!isDomoPage}
                  />
                  <ClearCookies
                    currentContext={currentContext}
                    onStatusUpdate={showStatus}
                    isDisabled={!isDomoPage}
                  />
                  <DeleteCurrentObject
                    currentContext={currentContext}
                    onStatusUpdate={showStatus}
                    isDisabled={!isDomoPage}
                  />
                  <Tooltip delay={400} closeDelay={0}>
                    <Button
                      variant='tertiary'
                      fullWidth
                      isIconOnly
                      onPress={() => {
                        chrome.runtime.openOptionsPage();
                      }}
                    >
                      <IconSettings size={4} />
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
                          <IconChevronDown size={4} />
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
                        <Disclosure.Indicator>
                          <IconLayoutSidebarRightExpand size={4} />
                        </Disclosure.Indicator>
                      </Button>
                      <Tooltip.Content>Open side panel</Tooltip.Content>
                    </Tooltip>
                  )}
                </ButtonGroup>
              </Disclosure.Heading>
              <Disclosure.Content className='flex w-full flex-col gap-1'>
                <ActivityLogCurrentObject
                  currentContext={currentContext}
                  onStatusUpdate={showStatus}
                />
                {/* <FilterActivityLog
                currentContext={currentContext}
                // isDisabled={!isDomoPage}
                /> */}
                <NavigateToCopiedObject
                  ref={navigateToCopiedRef}
                  currentContext={currentContext}
                />
                {(currentContext?.domoObject?.typeId === 'PAGE' ||
                  currentContext?.domoObject?.typeId === 'DATA_APP_VIEW') && (
                  <GetPages
                    currentContext={currentContext}
                    onStatusUpdate={showStatus}
                    isDisabled={!isDomoPage}
                  />
                )}
                {currentContext?.domoObject?.typeId === 'DATAFLOW_TYPE' && (
                  <UpdateDataflowDetails
                    currentContext={currentContext}
                    onStatusUpdate={showStatus}
                  />
                )}
              </Disclosure.Content>
            </Disclosure>
          )}
        </Card.Content>
      </Card>
      <div className='relative min-h-[6rem] w-full'>
        <div
          className={`transition-all duration-300 ease-in-out ${
            statusBar.visible
              ? '-translate-y-2 opacity-0'
              : 'translate-y-0 opacity-100'
          }`}
        >
          <ContextFooter
            currentContext={currentContext}
            isLoading={isLoadingCurrentContext}
          />
        </div>
        {statusBar.visible && (
          <div className='absolute inset-0 h-full min-h-[6rem] translate-y-0 opacity-100 transition-all duration-300 ease-in-out'>
            <StatusBar
              key={statusBar.key}
              title={statusBar.title}
              description={statusBar.description}
              status={statusBar.status}
              timeout={statusBar.timeout}
              onClose={hideStatus}
            />
          </div>
        )}
        {/* Debug: statusBar.visible = {statusBar.visible.toString()}, key = {statusBar.key} */}
      </div>
    </div>
  );
}
