import { useCallback, useRef, useState } from 'react';
import { Button, ButtonGroup, Tooltip } from '@heroui/react';
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
  isLoadingCurrentObject
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
    <div className='flex w-auto min-w-xs flex-col gap-1 bg-background p-2'>
      <ButtonGroup fullWidth>
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
          >
            <IconClipboard className='h-4 w-4' />
          </Button>
          <Tooltip.Content>Copy ID</Tooltip.Content>
        </Tooltip>

        <ShareWithSelf
          currentContext={currentContext}
          onStatusUpdate={showStatus}
          isDisabled={!isDomoPage}
        />
        <ClearCookies onStatusUpdate={showStatus} isDisabled={!isDomoPage} />
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
          >
            <IconSettings className='h-4 w-4' />
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

      <div className='relative min-h-[5rem] w-full'>
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
            isLoading={isLoadingCurrentObject}
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
    </div>
  );
}
