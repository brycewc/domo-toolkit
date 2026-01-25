import { useCallback, useRef, useState } from 'react';
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
import { IconSettings } from '@tabler/icons-react';

export function ActionButtons({
  currentContext,
  isLoadingCurrentContext,
  collapsable = false
}) {
  const navigateToCopiedRef = useRef();
  const [isExpanded, setIsExpanded] = useState(!collapsable);
  const [statusBar, setStatusBar] = useState({
    title: '',
    description: '',
    status: 'accent',
    timeout: 3000,
    visible: false
  });

  const showStatus = (
    title,
    description,
    status = 'accent',
    timeout = 3000
  ) => {
    setStatusBar({ title, description, status, timeout, visible: true });
  };

  const hideStatus = useCallback(() => {
    setStatusBar((prev) => ({ ...prev, visible: false }));
  }, []);

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
                  {collapsable && (
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
              title={statusBar.title}
              description={statusBar.description}
              status={statusBar.status}
              timeout={statusBar.timeout}
              onClose={hideStatus}
            />
          </div>
        )}
      </div>
    </div>
  );
}
