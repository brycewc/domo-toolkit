import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Chip,
  Disclosure,
  Spinner,
  Tooltip
} from '@heroui/react';
import {
  IconChevronDown,
  IconClipboard,
  IconX
} from '@tabler/icons-react';
import { AnimatedCheck } from '@/components';
import { DomoContext, DomoObject } from '@/models';

/**
 * Known fields to display prominently with human-readable labels.
 * Order here determines display order.
 */
const KNOWN_FIELDS = [
  { key: 'name', label: 'Name' },
  { key: 'displayType', label: 'Display Type' },
  { key: 'dataProviderType', label: 'Provider Type' },
  { key: 'type', label: 'Type' },
  { key: 'owner', label: 'Owner', format: 'owner' },
  { key: 'createdBy', label: 'Created By' },
  { key: 'description', label: 'Description' },
  { key: 'status', label: 'Status' },
  { key: 'valid', label: 'Valid', format: 'boolean' },
  { key: 'createdAt', label: 'Created', format: 'date' },
  { key: 'modifiedAt', label: 'Modified', format: 'date' },
  { key: 'updatedAt', label: 'Updated', format: 'date' },
  { key: 'lastUpdated', label: 'Last Updated', format: 'date' },
  { key: 'dataModified', label: 'Data Modified', format: 'date' },
  { key: 'createdDate', label: 'Created', format: 'date' },
  { key: 'modifiedDate', label: 'Modified', format: 'date' },
  { key: 'rowCount', label: 'Row Count', format: 'number' },
  { key: 'columnCount', label: 'Column Count', format: 'number' }
];

/**
 * Format a value based on its format type
 */
function formatValue(value, format) {
  if (value === null || value === undefined) return null;

  switch (format) {
    case 'date': {
      const date = new Date(value);
      if (isNaN(date.getTime())) return String(value);
      return date.toLocaleString();
    }
    case 'boolean':
      return value ? 'Yes' : 'No';
    case 'number':
      return typeof value === 'number' ? value.toLocaleString() : String(value);
    case 'owner':
      // Owner can be an object with name/displayName or a simple string
      if (typeof value === 'object' && value !== null) {
        return value.displayName || value.name || JSON.stringify(value);
      }
      return String(value);
    default:
      if (typeof value === 'object') return null; // Skip complex objects
      return String(value);
  }
}

/**
 * Extract key fields from the details object
 * @param {Object} details - The API response details
 * @returns {Array<{label: string, value: string}>}
 */
function extractKeyFields(details) {
  if (!details || typeof details !== 'object') return [];

  const fields = [];

  for (const { key, label, format } of KNOWN_FIELDS) {
    if (key in details) {
      const formatted = formatValue(details[key], format);
      if (formatted !== null) {
        fields.push({ label, value: formatted });
      }
    }
  }

  return fields;
}

export function ObjectDetailsView({
  onBackToDefault = null,
  onStatusUpdate = null
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [showSpinner, setShowSpinner] = useState(false);
  const [error, setError] = useState(null);
  const [domoObject, setDomoObject] = useState(null);
  const [keyFields, setKeyFields] = useState([]);
  const [jsonString, setJsonString] = useState('');
  const [isCopied, setIsCopied] = useState(false);

  // Load data on mount
  useEffect(() => {
    loadObjectDetails();
  }, []);

  const loadObjectDetails = async () => {
    setIsLoading(true);
    setShowSpinner(false);
    setError(null);

    // Delay showing spinner to avoid flash on quick loads
    const spinnerTimer = setTimeout(() => {
      setShowSpinner(true);
    }, 200);

    try {
      const result = await chrome.storage.session.get(['sidepanelDataList']);
      const data = result.sidepanelDataList;

      if (!data || data.type !== 'viewObjectDetails') {
        setError('No object details found. Please try again.');
        setIsLoading(false);
        clearTimeout(spinnerTimer);
        return;
      }

      // Reconstruct the DomoObject
      const obj = DomoObject.fromJSON(data.domoObject);
      setDomoObject(obj);

      // Extract key fields from metadata details
      const details = obj.metadata?.details || {};
      setKeyFields(extractKeyFields(details));

      // Build JSON string for the collapsible section
      setJsonString(JSON.stringify(details, null, 2));
    } catch (err) {
      console.error('[ObjectDetailsView] Error loading details:', err);
      setError(err.message || 'Failed to load object details');
    } finally {
      setIsLoading(false);
      clearTimeout(spinnerTimer);
    }
  };

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
      onStatusUpdate?.(
        'Copied',
        'Full JSON copied to clipboard',
        'success',
        2000
      );
    } catch (err) {
      onStatusUpdate?.('Error', 'Failed to copy JSON', 'danger', 3000);
    }
  };

  const handleCopyId = async () => {
    if (!domoObject?.id) return;
    try {
      await navigator.clipboard.writeText(domoObject.id.toString());
      onStatusUpdate?.(
        'Copied',
        `ID **${domoObject.id}** copied to clipboard`,
        'success',
        2000
      );
    } catch (err) {
      onStatusUpdate?.('Error', 'Failed to copy ID', 'danger', 3000);
    }
  };

  if (isLoading && showSpinner) {
    return (
      <div className='flex items-center justify-center'>
        <div className='flex flex-col items-center gap-2'>
          <Spinner size='lg' />
          <p className='text-muted'>Loading object details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='flex items-center justify-center p-4'>
        <div className='flex flex-col items-center gap-2 text-center'>
          <p className='text-danger'>{error}</p>
          <Button onPress={loadObjectDetails}>Retry</Button>
        </div>
      </div>
    );
  }

  if (!domoObject) return null;

  return (
    <Card className='w-full overflow-x-hidden overflow-y-scroll overscroll-x-none overscroll-y-contain p-2'>
      <Card.Header>
        <Card.Title className='flex items-center justify-between'>
          <div className='flex flex-col gap-1'>
            <div className='flex flex-wrap items-center gap-x-2'>
              <span className='font-bold'>
                {domoObject.metadata?.name || `ID: ${domoObject.id}`}
              </span>
              <Chip size='sm' variant='soft' color='secondary'>
                {domoObject.typeName}
              </Chip>
            </div>
            <span className='text-sm text-muted'>ID: {domoObject.id}</span>
          </div>
          <div className='flex items-center gap-1'>
            <Tooltip delay={400} closeDelay={0}>
              <Button
                variant='ghost'
                size='sm'
                isIconOnly
                onPress={handleCopyId}
              >
                <IconClipboard stroke={1.5} />
              </Button>
              <Tooltip.Content className='text-xs'>Copy ID</Tooltip.Content>
            </Tooltip>
            {onBackToDefault && (
              <Tooltip delay={400} closeDelay={0}>
                <Button
                  variant='ghost'
                  size='sm'
                  isIconOnly
                  onPress={onBackToDefault}
                >
                  <IconX stroke={1.5} />
                </Button>
                <Tooltip.Content className='text-xs'>Close</Tooltip.Content>
              </Tooltip>
            )}
          </div>
        </Card.Title>
      </Card.Header>

      <Card.Content className='flex flex-col gap-3'>
        {/* Key Fields */}
        {keyFields.length > 0 && (
          <div className='flex flex-col gap-1'>
            {keyFields.map(({ label, value }) => (
              <div
                key={label}
                className='flex flex-row items-start gap-2 border-b border-border py-1.5 last:border-b-0'
              >
                <span className='w-28 shrink-0 text-xs font-medium text-muted'>
                  {label}
                </span>
                <span className='break-all text-xs'>{value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Full JSON */}
        {jsonString && jsonString !== '{}' && (
          <Disclosure className='w-full'>
            <Disclosure.Heading>
              <Disclosure.Trigger
                variant='tertiary'
                className='flex w-full items-center justify-between'
              >
                <span className='text-xs font-medium'>Full JSON</span>
                <Disclosure.Indicator>
                  <IconChevronDown stroke={1.5} size={16} />
                </Disclosure.Indicator>
              </Disclosure.Trigger>
            </Disclosure.Heading>
            <Disclosure.Content>
              <Disclosure.Body>
                <div className='relative'>
                  <Tooltip delay={400} closeDelay={0}>
                    <Button
                      variant='ghost'
                      size='sm'
                      isIconOnly
                      onPress={handleCopyJson}
                      className='absolute right-1 top-1 z-10'
                    >
                      {isCopied ? (
                        <AnimatedCheck stroke={1.5} size={14} />
                      ) : (
                        <IconClipboard stroke={1.5} size={14} />
                      )}
                    </Button>
                    <Tooltip.Content className='text-xs'>
                      {isCopied ? 'Copied!' : 'Copy JSON'}
                    </Tooltip.Content>
                  </Tooltip>
                  <pre className='max-h-96 overflow-auto rounded-md bg-default-100 p-2 pr-8 text-xs'>
                    {jsonString}
                  </pre>
                </div>
              </Disclosure.Body>
            </Disclosure.Content>
          </Disclosure>
        )}
      </Card.Content>
    </Card>
  );
}
