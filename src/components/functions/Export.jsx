import { Button, Dropdown, Label } from '@heroui/react';
import {
  IconCsv,
  IconFileTypeXls,
  IconFileDownload
} from '@tabler/icons-react';
import { exportCard } from '@/services';
import { useStatusBar } from '@/hooks';

const EXPORTABLE_TYPES = new Set(['CARD']);

const NON_EXPORTABLE_CARD_TYPES = new Set(['domoapp', 'text']);

const EXPORT_OPTIONS = [
  {
    id: 'excel',
    label: 'Export as Excel',
    icon: IconFileTypeXls
  },
  {
    id: 'csv',
    label: 'Export as CSV',
    icon: IconCsv
  }
];

export function Export({ currentContext, isDisabled }) {
  const { showPromiseStatus } = useStatusBar();

  const typeId = currentContext?.domoObject?.typeId;
  const cardType =
    currentContext?.domoObject?.metadata?.details?.type?.toLowerCase();

  if (!EXPORTABLE_TYPES.has(typeId)) return null;
  if (typeId === 'CARD' && NON_EXPORTABLE_CARD_TYPES.has(cardType)) return null;

  const handleExport = (format) => {
    const objectId = currentContext?.domoObject?.id;
    if (!objectId) return;

    const title =
      currentContext.domoObject.metadata?.name || currentContext.domoObject.id;

    showPromiseStatus(
      exportCard({
        cardId: objectId,
        cardTitle: title,
        format,
        tabId: currentContext.tabId
      }),
      {
        loading: `Exporting **${title}**…`,
        success: (data) => `Downloading **${data.fileName}**`,
        error: (err) => `Could not export card **${objectId}** – ${err.message}`
      }
    );
  };

  return (
    <Dropdown isDisabled={isDisabled}>
      <Button
        variant='tertiary'
        fullWidth
        isDisabled={isDisabled}
        className='min-w-fit flex-1 basis-[48%]'
      >
        <IconFileDownload stroke={1.5} />
        Export
      </Button>
      <Dropdown.Popover className='w-fit min-w-40' placement='bottom'>
        <Dropdown.Menu onAction={(key) => handleExport(key)}>
          {EXPORT_OPTIONS.map((opt) => (
            <Dropdown.Item key={opt.id} id={opt.id} textValue={opt.label}>
              <opt.icon className='size-4 shrink-0' stroke={1.5} />
              <Label>{opt.label}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
