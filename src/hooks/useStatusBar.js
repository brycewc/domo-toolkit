import { useState, useCallback } from 'react';

export function useStatusBar() {
  const [statusBar, setStatusBar] = useState({
    title: '',
    description: '',
    status: 'accent',
    timeout: null,
    visible: false,
    key: Date.now()
  });

  const showStatus = useCallback(
    (title, description, status = 'accent', timeout = 3000) => {
      setStatusBar({
        title,
        description,
        status,
        timeout,
        visible: true,
        key: Date.now()
      });
    },
    []
  );

  const hideStatus = useCallback(() => {
    setStatusBar((prev) => ({ ...prev, visible: false }));
  }, []);

  return { statusBar, showStatus, hideStatus };
}
