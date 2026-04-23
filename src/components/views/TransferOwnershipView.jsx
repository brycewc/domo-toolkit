import {
  Button,
  Card,
  Checkbox,
  Description,
  Disclosure,
  Input,
  Label,
  ScrollShadow,
  Separator,
  Spinner,
  Switch,
  TextField,
  Tooltip
} from '@heroui/react';
import { IconCheck, IconLoader2, IconUserUp, IconX } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';

import { UserComboBox } from '@/components';
import { useStatusBar } from '@/hooks';
import { DomoContext } from '@/models';
import {
  countOwned,
  deleteUser,
  getFullUserDetails,
  getUserDetails,
  sendEmail,
  TRANSFER_TYPES,
  transferAllOwnership,
  TYPE_KEY_TO_LOG_TYPE,
  uploadDataFile
} from '@/services';
import {
  buildExcelBlob,
  generateExportFilename,
  getSidepanelData
} from '@/utils';

const LOG_COLUMNS = [
  { accessorKey: 'Object Type', header: 'Object Type' },
  { accessorKey: 'Object ID', header: 'Object ID' },
  { accessorKey: 'Object Name', header: 'Object Name' },
  { accessorKey: 'Date', header: 'Date' },
  { accessorKey: 'Status', header: 'Status' },
  { accessorKey: 'Notes', header: 'Notes' },
  { accessorKey: 'Previous Owner ID', header: 'Previous Owner ID' },
  { accessorKey: 'Previous Owner Name', header: 'Previous Owner Name' },
  { accessorKey: 'New Owner ID', header: 'New Owner ID' },
  { accessorKey: 'New Owner Name', header: 'New Owner Name' }
];

const XLSX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function TransferOwnershipView({ onBackToDefault = null, onStatusUpdate = null }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentContext, setCurrentContext] = useState(null);
  const [sourceUser, setSourceUser] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedDisplayName, setSelectedDisplayName] = useState(null);
  const [manager, setManager] = useState(null);
  const [deleteAfterTransfer, setDeleteAfterTransfer] = useState(false);
  const [emailNewOwner, setEmailNewOwner] = useState(false);
  const [targetUser, setTargetUser] = useState(null); // { email, displayName }
  const [typeStates, setTypeStates] = useState(() =>
    Object.fromEntries(
      TRANSFER_TYPES.map((t) => [t.key, { count: null, enabled: true, status: 'idle' }])
    )
  );
  const mountedRef = useRef(true);
  const seededItemsRef = useRef({});
  const { showStatus } = useStatusBar();

  useEffect(() => {
    mountedRef.current = true;
    loadData();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Resolve email + displayName for the destination user whenever it changes.
  // Powers both the email-toggle enable state and the attachment's "New Owner
  // Name" column. Reset on every change so the toggle disables until the new
  // lookup resolves.
  useEffect(() => {
    if (!selectedUserId || !currentContext?.tabId) {
      setTargetUser(null);
      return;
    }
    setTargetUser(null);
    let cancelled = false;
    getFullUserDetails(selectedUserId, currentContext.tabId)
      .then((user) => {
        if (cancelled || !mountedRef.current || !user) return;
        setTargetUser({
          displayName: user.displayName || null,
          email: user.emailAddress || user.email || null
        });
      })
      .catch(() => {
        if (!cancelled && mountedRef.current) setTargetUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedUserId, currentContext?.tabId]);

  const loadData = async () => {
    try {
      const data = await getSidepanelData();

      if (!data || data.type !== 'transferOwnership') {
        onBackToDefault?.();
        return;
      }

      const context = data.currentContext ? DomoContext.fromJSON(data.currentContext) : null;

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

      // Resolve the source user's manager for the quick-set button
      const reportsTo = context.domoObject?.metadata?.context?.reportsTo;
      if (reportsTo && context.tabId) {
        getUserDetails(reportsTo, context.tabId)
          .then((details) => {
            if (mountedRef.current && details) {
              setManager({
                active: details.active,
                id: details.id,
                name: details.displayName
              });
            }
          })
          .catch(() => {});
      }

      // Determine forbidden types once (used for both prelist filtering and UI)
      const userRights = context.user?.metadata?.USER_RIGHTS || [];
      const forbidden = new Set(
        TRANSFER_TYPES.filter(
          (t) => t.requiredAuthority && !userRights.includes(t.requiredAuthority)
        ).map((t) => t.key)
      );

      // Seeded path: GetOwnedObjectsView handed off pre-fetched raw owned data
      if (data.seededOwnedObjects && userId) {
        seededItemsRef.current = data.seededOwnedObjects;
        setTypeStates((prev) => {
          const next = { ...prev };
          for (const t of TRANSFER_TYPES) {
            if (forbidden.has(t.key)) continue;
            const seed = data.seededOwnedObjects[t.key];
            // appStudioApps uses a different getter for transfer — don't mark
            // as prelisted; let Phase 1 re-fetch via getOwnedForTransfer.
            if (t.getOwnedForTransfer) continue;
            const count = countOwned(t.key, seed);
            next[t.key] = {
              count,
              enabled: count > 0 ? next[t.key].enabled : false,
              status: 'prelisted'
            };
          }
          return next;
        });

        // Prelist any remaining non-seeded types (e.g. appStudioApps) so the
        // UI is still fully transparent after a partial-handoff.
        const remaining = TRANSFER_TYPES.filter(
          (t) => !forbidden.has(t.key) && (t.getOwnedForTransfer || !data.seededOwnedObjects[t.key])
        );
        if (remaining.length > 0) {
          prelistTypes(remaining, userId, context.tabId);
        }
      } else if (userId && context.tabId) {
        const toList = TRANSFER_TYPES.filter((t) => !forbidden.has(t.key));
        prelistTypes(toList, userId, context.tabId);
      }
    } catch (error) {
      console.error('[TransferOwnershipView] Error loading data:', error);
      onStatusUpdate?.('Error', error.message || 'Failed to load context', 'danger');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  const prelistTypes = async (types, fromUserId, tid) => {
    setTypeStates((prev) => {
      const next = { ...prev };
      for (const t of types) {
        next[t.key] = { ...next[t.key], count: null, status: 'prelisting' };
      }
      return next;
    });

    await Promise.allSettled(
      types.map(async (type) => {
        try {
          const listOwned = type.getOwnedForTransfer || type.getOwned;
          const owned = await listOwned(fromUserId, tid);
          if (!mountedRef.current) return;
          seededItemsRef.current[type.key] = owned;
          const count = countOwned(type.key, owned);
          setTypeStates((prev) => ({
            ...prev,
            [type.key]: {
              count,
              enabled: count > 0 ? prev[type.key].enabled : false,
              status: 'prelisted'
            }
          }));
        } catch {
          if (!mountedRef.current) return;
          setTypeStates((prev) => ({
            ...prev,
            [type.key]: { count: 0, enabled: false, status: 'error' }
          }));
        }
      })
    );
  };

  const toggleType = (key) => {
    setTypeStates((prev) => ({
      ...prev,
      [key]: { ...prev[key], enabled: !prev[key].enabled }
    }));
  };

  const userRights = currentContext?.user?.metadata?.USER_RIGHTS || [];
  const canDeleteUsers = userRights.includes('user.edit');

  const forbiddenTypes = new Set(
    TRANSFER_TYPES.filter(
      (t) => t.requiredAuthority && !userRights.includes(t.requiredAuthority)
    ).map((t) => t.key)
  );

  const enabledCount = Object.entries(typeStates).filter(
    ([key, s]) => s.enabled && !forbiddenTypes.has(key) && s.count > 0
  ).length;

  const selectableCount = Object.entries(typeStates).filter(
    ([key, s]) => !forbiddenTypes.has(key) && s.count !== 0
  ).length;

  const hasTransferStarted = Object.values(typeStates).some(
    (s) => s.status !== 'idle' && s.status !== 'prelisting' && s.status !== 'prelisted'
  );

  const isPrelistSettled = Object.entries(typeStates).every(
    ([key, s]) =>
      forbiddenTypes.has(key) ||
      s.status === 'prelisted' ||
      s.status === 'error' ||
      s.status === 'listing' ||
      s.status === 'transferring' ||
      s.status === 'done'
  );

  const handleSubmit = async () => {
    if (!sourceUser || !selectedUserId) return;

    setIsSubmitting(true);

    const enabledTypes = new Set(
      Object.entries(typeStates)
        .filter(([key, s]) => s.enabled && !forbiddenTypes.has(key) && s.count > 0)
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
        seededOwnedObjects: seededItemsRef.current,
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

      // Email the new owner a summary + attachment. Runs before the delete
      // step so the recipient gets their context even if the delete fails or
      // the extension session ends early.
      if (emailNewOwner && targetUser?.email && totalSucceeded > 0) {
        try {
          const rows = buildTransferLogRows({
            fromUserId: sourceUser.id,
            fromUserName: sourceUser.name,
            results,
            toUserId: selectedUserId,
            toUserName: targetUser.displayName
          });
          const blob = await buildExcelBlob(rows, LOG_COLUMNS, 'Transfer Log');
          const filename = `${generateExportFilename('transferred-objects')}.xlsx`;
          const dataFileId = await uploadDataFile(
            blob,
            filename,
            XLSX_MIME_TYPE,
            currentContext.tabId
          );
          await sendEmail(
            {
              bodyHtml: renderEmailBody({
                sourceUserName: sourceUser.name,
                totalFailed,
                totalSucceeded
              }),
              dataFileAttachments: [dataFileId],
              recipientEmails: targetUser.email,
              subject: `Ownership transferred to you from ${sourceUser.name}`
            },
            currentContext.tabId
          );
        } catch (err) {
          showStatus(
            'Email Not Sent',
            err.message || 'Failed to email new owner',
            'warning'
          );
          // Intentionally do not abort the delete step below — the transfer
          // itself succeeded; the email is a courtesy.
        }
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
          setTimeout(() => onBackToDefault?.(), 3000);
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
        setTimeout(() => onBackToDefault?.(), 3000);
      }
    } catch (error) {
      showStatus('Transfer Failed', error.message || 'An error occurred', 'danger', 5000);
    } finally {
      if (mountedRef.current) setIsSubmitting(false);
    }
  };

  const renderTypeRow = (type) => {
    const state = typeStates[type.key];
    const { count, enabled, result, status } = state;

    // Pre-transfer states: show checkbox with count/spinner on the right.
    if (status === 'idle' || status === 'prelisting' || status === 'prelisted') {
      const isForbidden = forbiddenTypes.has(type.key);
      const isZero = status === 'prelisted' && count === 0;
      const checkboxDisabled = isForbidden || isSubmitting || hasTransferStarted || isZero;
      return (
        <div className='flex items-center justify-between py-1' key={type.key}>
          <div className='flex items-center gap-2'>
            <Checkbox
              id={`type-${type.key}`}
              isDisabled={checkboxDisabled}
              isSelected={!isForbidden && !isZero && enabled}
              onChange={() => toggleType(type.key)}
            >
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
            </Checkbox>
            <Label
              className={`text-sm ${isForbidden || isZero ? 'text-muted' : ''}`}
              htmlFor={`type-${type.key}`}
            >
              {type.label}
            </Label>
          </div>
          {isForbidden ? (
            <span className='shrink-0 text-xs text-muted'>{type.requiredAuthority}</span>
          ) : status === 'prelisting' ? (
            <IconLoader2 className='shrink-0 animate-spin text-accent' size={14} />
          ) : status === 'prelisted' ? (
            <span className='shrink-0 text-xs text-muted'>({count})</span>
          ) : null}
        </div>
      );
    }

    // Listing: spinner + "Searching..."
    if (status === 'listing') {
      return (
        <div className='flex items-center justify-between py-1' key={type.key}>
          <div className='flex items-center gap-2'>
            <IconLoader2 className='shrink-0 animate-spin text-accent' size={18} />
            <span className='text-sm'>{type.label}</span>
          </div>
          <span className='shrink-0 text-xs text-muted'>Searching...</span>
        </div>
      );
    }

    // Transferring: spinner + count
    if (status === 'transferring') {
      return (
        <div className='flex items-center justify-between py-1' key={type.key}>
          <div className='flex items-center gap-2'>
            <IconLoader2 className='shrink-0 animate-spin text-warning' size={18} />
            <span className='text-sm'>{type.label}</span>
          </div>
          <span className='shrink-0 text-xs text-muted'>{count > 0 ? `(${count})` : ''}</span>
        </div>
      );
    }

    // Done with all succeeded (or 0 items)
    if (status === 'done' && (!result?.failed || result.failed === 0)) {
      return (
        <div className='flex items-center justify-between py-1' key={type.key}>
          <div className='flex items-center gap-2'>
            <IconCheck className='shrink-0 text-success' size={18} />
            <span className='text-sm'>{type.label}</span>
          </div>
          <span className='shrink-0 text-xs text-success'>
            {count > 0 ? `${result?.succeeded ?? count}/${count}` : 'None found'}
          </span>
        </div>
      );
    }

    // Done with some failures — expandable error details
    if (status === 'done' && result?.failed > 0) {
      return (
        <Disclosure key={type.key}>
          <div className='flex items-center justify-between py-1'>
            <div className='flex items-center gap-2'>
              <IconX className='shrink-0 text-danger' size={18} />
              <span className='text-sm'>{type.label}</span>
            </div>
            <Disclosure.Heading>
              <Button
                className='h-auto min-w-0 gap-1 px-1 py-0 text-xs text-danger'
                slot='trigger'
                variant='ghost'
              >
                {result.succeeded}/{count}
                <Disclosure.Indicator />
              </Button>
            </Disclosure.Heading>
          </div>
          <Disclosure.Content>
            <Disclosure.Body className='pt-0 pb-1 pl-7'>
              <ul className='list-none space-y-0.5'>
                {result.errors.slice(0, 10).map((err, i) => (
                  <li className='text-xs text-muted' key={i}>
                    <span className='font-mono'>{err.id}</span>
                    {': '}
                    {err.error}
                  </li>
                ))}
                {result.errors.length > 10 && (
                  <li className='text-xs text-muted'>...and {result.errors.length - 10} more</li>
                )}
              </ul>
            </Disclosure.Body>
          </Disclosure.Content>
        </Disclosure>
      );
    }

    // Error (listing or transfer failed entirely)
    if (status === 'error') {
      return (
        <div className='flex items-center justify-between py-1' key={type.key}>
          <div className='flex items-center gap-2'>
            <IconX className='shrink-0 text-danger' size={18} />
            <span className='text-sm'>{type.label}</span>
          </div>
          <span className='shrink-0 text-xs text-danger'>Failed</span>
        </div>
      );
    }

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
              <Button isIconOnly size='sm' variant='ghost' onPress={onBackToDefault}>
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
        <TextField isReadOnly isRequired className='pointer-events-none'>
          <Label>Transfer From</Label>
          <Input value={sourceUser?.name || 'Unknown User'} variant='secondary' />
        </TextField>

        {/* Target user picker */}
        <div className='flex items-end gap-1'>
          <UserComboBox
            avatarBaseUrl={currentContext?.domoObject?.baseUrl}
            className='min-w-0 flex-1'
            label='Transfer To'
            selectedDisplayName={selectedDisplayName}
            selectedKey={selectedUserId}
            tabId={currentContext?.tabId}
            onSelectionChange={(key) => {
              setSelectedUserId(key);
              setSelectedDisplayName(null);
            }}
          />
          <Tooltip closeDelay={0} delay={400}>
            <Button
              isIconOnly
              isDisabled={isSubmitting || !manager || !manager.active}
              size='md'
              variant='tertiary'
              onPress={() => {
                setSelectedUserId(manager.id);
                setSelectedDisplayName(manager.name);
              }}
            >
              <IconUserUp stroke={1.5} />
            </Button>
            <Tooltip.Content className='text-xs'>
              {manager?.active
                ? `Transfer to manager: ${manager.name}`
                : manager
                  ? `Manager ${manager.name} is inactive`
                  : 'No manager assigned'}
            </Tooltip.Content>
          </Tooltip>
        </div>

        {/* Select all / none */}
        <Checkbox
          id='select-all-types'
          isDisabled={isSubmitting || hasTransferStarted}
          isIndeterminate={enabledCount > 0 && enabledCount < selectableCount}
          isSelected={selectableCount > 0 && enabledCount === selectableCount}
          onChange={(checked) => {
            setTypeStates((prev) =>
              Object.fromEntries(
                Object.entries(prev).map(([key, state]) => [
                  key,
                  {
                    ...state,
                    enabled: forbiddenTypes.has(key) || state.count === 0 ? false : checked
                  }
                ])
              )
            );
          }}
        >
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
          <Checkbox.Content>
            <Label className='text-sm font-medium' htmlFor='select-all-types'>
              {enabledCount === selectableCount && selectableCount > 0
                ? 'Deselect All'
                : 'Select All'}
            </Label>
          </Checkbox.Content>
        </Checkbox>
        <Separator className='mt-1' />
      </div>

      <ScrollShadow
        hideScrollBar
        className='min-h-0 flex-1 overflow-y-auto px-1'
        offset={5}
        orientation='vertical'
      >
        {TRANSFER_TYPES.map((type) => renderTypeRow(type))}
      </ScrollShadow>
      <Separator />
      {/* Footer: email + delete toggles + submit */}
      <div className='flex shrink-0 flex-col gap-2'>
        <Switch
          isDisabled={!targetUser?.email || isSubmitting}
          isSelected={emailNewOwner && !!targetUser?.email}
          onChange={setEmailNewOwner}
        >
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <Switch.Content>
            <Label>Email new owner with summary</Label>
            <Description>
              {targetUser?.email
                ? `Sends an Excel attachment to ${targetUser.email}`
                : selectedUserId
                  ? 'Email unavailable for selected user'
                  : 'Select a destination user to enable'}
            </Description>
          </Switch.Content>
        </Switch>

        {canDeleteUsers && (
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
        )}

        <Button
          fullWidth
          isDisabled={!selectedUserId || enabledCount === 0 || isSubmitting || !isPrelistSettled}
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

function buildTransferLogRows({
  fromUserId,
  fromUserName,
  results,
  toUserId,
  toUserName
}) {
  const date = new Date().toISOString().slice(0, -5);
  const rows = [];
  for (const [typeKey, result] of results) {
    const typeDef = TRANSFER_TYPES.find((t) => t.key === typeKey);
    const logType = TYPE_KEY_TO_LOG_TYPE[typeKey];
    const failedById = new Map((result.errors || []).map((e) => [e.id, e.error]));
    // `{id: 'all'}` sentinel means the whole batch failed — every row in this
    // type should be marked FAILED with the shared error message.
    const wholeBatchError = failedById.get('all');
    for (const item of result.attempted ?? []) {
      const isFailure = wholeBatchError !== undefined || failedById.has(item.id);
      rows.push({
        'Date': date,
        'New Owner ID': toUserId,
        'New Owner Name': toUserName,
        'Notes': isFailure ? (wholeBatchError ?? failedById.get(item.id)) : '',
        'Object ID': item.id,
        'Object Name': item.name,
        'Object Type': item.subType
          ? item.subType.toUpperCase()
          : (logType ?? typeDef?.label ?? typeKey),
        'Previous Owner ID': fromUserId,
        'Previous Owner Name': fromUserName,
        'Status': isFailure ? 'FAILED' : 'TRANSFERRED'
      });
    }
  }
  return rows;
}

function renderEmailBody({ sourceUserName, totalFailed, totalSucceeded }) {
  const objectWord = totalSucceeded === 1 ? 'object' : 'objects';
  const failedLine =
    totalFailed > 0
      ? `<p>${totalFailed} object${totalFailed === 1 ? '' : 's'} could not be transferred and ${totalFailed === 1 ? 'is' : 'are'} included in the attachment with a FAILED status.</p>`
      : '';
  return `<p>Ownership of <strong>${totalSucceeded}</strong> ${objectWord} has been transferred to you from <strong>${sourceUserName}</strong>.</p><p>A complete list is attached.</p>${failedLine}`;
}
