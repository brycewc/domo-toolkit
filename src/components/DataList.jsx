import { useState } from 'react';
import {
  Button,
  ButtonGroup,
  Card,
  Disclosure,
  DisclosureGroup,
  Link,
  Tooltip,
  Popover
} from '@heroui/react';
import {
  IconChevronDown,
  IconClipboard,
  IconDots,
  IconFolders,
  IconRefresh,
  IconUserPlus,
  IconUsersPlus,
  IconX
} from '@tabler/icons-react';
import { AnimatedCheck } from './AnimatedCheck';

/**
 * Available header action types for DataList
 * @typedef {'openAll' | 'copy' | 'shareAll' | 'refresh'} HeaderActionType
 */

/**
 * Available item action types for DataList items
 * @typedef {'openAll' | 'copy' | 'share' | 'shareAll'} ItemActionType
 */

/**
 * Recursively collect all URLs from items and their children
 * Skips virtual parent nodes (grouping headers) that don't have real URLs
 * @param {Array} itemList - Array of items to collect URLs from
 * @param {Function} [filter] - Optional filter function (item) => boolean
 * @returns {string[]} Array of URLs
 */
function collectAllUrls(itemList, filter = null) {
  const urls = [];
  const traverse = (list) => {
    for (const item of list) {
      // Add URL if it exists and item is not a virtual parent
      // Also apply optional filter (e.g., skip DATA_APP items)
      if (item.url && !item.isVirtualParent) {
        if (!filter || filter(item)) {
          urls.push(item.url);
        }
      }
      // Recursively process children
      if (item.children && item.children.length > 0) {
        traverse(item.children);
      }
    }
  };
  traverse(itemList);
  return urls;
}

/**
 * DataList Component
 * A hierarchical list component for displaying nested data structures using HeroUI v3
 *
 * Features:
 * - Hierarchical/nested item display
 * - Expandable/collapsible sections with Disclosure
 * - Item counts and metadata
 * - Clickable links to navigate
 * - Action buttons for each item (with built-in copy and openAll handling)
 * - Configurable header action buttons (with built-in copy and openAll handling)
 * - Responsive design with Tailwind CSS
 *
 * Standard actions (copy, openAll) are handled internally.
 * Custom actions (refresh, shareAll, share) are delegated via callbacks.
 *
 * @param {Object} props
 * @param {Array} props.items - Array of list items with optional children
 * @param {React.ReactNode} props.title - Title/stats section to display in header
 * @param {HeaderActionType[]} props.headerActions - Array of action types to show in header
 * @param {Function} props.onClose - Callback when close button is clicked (shows close button if provided)
 * @param {string} props.closeLabel - Label for close button tooltip
 * @param {boolean} props.isRefreshing - Whether refresh action is in progress
 * @param {string|number} props.objectId - Object ID for header copy action
 * @param {Function} props.onRefresh - Callback for refresh action
 * @param {Function} props.onShareAll - Callback for shareAll header action
 * @param {ItemActionType[]} props.itemActions - Array of action types to show on items (if not provided, uses default logic)
 * @param {Function} props.onItemShare - Callback for share item action (actionType, item) => void
 * @param {Function} props.onItemShareAll - Callback for shareAll item action (actionType, item) => void
 * @param {Function} props.onStatusUpdate - Callback to show status messages (title, description, status, timeout)
 * @param {Boolean} props.showActions - Whether to show action buttons on items
 * @param {Boolean} props.showCounts - Whether to show item counts
 * @param {String} props.objectType - The type of object being displayed (e.g., 'DATA_APP_VIEW', 'PAGE')
 * @param {String} props.itemLabel - Label for items in status messages (default: 'item')
 */
export function DataList({
  items = [],
  title,
  headerActions = [],
  onClose,
  closeLabel = 'Close',
  isRefreshing = false,
  objectId,
  onRefresh,
  onShareAll,
  itemActions,
  onItemShare,
  onItemShareAll,
  onStatusUpdate,
  showActions = true,
  showCounts = true,
  objectType,
  itemLabel = 'item'
}) {
  const [isCopied, setIsCopied] = useState(false);

  /**
   * Handle header action button clicks
   * Standard actions (copy, openAll) are handled here.
   * Custom actions are delegated to callbacks.
   */
  const handleHeaderAction = async (actionType) => {
    try {
      switch (actionType) {
        case 'copy':
          setIsCopied(true);
          setTimeout(() => setIsCopied(false), 1000);
          await navigator.clipboard.writeText(objectId?.toString() || '');
          onStatusUpdate?.(
            'Copied',
            `ID **${objectId}** copied to clipboard`,
            'success',
            2000
          );
          break;

        case 'openAll': {
          // Filter out DATA_APP items (we want their children, not the app itself)
          const urls = collectAllUrls(
            items,
            (item) => item.typeId !== 'DATA_APP'
          );
          const count = urls.length;
          urls.forEach((url) => {
            window.open(url, '_blank', 'noopener,noreferrer');
          });
          onStatusUpdate?.(
            'Opened',
            `Opened **${count}** ${itemLabel}${count !== 1 ? 's' : ''} in new tabs`,
            'success',
            2000
          );
          break;
        }

        case 'refresh':
          onRefresh?.();
          break;

        case 'shareAll':
          onShareAll?.();
          break;

        default:
          break;
      }
    } catch (err) {
      console.error(`[DataList] Error in header action ${actionType}:`, err);
      onStatusUpdate?.(
        'Error',
        err.message || `Failed to ${actionType}`,
        'danger',
        3000
      );
    }
  };

  /**
   * Handle item action button clicks
   * Standard actions (copy, openAll) are handled here.
   * Custom actions are delegated to callbacks.
   */
  const handleItemAction = async (actionType, item) => {
    try {
      switch (actionType) {
        case 'copy':
          await navigator.clipboard.writeText(item.id?.toString() || '');
          onStatusUpdate?.(
            'Copied',
            `ID **${item.id}** copied to clipboard`,
            'success',
            2000
          );
          break;

        case 'openAll':
          if (item.children) {
            const count = item.children.length;
            item.children.forEach((child) => {
              if (child.url) {
                window.open(child.url, '_blank', 'noopener,noreferrer');
              }
            });
            onStatusUpdate?.(
              'Opened',
              `Opened **${count}** ${itemLabel}${count !== 1 ? 's' : ''} in new tabs`,
              'success',
              2000
            );
          }
          break;

        case 'share':
          onItemShare?.(actionType, item);
          break;

        case 'shareAll':
          onItemShareAll?.(actionType, item);
          break;

        default:
          break;
      }
    } catch (err) {
      console.error(`[DataList] Error in item action ${actionType}:`, err);
      onStatusUpdate?.(
        'Error',
        err.message || `Failed to ${actionType}`,
        'danger',
        3000
      );
    }
  };

  const hasHeaderActions = headerActions.length > 0 || onClose;

  return (
    <Card className='w-full overflow-x-hidden overflow-y-scroll overscroll-x-none overscroll-y-contain p-2'>
      {(title || hasHeaderActions) && (
        <Card.Header>
          <div className='flex flex-col gap-1'>
            <Card.Title className='flex items-center justify-between'>
              {title}
              {hasHeaderActions && (
                <ButtonGroup hideSeparator>
                  {headerActions.length > 0 && (
                    <Popover>
                      <Button variant='ghost' size='sm' isIconOnly>
                        <IconDots stroke={1.5} />
                      </Button>
                      <Popover.Content placement='left' offset={2}>
                        <Popover.Dialog className='p-0'>
                          <ButtonGroup size='sm' fullWidth variant='ghost'>
                            {headerActions.includes('openAll') && (
                              <Tooltip delay={400} closeDelay={0}>
                                <Button
                                  variant='ghost'
                                  size='sm'
                                  isIconOnly
                                  onPress={() => handleHeaderAction('openAll')}
                                  aria-label='Open All'
                                >
                                  <IconFolders stroke={1.5} />
                                </Button>
                                <Tooltip.Content className='text-xs'>
                                  Open all in new tabs
                                </Tooltip.Content>
                              </Tooltip>
                            )}
                            {headerActions.includes('copy') && (
                              <Tooltip delay={400} closeDelay={0}>
                                <Button
                                  variant='ghost'
                                  size='sm'
                                  isIconOnly
                                  onPress={() => handleHeaderAction('copy')}
                                  aria-label='Copy'
                                >
                                  {isCopied ? (
                                    <AnimatedCheck stroke={1.5} />
                                  ) : (
                                    <IconClipboard stroke={1.5} />
                                  )}
                                </Button>
                                <Tooltip.Content className='text-xs'>
                                  {isCopied ? 'Copied!' : 'Copy ID'}
                                </Tooltip.Content>
                              </Tooltip>
                            )}
                            {headerActions.includes('shareAll') && (
                              <Tooltip delay={400} closeDelay={0}>
                                <Button
                                  variant='ghost'
                                  size='sm'
                                  isIconOnly
                                  onPress={() => handleHeaderAction('shareAll')}
                                  aria-label='Share All'
                                >
                                  <IconUsersPlus stroke={1.5} />
                                </Button>
                                <Tooltip.Content className='text-xs'>
                                  Share all with yourself
                                </Tooltip.Content>
                              </Tooltip>
                            )}
                            {headerActions.includes('refresh') && (
                              <Tooltip delay={400} closeDelay={0}>
                                <Button
                                  variant='ghost'
                                  size='sm'
                                  isIconOnly
                                  isDisabled={isRefreshing}
                                  onPress={() => handleHeaderAction('refresh')}
                                >
                                  <IconRefresh
                                    stroke={1.5}
                                    size={16}
                                    className={
                                      isRefreshing ? 'animate-spin' : ''
                                    }
                                  />
                                </Button>
                                <Tooltip.Content className='text-xs'>
                                  Refresh
                                </Tooltip.Content>
                              </Tooltip>
                            )}
                          </ButtonGroup>
                        </Popover.Dialog>
                      </Popover.Content>
                    </Popover>
                  )}
                  {onClose && (
                    <Tooltip delay={400} closeDelay={0}>
                      <Button
                        variant='ghost'
                        size='sm'
                        isIconOnly
                        onPress={onClose}
                      >
                        <IconX stroke={1.5} />
                      </Button>
                      <Tooltip.Content className='text-xs'>
                        {closeLabel}
                      </Tooltip.Content>
                    </Tooltip>
                  )}
                </ButtonGroup>
              )}
            </Card.Title>
          </div>
        </Card.Header>
      )}

      <Card.Content>
        <DisclosureGroup className='flex flex-col' allowsMultipleExpanded>
          {items.map((item, index) => (
            <DataListItem
              key={item.id || index}
              item={item}
              itemActions={itemActions}
              onItemAction={handleItemAction}
              showActions={showActions}
              showCounts={showCounts}
              objectType={objectType}
            />
          ))}
        </DisclosureGroup>
      </Card.Content>
    </Card>
  );
}

/**
 * DataListItem Component
 * Individual item in the DataList, supports nested children
 *
 * @param {Object} props
 * @param {Object} props.item - Item data object
 * @param {String} props.item.id - Unique identifier
 * @param {String} props.item.label - Display label
 * @param {String} props.item.url - Optional URL for link
 * @param {Number} props.item.count - Optional count to display
 * @param {Array} props.item.children - Optional nested children
 * @param {Object} props.item.metadata - Optional additional metadata
 * @param {ItemActionType[]} props.itemActions - Array of action types to show (if not provided, uses default logic)
 * @param {Function} props.onItemAction - Callback when action is clicked
 * @param {Boolean} props.showActions - Whether to show action buttons
 * @param {Boolean} props.showCounts - Whether to show counts
 * @param {String} props.objectType - The type of object being displayed
 */
function DataListItem({
  item,
  itemActions,
  onItemAction,
  showActions = true,
  showCounts = true,
  depth = 0,
  objectType
}) {
  const hasChildren = item.children && item.children.length > 0;
  const [isOpen, setIsOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const handleAction = (actionType) => {
    if (actionType === 'copy') {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 1000);
    }

    if (onItemAction) {
      onItemAction(actionType, item);
    }
  };

  const labelTooltip = (
    <Tooltip delay={200} closeDelay={0} className='flex-1'>
      <Tooltip.Trigger className='truncate'>{item.label}</Tooltip.Trigger>
      <Tooltip.Content placement='top left' offset={8}>
        ID: {item.id}
      </Tooltip.Content>
    </Tooltip>
  );

  const copyButton = (
    <Tooltip delay={400} closeDelay={0}>
      <Button
        variant='ghost'
        size='sm'
        fullWidth
        isIconOnly
        onPress={() => handleAction('copy')}
        aria-label='Copy'
      >
        {isCopied ? (
          <AnimatedCheck stroke={1.5} />
        ) : (
          <IconClipboard stroke={1.5} />
        )}
      </Button>
      <Tooltip.Content className='text-xs'>
        {isCopied ? 'Copied!' : 'Copy ID'}
      </Tooltip.Content>
    </Tooltip>
  );

  return (
    <Disclosure
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      className='w-full border-t border-border p-1'
    >
      <Disclosure.Heading className='flex min-h-9 w-full flex-row justify-between'>
        <div className='flex w-full min-w-0 flex-1 basis-4/5 items-center gap-2'>
          {!item?.isVirtualParent &&
            (item.url ? (
              <Link
                href={item.url}
                target='_blank'
                className='truncate text-sm font-normal no-underline decoration-accent hover:text-accent hover:underline'
                isDisabled={!item.url}
              >
                {labelTooltip}
              </Link>
            ) : (
              <span className='text-sm'>{labelTooltip}</span>
            ))}
          {hasChildren && (
            <>
              <Disclosure.Trigger
                variant='tertiary'
                aria-label='Toggle'
                className='flex shrink-0 flex-row items-center gap-1'
              >
                {item.isVirtualParent && (
                  <p className='truncate text-sm font-medium'>{item.label}</p>
                )}
                {showCounts && item.count !== undefined && (
                  <p className='text-sm text-muted'> ({item.count})</p>
                )}
                <Disclosure.Indicator>
                  <IconChevronDown stroke={1.5} />
                </Disclosure.Indicator>
              </Disclosure.Trigger>
            </>
          )}
        </div>
        {showActions &&
          !item.isVirtualParent &&
          (() => {
            // If itemActions is explicitly provided, use it to determine which buttons to show
            if (itemActions) {
              // If only copy is allowed, show just the copy button
              if (itemActions.length === 1 && itemActions.includes('copy')) {
                return copyButton;
              }

              // Otherwise show a popover with the allowed actions
              return (
                <Popover>
                  <Button variant='ghost' size='sm' isIconOnly>
                    <IconDots stroke={1.5} />
                  </Button>
                  <Popover.Content placement='left' offset={2}>
                    <Popover.Dialog className='p-0'>
                      <ButtonGroup
                        variant='ghost'
                        size='sm'
                        className='flex max-w-xs justify-end'
                        fullWidth
                      >
                        {itemActions.includes('openAll') && hasChildren && (
                          <Tooltip delay={400} closeDelay={0}>
                            <Button
                              variant='ghost'
                              size='sm'
                              fullWidth
                              isIconOnly
                              onPress={() => handleAction('openAll')}
                              aria-label='Open All'
                            >
                              <IconFolders stroke={1.5} />
                            </Button>
                            <Tooltip.Content className='text-xs'>
                              Open all children in new tabs
                            </Tooltip.Content>
                          </Tooltip>
                        )}
                        {itemActions.includes('copy') && copyButton}
                        {itemActions.includes('shareAll') && hasChildren && (
                          <Tooltip delay={400} closeDelay={0}>
                            <Button
                              variant='ghost'
                              size='sm'
                              fullWidth
                              isIconOnly
                              onPress={() => handleAction('shareAll')}
                              aria-label='Share All'
                            >
                              <IconUsersPlus stroke={1.5} />
                            </Button>
                            <Tooltip.Content className='text-xs'>
                              Share all children with yourself
                            </Tooltip.Content>
                          </Tooltip>
                        )}
                        {itemActions.includes('share') && (
                          <Tooltip delay={400} closeDelay={0}>
                            <Button
                              variant='ghost'
                              size='sm'
                              fullWidth
                              isIconOnly
                              onPress={() => handleAction('share')}
                              aria-label='Share'
                            >
                              <IconUserPlus stroke={1.5} />
                            </Button>
                            <Tooltip.Content className='text-xs'>
                              Share with yourself
                            </Tooltip.Content>
                          </Tooltip>
                        )}
                      </ButtonGroup>
                    </Popover.Dialog>
                  </Popover.Content>
                </Popover>
              );
            }

            // Default logic when itemActions is not provided
            if (
              item.typeId === 'DATA_APP_VIEW' ||
              item.typeId === 'REPORT_BUILDER_VIEW' ||
              objectType === 'DATA_APP_VIEW'
            ) {
              return copyButton;
            }

            return (
              <Popover>
                <Button variant='ghost' size='sm' isIconOnly>
                  <IconDots stroke={1.5} />
                </Button>
                <Popover.Content placement='left' offset={2}>
                  <Popover.Dialog className='p-0'>
                    <ButtonGroup
                      variant='ghost'
                      size='sm'
                      className='flex max-w-xs justify-end'
                      fullWidth
                    >
                      {hasChildren && item.typeId !== 'DATA_APP' && (
                        <>
                          <Tooltip delay={400} closeDelay={0}>
                            <Button
                              variant='ghost'
                              size='sm'
                              fullWidth
                              isIconOnly
                              onPress={() => handleAction('openAll')}
                              aria-label='Open All'
                            >
                              <IconFolders stroke={1.5} />
                            </Button>
                            <Tooltip.Content className='text-xs'>
                              Open all children in new tabs
                            </Tooltip.Content>
                          </Tooltip>
                          <Tooltip delay={400} closeDelay={0}>
                            <Button
                              variant='ghost'
                              size='sm'
                              fullWidth
                              isIconOnly
                              onPress={() => handleAction('shareAll')}
                              aria-label='Share'
                            >
                              <IconUsersPlus stroke={1.5} />
                            </Button>
                            <Tooltip.Content className='text-xs'>
                              Share all children with yourself
                            </Tooltip.Content>
                          </Tooltip>
                        </>
                      )}
                      {copyButton}
                      {item.typeId !== 'DATA_APP_VIEW' &&
                        item.typeId !== 'REPORT_BUILDER_VIEW' &&
                        objectType !== 'DATA_APP_VIEW' && (
                          <Tooltip delay={400} closeDelay={0}>
                            <Button
                              variant='ghost'
                              size='sm'
                              fullWidth
                              isIconOnly
                              onPress={() => handleAction('share')}
                              aria-label='Share'
                            >
                              <IconUserPlus stroke={1.5} />
                            </Button>
                            <Tooltip.Content className='text-xs'>
                              Share with yourself
                            </Tooltip.Content>
                          </Tooltip>
                        )}
                    </ButtonGroup>
                  </Popover.Dialog>
                </Popover.Content>
              </Popover>
            );
          })()}
      </Disclosure.Heading>
      {hasChildren && (
        <Disclosure.Content>
          <Disclosure.Body>
            {item.children.map((child, index) => (
              <DataListItem
                key={child.id || index}
                item={child}
                index={index}
                itemActions={itemActions}
                onItemAction={onItemAction}
                showActions={showActions}
                showCounts={showCounts}
                depth={depth + 1}
                objectType={objectType}
              />
            ))}
          </Disclosure.Body>
        </Disclosure.Content>
      )}
    </Disclosure>
  );
}
