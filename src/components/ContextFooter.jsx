import { useState } from 'react';
import {
  Alert,
  Button,
  Chip,
  Spinner,
  Popover,
  Tooltip,
  Link,
  ButtonGroup
} from '@heroui/react';
import { IconClipboard, IconEye, IconEyeOff } from '@tabler/icons-react';
import { AnimatedCheck } from './AnimatedCheck';
import JsonView from 'react18-json-view';
import '@/assets/json-view-theme.css';
import { JsonStringifyOrder } from '@/utils';
import { s } from 'motion/react-client';

export function ContextFooter({ currentContext, isLoading, onStatusUpdate }) {
  const [isCopied, setIsCopied] = useState(false);
  const [fullContextVisible, setFullContextVisible] = useState(false);

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

  const handleContextEye = () => {
    setFullContextVisible(!fullContextVisible);
  };

  const alertContent = (
    <Alert
      status={currentContext?.isDomoPage || isLoading ? 'accent' : 'warning'}
      className='min-h-20 w-full p-2'
    >
      <Alert.Content
        className={`flex flex-col ${isLoading ? 'items-center' : 'items-start'}`}
      >
        {isLoading ? (
          <Spinner size='sm' color='accent' />
        ) : (
          <>
            <Alert.Title className='flex w-full items-center justify-between gap-1'>
              {currentContext?.isDomoPage ? (
                <span>
                  Current Context:{' '}
                  <span className='underline'>
                    {currentContext?.instance}.domo.com
                  </span>
                </span>
              ) : (
                'Not a Domo Instance'
              )}
              <Alert.Indicator />
            </Alert.Title>
            <Alert.Description className='flex flex-wrap items-center gap-x-1'>
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
            </Alert.Description>
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
    <Popover
      className='flex w-full items-start justify-start'
      onOpenChange={() => {
        setTimeout(() => {
          setFullContextVisible(false);
        }, 100);
      }}
    >
      <Popover.Trigger className='w-full'>{alertContent}</Popover.Trigger>
      <Popover.Content
        placement='bottom'
        className='flex h-[90%] w-[92%] flex-col justify-start gap-1 p-1'
      >
        <div className='flex flex-row items-center justify-between'>
          <Chip color='accent' variant='soft' className='w-fit'>
            {currentContext?.domoObject?.typeId}
          </Chip>
          {process.env.NODE_ENV === 'development' && (
            <ButtonGroup>
              <Tooltip delay={400} closeDelay={0}>
                <Button
                  variant='ghost'
                  size='sm'
                  isIconOnly
                  fullWidth
                  onPress={handleContextEye}
                >
                  {fullContextVisible ? (
                    <IconEye stroke={1.5} />
                  ) : (
                    <IconEyeOff stroke={1.5} />
                  )}
                </Button>
                <Tooltip.Content>
                  Toggle full current context JSON
                </Tooltip.Content>
              </Tooltip>
              <Tooltip delay={400} closeDelay={0}>
                <Button
                  variant='ghost'
                  size='sm'
                  isIconOnly
                  onPress={handleCopy}
                  fullWidth
                >
                  {isCopied ? (
                    <AnimatedCheck stroke={1.5} />
                  ) : (
                    <IconClipboard stroke={1.5} />
                  )}
                </Button>
                <Tooltip.Content>
                  Copy full current context JSON to clipboard
                </Tooltip.Content>
              </Tooltip>
            </ButtonGroup>
          )}
        </div>
        <JsonView
          className='overflow-auto'
          src={
            fullContextVisible
              ? currentContext
              : currentContext?.domoObject?.metadata
          }
          collapsed={1}
          matchesURL={false}
          displaySize
          collapseStringMode='word'
          collapseStringsAfterLength={50}
          CopyComponent={({ onClick, className, style }) => (
            <IconClipboard
              onClick={onClick}
              className={className}
              style={style}
              size={16}
              stroke={1.5}
            />
          )}
          CopiedComponent={({ className, style }) => (
            <AnimatedCheck
              className={className}
              style={style}
              size={16}
              stroke={1.5}
            />
          )}
          customizeNode={(params) => {
            if (
              typeof params.node === 'string' &&
              params.node.startsWith('https://')
            ) {
              return (
                <Link
                  href={params.node}
                  target='_blank'
                  className='text-(--json-boolean) no-underline decoration-(--json-boolean) hover:underline'
                >
                  {params.node}
                </Link>
              );
            }
            if (params.indexOrName?.toLowerCase().includes('id')) {
              return { enableClipboard: true };
            } else if (
              (typeof params.node === 'number' ||
                typeof params.node === 'string') &&
              params.node?.toString().length >= 7
            ) {
              return { enableClipboard: true };
            } else {
              return { enableClipboard: false };
            }
          }}
        />
      </Popover.Content>
    </Popover>
  );
}
