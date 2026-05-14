import { toast } from '@heroui/react';
import { useCallback } from 'react';

export function useStatusBar() {
  const showStatus = useCallback((title, description, status = 'accent', timeout) => {
    const resolvedTimeout = timeout ?? defaultTimeoutFor(status);
    toast(title, {
      description: parseDescription(description),
      timeout: resolvedTimeout || 0,
      variant: status
    });
  }, []);

  const showPromiseStatus = useCallback((promise, { error, loading, success }) => {
    const loadingId = toast(parseDescription(loading), {
      isLoading: true,
      timeout: 0
    });

    promise.then(
      (data) => {
        toast.close(loadingId);
        const msg = typeof success === 'function' ? success(data) : success;
        toast.success(parseDescription(msg));
      },
      (err) => {
        toast.close(loadingId);
        const msg = typeof error === 'function' ? error(err) : error;
        toast.danger(parseDescription(msg));
      }
    );

    return loadingId;
  }, []);

  return { showPromiseStatus, showStatus };
}

function defaultTimeoutFor(status) {
  if (status === 'danger') return 7000;
  if (status === 'warning') return 5000;
  return 3000;
}

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
