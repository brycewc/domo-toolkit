import { useCallback, useEffect, useRef, useState } from 'react';
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
  IconSettings,
  IconSquare
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
    <div className='flex w-full min-w-xs flex-col items-center justify-center gap-1'>
      <Card className='h-full w-full p-0'>
        <Card.Content className='p-2'>
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
              className={isExpanded ? 'space-y-1' : ''}
            >
              <Disclosure.Heading className='w-full'>
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
                        window.close();
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
                        <IconLayoutSidebarRightExpand size={4} />
                      </Button>
                      <Tooltip.Content>Open side panel</Tooltip.Content>
                    </Tooltip>
                  )}
                </ButtonGroup>
              </Disclosure.Heading>
              <Disclosure.Content className='space-y-1'>
                <div className='flex w-full flex-wrap place-items-center items-center justify-center gap-1'>
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
                </div>
                {(currentContext?.domoObject?.typeId === 'PAGE' ||
                  currentContext?.domoObject?.typeId === 'DATA_APP_VIEW' ||
                  currentContext?.domoObject?.typeId === 'CARD' ||
                  currentContext?.domoObject?.typeId === 'DATA_SOURCE') && (
                  <GetPages
                    currentContext={currentContext}
                    onStatusUpdate={showStatus}
                    isDisabled={!isDomoPage}
                    onCollapseActions={
                      collapsable ? () => setIsExpanded(false) : undefined
                    }
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
      <div className='w-full'>
        {statusBar.visible ? (
          <StatusBar
            key={statusBar.key}
            title={statusBar.title}
            description={statusBar.description}
            status={statusBar.status}
            timeout={statusBar.timeout}
            onClose={hideStatus}
          />
        ) : (
          <ContextFooter
            currentContext={currentContext}
            isLoading={isLoadingCurrentContext}
          />
        )}
      </div>
    </div>
  );
}
