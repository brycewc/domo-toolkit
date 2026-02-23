import { Button, Dropdown, Label, Tooltip } from '@heroui/react';
import {
  IconCsv,
  IconFileTypeXls,
  IconFileDownload,
  IconBrandPython,
  IconFileTypeJs
} from '@tabler/icons-react';
import { js_beautify } from 'js-beautify';
import { exportCard, getCodeEngineCode } from '@/services';
import { useStatusBar } from '@/hooks';

const NON_EXPORTABLE_CARD_TYPES = new Set(['domoapp', 'text']);

const CARD_EXPORT_OPTIONS = [
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

  if (typeId === 'CARD' && NON_EXPORTABLE_CARD_TYPES.has(cardType)) return null;

  if (typeId === 'CODEENGINE_PACKAGE') {
    const language =
      currentContext?.domoObject?.metadata?.details?.language?.toUpperCase();
    const isPython = language === 'PYTHON';

    const handleCodeExport = () => {
      const packageId = currentContext?.domoObject?.id;
      if (!packageId) return;

      const name =
        currentContext.domoObject.metadata?.name || 'code-engine-package';

      const exportPromise = getCodeEngineCode({
        packageId,
        tabId: currentContext.tabId
      }).then(({ code, version }) => {
        const formatted = isPython
          ? code
          : js_beautify(code, { indent_size: 2 });
        const ext = isPython ? 'py' : 'js';
        const mimeType = isPython ? 'text/x-python' : 'application/javascript';
        const blob = new Blob([formatted], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const fileName = `${name}_v${version}.${ext}`;
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        return { fileName };
      });

      showPromiseStatus(exportPromise, {
        loading: `Exporting **${name}** code…`,
        success: (data) => `Downloading **${data.fileName}**`,
        error: (err) => `Could not export code – ${err.message}`
      });
    };

    return (
      <Tooltip delay={400} closeDelay={0}>
        <Button
          variant='tertiary'
          fullWidth
          isDisabled={isDisabled}
          onPress={handleCodeExport}
          className='min-w-36 flex-1 whitespace-normal'
        >
          {isPython ? (
            <IconBrandPython stroke={1.5} />
          ) : (
            <IconFileTypeJs stroke={1.5} />
          )}
          Download Version
        </Button>
        <Tooltip.Content>
          Download code engine package version code as a{' '}
          {isPython ? '.py' : '.js'} file
        </Tooltip.Content>
      </Tooltip>
    );
  }

  const handleCardExport = (format) => {
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
        className='min-w-36 flex-1 whitespace-normal'
      >
        <IconFileDownload stroke={1.5} />
        Export
      </Button>
      <Dropdown.Popover className='w-fit min-w-40' placement='bottom'>
        <Dropdown.Menu onAction={(key) => handleCardExport(key)}>
          {CARD_EXPORT_OPTIONS.map((opt) => (
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
