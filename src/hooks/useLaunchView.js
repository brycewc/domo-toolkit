import { useCallback, useState } from 'react';

import { launchView } from '@/utils';

/**
 * Wraps `launchView` with pending state for button feedback.
 * @returns {{ isPending: boolean, launch: (options: Object) => Promise<void> }}
 */
export function useLaunchView() {
  const [isPending, setIsPending] = useState(false);

  const launch = useCallback(async (options) => {
    setIsPending(true);
    try {
      await launchView(options);
    } finally {
      setIsPending(false);
    }
  }, []);

  return { isPending, launch };
}
