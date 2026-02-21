import { useState } from 'react';
import { Button, Dropdown, Label, Spinner } from '@heroui/react';
import {
  IconFileSpreadsheet,
  IconTableExport,
  IconCsv
} from '@tabler/icons-react';
import { AnimatedCheck } from '@/components';
import { exportCard } from '@/services';

const EXPORTABLE_TYPES = new Set(['CARD']);

const NON_EXPORTABLE_CARD_TYPES = new Set(['domoapp', 'text']);

const EXPORT_OPTIONS = [
  {
    id: 'excel',
    label: 'Export as Excel',
    icon: IconFileSpreadsheet
  },
  {
    id: 'csv',
    label: 'Export as CSV',
    icon: IconCsv
  }
];

export function Export({ currentContext, onStatusUpdate, isDisabled }) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const typeId = currentContext?.domoObject?.typeId;
  const cardType =
    currentContext?.domoObject?.metadata?.details?.type?.toLowerCase();

  if (!EXPORTABLE_TYPES.has(typeId)) return null;
  if (typeId === 'CARD' && NON_EXPORTABLE_CARD_TYPES.has(cardType))
    return null;

  const handleExport = async (format) => {
    const objectId = currentContext?.domoObject?.id;
    if (!objectId) return;

    setIsLoading(true);

    try {
      const title =
        currentContext.domoObject.metadata?.name ||
        currentContext.domoObject.id;

      const { fileName } = await exportCard({
        cardId: objectId,
        cardTitle: title,
        format,
        tabId: currentContext.tabId
      });

      setIsSuccess(true);
      setTimeout(() => setIsSuccess(false), 2000);
      onStatusUpdate?.(
        'Export Started',
        `Downloading **${fileName}**`,
        'success',
        2000
      );
    } catch (error) {
      console.error('Export failed:', error);
      onStatusUpdate?.(
        'Export Failed',
        `Could not export card **${objectId}** – ${error.message}`,
        'danger',
        4000
      );
    } finally {
      setIsLoading(false);
    }
  };

  const buttonDisabled = isDisabled || isLoading;

  return (
    <Dropdown isDisabled={buttonDisabled}>
      <Button
        variant='tertiary'
        fullWidth
        isDisabled={buttonDisabled}
        isPending={isLoading}
        className='min-w-fit flex-1 basis-[48%]'
      >
        {({ isPending }) => {
          if (isPending) return <Spinner color='currentColor' size='sm' />;
          if (isSuccess) return <AnimatedCheck />;
          return (
            <>
              <IconTableExport stroke={1.5} />
              Export
            </>
          );
        }}
      </Button>
      <Dropdown.Popover className='w-fit min-w-40' placement='bottom left'>
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
