import { Alert, Chip, Spinner, Tooltip } from '@heroui/react';
import { IconBoltOff } from '@tabler/icons-react';

export function ContextFooter({ currentContext, isLoading }) {
  const isDomoPage = currentContext?.isDomoPage ?? false;

  return (
    <Tooltip isDisabled={!isDomoPage} delay={1000} closeDelay={0}>
      <Tooltip.Trigger>
        <Alert
          status={isDomoPage || isLoading ? 'accent' : 'warning'}
          className={
            isDomoPage || isLoading
              ? 'bg-linear-to-r to-accent/10'
              : 'bg-linear-to-r to-warning/10'
          }
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
                      <span className='text-sm text-muted'>
                        No object detected on this page
                      </span>
                    ) : (
                      <>
                        <Chip color='accent' variant='soft' className='w-fit'>
                          {currentContext.domoObject.typeName}
                          {' ('}
                          {currentContext.domoObject.typeId}
                          {')'}
                        </Chip>
                        <span className='text-sm'>
                          ID: {currentContext.domoObject.id}
                        </span>
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
      </Tooltip.Trigger>
      <Tooltip.Content
        placement='bottom'
        className='max-w-[calc(var(--container-xs)-1.5rem)] text-center text-wrap'
      >
        <>
          Unless otherwise noted (with{' '}
          <IconBoltOff className='inline h-4 w-4' />
          ), all buttons take current context into account to make the action
          dynamic
        </>
      </Tooltip.Content>
    </Tooltip>
  );
}
