import { useCallback } from 'react';
import { toast } from '@heroui/react';

function parseDescription(text) {
  if (!text) return text;

  const parts = [];
  let lastIndex = 0;
  const regex = /\*\*(.+?)\*\*/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    parts.push(<strong key={match.index}>{match[1]}</strong>);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

export function useStatusBar() {
  const showStatus = useCallback(
    (title, description, status = 'accent', timeout = 3000) => {
      const method =
        status === 'success'
          ? toast.success
          : status === 'warning'
            ? toast.warning
            : status === 'danger'
              ? toast.danger
              : toast;

      method(title, {
        description: parseDescription(description),
        timeout: timeout || 0
      });
    },
    []
  );

  const showPromiseStatus = useCallback(
    (promise, { loading, success, error }) => {
      return toast.promise(promise, {
        loading,
        success: (data) => {
          const msg = typeof success === 'function' ? success(data) : success;
          return parseDescription(msg);
        },
        error: (err) => {
          const msg = typeof error === 'function' ? error(err) : error;
          return parseDescription(msg);
        }
      });
    },
    []
  );

  return { showStatus, showPromiseStatus };
}
