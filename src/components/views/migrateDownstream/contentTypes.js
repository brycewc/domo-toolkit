import { DomoObject } from '@/models/DomoObject';

// Sentinel for the "drop column" remap choice: remove the column's references
// from the content that uses it (badge_table cards/drills, alert rules, and the
// output of a dataset view that only selects it) instead of mapping it to a
// target column.
export const DROP = '__drop__';

export const TYPE_KEY_TO_DOMO_TYPE = {
  alerts: 'ALERT',
  apps: 'RYUU_APP',
  beastModes: 'BEAST_MODE_FORMULA',
  cards: 'CARD',
  dataflows: 'DATAFLOW_TYPE',
  datasets: 'DATA_SOURCE',
  jupyterWorkspaces: 'DATA_SCIENCE_NOTEBOOK'
};

export const UNMAPPED = '__unmapped__';

export function buildObjectUrl(typeKey, item, origin) {
  const domoTypeId = TYPE_KEY_TO_DOMO_TYPE[typeKey];
  if (!domoTypeId || !origin) return null;
  try {
    // Apps link to their asset-library overview, keyed by the design id, not the
    // card id every other field of the row is keyed by.
    const objectId = typeKey === 'apps' ? item.designId : item.id;
    if (!objectId) return null;
    return new DomoObject(domoTypeId, objectId, origin, { name: item.name }).url;
  } catch {
    return null;
  }
}
