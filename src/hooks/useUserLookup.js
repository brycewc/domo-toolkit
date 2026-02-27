import { useEffect, useState } from 'react';

import { fetchUserDisplayNames } from '@/services';
import { extractUserIds } from '@/utils';

export function useUserLookup(src, tabId = null) {
  const [userMap, setUserMap] = useState({});

  useEffect(() => {
    if (!src) {
      setUserMap({});
      return;
    }

    const userIds = extractUserIds(src);
    if (userIds.size === 0) {
      setUserMap({});
      return;
    }

    fetchUserDisplayNames(Array.from(userIds), tabId)
      .then((map) => setUserMap(map ?? {}))
      .catch(() => setUserMap({}));
  }, [src, tabId]);

  return userMap;
}
