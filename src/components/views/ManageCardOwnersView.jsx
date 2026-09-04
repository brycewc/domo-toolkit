import { Button, Chip, Label, Spinner, Tooltip } from '@heroui/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Alert } from '@/components/Alert';
import { AlertStatusIcon } from '@/components/AlertStatusIcon';
import { CloseButton } from '@/components/CloseButton';
import { OwnerComboBox } from '@/components/OwnerComboBox';
import { DataList } from '@/components/views/DataList';
import { OwnerCardsModal } from '@/components/views/OwnerCardsModal';
import { useStatusBar } from '@/hooks/useStatusBar';
import { useViewReady } from '@/hooks/useViewReady';
import { DataListItem } from '@/models/DataListItem';
import { DomoContext } from '@/models/DomoContext';
import { DomoObject } from '@/models/DomoObject';
import { getCardOwners, getCardsForObject, updateCardOwners } from '@/services/cards';
import { getValidTabForInstance } from '@/utils/currentObject';
import { getSidepanelData } from '@/utils/sidepanel';
import IconPeople from '@icons/people.svg?react';
import IconPersonCard from '@icons/person-card.svg?react';
import IconPerson from '@icons/person.svg?react';
import IconSync from '@icons/sync.svg?react';
import IconX from '@icons/x.svg?react';

const SUPPORTED_TYPES = [
  'BEAST_MODE_FORMULA',
  'DATA_APP_VIEW',
  'DATA_SOURCE',
  'DATAFLOW_TYPE',
  'PAGE',
  'REPORT_BUILDER_PAGE',
  'WORKSHEET_VIEW'
];

export function ManageCardOwnersView({ instance = null, onBackToDefault = null, onStatusUpdate = null }) {
  const [isLoading, setIsLoading] = useState(true);
  const holdContent = useViewReady(!isLoading);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [currentContext, setCurrentContext] = useState(null);
  const [cards, setCards] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [added, setAdded] = useState(() => new Map());
  const [removed, setRemoved] = useState(() => new Map());
  const mountedRef = useRef(true);
  const { showPromiseStatus } = useStatusBar();

  useEffect(() => {
    mountedRef.current = true;
    loadData();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadData = async ({ isRefresh = false } = {}) => {
    setError(null);
    try {
      const data = await getSidepanelData(instance);
      if (!data || data.type !== 'manageCardOwners') {
        onBackToDefault?.();
        return;
      }
      const context = data.currentContext ? DomoContext.fromJSON(data.currentContext) : null;
      const domoObject = context?.domoObject;
      if (!context || !SUPPORTED_TYPES.includes(domoObject?.typeId)) {
        onStatusUpdate?.('Error', 'Manage Card Owners is not available for this object', 'danger');
        onBackToDefault?.();
        return;
      }

      const tabId = await getValidTabForInstance(context.instance);

      // A pre-fetched card list (popup handoff) has ids and titles but never
      // owners, so owners are always read separately below. Refresh re-reads the
      // authoritative list.
      let rawCards = !isRefresh && Array.isArray(data.cards) && data.cards.length ? data.cards : null;
      if (!rawCards) {
        rawCards = await getCardsForObject({
          metadata: domoObject.metadata,
          objectId: domoObject.id,
          objectType: domoObject.typeId,
          tabId
        });
      }

      const cardList = (rawCards || [])
        .filter((c) => Number.isFinite(c.id))
        .map((c) => ({ id: c.id, name: (c.title || c.name || '').trim() || `Card ${c.id}` }));

      if (cardList.length === 0) {
        const typeName = domoObject.typeName?.toLowerCase() || 'object';
        onStatusUpdate?.('No Cards Found', `No cards found on this ${typeName}.`, 'warning', 3000);
        onBackToDefault?.();
        return;
      }

      const ownersByCardId = await getCardOwners({ cardIds: cardList.map((c) => c.id), tabId });
      const nextCards = cardList.map((c) => {
        const readable = Object.prototype.hasOwnProperty.call(ownersByCardId, String(c.id));
        return { ...c, owners: readable ? ownersByCardId[String(c.id)] : [], readable };
      });

      if (!mountedRef.current) return;
      setCurrentContext(context);
      setCards(nextCards);
      // Default selection: every readable card (opt-out). A refresh re-reads the
      // server baseline but keeps the current selection and pending owner edits.
      if (!isRefresh) {
        setSelectedIds(new Set(nextCards.filter((c) => c.readable).map((c) => String(c.id))));
      }
    } catch (err) {
      console.error('[ManageCardOwnersView] Error loading data:', err);
      if (mountedRef.current) setError(err.message || 'Failed to read card owners');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadData({ isRefresh: true });
      onStatusUpdate?.('Refreshed', 'Owner data updated', 'success', 2000);
    } catch (err) {
      onStatusUpdate?.('Refresh Failed', err.message || 'Failed to refresh owners', 'danger', 3000);
    } finally {
      if (mountedRef.current) setIsRefreshing(false);
    }
  };

  const origin = currentContext?.domoObject?.baseUrl || '';
  const readableCards = useMemo(() => cards.filter((c) => c.readable), [cards]);
  const readableIds = useMemo(() => new Set(readableCards.map((c) => String(c.id))), [readableCards]);
  const selectedCards = useMemo(
    () => cards.filter((c) => c.readable && selectedIds.has(String(c.id))),
    [cards, selectedIds]
  );

  // The owners in play: the union currently on the selected cards, plus anything
  // added, minus anything removed. Each is "partial" when it is only on some
  // selected cards and is not being applied to all via `added`.
  const displayedOwners = useMemo(() => {
    const counts = new Map();
    for (const card of selectedCards) {
      for (const owner of card.owners) {
        const key = `${owner.type}:${owner.id}`;
        const existing = counts.get(key);
        if (existing) {
          existing.count += 1;
          existing.cards.push({ id: card.id, name: card.name });
        } else {
          counts.set(key, { cards: [{ id: card.id, name: card.name }], count: 1, entity: owner });
        }
      }
    }
    const keys = new Set([...counts.keys(), ...added.keys()]);
    for (const key of removed.keys()) keys.delete(key);
    const total = selectedCards.length;
    return [...keys]
      .map((key) => {
        const fromCards = counts.get(key);
        const entity = added.get(key) || fromCards?.entity || parseOwnerKey(key);
        const presentCount = fromCards?.count || 0;
        const partial = !added.has(key) && presentCount > 0 && presentCount < total;
        return { cards: fromCards?.cards || [], entity, key, partial, presentCount, total };
      })
      .sort((a, b) => a.entity.displayName.localeCompare(b.entity.displayName, undefined, { sensitivity: 'base' }));
  }, [selectedCards, added, removed]);

  const excludeKeys = useMemo(() => new Set(displayedOwners.map((o) => o.key)), [displayedOwners]);
  const hasEdits = added.size > 0 || removed.size > 0;

  const items = useMemo(
    () =>
      cards.map((card) => {
        const item = DataListItem.fromDomoObject(new DomoObject('CARD', card.id, origin, { name: card.name }), {
          label: card.name
        });
        item.metadata = card.readable ? `${card.owners.length} owner${card.owners.length === 1 ? '' : 's'}` : 'Owners unavailable';
        item.muted = !card.readable;
        return item;
      }),
    [cards, origin]
  );

  const isSelectable = (item) => readableIds.has(String(item.id));

  const commitOwner = (entity) => {
    const key = `${entity.type}:${entity.id}`;
    setRemoved((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
    setAdded((prev) => {
      const next = new Map(prev);
      next.set(key, entity);
      return next;
    });
  };

  const removeOwner = (key, entity) => {
    setAdded((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
    setRemoved((prev) => {
      const next = new Map(prev);
      next.set(key, entity);
      return next;
    });
  };

  const handleSave = () => {
    const targets = cards.filter((c) => c.readable && selectedIds.has(String(c.id)));
    if (targets.length === 0) {
      onStatusUpdate?.('No cards selected', 'Select at least one card', 'warning', 2500);
      return;
    }
    if (!hasEdits) return;

    const addKeys = [...added.keys()];
    const removeKeys = [...removed.keys()];

    // A card must never be left ownerless. Compute each selected card's resulting
    // owner set (current + added - removed) and block if any would end up empty.
    const orphaned = targets.filter((card) => {
      const resulting = new Set(card.owners.map((o) => `${o.type}:${o.id}`));
      for (const key of addKeys) resulting.add(key);
      for (const key of removeKeys) resulting.delete(key);
      return resulting.size === 0;
    });
    if (orphaned.length > 0) {
      const names = orphaned.slice(0, 3).map((c) => c.name).join(', ');
      const more = orphaned.length > 3 ? ` and ${orphaned.length - 3} more` : '';
      onStatusUpdate?.(
        'Cannot remove all owners',
        `${orphaned.length} card${orphaned.length === 1 ? '' : 's'} would be left with no owner (${names}${more}). Add an owner or deselect ${orphaned.length === 1 ? 'it' : 'them'}.`,
        'danger',
        6000
      );
      return;
    }

    const cardIds = targets.map((c) => c.id);
    const addOwners = [...added.values()].map((o) => ({ id: o.id, type: o.type }));
    const removeOwners = [...removed.values()].map((o) => ({ id: o.id, type: o.type }));

    setIsSubmitting(true);
    const promise = (async () => {
      const tabId = await getValidTabForInstance(currentContext.instance);
      const result = await updateCardOwners({ addOwners, cardIds, removeOwners, tabId });
      if (result.failed > 0) throw new Error(`${result.succeeded} updated, ${result.failed} failed`);
      return result.succeeded;
    })();

    showPromiseStatus(promise, {
      error: (e) => e.message || 'Failed to update owners',
      loading: `Updating owners on ${cardIds.length} card${cardIds.length === 1 ? '' : 's'}...`,
      success: (n) => `Updated owners on ${n} card${n === 1 ? '' : 's'}`
    });

    promise
      .then(() => {
        if (mountedRef.current) onBackToDefault?.();
      })
      .catch(() => {})
      .finally(() => {
        if (mountedRef.current) setIsSubmitting(false);
      });
  };

  if (isLoading || holdContent) {
    return (
      <div className='flex h-full items-center justify-center'>
        <Spinner size='lg' />
      </div>
    );
  }

  if (error) {
    return (
      <Alert className='w-full' status='warning'>
        <AlertStatusIcon />
        <Alert.Content>
          <Alert.Title>Could not read card owners</Alert.Title>
          <div className='flex flex-col items-start justify-center gap-2'>
            <Alert.Description>{error}</Alert.Description>
            <Button
              isPending={isRetrying}
              size='sm'
              onPress={async () => {
                setIsRetrying(true);
                setIsLoading(true);
                await loadData();
                if (mountedRef.current) setIsRetrying(false);
              }}
            >
              {isRetrying ? <Spinner color='currentColor' size='sm' /> : <IconSync />}
              Retry
            </Button>
          </div>
        </Alert.Content>
        <CloseButton className='rounded-full' variant='ghost' onPress={() => onBackToDefault?.()} />
      </Alert>
    );
  }

  const selectAllControl = {
    ariaLabel: 'Select all cards',
    count: readableCards.filter((c) => selectedIds.has(String(c.id))).length,
    isDisabled: isSubmitting,
    onToggle: (checked) => setSelectedIds(checked ? new Set(readableCards.map((c) => String(c.id))) : new Set()),
    showCount: true,
    total: readableCards.length
  };

  // The owner editor lives in the DataList footer, pinned beneath the card list.
  const ownerEditor = (
    <div className='flex flex-col gap-2'>
      <Label className='text-sm font-medium'>Owners</Label>
      <OwnerComboBox
        aria-label='Add an owner'
        avatarBaseUrl={origin}
        excludeKeys={excludeKeys}
        isDisabled={isSubmitting}
        menuTrigger='input'
        selectionMode='multiple'
        sources={['USER', 'GROUP']}
        tabId={currentContext?.tabId}
        onSelect={commitOwner}
      />

      {displayedOwners.length > 0 ? (
        <div className='flex max-h-28 flex-wrap gap-1 overflow-y-auto'>
          {displayedOwners.map(({ cards: ownerCards, entity, key, partial, presentCount, total }) => (
            <Chip className='h-6 max-w-full px-2 text-xs' color={partial ? 'warning' : 'accent'} key={key} size='sm' variant='soft'>
              {entity.type === 'GROUP' ? (
                <IconPeople className='size-3 shrink-0' />
              ) : (
                <IconPerson className='size-3 shrink-0' />
              )}
              <Chip.Label className='truncate'>{entity.displayName}</Chip.Label>
              {partial && (
                <>
                  <Tooltip>
                    <Button
                      className='ml-1 h-4 min-w-0 px-1 text-[10px] opacity-80'
                      isDisabled={isSubmitting}
                      size='sm'
                      variant='ghost'
                      onPress={() => commitOwner(entity)}
                    >
                      {presentCount}/{total}
                    </Button>
                    <Tooltip.Content className='max-w-45'>
                      On {presentCount} of {total} selected cards. Click to add to all.
                    </Tooltip.Content>
                  </Tooltip>
                  <OwnerCardsModal
                    cards={ownerCards}
                    origin={origin}
                    ownerName={entity.displayName}
                    presentCount={presentCount}
                    total={total}
                  />
                </>
              )}
              <Button
                isIconOnly
                className='ml-1 size-4 min-w-0'
                isDisabled={isSubmitting}
                size='sm'
                variant='ghost'
                onPress={() => removeOwner(key, entity)}
              >
                <IconX className='size-3' />
              </Button>
            </Chip>
          ))}
        </div>
      ) : (
        <span className='text-xs text-muted'>No owners on the selected cards yet.</span>
      )}

      <span className='text-xs text-muted'>
        Removing an owner clears it from every selected card. Owners shown with a count are only on some; click the count to
        add it to all, or leave it to keep it on only those cards.
      </span>

      <Button fullWidth isDisabled={isSubmitting || !hasEdits} isPending={isSubmitting} variant='primary' onPress={handleSave}>
        <IconPersonCard />
        Save Owners
      </Button>
    </div>
  );

  const objectName = currentContext?.domoObject?.metadata?.name;
  const objectType = currentContext?.domoObject?.typeId;

  return (
    <DataList
      fillHeight
      selectionMode
      showCounts
      currentContext={currentContext}
      feature='Card Owners for'
      featureIcon={<IconPersonCard />}
      footer={ownerEditor}
      getUnselectableTooltip={() => 'Owners are unavailable for this card.'}
      headerActions={['reload', 'refresh']}
      isRefreshing={isRefreshing}
      isSelectable={isSelectable}
      itemLabel='card'
      items={items}
      objectId={currentContext?.domoObject?.id}
      objectType={objectType}
      selectAll={selectAllControl}
      selectedIds={selectedIds}
      subject={objectName}
      subjectTypeId={objectType}
      subtext={`**${selectedCards.length}** of **${readableCards.length}** selected`}
      viewType='manageCardOwners'
      onClose={onBackToDefault}
      onRefresh={handleRefresh}
      onSelectionChange={setSelectedIds}
      onStatusUpdate={onStatusUpdate}
    />
  );
}

// Reconstruct a minimal owner entity from a `${type}:${id}` key when the owner
// isn't in the loaded lists (defensive; the display name falls back to the id).
function parseOwnerKey(key) {
  const idx = key.indexOf(':');
  const type = key.slice(0, idx);
  const id = key.slice(idx + 1);
  return { displayName: id, id, type };
}
