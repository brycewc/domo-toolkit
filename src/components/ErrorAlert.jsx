import { Button, Tooltip } from '@heroui/react';
import { useCallback, useState } from 'react';
import JsonView from 'react18-json-view';

import { AnimatedCheck } from '@/components/AnimatedCheck';
import { copyJsonNode, copyToClipboard } from '@/utils/copyToClipboard';
import IconClipboardCopy from '@icons/clipboard-copy.svg?react';
import IconExclamationTriangle from '@icons/exclamation-triangle.svg?react';
import IconX from '@icons/x.svg?react';
import '@/assets/json-view-theme.css';

/**
 * Dismissable alert for a result-list group, shared by the Objects Owned,
 * Migrate Content, and Remap Columns views. The title shares one line with the
 * warning icon and the copy/dismiss controls; the structured detail renders
 * full-width beneath them as collapsible JSON (or plain text when the detail
 * isn't an object), each scrolling inside its own box so a long message or a
 * wide JSON tree never pushes the panel sideways.
 *
 * `status` is 'danger' for a failure and 'warning' for an outcome the user
 * should see but that isn't a failure, such as items deliberately skipped.
 *
 * Dismissal is owned by the parent (so it can re-surface the alert when a fresh
 * error arrives); this component only reports the press via `onDismiss`.
 */
export function ErrorAlert({ detail = null, onDismiss, status = 'danger', title }) {
  const isWarning = status === 'warning';
  const noun = isWarning ? 'details' : 'error details';
  const [copied, setCopied] = useState(false);

  const hasJsonDetail = detail != null && typeof detail === 'object';
  const hasTextDetail = detail != null && typeof detail !== 'object';

  // Copy the complete failure payload: pretty JSON when structured, the raw
  // string otherwise, falling back to the title when there's no detail at all.
  const handleCopy = useCallback(async () => {
    const payload = hasJsonDetail ? JSON.stringify(detail, null, 2) : String(detail ?? title ?? '');
    try {
      await copyToClipboard(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    } catch {
      // Clipboard can reject (permissions/focus); nothing actionable here.
    }
  }, [detail, hasJsonDetail, title]);

  return (
    <div className='flex w-full min-w-0 flex-col gap-2 rounded-lg border border-border p-2'>
      <div className='flex items-center gap-2'>
        <IconExclamationTriangle className={`size-4 shrink-0 ${isWarning ? 'text-warning' : 'text-danger'}`} />
        <span className='min-w-0 flex-1 text-xs font-medium wrap-break-word'>{title}</span>
        <div className='flex shrink-0 items-center gap-1'>
          <Tooltip>
            <Button isIconOnly aria-label={`Copy ${noun}`} size='sm' variant='ghost' onPress={handleCopy}>
              {copied ? <AnimatedCheck /> : <IconClipboardCopy />}
            </Button>
            <Tooltip.Content>{copied ? 'Copied!' : `Copy ${noun}`}</Tooltip.Content>
          </Tooltip>
          <Tooltip>
            <Button
              isIconOnly
              aria-label={isWarning ? 'Dismiss' : 'Dismiss error'}
              size='sm'
              variant='ghost'
              onPress={onDismiss}
            >
              <IconX />
            </Button>
            <Tooltip.Content>Dismiss</Tooltip.Content>
          </Tooltip>
        </div>
      </div>
      {hasJsonDetail && (
        <div className='max-h-60 w-full min-w-0 overflow-auto rounded-md bg-surface-secondary p-2'>
          <JsonView
            displaySize
            className='text-xs'
            collapsed={2}
            collapseStringMode='word'
            collapseStringsAfterLength={80}
            customizeCopy={copyJsonNode}
            matchesURL={false}
            src={detail}
            CopiedComponent={({ className, style }) => (
              <AnimatedCheck className={className + ' text-success'} size={16} style={style} />
            )}
            CopyComponent={({ className, onClick, style }) => (
              <IconClipboardCopy className={className} size={16} style={style} onClick={onClick} />
            )}
          />
        </div>
      )}
      {hasTextDetail && (
        <pre className='max-h-60 w-full min-w-0 overflow-auto rounded-md bg-surface-secondary p-2 text-xs wrap-break-word whitespace-pre-wrap'>
          {String(detail)}
        </pre>
      )}
    </div>
  );
}
