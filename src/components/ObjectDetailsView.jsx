import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  ButtonGroup,
  Card,
  Chip,
  CloseButton,
  Disclosure,
  ScrollShadow,
  Spinner,
  Tooltip
} from '@heroui/react';
import { IconChevronDown, IconClipboard, IconX } from '@tabler/icons-react';
import JsonView from 'react18-json-view';
import '@/assets/json-view-theme.css';
import { AnimatedCheck } from '@/components';
import { DomoObject } from '@/models';

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
      // Detect epoch timestamps in seconds (10 digits) vs milliseconds (13 digits)
      const timestamp =
        typeof value === 'number' && value > 0 && value < 1e11
          ? value * 1000
          : value;
      const date = new Date(timestamp);
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
    } catch (err) {
      console.error('[ObjectDetailsView] Error loading details:', err);
      setError(err.message || 'Failed to load object details');
    } finally {
      setIsLoading(false);
      clearTimeout(spinnerTimer);
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
      <Card className='flex w-full items-center justify-center p-0'>
        <Card.Content className='flex flex-col items-center justify-center gap-2 p-2'>
          <Spinner size='lg' />
          <p className='text-muted'>Loading object details...</p>
        </Card.Content>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert className='w-full' status='warning'>
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Error</Alert.Title>
          <div className='flex flex-col items-start justify-center gap-2'>
            <Alert.Description>{error}</Alert.Description>
            <Button onPress={loadObjectDetails}>Retry</Button>
          </div>
        </Alert.Content>
        <CloseButton
          variant='ghost'
          className='rounded-full'
          onPress={() => onBackToDefault?.()}
        />
      </Alert>
    );
  }

  if (!domoObject) return null;

  return (
    <Card className='min-h-0 flex-1 overflow-hidden p-2'>
      <Card.Header>
        <Card.Title className='flex items-start justify-between'>
          <div className='flex min-w-0 flex-1 flex-col gap-1'>
            <div className='flex flex-wrap items-center gap-x-2'>
              <span>{domoObject.metadata?.name || `ID: ${domoObject.id}`}</span>
              <Chip size='sm' variant='soft' color='accent'>
                {domoObject.typeName}
              </Chip>
            </div>
            {domoObject.id &&
              !(
                domoObject.metadata?.name || domoObject.typeId === 'STREAM'
              ) && (
                <span className='text-sm text-muted'>ID: {domoObject.id}</span>
              )}
          </div>
          <ButtonGroup className='shrink-0' hideSeparator>
            <Tooltip delay={400} closeDelay={0}>
              <Button
                variant='ghost'
                size='sm'
                isIconOnly
                fullWidth
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
                  fullWidth
                  onPress={onBackToDefault}
                >
                  <IconX stroke={1.5} />
                </Button>
                <Tooltip.Content className='text-xs'>Close</Tooltip.Content>
              </Tooltip>
            )}
          </ButtonGroup>
        </Card.Title>
      </Card.Header>

      <ScrollShadow
        hideScrollBar
        className='min-h-0 flex-1 overflow-y-auto'
        orientation='vertical'
      >
        <Card.Content className='flex flex-col gap-3'>
          {/* Key Fields */}
          {keyFields.length > 0 && (
            <div className='flex flex-col gap-1'>
              {keyFields.map(({ label, value }) => (
                <div
                  key={label}
                  className='flex flex-row items-start justify-between gap-2 border-b border-border py-1.5 last:border-b-0'
                >
                  <span className='shrink-0 text-xs font-medium text-muted'>
                    {label}
                  </span>
                  <span className='text-xs break-all'>{value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Full JSON */}
          {domoObject.metadata?.details &&
            domoObject.metadata?.details !== '{}' && (
              <Disclosure className='w-full'>
                <Disclosure.Heading>
                  <Button
                    slot='trigger'
                    variant='ghost'
                    className='flex w-full items-center justify-between'
                  >
                    Full JSON
                    <Disclosure.Indicator>
                      <IconChevronDown stroke={1.5} />
                    </Disclosure.Indicator>
                  </Button>
                </Disclosure.Heading>
                <Disclosure.Content>
                  <Disclosure.Body>
                    <JsonView
                      className='min-h-0 flex-1 text-sm'
                      src={domoObject.metadata?.details}
                      collapsed={1}
                      matchesURL={false}
                      displaySize
                      collapseStringMode='word'
                      collapseStringsAfterLength={50}
                      CopyComponent={({ onClick, className, style }) => (
                        <IconClipboard
                          onClick={onClick}
                          className={className}
                          style={style}
                          size={16}
                          stroke={1.5}
                        />
                      )}
                      CopiedComponent={({ className, style }) => (
                        <AnimatedCheck
                          className={className}
                          style={style}
                          size={16}
                          stroke={1.5}
                        />
                      )}
                      customizeNode={(params) => {
                        if (params.node === null || params.node === undefined) {
                          return { enableClipboard: false };
                        }
                        if (
                          typeof params.node === 'string' &&
                          params.node.startsWith('https://')
                        ) {
                          return (
                            <Link
                              href={params.node}
                              target='_blank'
                              className='text-sm text-accent no-underline decoration-accent hover:underline'
                            >
                              {params.node}
                            </Link>
                          );
                        }
                        if (params.indexOrName?.toLowerCase().includes('id')) {
                          return { enableClipboard: true };
                        } else if (
                          (typeof params.node === 'number' ||
                            typeof params.node === 'string') &&
                          params.node?.toString().length >= 7
                        ) {
                          return { enableClipboard: true };
                        } else if (
                          typeof params.node === 'object' &&
                          Object.keys(params.node).length > 0
                        ) {
                          return { enableClipboard: true };
                        } else if (
                          Array.isArray(params.node) &&
                          params.node.length > 0
                        ) {
                          return { enableClipboard: true };
                        } else {
                          return { enableClipboard: false };
                        }
                      }}
                    />
                  </Disclosure.Body>
                </Disclosure.Content>
              </Disclosure>
            )}
        </Card.Content>
      </ScrollShadow>
    </Card>
  );
}
