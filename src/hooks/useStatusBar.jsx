import { toast } from '@heroui/react';
import { useCallback } from 'react';

import { parseMarkdownBold } from '@/utils/markdown';

export function useStatusBar() {
  const showStatus = useCallback((title, description, status = 'accent', timeout, { actionProps, onClose } = {}) => {
    const resolvedTimeout = timeout ?? defaultTimeoutFor(status);
    return toast(title, {
      actionProps,
      description: parseMarkdownBold(description),
      onClose,
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
        showResolved(toast.success, typeof success === 'function' ? success(data) : success);
      },
      (err) => {
        toast.close(loadingId);
        showResolved(toast.danger, typeof error === 'function' ? error(err) : error);
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

function showResolved(show, message) {
  if (message && typeof message === 'object') {
    show(parseMarkdownBold(message.title), { description: parseMarkdownBold(message.description) });
    return;
  }
  show(parseMarkdownBold(message));
}
