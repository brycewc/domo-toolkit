import { Alert, Chip, Spinner, Tooltip } from '@heroui/react';
import { IconBoltOff } from '@tabler/icons-react';

export function ContextFooter({ isDomoPage, currentContext, isLoading }) {
  return (
    <Tooltip isDisabled={!isDomoPage} delay={400} closeDelay={0}>
      <Tooltip.Trigger>
        <Alert
          status={isDomoPage ? 'accent' : 'warning'}
          className={
            isDomoPage
              ? 'from-bg-foreground/10 bg-linear-to-r to-accent/10'
              : 'from-bg-foreground/10 bg-linear-to-r to-warning/10'
          }
        >
          <Alert.Content>
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
            <Alert.Description>
              {isDomoPage ? (
                <div className='flex flex-col gap-1'>
                  {isLoading ? (
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
                  )}
                </div>
              ) : (
                'Navigate to an instance to enable most extension features'
              )}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      </Tooltip.Trigger>
      <Tooltip.Content className='max-w-[calc(var(--container-xs)-1.5rem)] text-center text-wrap'>
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
