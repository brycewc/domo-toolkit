import { Button, Dropdown, Label, Tooltip } from '@heroui/react';
import { useEffect, useState } from 'react';

import { showReleaseToast } from '@/hooks/useReleaseNotification';
import { useStatusBar } from '@/hooks/useStatusBar';
import { uploadDataFile } from '@/services/files';
import { sendEmail } from '@/services/messages';
import { getCurrentUserId, getFullUserDetails } from '@/services/users';
import { buildExcelBlob, generateExportFilename } from '@/utils/exportData';
import IconAiSparkle from '@icons/ai-sparkle.svg?react';
import IconCode from '@icons/code.svg?react';
import IconEnvelope from '@icons/envelope.svg?react';
import IconShield from '@icons/shield.svg?react';
import IconTrash from '@icons/trash.svg?react';

const DEV_ACTIONS = [
  {
    icon: IconTrash,
    id: 'clearSessionStorage',
    label: 'Clear Session Storage'
  },
  {
    icon: IconAiSparkle,
    id: 'releaseToast',
    label: 'Test Release Toast'
  },
  {
    icon: IconEnvelope,
    id: 'testTransferEmail',
    label: 'Test Transfer Email'
  }
];

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const DEV_LOG_COLUMNS = [
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

export function DevMenu() {
  const [developerMode, setDeveloperMode] = useState(false);
  const [supportModeOverride, setSupportModeOverride] = useState(false);
  const { showStatus } = useStatusBar();

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    chrome.storage.local.get(['developerMode', 'supportModeOverride'], (result) => {
      setDeveloperMode(result.developerMode ?? false);
      setSupportModeOverride(result.supportModeOverride ?? false);
    });

    const handleStorageChange = (changes, areaName) => {
      if (areaName !== 'local') return;
      if (changes.developerMode !== undefined) {
        setDeveloperMode(changes.developerMode.newValue ?? false);
      }
      if (changes.supportModeOverride !== undefined) {
        setSupportModeOverride(changes.supportModeOverride.newValue ?? false);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  if (!import.meta.env.DEV || !developerMode) return null;

  const handleAction = async (key) => {
    switch (key) {
      case 'clearSessionStorage':
        await clearSessionStorage(showStatus);
        break;
      case 'releaseToast':
        showReleaseToast();
        break;
      case 'testTransferEmail':
        await runTestTransferEmail(showStatus);
        break;
      case 'toggleSupportMode':
        chrome.storage.local.set({ supportModeOverride: !supportModeOverride });
        break;
      default:
        break;
    }
  };

  const menuItems = [
    ...DEV_ACTIONS,
    { icon: IconShield, id: 'toggleSupportMode', label: `${supportModeOverride ? 'Exit' : 'Enter'} Support Mode` }
  ];

  return (
    <Dropdown>
      <Tooltip>
        <Button fullWidth className='min-w-36 flex-1 whitespace-normal' variant='tertiary'>
          <IconCode />
          Dev
        </Button>
        <Tooltip.Content offset={4}>Developer testing utilities</Tooltip.Content>
      </Tooltip>
      <Dropdown.Popover className='w-fit min-w-60' placement='bottom'>
        <Dropdown.Menu onAction={handleAction}>
          {menuItems.map((action) => (
            <Dropdown.Item id={action.id} key={action.id} textValue={action.label}>
              <action.icon className='size-4 shrink-0' />
              <Label>{action.label}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

/**
 * Wipe chrome.storage.session. Everything there is either a re-derivable backup
 * (the background's in-memory tab-context and instance-user caches survive, and
 * rewrite their backups on the next update) or a transient handoff re-created on
 * the next action, so clearing is non-destructive: no settings live here (those
 * are in chrome.storage.local / .sync). An open side panel in this window resets
 * to its default view because its data record is one of the keys removed.
 */
async function clearSessionStorage(showStatus) {
  try {
    await chrome.storage.session.clear();
    showStatus('Session Storage Cleared', 'Removed all cached contexts and handoff data', 'success');
  } catch (error) {
    showStatus('Clear Failed', error.message || 'Unknown error', 'danger');
  }
}

/**
 * Exercises the full Transfer Ownership email pipeline against the current
 * user — looks them up, builds a one-row xlsx structurally identical to the
 * real attachment, uploads it, sends the email to their own address. No
 * actual ownership transfer happens; the row carries a TEST marker so the
 * recipient can tell it's a dev ping.
 */
async function runTestTransferEmail(showStatus) {
  try {
    const userId = await getCurrentUserId();
    const user = await getFullUserDetails(userId);
    const email = user?.emailAddress || user?.email;
    const displayName = user?.displayName || `User ${userId}`;
    if (!email) {
      showStatus('Dev Email Failed', 'Could not resolve an email for the current user', 'danger');
      return;
    }

    const date = new Date().toISOString().slice(0, -5);
    const rows = [
      {
        'Date': date,
        'New Owner ID': userId,
        'New Owner Name': displayName,
        'Notes': 'Dev Menu smoke test — no actual ownership transfer occurred',
        'Object ID': 'dev-menu-test',
        'Object Name': 'Dev Menu Test Row',
        'Object Type': 'TEST',
        'Previous Owner ID': userId,
        'Previous Owner Name': displayName,
        'Status': 'TEST'
      }
    ];

    const blob = await buildExcelBlob(rows, DEV_LOG_COLUMNS, 'Transfer Log');
    const filename = `${generateExportFilename('dev-transfer-test')}.xlsx`;
    const dataFileId = await uploadDataFile(blob, filename, XLSX_MIME_TYPE);

    await sendEmail({
      bodyHtml:
        '<p>This is a <strong>Dev Menu</strong> smoke test of the Transfer Ownership email pipeline.</p><p>No ownership was actually transferred. The attached Excel contains one placeholder row with the same column shape a real transfer would produce.</p>',
      dataFileAttachments: [dataFileId],
      recipientEmails: email,
      subject: 'Dev Menu — Transfer Email Pipeline Test'
    });

    showStatus('Dev Email Sent', `Delivered to **${email}**`, 'success');
  } catch (error) {
    showStatus('Dev Email Failed', error.message || 'Unknown error', 'danger');
  }
}
