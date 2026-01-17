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
  currentObject,
  currentInstance,
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
            isDisabled={!isDomoPage || !currentObject?.id}
            onPress={() => {
              navigator.clipboard.writeText(currentObject?.id);
              showStatus(
                `Copied ${currentObject?.typeName} ID ${currentObject?.id} to clipboard`,
                '',
                'success',
                1500
              );
              // Trigger detection in NavigateToCopiedObject
              navigateToCopiedRef.current?.triggerDetection(currentObject?.id);
            }}
            isIconOnly
          >
            <IconClipboard className='h-4 w-4' />
          </Button>
          <Tooltip.Content>Copy ID</Tooltip.Content>
        </Tooltip>

        <ShareWithSelf
          currentObject={currentObject}
          onStatusUpdate={showStatus}
          isDisabled={!isDomoPage}
        />
        <ClearCookies onStatusUpdate={showStatus} isDisabled={!isDomoPage} />
        <DeleteCurrentObject
          currentObject={currentObject}
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
      {/* <ActivityLogCurrentObject
        currentObject={currentObject}
        onStatusUpdate={showStatus}
      /> */}
      <FilterActivityLog
        currentObject={currentObject}
        // isDisabled={!isDomoPage}
      />
      <NavigateToCopiedObject
        ref={navigateToCopiedRef}
        isDomoPage={isDomoPage}
        currentInstance={currentInstance}
      />
      {(currentObject?.typeId === 'PAGE' ||
        currentObject?.typeId === 'DATA_APP_VIEW') && (
        <GetPages
          currentObject={currentObject}
          currentInstance={currentInstance}
          onStatusUpdate={showStatus}
          isDisabled={!isDomoPage}
        />
      )}
      {currentObject?.typeId === 'DATAFLOW_TYPE' && (
        <UpdateDataflowDetails
          onStatusUpdate={showStatus}
          currentObject={currentObject}
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
            currentInstance={currentInstance}
            currentObject={currentObject}
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
