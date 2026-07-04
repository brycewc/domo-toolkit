import { Avatar } from '@heroui/react';

import { getInitials } from '@/utils/general';

/**
 * Build an EntityPicker adapter for switching a dataset's account.
 *
 * Accounts are pre-fetched per connector (every option is already compatible), so the
 * adapter is a static source: the picker filters the supplied list client-side. Account
 * names are routinely duplicated, so the row carries ID and owner inline and the detail
 * panel adds the owner avatar, dates, connected-dataset count, and validity.
 *
 * @param {Object} params
 * @param {Array<Object>} params.accounts - Compatible accounts (from getAccountsForProvider)
 * @param {string} params.dataProviderKey - Connector key, for the provider icon
 * @param {string} [params.instanceBaseUrl] - Base URL for provider icons and owner avatars
 * @returns {Object} EntityPicker adapter
 */
export function createAccountPickerAdapter({ accounts, dataProviderKey, instanceBaseUrl }) {
  return {
    emptyLabel: 'No compatible accounts found',
    getHref: instanceBaseUrl ? (account) => `${instanceBaseUrl}/datacenter/accounts?id=${account.id}` : undefined,
    getKey: (account) => account.id,
    getTitle: (account) => account.name,
    items: accounts,
    paginated: false,
    renderDetail: (account) => <AccountDetail account={account} instanceBaseUrl={instanceBaseUrl} />,
    renderRow: (account) => (
      <AccountRow account={account} dataProviderKey={dataProviderKey} instanceBaseUrl={instanceBaseUrl} />
    ),
    searchPlaceholder: 'Search accounts by name or ID...'
  };
}

function AccountDetail({ account, instanceBaseUrl }) {
  const created = formatDate(account.createDate);
  const modified = formatDate(account.lastModified);
  const avatarSrc =
    instanceBaseUrl && account.ownerId
      ? `${instanceBaseUrl}/api/content/v1/avatar/${account.ownerType}/${account.ownerId}?size=100`
      : undefined;
  return (
    <div className='flex flex-col gap-3 p-1'>
      <div className='flex items-center gap-2'>
        <Avatar size='sm'>
          <Avatar.Image src={avatarSrc} />
          <Avatar.Fallback>{getInitials(account.owner || '?')}</Avatar.Fallback>
        </Avatar>
        <div className='flex min-w-0 flex-col'>
          <span className='text-xs text-muted'>Owner</span>
          <span className='truncate text-sm'>{account.owner || 'Unknown'}</span>
        </div>
      </div>
      <DetailRow label='Account ID' value={account.id} />
      {created && <DetailRow label='Created' value={created} />}
      {modified && <DetailRow label='Last modified' value={modified} />}
      {account.datasetCount != null && <DetailRow label='Connected datasets' value={account.datasetCount} />}
      <DetailRow label='Status' value={account.valid ? 'Valid' : 'Invalid credentials'} />
    </div>
  );
}

function AccountRow({ account, dataProviderKey, instanceBaseUrl }) {
  const count = account.datasetCount;
  const meta = ['ID: ' + account.id, count != null ? `${count} dataset${count === 1 ? '' : 's'}` : null]
    .filter(Boolean)
    .join(' • ');
  return (
    <>
      <div className='size-8 shrink-0 overflow-hidden rounded-sm bg-surface-secondary'>
        {dataProviderKey && instanceBaseUrl ? (
          <img
            alt=''
            className='size-full object-contain'
            src={`${instanceBaseUrl}/api/data/v1/providers/${dataProviderKey}/images/96.png`}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : null}
      </div>
      <div className='flex min-w-0 flex-col'>
        <span className='line-clamp-2 break-all text-sm'>{account.name}</span>
        <span className='line-clamp-1 break-all text-xs text-muted'>{meta}</span>
      </div>
    </>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className='flex items-baseline justify-between gap-2'>
      <span className='shrink-0 text-xs text-muted'>{label}</span>
      <span className='min-w-0 truncate text-right text-sm'>{value}</span>
    </div>
  );
}

function formatDate(epochMs) {
  if (typeof epochMs !== 'number' || !Number.isFinite(epochMs) || epochMs <= 0) return null;
  const date = new Date(epochMs);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString();
}
