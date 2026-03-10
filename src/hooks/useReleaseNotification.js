import { toast } from '@heroui/react';
import { useEffect } from 'react';

import { releases } from '@/data';

export function showReleaseToast() {
  const currentVersion = chrome.runtime.getManifest().version;
  const latestRelease = releases.find((r) => r.version === currentVersion);
  const summary = latestRelease?.summary || 'Check out the latest changes.';

  let toastKey;

  const clearBadge = () => {
    chrome.runtime
      .sendMessage({ type: 'RELEASE_NOTES_SEEN' })
      .catch(() => {});
  };

  toastKey = toast.info(`New Version ${currentVersion}`, {
    actionProps: {
      children: 'View Details',
      onPress: () => {
        chrome.tabs.create({
          url: chrome.runtime.getURL('src/options/index.html#release-notes')
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
}

export function useReleaseNotification() {
  useEffect(() => {
    const currentVersion = chrome.runtime.getManifest().version;

    chrome.storage.local.get(['lastSeenVersion'], (result) => {
      if (result.lastSeenVersion === currentVersion) return;
      showReleaseToast();
    });
  }, []);
}
