import { useState } from 'react';
import { Alert, Button, Chip, Spinner, Popover, Tooltip } from '@heroui/react';
import { IconClipboard } from '@tabler/icons-react';
import { AnimatedCheck } from './AnimatedCheck';
import JsonView from 'react18-json-view';
import '@/assets/json-view-theme.css';
import { JsonStringifyOrder } from '@/utils';

export function ContextFooter({ currentContext, isLoading, onStatusUpdate }) {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = () => {
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
    try {
      const contextJson = JsonStringifyOrder(currentContext, 2);
      navigator.clipboard.writeText(contextJson);
      onStatusUpdate?.(
        'Success',
        `Copied Context JSON to clipboard`,
        'success',
        2000
      );
    } catch (error) {
      onStatusUpdate?.(
        'Error',
        `Failed to copy context JSON: ${error.message}`,
        'danger',
        3000
      );
    }
  };

  const alertContent = (
    <Alert
      status={currentContext?.isDomoPage || isLoading ? 'accent' : 'warning'}
      className='w-full p-2'
    >
      <Alert.Content
        className={`flex flex-col ${isLoading ? 'items-center' : 'items-start'}`}
      >
        {isLoading ? (
          <Spinner size='sm' color='accent' />
        ) : (
          <>
            <Alert.Title>
              {currentContext?.isDomoPage ? (
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
            <div className='flex flex-wrap items-center gap-x-1 text-sm'>
              {currentContext?.isDomoPage ? (
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
            </div>
          </>
        )}
      </Alert.Content>
    </Alert>
  );

  // Only wrap with Popover when on a Domo page with an object
  if (
    !currentContext?.isDomoPage ||
    isLoading ||
    !currentContext?.domoObject?.id
  ) {
    return alertContent;
  }

  return (
    <Popover className='flex w-full items-start justify-start'>
      <Popover.Trigger className='w-full'>{alertContent}</Popover.Trigger>
      <Popover.Content
        placement='bottom'
        className='flex h-[90%] w-[90%] flex-col gap-2 overflow-y-auto p-2'
      >
        <div className='flex flex-row items-center justify-start'>
          <Chip color='accent' variant='soft' className='w-fit'>
            {currentContext?.domoObject?.typeId}
          </Chip>
          <Tooltip delay={400} closeDelay={0}>
            <Button variant='ghost' size='sm' isIconOnly onPress={handleCopy}>
              {isCopied ? (
                <AnimatedCheck stroke={1.5} />
              ) : (
                <IconClipboard stroke={1.5} />
              )}
            </Button>
            <Tooltip.Content>
              Copy current context JSON to clipboard
            </Tooltip.Content>
          </Tooltip>
        </div>
        <JsonView
          src={currentContext?.domoObject?.metadata}
          collapsed={1}
          matchesURL
          displaySize
          collapseStringMode='word'
          enableClipboard={false}
        />
      </Popover.Content>
    </Popover>
  );
}
