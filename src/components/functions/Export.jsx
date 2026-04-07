import { Button, Dropdown, Label, Tooltip } from '@heroui/react';
import {
  IconBrandPython,
  IconCsv,
  IconFileDownload,
  IconFileTypeJs,
  IconFileTypeXls
} from '@tabler/icons-react';

import { useStatusBar } from '@/hooks';
import { exportCard, getCodeEngineCode } from '@/services';

const NON_EXPORTABLE_CARD_TYPES = new Set(['domoapp', 'text']);

const CARD_EXPORT_OPTIONS = [
  {
    icon: IconFileTypeXls,
    id: 'excel',
    label: 'Export as Excel'
  },
  {
    icon: IconCsv,
    id: 'csv',
    label: 'Export as CSV'
  }
];

export function Export({ currentContext, isDisabled }) {
  const { showPromiseStatus } = useStatusBar();

  const typeId = currentContext?.domoObject?.typeId;
  const cardType =
    currentContext?.domoObject?.metadata?.details?.type?.toLowerCase();

  if (typeId === 'CARD' && NON_EXPORTABLE_CARD_TYPES.has(cardType)) return null;

  if (typeId === 'CODEENGINE_PACKAGE' || typeId === 'CODEENGINE_PACKAGE_VERSION') {
    const isCEVersion = typeId === 'CODEENGINE_PACKAGE_VERSION';
    const language =
      currentContext?.domoObject?.metadata?.details?.language?.toUpperCase();
    const isPython = language === 'PYTHON';

    const handleCodeExport = () => {
      const packageId = isCEVersion
        ? currentContext?.domoObject?.parentId
        : currentContext?.domoObject?.id;
      if (!packageId) return;

      const name =
        currentContext.domoObject.metadata?.name || 'code-engine-package';

      const exportPromise = getCodeEngineCode({
        packageId,
        tabId: currentContext.tabId,
        version: isCEVersion ? currentContext.domoObject.id : null
      }).then(async ({ code, version }) => {
        let formatted = code;
        if (!isPython) {
          const { js_beautify } = await import('js-beautify');
          formatted = js_beautify(code, { indent_size: 2 });
        }
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
        error: (err) => `Could not export code – ${err.message}`,
        loading: `Exporting **${name}** code…`,
        success: (data) => `Downloading **${data.fileName}**`
      });
    };

    return (
      <Tooltip closeDelay={0} delay={400}>
        <Button
          fullWidth
          className='min-w-36 flex-1 whitespace-normal'
          isDisabled={isDisabled}
          variant='tertiary'
          onPress={handleCodeExport}
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
        error: (err) =>
          `Could not export card **${objectId}** – ${err.message}`,
        loading: `Exporting **${title}**…`,
        success: (data) => `Downloading **${data.fileName}**`
      }
    );
  };

  return (
    <Dropdown isDisabled={isDisabled}>
      <Button
        fullWidth
        className='min-w-36 flex-1 whitespace-normal'
        isDisabled={isDisabled}
        variant='tertiary'
      >
        <IconFileDownload stroke={1.5} />
        Export
      </Button>
      <Dropdown.Popover className='w-fit min-w-40' placement='bottom'>
        <Dropdown.Menu onAction={(key) => handleCardExport(key)}>
          {CARD_EXPORT_OPTIONS.map((opt) => (
            <Dropdown.Item id={opt.id} key={opt.id} textValue={opt.label}>
              <opt.icon className='size-4 shrink-0' stroke={1.5} />
              <Label>{opt.label}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
