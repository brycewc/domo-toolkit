import { Button, Dropdown, Label } from '@heroui/react';
import { IconCode, IconMail, IconSparkles } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import { showReleaseToast, useStatusBar } from '@/hooks';
import {
  getCurrentUserId,
  getFullUserDetails,
  sendEmail,
  uploadDataFile
} from '@/services';
import { buildExcelBlob, generateExportFilename } from '@/utils';

const DEV_ACTIONS = [
  {
    icon: IconSparkles,
    id: 'releaseToast',
    label: 'Test Release Toast'
  },
  {
    icon: IconMail,
    id: 'testTransferEmail',
    label: 'Test Transfer Email (self)'
  }
];

const XLSX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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
  const { showStatus } = useStatusBar();

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    chrome.storage.local.get(['developerMode'], (result) => {
      setDeveloperMode(result.developerMode ?? false);
    });

    const handleStorageChange = (changes, areaName) => {
      if (areaName === 'local' && changes.developerMode !== undefined) {
        setDeveloperMode(changes.developerMode.newValue ?? false);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  if (!import.meta.env.DEV || !developerMode) return null;

  const handleAction = async (key) => {
    switch (key) {
      case 'releaseToast':
        showReleaseToast();
        break;
      case 'testTransferEmail':
        await runTestTransferEmail(showStatus);
        break;
      default:
        break;
    }
  };

  return (
    <Dropdown>
      <Button
        fullWidth
        className='min-w-36 flex-1 whitespace-normal'
        variant='tertiary'
      >
        <IconCode stroke={1.5} />
        Dev
      </Button>
      <Dropdown.Popover className='w-fit min-w-40' placement='bottom'>
        <Dropdown.Menu onAction={handleAction}>
          {DEV_ACTIONS.map((action) => (
            <Dropdown.Item
              id={action.id}
              key={action.id}
              textValue={action.label}
            >
              <action.icon className='size-5 shrink-0' stroke={1.5} />
              <Label>{action.label}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
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
      showStatus(
        'Dev Email Failed',
        'Could not resolve an email for the current user',
        'danger'
      );
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
    showStatus(
      'Dev Email Failed',
      error.message || 'Unknown error',
      'danger'
    );
  }
}
