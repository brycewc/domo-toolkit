import { getObjectType } from '@/models/DomoObjectType';

import { ObjectTypeIcon } from './ObjectTypeIcon';

/**
 * ObjectTypeChip Component
 * The object type chip from the context footer (icon plus lowercase type name) for dense, virtualized lists.
 * It is plain HTML carrying HeroUI's chip classes so it stays cheap to mount in every row, and it exposes
 * the raw type key and its color through `data-key-tooltip` and `data-key-tooltip-color` for a surrounding
 * `KeyTooltipRegion` to show on hover.
 * A type missing from the registry shows its raw key, with no icon and no tooltip.
 * @param {Object} props
 * @param {string} [props.className] - Extra classes for the chip
 * @param {string} [props.color] - HeroUI chip color (default `accent`)
 * @param {string} props.typeId - Object type key, e.g. `DATA_SOURCE`
 */
export function ObjectTypeChip({ className = '', color = 'accent', typeId }) {
  if (!typeId) return null;
  const type = getObjectType(typeId);

  return (
    <span
      className={`chip chip--${color} chip--soft chip--sm w-fit max-w-full min-w-0 ${type ? 'lowercase' : ''} ${className}`}
      data-key-tooltip={type ? typeId : undefined}
      data-key-tooltip-color={type ? color : undefined}
    >
      <ObjectTypeIcon className='shrink-0' typeId={typeId} />
      <span className='min-w-0 truncate'>{type?.name ?? typeId}</span>
    </span>
  );
}
