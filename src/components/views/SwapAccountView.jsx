import { Button, Card, Separator, Spinner, Tooltip } from '@heroui/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { EntityPicker } from '@/components/EntityPicker';
import { createAccountPickerAdapter } from '@/components/pickers/accountPickerAdapter';
import { UserFilterAutocomplete } from '@/components/UserFilterAutocomplete';
import { useStatusBar } from '@/hooks/useStatusBar';
import { useViewReady } from '@/hooks/useViewReady';
import { DomoContext } from '@/models/DomoContext';
import { getAccountIdsForDomoObject, getAccountsForProvider, isLegacyAccountStructure } from '@/services/accounts';
import { runStream, updateStreamAccounts } from '@/services/datasets';
import { buildRefreshAction, buildReloadAction } from '@/utils/headerActions';
import { getSidepanelData } from '@/utils/sidepanel';
import IconExclamationTriangle from '@icons/exclamation-triangle.svg?react';
import IconPersonCard from '@icons/person-card.svg?react';
import IconSwapHorizontal from '@icons/swap-horizontal.svg?react';
import IconSync from '@icons/sync.svg?react';

import { ViewHeader } from './ViewHeader';

export function SwapAccountView({ instance = null, liveContext = null, onBackToDefault = null, onStatusUpdate = null }) {
  const [isLoading, setIsLoading] = useState(true);
  useViewReady(!isLoading);
  const [currentContext, setCurrentContext] = useState(null);
  const [streamId, setStreamId] = useState(null);
  const [dataProviderType, setDataProviderType] = useState(null);
  const [slots, setSlots] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [accountsError, setAccountsError] = useState(null);
  const [submittingAction, setSubmittingAction] = useState(null);
  const [isLegacyStructure, setIsLegacyStructure] = useState(false);
  const [screen, setScreen] = useState('form');
  const [activeSlotIndex, setActiveSlotIndex] = useState(0);
  const [ownerFilter, setOwnerFilter] = useState([]);
  const [ownerFilterMode, setOwnerFilterMode] = useState('include');
  const mountedRef = useRef(true);
  const { showPromiseStatus } = useStatusBar();
  const isSubmitting = submittingAction !== null;

  useEffect(() => {
    mountedRef.current = true;
    loadData();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const instanceBaseUrl = currentContext?.domoObject?.baseUrl;
  // Narrow the compatible accounts to (or away from) the selected owners before the
  // picker sees them; its own name/ID search then filters further within that set.
  const filteredAccounts = useMemo(() => {
    if (ownerFilter.length === 0) return accounts;
    const selected = new Set(ownerFilter.map(String));
    return accounts.filter((account) => {
      const isOwned = account.ownerId != null && selected.has(String(account.ownerId));
      return ownerFilterMode === 'exclude' ? !isOwned : isOwned;
    });
  }, [accounts, ownerFilter, ownerFilterMode]);
  const adapter = useMemo(
    () => createAccountPickerAdapter({ accounts: filteredAccounts, dataProviderKey: dataProviderType, instanceBaseUrl }),
    [dataProviderType, filteredAccounts, instanceBaseUrl]
  );

  const loadData = async () => {
    try {
      const data = await getSidepanelData(instance);
      if (!data || data.type !== 'swapAccount') {
        onBackToDefault?.();
        return;
      }
      const context = data.currentContext ? DomoContext.fromJSON(data.currentContext) : null;
      const domoObject = context?.domoObject;
      const details = domoObject?.metadata?.details;
      const resolvedStreamId = details?.streamId ?? domoObject?.metadata?.parent?.details?.id ?? null;
      const accountIds = getAccountIdsForDomoObject(domoObject);
      if (!context || !resolvedStreamId || accountIds.length === 0) {
        onStatusUpdate?.('Error', 'This dataset has no stream account to swap', 'danger');
        onBackToDefault?.();
        return;
      }
      const provider = details?.dataProviderType || null;
      const isLegacy = isLegacyAccountStructure(domoObject);
      if (!mountedRef.current) return;
      setCurrentContext(context);
      setStreamId(resolvedStreamId);
      setDataProviderType(provider);
      setIsLegacyStructure(isLegacy);
      setSlots(accountIds.map((id) => ({ currentAccountId: id, replacementId: null, replacementName: null })));
      // A single-account dataset has one slot; open its picker straight away so the
      // user doesn't pay an extra tap to reach it. A legacy (one-account) dataset
      // skips the slot form entirely, so open the picker even when no compatible
      // accounts came back (it shows its own empty state instead of the form).
      loadAccounts(provider, context.tabId, { openPicker: accountIds.length === 1, openWhenEmpty: isLegacy });
    } catch (error) {
      console.error('[SwapAccountView] Error loading data:', error);
      onStatusUpdate?.('Error', error.message || 'Failed to load context', 'danger');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  const loadAccounts = async (provider, tabId, { openPicker = false, openWhenEmpty = false } = {}) => {
    setIsLoadingAccounts(true);
    setAccountsError(null);
    try {
      const result = await getAccountsForProvider(provider, tabId);
      if (!mountedRef.current) return;
      setAccounts(result || []);
      if (openPicker && ((result || []).length > 0 || openWhenEmpty)) {
        setActiveSlotIndex(0);
        setScreen('picker');
      }
    } catch (error) {
      console.error('[SwapAccountView] Error loading accounts:', error);
      if (mountedRef.current) setAccountsError(error.message || 'Failed to load accounts');
    } finally {
      if (mountedRef.current) setIsLoadingAccounts(false);
    }
  };

  const setReplacement = (index, id, name) =>
    setSlots((prev) => prev.map((slot, i) => (i === index ? { ...slot, replacementId: id, replacementName: name } : slot)));

  const describeAccount = (id) => {
    const account = accounts.find((a) => a.id === id);
    const name = account?.name ?? `Account ${id}`;
    const count = account?.datasetCount;
    return count != null ? `${name} (ID: ${id}) • ${count} dataset${count === 1 ? '' : 's'}` : `${name} (ID: ${id})`;
  };

  const openPicker = (index) => {
    setActiveSlotIndex(index);
    setScreen('picker');
  };

  const handlePicked = (account) => {
    setReplacement(activeSlotIndex, account.id, account.name);
    setScreen('form');
  };

  const applyAccountChanges = (accountChanges, runAfter) => {
    const changeCount = Object.keys(accountChanges).length;
    if (changeCount === 0) {
      onStatusUpdate?.('No changes to apply', 'Choose a different account first', 'warning', 2000);
      return;
    }

    setSubmittingAction(runAfter ? 'saveAndRun' : 'save');
    const promise = (async () => {
      await updateStreamAccounts({ accountChanges, streamId, tabId: currentContext.tabId });
      // Swap first, then kick off the import so the new run pulls from the new
      // account. Reload afterward so the page reflects both the swap and the run.
      if (runAfter) await runStream({ streamId, tabId: currentContext.tabId });
      if (currentContext.tabId) chrome.tabs.reload(currentContext.tabId);
      return changeCount;
    })();

    const plural = changeCount > 1;
    showPromiseStatus(promise, {
      error: (err) => err.message || 'An error occurred',
      loading: runAfter
        ? plural
          ? `Swapping ${changeCount} accounts and running…`
          : 'Swapping account and running…'
        : plural
          ? `Swapping ${changeCount} accounts…`
          : 'Swapping account…',
      success: (n) => {
        if (runAfter) return n > 1 ? `Swapped ${n} accounts and started run` : 'Swapped account and started run';
        return n > 1 ? `Swapped ${n} accounts` : 'Swapped account';
      }
    });

    promise
      .then(() => {
        if (mountedRef.current) onBackToDefault?.();
      })
      .catch(() => {})
      .finally(() => {
        if (mountedRef.current) setSubmittingAction(null);
      });
  };

  // Legacy (one-account) datasets save straight from the account detail panel,
  // so build the single change from the picked account rather than the slot form.
  const handleSaveSelected = (account, runAfter = false) => {
    const slot = slots[activeSlotIndex];
    if (!slot) return;
    applyAccountChanges({ [slot.currentAccountId]: account.id }, runAfter);
  };

  const handleSubmit = (runAfter = false) => {
    const accountChanges = {};
    for (const slot of slots) {
      if (slot.replacementId != null && slot.replacementId !== slot.currentAccountId) {
        accountChanges[slot.currentAccountId] = slot.replacementId;
      }
    }
    applyAccountChanges(accountChanges, runAfter);
  };

  if (isLoading) {
    return (
      <Card className='flex h-full w-full items-center justify-center'>
        <Card.Content className='flex flex-col items-center gap-2 py-8'>
          <Spinner size='lg' />
          <p className='text-sm text-muted'>Loading...</p>
        </Card.Content>
      </Card>
    );
  }

  if (!currentContext) return null;

  const objectId = currentContext.domoObject.id;
  const objectName = currentContext.domoObject.metadata?.name || objectId;
  const datasetOwner = currentContext.domoObject.metadata?.details?.owner ?? null;
  // Group ownership isn't supported yet: the owner picker searches users only, so a
  // group owner's id would resolve to nothing. Gate the shortcut to USER owners.
  const datasetOwnerIsUser = datasetOwner?.type === 'USER';
  const activeSlot = slots[activeSlotIndex];

  // Reload re-targets the view at the user's current object; refresh re-fetches the
  // compatible account list in place so newly created or renamed accounts show up.
  const headerActions = [
    buildReloadAction({
      currentContext: liveContext,
      objectId: currentContext.domoObject.id,
      objectType: currentContext.domoObject.typeId,
      onStatusUpdate,
      viewType: 'swapAccount'
    }),
    buildRefreshAction({
      isRefreshing: isLoadingAccounts,
      onRefresh: () =>
        loadAccounts(dataProviderType, currentContext.tabId, {
          openPicker: isLegacyStructure,
          openWhenEmpty: isLegacyStructure
        })
    })
  ];

  return (
    <Card className='flex min-h-0 w-full flex-1 flex-col p-2'>
      <ViewHeader
        actions={headerActions}
        feature='Swap Account for'
        featureIcon={<IconSwapHorizontal />}
        subject={objectName}
        subjectTypeId={currentContext.domoObject.typeId}
        subtext={`ID: ${objectId}`}
        onClose={onBackToDefault}
      />
      <Separator />

      {screen === 'picker' && activeSlot ? (
        <EntityPicker
          adapter={adapter}
          excludeIds={new Set([activeSlot.currentAccountId])}
          key={activeSlotIndex}
          tabId={currentContext.tabId}
          title={isLegacyStructure ? undefined : 'Choose Account'}
          onCancel={isLegacyStructure ? undefined : () => setScreen('form')}
          onSelect={handlePicked}
          filterSlot={
            <div className='flex flex-1 items-center gap-1'>
              <Tooltip delay={200}>
                <Button
                  isIconOnly
                  className='shrink-0'
                  isDisabled={!datasetOwnerIsUser}
                  size='sm'
                  variant='tertiary'
                  onPress={() => {
                    setOwnerFilterMode('include');
                    setOwnerFilter([datasetOwner.id]);
                  }}
                >
                  <IconPersonCard />
                </Button>
                <Tooltip.Content className='max-w-60' offset={4}>
                  Filter to this dataset's owner
                </Tooltip.Content>
              </Tooltip>
              <UserFilterAutocomplete
                domoOrigin={currentContext.origin}
                knownUsers={datasetOwnerIsUser ? [{ displayName: datasetOwner.name, id: datasetOwner.id }] : undefined}
                label='Owner'
                mode={ownerFilterMode}
                placeholder='Filter by owner...'
                tabId={currentContext.tabId}
                value={ownerFilter}
                onChange={setOwnerFilter}
                onModeChange={setOwnerFilterMode}
              />
            </div>
          }
          renderDetailActions={
            isLegacyStructure
              ? (account) => (
                  <div className='flex gap-2'>
                    <Button
                      fullWidth
                      isDisabled={isSubmitting}
                      isPending={submittingAction === 'save'}
                      variant='primary'
                      onPress={() => handleSaveSelected(account, false)}
                    >
                      Save
                    </Button>
                    <Button
                      fullWidth
                      isDisabled={isSubmitting}
                      isPending={submittingAction === 'saveAndRun'}
                      variant='secondary'
                      onPress={() => handleSaveSelected(account, true)}
                    >
                      Save and Run
                    </Button>
                  </div>
                )
              : undefined
          }
        />
      ) : accountsError ? (
        <div className='flex items-center gap-2 py-2'>
          <IconExclamationTriangle className='shrink-0 text-danger' size={16} />
          <span className='min-w-0 flex-1 text-xs text-danger'>Could not load accounts</span>
          <Button
            size='sm'
            variant='ghost'
            onPress={() =>
              loadAccounts(dataProviderType, currentContext.tabId, {
                openPicker: isLegacyStructure,
                openWhenEmpty: isLegacyStructure
              })
            }
          >
            <IconSync />
            Retry
          </Button>
        </div>
      ) : (
        <>
          <div className='flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto'>
            {isLoadingAccounts ? (
              <div className='flex flex-1 items-center justify-center py-8'>
                <Spinner size='lg' />
              </div>
            ) : (
              slots.map((slot, index) => (
                <div className='flex flex-col gap-1' key={slot.currentAccountId}>
                  <span className='line-clamp-2 text-xs break-all text-muted'>
                    Current: {describeAccount(slot.currentAccountId)}
                  </span>
                  {slot.replacementId != null ? (
                    <div className='flex items-center justify-between gap-2'>
                      <span className='min-w-0 truncate text-sm'>
                        → {slot.replacementName} (ID: {slot.replacementId})
                      </span>
                      <Button size='sm' variant='ghost' onPress={() => openPicker(index)}>
                        Change
                      </Button>
                    </div>
                  ) : (
                    <Button fullWidth size='sm' variant='secondary' onPress={() => openPicker(index)}>
                      Choose Account
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>

          <div className='flex shrink-0 gap-2 pt-2'>
            <Button
              fullWidth
              isDisabled={isSubmitting || isLoadingAccounts}
              isPending={submittingAction === 'save'}
              variant='primary'
              onPress={() => handleSubmit(false)}
            >
              Save
            </Button>
            <Button
              fullWidth
              isDisabled={isSubmitting || isLoadingAccounts}
              isPending={submittingAction === 'saveAndRun'}
              variant='secondary'
              onPress={() => handleSubmit(true)}
            >
              Save and Run
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
