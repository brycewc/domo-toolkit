import { Button, Card, Separator, Spinner, Tooltip } from '@heroui/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { EntityPicker } from '@/components/EntityPicker';
import { createAccountPickerAdapter } from '@/components/pickers/accountPickerAdapter';
import { useStatusBar } from '@/hooks/useStatusBar';
import { DomoContext } from '@/models/DomoContext';
import { getAccountIdsForDomoObject, getAccountsForProvider } from '@/services/accounts';
import { updateStreamAccounts } from '@/services/datasets';
import { getSidepanelData } from '@/utils/sidepanel';
import IconExclamationTriangle from '@icons/exclamation-triangle.svg?react';
import IconSync from '@icons/sync.svg?react';
import IconX from '@icons/x.svg?react';

export function SwitchAccountView({ instance = null, onBackToDefault = null, onStatusUpdate = null }) {
  const [isLoading, setIsLoading] = useState(true);
  const [currentContext, setCurrentContext] = useState(null);
  const [streamId, setStreamId] = useState(null);
  const [dataProviderType, setDataProviderType] = useState(null);
  const [slots, setSlots] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [accountsError, setAccountsError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [screen, setScreen] = useState('form');
  const [activeSlotIndex, setActiveSlotIndex] = useState(0);
  const mountedRef = useRef(true);
  const { showPromiseStatus } = useStatusBar();

  useEffect(() => {
    mountedRef.current = true;
    loadData();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const instanceBaseUrl = currentContext?.domoObject?.baseUrl;
  const adapter = useMemo(
    () => createAccountPickerAdapter({ accounts, dataProviderKey: dataProviderType, instanceBaseUrl }),
    [accounts, dataProviderType, instanceBaseUrl]
  );

  const loadData = async () => {
    try {
      const data = await getSidepanelData(instance);
      if (!data || data.type !== 'switchAccount') {
        onBackToDefault?.();
        return;
      }
      const context = data.currentContext ? DomoContext.fromJSON(data.currentContext) : null;
      const domoObject = context?.domoObject;
      const details = domoObject?.metadata?.details;
      const resolvedStreamId = details?.streamId ?? domoObject?.metadata?.parent?.details?.id ?? null;
      const accountIds = getAccountIdsForDomoObject(domoObject);
      if (!context || !resolvedStreamId || accountIds.length === 0) {
        onStatusUpdate?.('Error', 'This dataset has no stream account to switch', 'danger');
        onBackToDefault?.();
        return;
      }
      const provider = details?.dataProviderType || null;
      if (!mountedRef.current) return;
      setCurrentContext(context);
      setStreamId(resolvedStreamId);
      setDataProviderType(provider);
      setSlots(accountIds.map((id) => ({ currentAccountId: id, replacementId: null, replacementName: null })));
      // A single-account dataset has one slot; open its picker straight away so the
      // user doesn't pay an extra tap to reach it.
      loadAccounts(provider, context.tabId, accountIds.length === 1);
    } catch (error) {
      console.error('[SwitchAccountView] Error loading data:', error);
      onStatusUpdate?.('Error', error.message || 'Failed to load context', 'danger');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  const loadAccounts = async (provider, tabId, openIfSingle = false) => {
    setIsLoadingAccounts(true);
    setAccountsError(null);
    try {
      const result = await getAccountsForProvider(provider, tabId);
      if (!mountedRef.current) return;
      setAccounts(result || []);
      if (openIfSingle && (result || []).length > 0) {
        setActiveSlotIndex(0);
        setScreen('picker');
      }
    } catch (error) {
      console.error('[SwitchAccountView] Error loading accounts:', error);
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

  const handleSubmit = () => {
    const accountChanges = {};
    for (const slot of slots) {
      if (slot.replacementId != null && slot.replacementId !== slot.currentAccountId) {
        accountChanges[slot.currentAccountId] = slot.replacementId;
      }
    }
    if (Object.keys(accountChanges).length === 0) {
      onStatusUpdate?.('No changes to apply', 'Choose a different account first', 'warning', 2000);
      return;
    }

    setIsSubmitting(true);
    const changeCount = Object.keys(accountChanges).length;
    const promise = (async () => {
      await updateStreamAccounts({ accountChanges, streamId, tabId: currentContext.tabId });
      if (currentContext.tabId) chrome.tabs.reload(currentContext.tabId);
      return changeCount;
    })();

    showPromiseStatus(promise, {
      error: (err) => err.message || 'An error occurred',
      loading: changeCount > 1 ? `Switching ${changeCount} accounts…` : 'Switching account…',
      success: (n) => (n > 1 ? `Switched ${n} accounts` : 'Switched account')
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
  const activeSlot = slots[activeSlotIndex];

  return (
    <Card className='flex min-h-0 w-full flex-1 flex-col p-2'>
      <Card.Header className='gap-2'>
        <Card.Title className='flex items-start justify-between'>
          <div className='min-w-0 flex-1 pt-1'>
            <div className='truncate'>Switch Account</div>
            <Tooltip>
              <Tooltip.Trigger className='block w-full min-w-0 pr-8'>
                <div className='truncate text-xs font-normal text-muted'>
                  {objectName} (ID: {objectId})
                </div>
              </Tooltip.Trigger>
              <Tooltip.Content className='text-wrap'>
                {objectName} (ID: {objectId})
              </Tooltip.Content>
            </Tooltip>
          </div>
          {onBackToDefault && (
            <Tooltip>
              <Button isIconOnly size='sm' variant='ghost' onPress={onBackToDefault}>
                <IconX />
              </Button>
              <Tooltip.Content className='max-w-60'>Close</Tooltip.Content>
            </Tooltip>
          )}
        </Card.Title>
        <Separator />
      </Card.Header>

      {screen === 'picker' && activeSlot ? (
        <EntityPicker
          adapter={adapter}
          excludeIds={new Set([activeSlot.currentAccountId])}
          key={activeSlotIndex}
          tabId={currentContext.tabId}
          title='Choose account'
          onCancel={() => setScreen('form')}
          onSelect={handlePicked}
        />
      ) : accountsError ? (
        <div className='flex items-center gap-2 py-2'>
          <IconExclamationTriangle className='shrink-0 text-danger' size={16} />
          <span className='min-w-0 flex-1 text-xs text-danger'>Could not load accounts</span>
          <Button size='sm' variant='ghost' onPress={() => loadAccounts(dataProviderType, currentContext.tabId)}>
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
                  <span className='line-clamp-2 break-all text-xs text-muted'>
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
                      Choose account
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>

          <div className='flex shrink-0 flex-col gap-2 pt-2'>
            <Button
              fullWidth
              isDisabled={isSubmitting || isLoadingAccounts}
              isPending={isSubmitting}
              variant='primary'
              onPress={handleSubmit}
            >
              Save
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
