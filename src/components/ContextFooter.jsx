import { Alert, Chip, Spinner, Tooltip } from '@heroui/react';
import { IconBoltOff } from '@tabler/icons-react';

export function ContextFooter({
  isDomoPage,
  currentInstance,
  currentObject,
  isLoading
}) {
  return (
    <Tooltip isDisabled={!isDomoPage} delay={500} closeDelay={0}>
      <Tooltip.Trigger>
        <Alert
          status={isDomoPage ? 'accent' : 'warning'}
          className={
            isDomoPage
              ? 'from-bg-foreground/10 bg-linear-to-r to-accent/10'
              : 'from-bg-foreground/10 bg-linear-to-r to-warning/10'
          }
        >
          <Alert.Indicator />
          <Alert.Content className='w-full'>
            <Alert.Title>
              {isDomoPage ? (
                <>
                  Current Context:{' '}
                  <span className='underline'>{currentInstance}.domo.com</span>
                </>
              ) : (
                'Not a Domo Instance'
              )}
            </Alert.Title>
            <Alert.Description>
              {isDomoPage ? (
                <div className='w-full'>
                  {isLoading ||
                  !currentInstance ||
                  !currentObject?.objectType ||
                  !currentObject?.id ? (
                    <Spinner size='sm' color='accent' />
                  ) : (
                    <Chip color='accent' variant='primary'>
                      {currentObject.typeName} (ID: {currentObject.id})
                    </Chip>
                  )}
                </div>
              ) : (
                'Navigate to an instance to enable most extension features'
              )}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      </Tooltip.Trigger>
      <Tooltip.Content showArrow>
        <Tooltip.Arrow />
        <p className='max-w-s text-center'>
          Unless otherwise noted (with{' '}
          <IconBoltOff className='inline h-4 w-4' />
          ), all buttons take current context into account to make the action
          dynamic
        </p>
      </Tooltip.Content>
    </Tooltip>
  );
}
