import { useEffect, useState } from 'react';

import { fetchGroupDisplayNames } from '@/services';
import { extractGroupIds } from '@/utils';

export function useGroupLookup(src, tabId = null) {
  const [groupMap, setGroupMap] = useState({});

  useEffect(() => {
    if (!src) {
      setGroupMap({});
      return;
    }

    const groupIds = extractGroupIds(src);
    if (groupIds.size === 0) {
      setGroupMap({});
      return;
    }

    fetchGroupDisplayNames(Array.from(groupIds), tabId)
      .then((map) => setGroupMap(map ?? {}))
      .catch(() => setGroupMap({}));
  }, [src, tabId]);

  return groupMap;
}
