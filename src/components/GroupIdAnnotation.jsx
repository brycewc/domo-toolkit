import { IconClipboard } from '@tabler/icons-react';
import { useState } from 'react';

import { AnimatedCheck } from '@/components';

export function GroupIdAnnotation({ displayName, value }) {
  const [copied, setCopied] = useState(false);
  const isString = typeof value === 'string';

  const handleCopy = (event) => {
    event.stopPropagation();
    navigator.clipboard.writeText(String(value));
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <>
      <span className={isString ? 'json-view--string' : 'json-view--number'}>
        {isString ? `"${value}"` : String(value)}
      </span>
      {copied ? (
        <AnimatedCheck
          className='json-view--copy text-success'
          size={16}
          stroke={1.5}
          style={{ display: 'inline-block' }}
        />
      ) : (
        <IconClipboard
          className='json-view--copy'
          size={16}
          stroke={1.5}
          onClick={handleCopy}
        />
      )}
      <span className='json-view--annotation'>{displayName} (group)</span>
    </>
  );
}
