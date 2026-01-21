import { useCallback, useRef, useState } from 'react';
import { Button, ButtonGroup, Skeleton, Tooltip } from '@heroui/react';
import {
  ActivityLogCurrentObject,
  ClearCookies,
  ContextFooter,
  DeleteCurrentObject,
  FilterActivityLog,
  GetPages,
  NavigateToCopiedObject,
  StatusBar,
  UpdateDataflowDetails,
  ShareWithSelf
} from '@/components';
import { IconClipboard, IconSettings } from '@tabler/icons-react';

export function ActionButtons({
  currentContext,
  isDomoPage,
  isLoadingCurrentContext
}) {
  const navigateToCopiedRef = useRef();
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

  return (
    <div className='flex flex-col gap-1 p-2 w-full min-w-xs justify-center'>
      {isLoadingCurrentContext ? (
        <>
          <Skeleton className='h-10 w-full rounded-4xl' />
          <Skeleton className='h-10 w-full rounded-4xl' />
          <Skeleton className='h-10 w-full rounded-4xl' />
          <Skeleton className='from-bg-foreground/10 h-[6rem] w-full rounded-4xl bg-linear-to-r to-accent/10' />
        </>
      ) : (
        <>
          <ButtonGroup>
            <Tooltip delay={400} closeDelay={0}>
              <Button
                isDisabled={!isDomoPage || !currentContext?.domoObject?.id}
                onPress={() => {
                  navigator.clipboard.writeText(currentContext?.domoObject?.id);
                  showStatus(
                    `Copied ${currentContext?.domoObject?.typeName} ID ${currentContext?.domoObject?.id} to clipboard`,
                    '',
                    'success',
                    1500
                  );
                  // Trigger detection in NavigateToCopiedObject
                  navigateToCopiedRef.current?.triggerDetection(
                    currentContext?.domoObject?.id
                  );
                }}
                isIconOnly
                fullWidth
              >
                <IconClipboard className='size-4' />
              </Button>
              <Tooltip.Content>Copy ID</Tooltip.Content>
            </Tooltip>

            <ShareWithSelf
              currentContext={currentContext}
              onStatusUpdate={showStatus}
              isDisabled={!isDomoPage}
            />
            <ClearCookies
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
                onPress={() => {
                  chrome.runtime.openOptionsPage();
                }}
                isIconOnly
                fullWidth
              >
                <IconSettings className='size-4' />
              </Button>
              <Tooltip.Content>Extension settings</Tooltip.Content>
            </Tooltip>
          </ButtonGroup>
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
            isDomoPage={isDomoPage}
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

          <div className='relative min-h-[6rem] w-full'>
            <div
              className={`transition-all duration-300 ease-in-out ${
                statusBar.visible
                  ? '-translate-y-2 opacity-0'
                  : 'translate-y-0 opacity-100'
              }`}
            >
              <ContextFooter
                isDomoPage={isDomoPage}
                currentContext={currentContext}
                isLoading={isLoadingCurrentContext}
              />
            </div>
            {statusBar.visible && (
              <div className='absolute inset-0 translate-y-0 opacity-100 transition-all duration-300 ease-in-out'>
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
        </>
      )}
    </div>
  );
}
