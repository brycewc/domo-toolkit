import { Button, Spinner, ToggleButton, ToggleButtonGroup } from '@heroui/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useStatusBar } from '@/hooks/useStatusBar';
import { useViewReady } from '@/hooks/useViewReady';
import { DataListItem } from '@/models/DataListItem';
import { DomoContext } from '@/models/DomoContext';
import { DomoObject } from '@/models/DomoObject';
import { getCardsForObject, setCardsLocked } from '@/services/cards';
import { getSidepanelData } from '@/utils/sidepanel';
import IconLockClosed from '@icons/lock-closed.svg?react';
import IconLockOpen from '@icons/lock-open.svg?react';

import { DataList } from './DataList';

export function ManageCardLocksView({
  instance = null,
  liveContext = null,
  onBackToDefault = null,
  onStatusUpdate = null
}) {
  const [isLoading, setIsLoading] = useState(true);
  const holdContent = useViewReady(!isLoading);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentContext, setCurrentContext] = useState(null);
  const [cards, setCards] = useState([]);
  const [mode, setMode] = useState('lock');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const mountedRef = useRef(true);
  const { showPromiseStatus } = useStatusBar();

  useEffect(() => {
    mountedRef.current = true;
    loadData();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Whether every card reported a boolean lock state. The dataset/dataflow card
  // endpoints don't always return `locked`; when the status is unknown we can't
  // meaningfully mute rows or pre-select by state, so the view degrades to a
  // plain confirm-list where every card is selectable in both modes.
  const lockStatusKnown = cards.length > 0 && cards.every((card) => typeof card.locked === 'boolean');

  // The cards the current mode would actually change: unlocked cards in lock
  // mode, locked cards in unlock mode. When lock status is unknown, every card
  // is fair game. Both the default selection and which rows are selectable
  // derive from this, so flipping the toggle re-selects the right set.
  const actionableIds = useMemo(() => {
    const ids = new Set();
    for (const card of cards) {
      const eligible = !lockStatusKnown || (mode === 'lock' ? card.locked !== true : card.locked === true);
      if (eligible) ids.add(String(card.id));
    }
    return ids;
  }, [cards, lockStatusKnown, mode]);

  // Default the selection to every actionable card (opt-out semantics): the user
  // unchecks the ones to leave alone. Recomputed on mode change so toggling
  // Lock/Unlock re-selects whatever is now actionable.
  useEffect(() => {
    setSelectedIds(new Set(actionableIds));
  }, [actionableIds]);

  const origin = currentContext?.domoObject?.baseUrl || '';

  const items = useMemo(
    () =>
      cards.map((card) => {
        const item = DataListItem.fromDomoObject(new DomoObject('CARD', card.id, origin, { name: card.title }));
        // Dim cards already in the target state (nothing to do in this mode).
        item.muted = lockStatusKnown && !actionableIds.has(String(card.id));
        return item;
      }),
    [actionableIds, cards, lockStatusKnown, origin]
  );

  const isSelectable = (item) => actionableIds.has(String(item.id));

  // Lookup of each card's current lock state, feeding the trailing status icon.
  const lockedById = useMemo(() => {
    const map = new Map();
    for (const card of cards) map.set(String(card.id), card.locked);
    return map;
  }, [cards]);

  const getItemBadge = (item) => {
    const locked = lockedById.get(String(item.id));
    if (typeof locked !== 'boolean') return null;
    return {
      icon: locked ? (
        <IconLockClosed className='size-4 shrink-0 text-foreground' />
      ) : (
        <IconLockOpen className='size-4 shrink-0 text-muted' />
      ),
      tooltip: locked ? 'Locked' : 'Unlocked'
    };
  };

  // Just the Lock/Unlock toggle. The select-all lives in DataList's built-in
  // `selectAll` control, which renders directly below this banner, so it still
  // reads as scoped to whichever action the toggle currently has chosen.
  const banner = (
    <ToggleButtonGroup
      disallowEmptySelection
      fullWidth
      aria-label='Choose whether to lock or unlock cards'
      selectedKeys={[mode]}
      selectionMode='single'
      size='sm'
      onSelectionChange={(keys) => {
        const next = [...keys][0];
        if (next) setMode(next);
      }}
    >
      <ToggleButton id='lock'>Lock</ToggleButton>
      <ToggleButton id='unlock'>Unlock</ToggleButton>
    </ToggleButtonGroup>
  );

  const selectAllControl = {
    ariaLabel: 'Select all cards',
    count: selectedIds.size,
    isDisabled: isSubmitting,
    onToggle: (checked) => setSelectedIds(checked ? new Set(actionableIds) : new Set()),
    showCount: true,
    total: actionableIds.size
  };

  async function handleSubmit() {
    const cardIds = cards.filter((card) => selectedIds.has(String(card.id))).map((card) => card.id);
    if (cardIds.length === 0) return;
    setIsSubmitting(true);
    const locked = mode === 'lock';
    const verb = locked ? 'Lock' : 'Unlock';
    const gerund = locked ? 'Locking' : 'Unlocking';
    const promise = setCardsLocked({ cardIds, locked, tabId: currentContext?.tabId });
    showPromiseStatus(promise, {
      error: (err) => `Failed to ${verb.toLowerCase()} cards: ${err.message}`,
      loading: `${gerund} **${cardIds.length}** card${cardIds.length === 1 ? '' : 's'}...`,
      success: (res) =>
        res.failed > 0
          ? `${verb}ed **${res.succeeded}**, **${res.failed}** failed`
          : `${verb}ed **${res.succeeded}** card${res.succeeded === 1 ? '' : 's'}`
    });
    try {
      const res = await promise;
      // Close on a clean run; keep the view open (refreshed) when some cards
      // failed so the user can see what is left and retry.
      if (res.failed > 0) {
        await refresh();
      } else {
        onBackToDefault?.();
        return;
      }
    } catch {
      // Status already surfaced via showPromiseStatus.
    } finally {
      if (mountedRef.current) setIsSubmitting(false);
    }
  }

  async function loadData(context = null) {
    try {
      let ctx = context;
      if (!ctx) {
        const data = await getSidepanelData(instance);
        if (!data || data.type !== 'manageCardLocks') {
          onBackToDefault?.();
          return;
        }
        ctx = data.currentContext ? DomoContext.fromJSON(data.currentContext) : null;
      }
      if (!ctx?.domoObject?.id) {
        onStatusUpdate?.('Error', 'No object context available', 'danger');
        onBackToDefault?.();
        return;
      }

      if (mountedRef.current) setCurrentContext(ctx);

      // Always fetch fresh so a post-operation refresh reflects the new lock
      // state (the pre-fetched context snapshot goes stale after a lock/unlock).
      const rawCards = await getCardsForObject({
        metadata: ctx.domoObject.metadata,
        objectId: ctx.domoObject.id,
        objectType: ctx.domoObject.typeId,
        tabId: ctx.tabId
      });

      if (!mountedRef.current) return;
      setCards(
        (rawCards || [])
          .filter((card) => Number.isFinite(card.id))
          .map((card) => ({
            id: card.id,
            locked: card.locked,
            title: (card.title || card.name || '').trim()
          }))
      );
    } catch (error) {
      if (mountedRef.current) {
        onStatusUpdate?.('Error', error.message || 'Failed to load cards', 'danger');
        onBackToDefault?.();
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }

  async function refresh() {
    setIsRefreshing(true);
    await loadData(currentContext);
  }

  if (isLoading || holdContent) {
    return (
      <div className='flex h-full items-center justify-center'>
        <Spinner />
      </div>
    );
  }

  const selectedCount = selectedIds.size;
  const footer = (
    <Button fullWidth isDisabled={selectedCount === 0 || isSubmitting} size='sm' onPress={handleSubmit}>
      {isSubmitting
        ? mode === 'lock'
          ? 'Locking...'
          : 'Unlocking...'
        : `${mode === 'lock' ? 'Lock' : 'Unlock'} ${selectedCount} card${selectedCount === 1 ? '' : 's'}`}
    </Button>
  );

  const objectName = currentContext?.domoObject?.metadata?.name;
  const objectType = currentContext?.domoObject?.typeId;
  const subtext =
    cards.length === 0
      ? 'No cards found on this object.'
      : !lockStatusKnown
        ? `**${cards.length}** card${cards.length === 1 ? '' : 's'}`
        : actionableIds.size === 0
          ? mode === 'lock'
            ? 'All cards are already locked.'
            : 'All cards are already unlocked.'
          : `**${actionableIds.size}** of **${cards.length}** card${cards.length === 1 ? '' : 's'} can be ${mode === 'lock' ? 'locked' : 'unlocked'}`;

  return (
    <DataList
      fillHeight
      selectionMode
      banner={banner}
      currentContext={currentContext || liveContext}
      feature='Card Locks for'
      featureIcon={<IconLockClosed />}
      footer={footer}
      getItemBadge={getItemBadge}
      getUnselectableTooltip={() => (mode === 'lock' ? 'This card is already locked.' : 'This card is already unlocked.')}
      headerActions={['reload', 'refresh']}
      isRefreshing={isRefreshing}
      isSelectable={isSelectable}
      itemActions={['copy']}
      itemLabel='card'
      items={items}
      objectId={currentContext?.domoObject?.id}
      objectType={objectType}
      selectAll={selectAllControl}
      selectedIds={selectedIds}
      showActivityLogAll={false}
      subject={objectName}
      subjectTypeId={objectType}
      subtext={subtext}
      viewType='manageCardLocks'
      onClose={onBackToDefault}
      onRefresh={refresh}
      onSelectionChange={setSelectedIds}
      onStatusUpdate={onStatusUpdate}
    />
  );
}
