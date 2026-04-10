import {
  Button,
  Card,
  Checkbox,
  Description,
  Input,
  Label,
  ScrollShadow,
  Separator,
  Spinner,
  Switch,
  TextField,
  Tooltip
} from '@heroui/react';
import {
  IconCheck,
  IconExclamationCircle,
  IconLoader2,
  IconX
} from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';

import { UserComboBox } from '@/components';
import { useStatusBar } from '@/hooks';
import { DomoContext } from '@/models';
import { deleteUser, TRANSFER_TYPES, transferAllOwnership } from '@/services';

export function TransferOwnershipView({
  onBackToDefault = null,
  onStatusUpdate = null
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentContext, setCurrentContext] = useState(null);
  const [sourceUser, setSourceUser] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [deleteAfterTransfer, setDeleteAfterTransfer] = useState(false);
  const [typeStates, setTypeStates] = useState(() =>
    Object.fromEntries(
      TRANSFER_TYPES.map((t) => [t.key, { enabled: true, status: 'idle' }])
    )
  );
  const mountedRef = useRef(true);
  const { showStatus } = useStatusBar();

  useEffect(() => {
    mountedRef.current = true;
    loadData();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadData = async () => {
    try {
      const result = await chrome.storage.session.get(['sidepanelDataList']);
      const data = result.sidepanelDataList;

      if (!data || data.type !== 'transferOwnership') {
        onBackToDefault?.();
        return;
      }

      const context = data.currentContext
        ? DomoContext.fromJSON(data.currentContext)
        : null;

      if (!context) {
        onStatusUpdate?.('Error', 'No context available', 'danger');
        onBackToDefault?.();
        return;
      }

      setCurrentContext(context);

      // Source user from context
      const userId = context.domoObject?.id;
      const userName =
        context.domoObject?.metadata?.name ||
        context.domoObject?.metadata?.displayName ||
        `User ${userId}`;

      if (userId) {
        setSourceUser({ id: userId, name: userName });
      }
    } catch (error) {
      console.error('[TransferOwnershipView] Error loading data:', error);
      onStatusUpdate?.(
        'Error',
        error.message || 'Failed to load context',
        'danger'
      );
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  const toggleType = (key) => {
    setTypeStates((prev) => ({
      ...prev,
      [key]: { ...prev[key], enabled: !prev[key].enabled }
    }));
  };

  const enabledCount = Object.values(typeStates).filter(
    (s) => s.enabled
  ).length;

  const handleSubmit = async () => {
    if (!sourceUser || !selectedUserId) return;

    setIsSubmitting(true);

    const enabledTypes = new Set(
      Object.entries(typeStates)
        .filter(([, s]) => s.enabled)
        .map(([key]) => key)
    );

    try {
      const results = await transferAllOwnership({
        enabledTypes,
        fromUserId: sourceUser.id,
        onTypeProgress: ({ count, result, status, typeKey }) => {
          if (!mountedRef.current) return;
          setTypeStates((prev) => ({
            ...prev,
            [typeKey]: { ...prev[typeKey], count, result, status }
          }));
        },
        tabId: currentContext.tabId,
        toUserId: selectedUserId
      });

      // Check if all succeeded
      let totalSucceeded = 0;
      let totalFailed = 0;
      for (const [, result] of results) {
        totalSucceeded += result.succeeded || 0;
        totalFailed += result.failed || 0;
      }

      if (totalFailed === 0 && deleteAfterTransfer) {
        try {
          await deleteUser(sourceUser.id, currentContext.tabId);
          showStatus(
            'Transfer Complete',
            `Transferred **${totalSucceeded}** object${totalSucceeded !== 1 ? 's' : ''} and deleted user **${sourceUser.name}**`,
            'success',
            5000
          );
        } catch (error) {
          showStatus(
            'Transfer Complete (Delete Failed)',
            `Transferred **${totalSucceeded}** object${totalSucceeded !== 1 ? 's' : ''} but failed to delete user: ${error.message}`,
            'warning',
            5000
          );
        }
      } else if (totalFailed > 0) {
        showStatus(
          'Transfer Partially Complete',
          `**${totalSucceeded}** succeeded, **${totalFailed}** failed`,
          'warning',
          5000
        );
      } else {
        showStatus(
          'Transfer Complete',
          `Transferred **${totalSucceeded}** object${totalSucceeded !== 1 ? 's' : ''}`,
          'success',
          5000
        );
      }
    } catch (error) {
      showStatus(
        'Transfer Failed',
        error.message || 'An error occurred',
        'danger',
        5000
      );
    } finally {
      if (mountedRef.current) setIsSubmitting(false);
    }
  };

  const renderTypeStatus = (state) => {
    if (state.status === 'listing')
      return <IconLoader2 className='animate-spin text-accent' size={16} />;
    if (state.status === 'transferring')
      return <IconLoader2 className='animate-spin text-warning' size={16} />;
    if (state.status === 'done' && state.result?.failed === 0)
      return <IconCheck className='text-success' size={16} />;
    if (state.status === 'done' && state.result?.failed > 0)
      return <IconExclamationCircle className='text-warning' size={16} />;
    if (state.status === 'error')
      return <IconX className='text-danger' size={16} />;
    return null;
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

  return (
    <Card className='flex min-h-0 w-full flex-1 flex-col p-2'>
      <Card.Header className='gap-2'>
        <Card.Title className='flex items-start justify-between'>
          <div className='min-w-0 flex-1 pt-1'>Transfer Ownership</div>
          {onBackToDefault && (
            <Tooltip closeDelay={0} delay={400}>
              <Button
                isIconOnly
                size='sm'
                variant='ghost'
                onPress={onBackToDefault}
              >
                <IconX stroke={1.5} />
              </Button>
              <Tooltip.Content className='text-xs'>Close</Tooltip.Content>
            </Tooltip>
          )}
        </Card.Title>
        <Separator />
      </Card.Header>
      <div className='flex shrink-0 flex-col gap-2'>
        {/* Source user (from context) */}
        <TextField isReadOnly isRequired>
          <Label>Transfer From</Label>
          <Input
            value={sourceUser?.name || 'Unknown User'}
            variant='secondary'
          />
        </TextField>

        {/* Target user picker */}
        <UserComboBox
          avatarBaseUrl={currentContext?.domoObject?.baseUrl}
          label='Transfer To'
          selectedKey={selectedUserId}
          tabId={currentContext?.tabId}
          onSelectionChange={setSelectedUserId}
        />

        {/* Select all / none */}
        <div className='mt-4 flex items-center gap-2'>
          <Checkbox
            id='select-all-types'
            isDisabled={isSubmitting}
            isSelected={enabledCount === TRANSFER_TYPES.length}
            onChange={(checked) => {
              setTypeStates((prev) =>
                Object.fromEntries(
                  Object.entries(prev).map(([key, state]) => [
                    key,
                    { ...state, enabled: checked }
                  ])
                )
              );
            }}
            isIndeterminate={
              enabledCount > 0 && enabledCount < TRANSFER_TYPES.length
            }
          >
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
          </Checkbox>
          <Label className='text-sm font-medium' htmlFor='select-all-types'>
            {enabledCount === TRANSFER_TYPES.length
              ? 'Deselect All'
              : 'Select All'}
          </Label>
        </div>
        <Separator className='mt-1' />
      </div>

      <ScrollShadow
        hideScrollBar
        className='min-h-0 flex-1 overflow-y-auto'
        offset={5}
        orientation='vertical'
      >
        {TRANSFER_TYPES.map((type) => {
          const state = typeStates[type.key];
          return (
            <div
              className='flex items-center justify-between py-1'
              key={type.key}
            >
              <div className='flex items-center gap-2'>
                <Checkbox
                  id={`type-${type.key}`}
                  isDisabled={isSubmitting}
                  isSelected={state.enabled}
                  onChange={() => toggleType(type.key)}
                >
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                </Checkbox>
                <Label className='text-sm' htmlFor={`type-${type.key}`}>
                  {type.label}
                </Label>
              </div>
              <div className='flex items-center gap-1'>
                {state.count > 0 && (
                  <span className='text-xs text-muted'>{state.count}</span>
                )}
                {renderTypeStatus(state)}
              </div>
            </div>
          );
        })}
      </ScrollShadow>
      <Separator />
      {/* Footer: delete toggle + submit */}
      <div className='flex shrink-0 flex-col gap-2'>
        <Switch
          isDisabled={isSubmitting}
          isSelected={deleteAfterTransfer}
          onChange={setDeleteAfterTransfer}
        >
          {({ isSelected }) => (
            <>
              <Switch.Control className={isSelected ? 'bg-danger' : ''}>
                <Switch.Thumb />
              </Switch.Control>
              <Switch.Content>
                <Label>Delete user after transfer</Label>
                <Description>Only if all transfers succeed</Description>
              </Switch.Content>
            </>
          )}
        </Switch>

        <Button
          fullWidth
          isDisabled={!selectedUserId || enabledCount === 0 || isSubmitting}
          isPending={isSubmitting}
          variant='primary'
          onPress={handleSubmit}
        >
          {isSubmitting ? (
            <Spinner color='currentColor' size='sm' />
          ) : (
            `Transfer ${enabledCount} Type${enabledCount !== 1 ? 's' : ''}`
          )}
        </Button>
      </div>
    </Card>
  );
}
