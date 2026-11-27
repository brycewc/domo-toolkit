import { Spinner } from '@heroui/react';
import { useCallback, useMemo, useRef } from 'react';

import { DataListItem } from '@/models/DataListItem';
import { DomoObject } from '@/models/DomoObject';
import { cardUrlOnPage } from '@/utils/cardHelpers';
import { soleExpandedGroupIds } from '@/utils/dataListGroups';
import IconLockClosed from '@icons/lock-closed.svg?react';

import { AnimatedCheck } from '../AnimatedCheck';
import { AnimatedX } from '../AnimatedX';
import { DataList } from './DataList';

const DEFAULT_STATUS_LABELS = { done: 'Done', failed: 'Failed', running: 'Running...' };
const RUNNING_LOCK = { locked: true, tooltip: 'Selection is locked until the run finishes.' };

/**
 * The selectable card list shared by the bulk card tools. Stateless: it loads
 * nothing, sends nothing, and holds no run state. Selection is keyed by card ID,
 * so a card listed under several views toggles as one.
 *
 * @param {Object} props
 * @param {Array<Object>} props.cards - Cards from `getCardsForContext` (string `id`, `loadIndex`, `title`, `locked`)
 * @param {Array<{cardIds: string[], viewId: string, viewName: string}>} [props.groups] - Parent scope only: one
 *   parent row per view, linking to it, with its cards beneath. Cards missing from `cards` are skipped, and a
 *   view left with none is dropped, so a view can filter `cards` without touching `groups`.
 * @param {import('@/models/DomoContext').DomoContext} props.context - The launch context, for row links
 * @param {string|number} [props.parentId] - The app or worksheet in parent scope; defaults to the context's parent
 * @param {Set<string>} props.selectedCardIds
 * @param {(next: Set<string>) => void} props.onSelectedCardIdsChange
 * @param {(card: Object) => boolean} [props.isSelectable]
 * @param {(card: Object) => string|null} [props.unselectableReason] - Tooltip on an unselectable card's checkbox
 * @param {Map<string, {error?: string, status: 'queued'|'running'|'done'|'failed'|'skipped'}>} [props.rowStatus]
 * @param {{done: string, failed: string, running: string}} [props.statusLabels] - Badge tooltips per status
 * @param {(card: Object) => React.ReactNode} [props.renderDetail] - Second line under each card; memoize it
 * @param {(card: Object) => {color?: string, label: string}|null} [props.chipFor]
 * @param {(card: Object) => boolean} [props.mutedFor]
 * @param {boolean} [props.isRunning] - Makes the selection read-only and drops Reload and Refresh
 *
 * Every other prop (`banner`, `footer`, `feature`, `subtext`, `headerActions`, ...) passes through to DataList.
 */
export function CardBatchList({
  banner,
  beta = false,
  cards = [],
  chipFor,
  context,
  currentContext,
  customHeaderActions,
  feature,
  featureIcon,
  footer,
  groups = [],
  headerActions = ['reload', 'refresh'],
  isActive = true,
  isRefreshing = false,
  isRunning = false,
  isSelectable,
  mutedFor,
  onClose,
  onRefresh,
  onSelectedCardIdsChange,
  onStatusUpdate,
  parentId = null,
  renderDetail,
  rowStatus,
  selectedCardIds,
  statusLabels = DEFAULT_STATUS_LABELS,
  subject,
  subjectTypeId,
  subtext,
  unselectableReason,
  viewType
}) {
  const domoObject = context?.domoObject;
  const origin = context?.origin || domoObject?.baseUrl || '';
  const resolvedParentId = parentId ?? domoObject?.parent?.id ?? null;
  const viewTypeId = domoObject?.typeId === 'WORKSHEET_VIEW' ? 'WORKSHEET_VIEW' : 'DATA_APP_VIEW';

  const cardsById = useMemo(() => new Map(cards.map((card) => [String(card.id), card])), [cards]);

  // Pinned by card ID across reloads, so a rename never reshuffles rows; cards first seen later go last.
  const orderRef = useRef(new Map());
  const sortWeights = useMemo(() => {
    const order = orderRef.current;
    let nextWeight = order.size;
    for (const card of [...cards].sort((a, b) => (a.loadIndex ?? 0) - (b.loadIndex ?? 0))) {
      const id = String(card.id);
      if (!order.has(id)) order.set(id, nextWeight++);
    }
    return new Map(order);
  }, [cards]);

  const selectableCardIds = useMemo(
    () => new Set(cards.filter((card) => (isSelectable ? isSelectable(card) : true)).map((card) => String(card.id))),
    [cards, isSelectable]
  );

  const { cardIdByRowId, groupCardIdsByRowId, items } = useMemo(() => {
    const cardIdByRowId = new Map();
    const groupCardIdsByRowId = new Map();

    const cardItem = (card, rowId, objectId, objectType) => {
      const cardId = String(card.id);
      const label = (card.title || card.name || '').trim() || `Card ${cardId}`;
      const cardObject = new DomoObject('CARD', cardId, origin, { name: label });
      cardObject.url = cardUrlOnPage({ cardId, objectId, objectType, origin, parentId: resolvedParentId }) ?? cardObject.url;
      const item = DataListItem.fromDomoObject(cardObject, { chip: chipFor?.(card) ?? null });
      item.id = rowId;
      item.originalId = rowId === cardId ? undefined : cardId;
      item.muted = Boolean(mutedFor?.(card));
      item.sortWeight = sortWeights.get(cardId) ?? 0;
      cardIdByRowId.set(rowId, cardId);
      return item;
    };

    if (groups.length === 0) {
      return {
        cardIdByRowId,
        groupCardIdsByRowId,
        items: cards.map((card) => cardItem(card, String(card.id), domoObject?.id, domoObject?.typeId))
      };
    }

    const groupItems = [];
    for (const { cardIds, viewId, viewName } of groups) {
      const children = cardIds
        .filter((cardId) => cardsById.has(cardId))
        .map((cardId) => cardItem(cardsById.get(cardId), `${viewId}:${cardId}`, viewId, viewTypeId));
      if (children.length === 0) continue;
      const rowId = `view:${viewId}`;
      const viewObject = new DomoObject(viewTypeId, viewId, origin, { name: viewName });
      if (resolvedParentId) viewObject.url = `${origin}/app-studio/${resolvedParentId}/pages/${viewId}`;
      const item = DataListItem.fromDomoObject(viewObject, {
        children,
        count: children.length,
        countLabel: children.length === 1 ? 'card' : 'cards'
      });
      item.id = rowId;
      item.originalId = viewId;
      groupCardIdsByRowId.set(
        rowId,
        children.map((child) => child.originalId)
      );
      groupItems.push(item);
    }
    return { cardIdByRowId, groupCardIdsByRowId, items: groupItems };
  }, [cards, cardsById, chipFor, domoObject, groups, mutedFor, origin, resolvedParentId, sortWeights, viewTypeId]);

  const defaultExpandedIds = useMemo(() => soleExpandedGroupIds(items), [items]);

  const selectedRowIds = useMemo(() => {
    const ids = new Set();
    for (const [rowId, cardId] of cardIdByRowId) {
      if (selectedCardIds?.has(cardId)) ids.add(rowId);
    }
    for (const [rowId, cardIds] of groupCardIdsByRowId) {
      const selectable = cardIds.filter((cardId) => selectableCardIds.has(cardId));
      if (selectable.length > 0 && selectable.every((cardId) => selectedCardIds?.has(cardId))) ids.add(rowId);
    }
    return ids;
  }, [cardIdByRowId, groupCardIdsByRowId, selectableCardIds, selectedCardIds]);

  // Diffing row sets, rather than mapping the incoming set straight to cards, is
  // what lets unchecking one instance of a card unselect it under every view.
  const handleSelectionChange = useCallback(
    (incoming) => {
      if (isRunning) return;
      const added = [...incoming].filter((rowId) => !selectedRowIds.has(rowId));
      const removed = [...selectedRowIds].filter((rowId) => !incoming.has(rowId));
      const next = new Set(selectedCardIds);
      for (const rowId of added) {
        for (const cardId of groupCardIdsByRowId.get(rowId) || []) {
          if (selectableCardIds.has(cardId)) next.add(cardId);
        }
      }
      for (const rowId of removed) {
        for (const cardId of groupCardIdsByRowId.get(rowId) || []) next.delete(cardId);
      }
      for (const rowId of added) {
        const cardId = cardIdByRowId.get(rowId);
        if (cardId && selectableCardIds.has(cardId)) next.add(cardId);
      }
      for (const rowId of removed) {
        const cardId = cardIdByRowId.get(rowId);
        if (cardId) next.delete(cardId);
      }
      onSelectedCardIdsChange?.(next);
    },
    [
      cardIdByRowId,
      groupCardIdsByRowId,
      isRunning,
      onSelectedCardIdsChange,
      selectableCardIds,
      selectedCardIds,
      selectedRowIds
    ]
  );

  const isRowSelectable = useCallback(
    (item) => {
      const groupCardIds = groupCardIdsByRowId.get(item.id);
      if (groupCardIds) return groupCardIds.some((cardId) => selectableCardIds.has(cardId));
      return selectableCardIds.has(cardIdByRowId.get(item.id));
    },
    [cardIdByRowId, groupCardIdsByRowId, selectableCardIds]
  );

  const getUnselectableTooltip = useCallback(
    (item) => {
      if (groupCardIdsByRowId.has(item.id)) return 'None of the cards on this page can be selected.';
      const card = cardsById.get(cardIdByRowId.get(item.id));
      return card ? (unselectableReason?.(card) ?? null) : null;
    },
    [cardIdByRowId, cardsById, groupCardIdsByRowId, unselectableReason]
  );

  const getItemLock = useCallback(() => (isRunning ? RUNNING_LOCK : null), [isRunning]);

  const getItemBadge = useCallback(
    (item) => {
      const cardId = cardIdByRowId.get(item.id);
      if (!cardId) return null;
      const { error, status } = rowStatus?.get(cardId) || {};
      switch (status) {
        case 'done':
          return { icon: <AnimatedCheck className='size-4 shrink-0 text-success' />, tooltip: statusLabels.done };
        case 'failed':
          return {
            icon: <AnimatedX className='size-4 shrink-0 text-danger' />,
            tooltip: `${statusLabels.failed}: ${error || 'Unknown error'}`
          };
        case 'running':
          return { icon: <Spinner className='shrink-0' color='current' size='sm' />, tooltip: statusLabels.running };
        default:
          break;
      }
      if (cardsById.get(cardId)?.locked === true) {
        return { icon: <IconLockClosed className='size-4 shrink-0 text-foreground' />, tooltip: 'Locked' };
      }
      return null;
    },
    [cardIdByRowId, cardsById, rowStatus, statusLabels]
  );

  const renderItemDetail = useMemo(() => {
    if (typeof renderDetail !== 'function') return undefined;
    return (item) => {
      const card = cardsById.get(cardIdByRowId.get(item.id));
      return card ? renderDetail(card) : null;
    };
  }, [cardIdByRowId, cardsById, renderDetail]);

  const selectedSelectableCount = [...selectableCardIds].filter((cardId) => selectedCardIds?.has(cardId)).length;
  const selectAll = {
    ariaLabel: 'Select all cards',
    count: selectedSelectableCount,
    isDisabled: isRunning,
    onToggle: (checked) => {
      const next = new Set(selectedCardIds);
      for (const cardId of selectableCardIds) {
        if (checked) next.add(cardId);
        else next.delete(cardId);
      }
      onSelectedCardIdsChange?.(next);
    },
    showCount: true,
    total: selectableCardIds.size
  };

  const visibleHeaderActions = isRunning
    ? headerActions.filter((action) => action !== 'reload' && action !== 'refresh')
    : headerActions;

  return (
    <DataList
      allowsMultipleExpanded
      fillHeight
      selectionMode
      banner={banner}
      beta={beta}
      currentContext={currentContext}
      customHeaderActions={customHeaderActions}
      defaultExpandedIds={defaultExpandedIds}
      feature={feature}
      featureIcon={featureIcon}
      footer={footer}
      getItemBadge={getItemBadge}
      getItemLock={getItemLock}
      getUnselectableTooltip={getUnselectableTooltip}
      headerActions={visibleHeaderActions}
      isActive={isActive}
      isRefreshing={isRefreshing}
      isSelectable={isRowSelectable}
      itemActions={['copy']}
      itemLabel='card'
      items={items}
      objectId={domoObject?.id}
      objectType={domoObject?.typeId}
      renderItemDetail={renderItemDetail}
      selectAll={selectAll}
      selectedIds={selectedRowIds}
      showActivityLogAll={false}
      subject={subject}
      subjectTypeId={subjectTypeId}
      subtext={subtext}
      viewType={viewType}
      onClose={onClose}
      onRefresh={onRefresh}
      onSelectionChange={handleSelectionChange}
      onStatusUpdate={onStatusUpdate}
    />
  );
}
