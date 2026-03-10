import { toast } from '@heroui/react';
import { useEffect } from 'react';

import { releases } from '@/data';

export function useReleaseNotification() {
  useEffect(() => {
    const currentVersion = chrome.runtime.getManifest().version;

    chrome.storage.local.get(['lastSeenVersion'], (result) => {
      if (result.lastSeenVersion === currentVersion) return;

      const latestRelease = releases.find(
        (r) => r.version === currentVersion
      );
      const summary =
        latestRelease?.summary || 'Check out the latest changes.';

      let toastKey;

      const clearBadge = () => {
        chrome.runtime
          .sendMessage({ type: 'RELEASE_NOTES_SEEN' })
          .catch(() => {});
      };

      toastKey = toast.info(`Updated to v${currentVersion}`, {
        actionProps: {
          children: 'View',
          onPress: () => {
            chrome.tabs.create({
              url: chrome.runtime.getURL(
                'src/options/index.html#release-notes'
              )
            });
            toast.close(toastKey);
          },
          size: 'sm',
          variant: 'secondary'
        },
        description: summary,
        onClose: clearBadge,
        timeout: 0
      });
    });
  }, []);
}
