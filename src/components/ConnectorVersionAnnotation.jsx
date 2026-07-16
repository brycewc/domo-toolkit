import { useState } from 'react';

import { copyToClipboard } from '@/utils/copyToClipboard';
import IconClipboardCopy from '@icons/clipboard-copy.svg?react';

import { AnimatedCheck } from './AnimatedCheck';
export function ConnectorVersionAnnotation({ latestVersion, value }) {
  const [copied, setCopied] = useState(false);
  const isString = typeof value === 'string';

  const handleCopy = (event) => {
    event.stopPropagation();
    copyToClipboard(String(value)).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <>
      <span className={isString ? 'json-view--string' : 'json-view--number'}>{isString ? `"${value}"` : String(value)}</span>
      {copied ? (
        <AnimatedCheck className='json-view--copy text-success' size={16} style={{ display: 'inline-block' }} />
      ) : (
        <IconClipboardCopy className='json-view--copy' size={16} onClick={handleCopy} />
      )}
      <span className='json-view--annotation'>latest: {latestVersion}</span>
    </>
  );
}
