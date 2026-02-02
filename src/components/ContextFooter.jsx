import { Alert, Chip, Spinner, Popover } from '@heroui/react';
import JsonView from 'react18-json-view';
import 'react18-json-view/src/style.css';
import { useTheme } from '@/hooks';

export function ContextFooter({ currentContext, isLoading }) {
  const isDomoPage = currentContext?.isDomoPage ?? false;
  const theme = useTheme();

  return (
    <Popover isDisabled={!isDomoPage}>
      <Popover.Trigger>
        <Alert
          status={isDomoPage || isLoading ? 'accent' : 'warning'}
          className='p-2'
          // className={
          //   isDomoPage || isLoading
          //     ? 'bg-linear-to-r to-accent/10'
          //     : 'bg-linear-to-r to-warning/10'
          // }
        >
          <Alert.Content>
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
      </Popover.Trigger>
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
