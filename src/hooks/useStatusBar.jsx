import { toast } from '@heroui/react';
import { useCallback } from 'react';

import { parseMarkdownBold } from '@/utils/markdown';

export function useStatusBar() {
  const showStatus = useCallback((title, description, status = 'accent', timeout) => {
    const resolvedTimeout = timeout ?? defaultTimeoutFor(status);
    toast(title, {
      description: parseMarkdownBold(description),
      timeout: resolvedTimeout || 0,
      variant: status
    });
  }, []);

  const showPromiseStatus = useCallback((promise, { error, loading, success }) => {
    const loadingId = toast(parseMarkdownBold(loading), {
      isLoading: true,
      timeout: 0
    });

    promise.then(
      (data) => {
        toast.close(loadingId);
        const msg = typeof success === 'function' ? success(data) : success;
        toast.success(parseMarkdownBold(msg));
      },
      (err) => {
        toast.close(loadingId);
        const msg = typeof error === 'function' ? error(err) : error;
        toast.danger(parseMarkdownBold(msg));
      }
    );

    return loadingId;
  }, []);

  return { showPromiseStatus, showStatus };
}

function defaultTimeoutFor(status) {
  if (status === 'danger') return 10000;
  if (status === 'warning') return 8000;
  return 3000;
}
