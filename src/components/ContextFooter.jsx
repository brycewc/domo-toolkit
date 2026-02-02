import { Alert, Button, Chip, Spinner, Popover } from '@heroui/react';
import JsonView from 'react18-json-view';
import 'react18-json-view/src/style.css';
import { useTheme } from '@/hooks';

export function ContextFooter({ currentContext, isLoading }) {
  const isDomoPage = currentContext?.isDomoPage ?? false;
  const theme = useTheme();

  const alertContent = (
    <Alert
      status={isDomoPage || isLoading ? 'accent' : 'warning'}
      className='p-2'
    >
      <Alert.Content
        className={`flex flex-col ${isLoading ? 'items-center' : 'items-start'}`}
      >
        {isLoading ? (
          <Spinner size='sm' color='accent' />
        ) : (
          <>
            <Alert.Title>
              {isDomoPage ? (
                <>
                  Current Context:{' '}
                  <span className='underline'>
                    {currentContext?.instance}.domo.com
                  </span>
                </>
              ) : (
                'Not a Domo Instance'
              )}
            </Alert.Title>
            <Alert.Description className='flex flex-wrap items-center gap-x-1'>
              {isDomoPage ? (
                isLoading ? (
                  <Spinner size='sm' color='accent' />
                ) : !currentContext?.instance ||
                  !currentContext?.domoObject?.id ? (
                  'No object detected on this page'
                ) : (
                  <>
                    <Chip
                      color='accent'
                      variant='soft'
                      className='w-fit'
                      size='sm'
                    >
                      {currentContext.domoObject.typeName}
                    </Chip>
                    ID: {currentContext.domoObject.id}
                  </>
                )
              ) : (
                'Navigate to an instance to enable most extension features'
              )}
            </Alert.Description>
          </>
        )}
      </Alert.Content>
    </Alert>
  );

  // Only wrap with Popover when on a Domo page
  if (!isDomoPage) {
    return alertContent;
  }

  return (
    <Popover>
      <Popover.Trigger>{alertContent}</Popover.Trigger>
      <Popover.Content
        placement='bottom left'
        className='flex w-[95%] flex-col gap-2 overflow-y-auto p-2'
      >
        <Chip color='accent' variant='soft' className='w-fit'>
          {currentContext?.domoObject?.typeId}
        </Chip>
        <JsonView
          src={currentContext?.domoObject?.metadata?.details}
          collapsed={1}
          theme='vscode'
          dark={theme === 'dark'}
          matchesURL
          displaySize
          collapseStringMode='word'
          enableClipboard={false}
        />
      </Popover.Content>
    </Popover>
  );
}
