import { Button, Description, Modal, Tooltip } from '@heroui/react';
import { useMemo } from 'react';

import { DataList } from '@/components/views/DataList';
import { DataListItem } from '@/models/DataListItem';
import { DomoObject } from '@/models/DomoObject';
import { getObjectType } from '@/models/DomoObjectType';
import IconInfoCircle from '@icons/info-circle.svg?react';
import IconX from '@icons/x.svg?react';

// Canonical downstream content types, in the order their groups render. Matches
// MIGRATE_TYPES / REMAP_TYPES; kept local so this modal stays standalone.
const USAGE_TYPES = [{ key: 'alerts' }, { key: 'beastModes' }, { key: 'cards' }, { key: 'dataflows' }, { key: 'datasets' }];

const TYPE_KEY_TO_DOMO_TYPE = {
  alerts: 'ALERT',
  beastModes: 'BEAST_MODE_FORMULA',
  cards: 'CARD',
  dataflows: 'DATAFLOW_TYPE',
  datasets: 'DATA_SOURCE'
};

// Info-icon modal listing every piece of content that references a column,
// grouped by type via a read-only DataList. Cards nest their drills (with the
// drill icon); a card shown only because a drill under it uses the column is
// marked muted with an explanatory legend at the top. The info icon itself is
// the modal trigger (React Aria wires onPress through the Modal's DialogTrigger).
// `items` are the column's usages ({ id, name, type }); `cardsById` resolves a
// drill's parent and metadata. `total`/`totalLabel` form the "referenced by N of
// M" denominator (e.g. "selected item", "downstream item").
export function ColumnUsagesModal({ cardsById, columnName, items, origin, total, totalLabel = 'selected item' }) {
  const {
    expandedIds,
    hasIndirectCards,
    items: usageItems
  } = useMemo(() => buildColumnUsageTree(items, cardsById, origin), [cardsById, items, origin]);
  return (
    <Modal>
      <Tooltip delay={300}>
        <Button
          isIconOnly
          aria-label={`Show where ${columnName} is used`}
          className='size-4 min-h-0 p-0 text-muted hover:text-foreground'
          size='sm'
          variant='ghost'
        >
          <IconInfoCircle className='size-3.5' />
        </Button>
        <Tooltip.Content className='max-w-60'>Click to view what objects reference this column</Tooltip.Content>
      </Tooltip>
      <Modal.Backdrop>
        <Modal.Container className='p-1' placement='center' scroll='outside'>
          <Modal.Dialog className='p-2 pt-3'>
            <Modal.CloseTrigger className='absolute top-2 right-2' variant='ghost'>
              <IconX />
            </Modal.CloseTrigger>
            <Modal.Header>
              <Modal.Heading className='flex flex-col gap-1 truncate pr-6'>
                <span className='font-mono'>{columnName}</span>
                <Description>
                  Referenced by {items.length} of {total} {totalLabel}
                  {total === 1 ? '' : 's'}.
                </Description>
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className='max-h-[60vh] overflow-y-auto text-foreground'>
              {hasIndirectCards && (
                <p className='mb-2 text-xs text-muted'>
                  <span className='mr-1 inline-flex align-text-bottom text-accent'>
                    <IconInfoCircle className='size-3.5 shrink-0' />
                  </span>
                  This card doesn't use the column directly; one of its drill views does.
                </p>
              )}
              <DataList
                allowsMultipleExpanded
                defaultExpandedIds={expandedIds}
                items={usageItems}
                showActions={false}
                variant='transparent'
              />
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

// Groups card-type column usages so drills nest under their parent card. Uses
// the full card map to resolve each drill's parent and to name a parent that
// only appears because a drill under it uses the column (`usesColumn: false`).
// `orphanDrills` holds drills with no known parent (shouldn't happen) so none
// are dropped.
function buildCardUsageGroups(cardItems, cardsById) {
  const groups = new Map();
  for (const it of cardItems) {
    if (cardsById?.get(String(it.id))?.isDrill) continue;
    groups.set(String(it.id), { drills: [], id: it.id, name: it.name, usesColumn: true });
  }
  const orphanDrills = [];
  for (const it of cardItems) {
    const meta = cardsById?.get(String(it.id));
    if (!meta?.isDrill) continue;
    if (meta.parentId == null) {
      orphanDrills.push(it);
      continue;
    }
    const key = String(meta.parentId);
    if (!groups.has(key)) {
      // Prefer a parent that's in the list; otherwise use the name the drill
      // carries (the parent isn't migrating, so it isn't in cardsById).
      const parent = cardsById?.get(key);
      groups.set(key, {
        drills: [],
        id: meta.parentId,
        name: parent?.name || meta.parentName || `Card ${meta.parentId}`,
        usesColumn: false
      });
    }
    groups.get(key).drills.push(it);
  }
  const byName = (a, b) => (a.name || '').localeCompare(b.name || '');
  return {
    groups: [...groups.values()].map((g) => ({ ...g, drills: [...g.drills].sort(byName) })).sort(byName),
    orphanDrills: orphanDrills.sort(byName)
  };
}

// Builds the DataList tree for the column-usages modal: a virtual-parent group
// per content type, with card-type usages nested (drills under their parent
// card). A card present only because a drill under it uses the column carries a
// muted/legend marker (and stays a non-link); `hasIndirectCards` flags whether
// any exist so the modal can show the matching legend. Also returns the ids to
// expand by default so the modal shows every usage at once.
function buildColumnUsageTree(items, cardsById, origin) {
  const expandedIds = [];
  let hasIndirectCards = false;
  const drillItem = (d, parentId) =>
    new DataListItem({
      id: `cards:${d.id}`,
      label: d.name,
      originalId: d.id,
      typeId: 'DRILL_VIEW',
      url: buildDrillViewUrl({ id: d.id, name: d.name, parentId }, origin)
    });
  const treeItems = USAGE_TYPES.map((t) => {
    const typeItems = items.filter((it) => it.type === t.key);
    if (typeItems.length === 0) return null;
    let children;
    let count = typeItems.length;
    let countLabel = null;
    if (t.key === 'cards') {
      const { groups, orphanDrills } = buildCardUsageGroups(typeItems, cardsById);
      // Call out drills separately in the group count, matching the main list:
      // "{parent-card usages} + {drill usages} drills".
      const drillUsages = typeItems.filter((it) => cardsById?.get(String(it.id))?.isDrill).length;
      count = typeItems.length - drillUsages;
      if (drillUsages > 0) countLabel = `+ ${drillUsages} drill${drillUsages === 1 ? '' : 's'}`;
      children = groups.map((g) => {
        const drills = g.drills.map((d) => drillItem(d, g.id));
        if (drills.length > 0) expandedIds.push(`cards:${g.id}`);
        // A card that doesn't itself reference the column (it's here only
        // because a drill under it does) gets the muted marker and stays a
        // non-link, so it reads as a container rather than a direct match.
        if (!g.usesColumn) hasIndirectCards = true;
        return new DataListItem({
          annotation: g.usesColumn ? null : "This card doesn't use the column directly; one of its drill views does.",
          children: drills.length > 0 ? drills : undefined,
          id: `cards:${g.id}`,
          label: g.name,
          muted: !g.usesColumn,
          originalId: g.id,
          typeId: TYPE_KEY_TO_DOMO_TYPE.cards,
          url: g.usesColumn ? buildObjectUrl('cards', { id: g.id, name: g.name }, origin) : null
        });
      });
      for (const d of orphanDrills) children.push(drillItem(d, cardsById?.get(String(d.id))?.parentId));
    } else {
      children = typeItems.map(
        (it) =>
          new DataListItem({
            id: `${t.key}:${it.id}`,
            label: it.name,
            originalId: it.id,
            typeId: TYPE_KEY_TO_DOMO_TYPE[t.key],
            url: buildObjectUrl(t.key, it, origin)
          })
      );
    }
    expandedIds.push(t.key);
    return new DataListItem({
      children,
      count,
      countLabel,
      id: t.key,
      isVirtualParent: true,
      label: typeGroupLabel(t.key),
      typeId: TYPE_KEY_TO_DOMO_TYPE[t.key]
    });
  }).filter(Boolean);
  return { expandedIds, hasIndirectCards, items: treeItems };
}

// Drill cards open in the analyzer alongside their parent card, so the URL needs
// the parent card id the drill carries. Built as a DRILL_VIEW object so the path
// stays defined by the type registry.
function buildDrillViewUrl(item, origin) {
  if (!origin || item.parentId == null) return null;
  try {
    return new DomoObject('DRILL_VIEW', item.id, origin, { name: item.name }, null, item.parentId).url;
  } catch {
    return null;
  }
}

// Best-effort Domo object URL for a usage item. Returns null when the
// type/origin is unknown or the URL can't be built.
function buildObjectUrl(typeKey, item, origin) {
  const domoTypeId = TYPE_KEY_TO_DOMO_TYPE[typeKey];
  if (!domoTypeId || !origin) return null;
  try {
    return new DomoObject(domoTypeId, item.id, origin, { name: item.name }).url;
  } catch {
    return null;
  }
}

// Plural group label for a usage type, taken from the object type model so the
// casing matches everywhere it's shown. None of these types pluralize
// irregularly, so a trailing "s" is enough.
function typeGroupLabel(typeKey) {
  const name = getObjectType(TYPE_KEY_TO_DOMO_TYPE[typeKey])?.name || typeKey;
  return `${name}s`;
}
