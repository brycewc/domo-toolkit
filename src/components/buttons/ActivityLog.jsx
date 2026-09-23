import { Button, Description, Dropdown, Label, Tooltip } from '@heroui/react';
import { useState } from 'react';

import { DisabledTooltip } from '@/components/DisabledTooltip';
import { ObjectTypeIcon } from '@/components/ObjectTypeIcon';
import { useLongPress } from '@/hooks/useLongPress';
import { getObjectType } from '@/models/DomoObjectType';
import { getCardsForObject, getOwnedCards } from '@/services/cards';
import { getPagesForCards, getSubpageIds } from '@/services/pages';
import {
  COMBINED_PARENT_LOG_TYPES,
  getActivityLogParent,
  getActivityLogTarget,
  launchActivityLog,
  PARENT_ONLY_LOG_TYPES
} from '@/utils/activityLog';
import { isDatasetTypeId } from '@/utils/datasetTypes';
import { waitForChildPages } from '@/utils/pageHelpers';
import IconChartBarBox from '@icons/chart-bar-box.svg?react';
import IconListSearch from '@icons/list-search.svg?react';
import IconPagesBars from '@icons/pages-bars.svg?react';
import IconTree from '@icons/tree.svg?react';

export function ActivityLog({ currentContext, onStatusUpdate }) {
  const [isLoading, setIsLoading] = useState(false);
  const { LongPressOverlay, pressProps } = useLongPress();

  const userRights = currentContext?.user?.metadata?.USER_RIGHTS || [];
  const isDisabled = !currentContext?.domoObject?.id || isLoading || !userRights.includes('audit');
  // Persistent reasons the action is unavailable (loading is transient and
  // handled by the button's pending state, so it is intentionally excluded).
  const disabledReason = !currentContext?.domoObject?.id
    ? 'Navigate to a Domo object to view its activity log'
    : !userRights.includes('audit')
      ? 'You need the Audit permission to view activity logs'
      : null;
  const typeId = currentContext?.domoObject?.typeId;
  const hasCards =
    isDatasetTypeId(typeId) || ['DATA_APP_VIEW', 'DATAFLOW_TYPE', 'PAGE', 'WORKSHEET_VIEW'].includes(typeId);
  const ownsCards = ['GROUP', 'USER'].includes(typeId);
  const longPressEnabled = !isDisabled && (hasCards || ownsCards);
  const typeLabel = currentContext?.domoObject?.typeName?.toLowerCase() || 'object';
  const hasChildPages = ['DATA_APP_VIEW', 'PAGE', 'WORKSHEET_VIEW'].includes(typeId);
  const hasParent = COMBINED_PARENT_LOG_TYPES.includes(typeId);
  const usesParentLog = PARENT_ONLY_LOG_TYPES.includes(typeId);
  const parentTypeId = hasParent || usesParentLog ? getObjectType(typeId)?.parents?.[0] : null;
  const parentTypeName = parentTypeId ? getObjectType(parentTypeId)?.name : null;

  // getCardsForObject only knows how to read cards off an object that contains
  // them, so owner types resolve through the owned-by search instead.
  const fetchCards = () =>
    ownsCards
      ? getOwnedCards(currentContext?.domoObject.id, currentContext?.tabId, typeId)
      : getCardsForObject({
          metadata: currentContext?.domoObject.metadata,
          objectId: currentContext?.domoObject.id,
          objectType: typeId,
          tabId: currentContext?.tabId
        });

  const handleClick = async (key = null) => {
    if (!currentContext?.domoObject || !currentContext?.domoObject.id || !currentContext?.domoObject.objectType) {
      onStatusUpdate?.('No Object Detected', 'Navigate to a Domo object page to use this feature', 'warning');
      return;
    }

    setIsLoading(true);

    let activityLogObjects;
    let activityLogType;
    let message;
    const objectName =
      currentContext?.domoObject.metadata?.name ??
      `${currentContext?.domoObject.typeName?.toLowerCase()} **${currentContext?.domoObject.id}**`;
    const cardsPhrase = ownsCards ? `Cards owned by ${objectName}` : `Cards on ${objectName}`;

    try {
      // A Code Engine package version isn't recorded in the activity log, so a plain
      // click routes to the parent package via the existing 'parent' handling.
      const action = key ?? (usesParentLog ? 'parent' : null);

      switch (action) {
        case 'card-pages': {
          activityLogType = 'card-pages';
          let pages = currentContext?.domoObject?.metadata?.context?.cardPages;

          if (!pages) {
            const cards = await fetchCards();

            if (!cards || cards.length === 0) {
              onStatusUpdate?.(
                'No Cards Found',
                ownsCards ? `No cards owned by ${objectName}` : `No cards found on ${objectName}`,
                'warning'
              );
              setIsLoading(false);
              return;
            }

            const result = await getPagesForCards(
              cards.map((card) => card.id),
              currentContext?.tabId
            );
            pages = result.pages;
          }

          const validPages = pages.filter((p) => Number(p.id) >= 0);

          if (validPages.length === 0) {
            if (pages.length === 0) {
              onStatusUpdate?.('No Pages Found', `${cardsPhrase} are not used on any pages`, 'warning', 5000);
            } else {
              onStatusUpdate?.(
                'No Valid Pages Found',
                `${cardsPhrase} are only used on Overview, Favorites, or Shared pages`,
                'warning',
                5000
              );
            }
            setIsLoading(false);
            return;
          }

          activityLogObjects = validPages;
          message = `Navigating to activity log for ${validPages.length} ${validPages.length === 1 ? 'page' : 'pages'} containing cards ${ownsCards ? 'owned by' : 'from'} ${objectName}`;
          break;
        }
        case 'cards': {
          const cards = await fetchCards();

          if (!cards || cards.length === 0) {
            onStatusUpdate?.(
              'No Cards Found',
              ownsCards ? `No cards owned by ${objectName}` : `No cards found on ${objectName}`,
              'warning',
              5000
            );
            setIsLoading(false);
            return;
          }

          activityLogObjects = cards.map((card) => ({
            id: String(card.id),
            type: 'CARD'
          }));
          activityLogType = 'cards';
          message = `Navigating to activity log for ${cards.length} ${cards.length === 1 ? 'card' : 'cards'} ${ownsCards ? 'owned by' : 'on'} ${objectName}`;
          break;
        }
        case 'child-pages': {
          activityLogType = 'child-pages';
          let childPageIds;

          if (currentContext?.domoObject.typeId === 'PAGE') {
            const subpageIds = await getSubpageIds({
              pageId: parseInt(currentContext.domoObject.id),
              tabId: currentContext.tabId
            });
            childPageIds = (subpageIds || []).filter((id) => id >= 0);
          } else {
            const result = await waitForChildPages(currentContext);

            if (!result.success) {
              onStatusUpdate?.('Error', result.error, 'danger', 5000);
              setIsLoading(false);
              return;
            }

            childPageIds = (result.childPages || []).filter((p) => Number(p.pageId) >= 0).map((p) => Number(p.pageId));
          }

          if (childPageIds.length === 0) {
            onStatusUpdate?.(
              'No Child Pages Found',
              `No child pages found for ${currentContext?.domoObject.typeName?.toLowerCase()} **${currentContext?.domoObject.id}**`,
              'warning',
              5000
            );
            setIsLoading(false);
            return;
          }

          activityLogObjects = childPageIds.map((id) => ({
            id: String(id),
            type: currentContext?.domoObject.typeId
          }));
          message = `Navigating to activity log for ${activityLogObjects.length} child pages`;
          break;
        }
        case 'parent': {
          const parent = getActivityLogParent(currentContext.domoObject);

          if (!parent) {
            onStatusUpdate?.(
              'No Parent Found',
              `Could not determine the parent ${parentTypeName?.toLowerCase() || 'object'} for ${objectName}`,
              'warning',
              5000
            );
            setIsLoading(false);
            return;
          }

          activityLogObjects = [parent];
          activityLogType = 'single-object';
          message = `Navigating to activity log for ${parentTypeName?.toLowerCase()} **${parent.name ? `"${parent.name}"` : parent.id}**`;
          break;
        }
        default: {
          // There is intentionally no view-only option for App Studio pages and
          // worksheet views: the parent rows can be filtered out in the log itself.
          const target = getActivityLogTarget(currentContext.domoObject);
          activityLogObjects = target.objects;
          activityLogType = target.type;
          message = `Navigating to activity log for ${currentContext?.domoObject.typeName?.toLowerCase()} **${currentContext?.domoObject.id}**${target.type === 'object-and-parent' ? ` and its parent ${parentTypeName?.toLowerCase()}` : ''}`;
          break;
        }
      }

      onStatusUpdate?.('Opening Activity Log', message, 'success');

      await launchActivityLog({
        instance: currentContext?.instance,
        objects: activityLogObjects,
        origin: currentContext?.origin,
        tabId: currentContext?.tabId,
        type: activityLogType
      });
    } catch (err) {
      console.error('Error opening activity log:', err);
      onStatusUpdate?.('Error', `Failed to open activity log: ${err.message}`, 'danger', 5000);
    } finally {
      setIsLoading(false);
    }
  };

  if (disabledReason) {
    return (
      <DisabledTooltip content={disabledReason}>
        <Button fullWidth isIconOnly variant='tertiary'>
          <IconListSearch />
        </Button>
      </DisabledTooltip>
    );
  }

  return (
    <Dropdown isDisabled={!longPressEnabled} trigger='longPress'>
      <Tooltip delay={200}>
        <Button
          fullWidth
          isIconOnly
          isDisabled={isDisabled}
          isPending={isLoading}
          variant='tertiary'
          onPress={() => handleClick()}
          {...(longPressEnabled ? pressProps : {})}
        >
          <IconListSearch />
          <LongPressOverlay />
        </Button>
        <Tooltip.Content className='max-w-60' offset={4}>
          <span>View activity log</span>
          {longPressEnabled && <span className='italic'>Hold for more options</span>}
        </Tooltip.Content>
      </Tooltip>
      <Dropdown.Popover className='min-w-90' placement='bottom'>
        <Dropdown.Menu onAction={handleClick}>
          {hasParent && (
            <Dropdown.Item id='parent' textValue={parentTypeName || 'Parent'}>
              <div className='flex flex-col'>
                <div className='flex items-center gap-2'>
                  <ObjectTypeIcon className='size-4 shrink-0' typeId={parentTypeId} />
                  <Label>{parentTypeName}</Label>
                </div>
                <Description className='ml-6 text-xs'>
                  View activity log for the parent {parentTypeName?.toLowerCase()} this{' '}
                  {currentContext?.domoObject?.typeName?.toLowerCase() || 'page'} belongs to
                </Description>
              </div>
            </Dropdown.Item>
          )}
          <Dropdown.Item id='cards' textValue='Cards'>
            <div className='flex flex-col'>
              <div className='flex items-center gap-2'>
                <IconChartBarBox className='size-4 shrink-0' />
                <Label>Cards</Label>
              </div>
              <Description className='ml-6 text-xs'>
                {ownsCards
                  ? `View activity log for every card this ${typeLabel} owns`
                  : `View activity log for all cards on this ${typeLabel}`}
              </Description>
            </div>
          </Dropdown.Item>
          <Dropdown.Item id='card-pages' textValue='Card Pages'>
            <div className='flex flex-col'>
              <div className='flex items-center gap-2'>
                <IconPagesBars className='size-4 shrink-0' />
                <Label>Card Pages</Label>
              </div>
              <Description className='ml-6 text-xs'>
                {ownsCards
                  ? `View activity log for pages where cards owned by this ${typeLabel} appear`
                  : `View activity log for pages where cards from this ${typeLabel} appear`}
              </Description>
            </div>
          </Dropdown.Item>
          {hasChildPages && (
            <Dropdown.Item id='child-pages' textValue='Child Pages'>
              <div className='flex flex-col'>
                <div className='flex items-center gap-2'>
                  <IconTree className='size-4 shrink-0' />
                  <Label>Child Pages</Label>
                </div>
                <Description className='ml-6 text-xs'>View activity log for hierarchical child pages</Description>
              </div>
            </Dropdown.Item>
          )}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
