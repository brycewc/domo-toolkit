import { executeInPage } from '@/utils';

export async function fetchGroupDisplayNames(groupIds, tabId = null) {
  return executeInPage(
    async (ids) => {
      const response = await fetch(
        '/api/content/v2/groups/get?includeActive=true&includeUsers=false',
        {
          body: JSON.stringify(ids.map(String)),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        }
      );
      if (!response.ok) return {};
      const groups = await response.json();
      const map = {};
      for (const group of groups) {
        if (group.id != null && group.name) {
          map[group.id] = group.name;
        }
      }
      return map;
    },
    [groupIds],
    tabId
  );
}
