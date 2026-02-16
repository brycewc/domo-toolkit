import { useState } from 'react';
import {
  Button,
  ButtonGroup,
  Card,
  Disclosure,
  DisclosureGroup,
  Link,
  ScrollShadow,
  Tooltip,
  Popover
} from '@heroui/react';
import {
  IconChevronDown,
  IconClipboard,
  IconCopyX,
  IconDots,
  IconFolders,
  IconChartBar,
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
 * @typedef {'remove' | 'openAll' | 'copy' | 'share' | 'shareAll'} ItemActionType
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
 * @param {Function} props.onItemRemove - Callback for remove item action (item) => void
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
  onItemRemove,
  onItemShare,
  onItemShareAll,
  onStatusUpdate,
  showActions = true,
  showCounts = true,
  objectType,
  itemLabel = 'item'
}) {
  const [isCopied, setIsCopied] = useState(false);
  const [isHeaderShared, setIsHeaderShared] = useState(false);

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
          await onShareAll?.();
          setIsHeaderShared(true);
          setTimeout(() => setIsHeaderShared(false), 1500);
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
   * Standard actions (copy, openAll, remove) are handled here.
   * Custom actions are delegated to callbacks.
   */
  const handleItemAction = async (actionType, item) => {
    try {
      switch (actionType) {
        case 'remove':
          onItemRemove?.(item);
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
        case 'copy':
          await navigator.clipboard.writeText(item.id?.toString() || '');
          onStatusUpdate?.(
            'Copied',
            `ID **${item.id}** copied to clipboard`,
            'success',
            2000
          );
          break;

        case 'share':
          await onItemShare?.(actionType, item);
          break;

        case 'shareAll':
          await onItemShareAll?.(actionType, item);
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
    <Card className='w-full p-2'>
      {(title || hasHeaderActions) && (
        <Card.Header>
          <Card.Title className='flex items-start justify-between gap-2'>
            <div className='min-w-0 flex-1 pt-1'>{title}</div>
            {hasHeaderActions && (
              <ButtonGroup hideSeparator className='flex shrink-0'>
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
                          {headerActions.includes('shareAll') && (
                            <Tooltip delay={400} closeDelay={0}>
                              <Button
                                variant='ghost'
                                size='sm'
                                isIconOnly
                                onPress={() => handleHeaderAction('shareAll')}
                                aria-label='Share All'
                              >
                                {isHeaderShared ? (
                                  <AnimatedCheck stroke={1.5} />
                                ) : (
                                  <IconUsersPlus stroke={1.5} />
                                )}
                              </Button>
                              <Tooltip.Content className='text-xs'>
                                {isHeaderShared
                                  ? 'Shared!'
                                  : 'Share all with yourself'}
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
                                  className={isRefreshing ? 'animate-spin' : ''}
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
        </Card.Header>
      )}

      <ScrollShadow
        orientation='vertical'
        hideScrollBar
        className='max-h-[calc(100vh-10rem)] overflow-y-auto overscroll-x-none overscroll-y-contain'
      >
        <Card.Content>
          <DisclosureGroup
            className='flex w-full flex-col'
            allowsMultipleExpanded
          >
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
      </ScrollShadow>
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
  const [isShared, setIsShared] = useState(false);

  const handleAction = async (actionType) => {
    if (actionType === 'copy') {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 1000);
    }

    if (onItemAction) {
      try {
        await onItemAction(actionType, item);
        if (actionType === 'share' || actionType === 'shareAll') {
          setIsShared(true);
          setTimeout(() => setIsShared(false), 1500);
        }
      } catch {
        // Error handled by parent via onStatusUpdate
      }
    }
  };

  // Action button builders
  const removeButton = (
    <Tooltip key='remove' delay={400} closeDelay={0}>
      <Button
        variant='ghost'
        size='sm'
        fullWidth
        isIconOnly
        onPress={() => handleAction('remove')}
        aria-label='Remove'
      >
        <IconCopyX stroke={1.5} className='text-danger' />
      </Button>
      <Tooltip.Content className='text-xs'>
        Remove{' '}
        <span className='lowercase'>
          {objectType} from {item?.domoObject?.typeName || item?.typeId}
        </span>
      </Tooltip.Content>
    </Tooltip>
  );

  const openAllButton = (
    <Tooltip key='openAll' delay={400} closeDelay={0}>
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
        Open all in new tabs
      </Tooltip.Content>
    </Tooltip>
  );

  const copyButton = (
    <Tooltip key='copy' delay={400} closeDelay={0}>
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

  const shareAllButton = (
    <Tooltip key='shareAll' delay={400} closeDelay={0}>
      <Button
        variant='ghost'
        size='sm'
        fullWidth
        isIconOnly
        onPress={() => handleAction('shareAll')}
        aria-label='Share All'
      >
        {isShared ? (
          <AnimatedCheck stroke={1.5} />
        ) : (
          <IconUsersPlus stroke={1.5} />
        )}
      </Button>
      <Tooltip.Content className='text-xs'>
        {isShared ? 'Shared!' : 'Share all with yourself'}
      </Tooltip.Content>
    </Tooltip>
  );

  const shareButton = (
    <Tooltip key='share' delay={400} closeDelay={0}>
      <Button
        variant='ghost'
        size='sm'
        fullWidth
        isIconOnly
        onPress={() => handleAction('share')}
        aria-label='Share'
      >
        {isShared ? (
          <AnimatedCheck stroke={1.5} />
        ) : (
          <IconUserPlus stroke={1.5} />
        )}
      </Button>
      <Tooltip.Content className='text-xs'>
        {isShared ? 'Shared!' : 'Share with yourself'}
      </Tooltip.Content>
    </Tooltip>
  );

  // Compute which actions apply to this item
  const getApplicableActions = () => {
    const isUnshareable =
      item.typeId === 'DATA_APP_VIEW' ||
      item.typeId === 'REPORT_BUILDER_VIEW' ||
      item.typeId === 'CARD' ||
      objectType === 'DATA_APP_VIEW' ||
      Number(item.id) < 0;

    // items that shouldn't have shareAll button
    const isUnshareableParent = item.typeId === 'DATA_APP';

    if (item.isVirtualParent) {
      if (!hasChildren) return [];
      const actions = [];
      if (item.id !== 'REPORT_BUILDER_group') {
        // if (itemActions && itemActions?.includes('openAll'))
        actions.push(openAllButton);
        // if (itemActions && itemActions?.includes('shareAll'))
        actions.push(shareAllButton);
      }
      return actions;
    }

    if (itemActions) {
      const actions = [];
      if (itemActions.includes('openAll') && hasChildren)
        actions.push(openAllButton);
      if (
        itemActions.includes('shareAll') &&
        hasChildren &&
        !isUnshareable &&
        !isUnshareableParent &&
        item.countLabel !== 'cards'
      )
        actions.push(shareAllButton);
      if (itemActions.includes('share') && !isUnshareable)
        actions.push(shareButton);
      if (itemActions.includes('copy')) actions.push(copyButton);
      return actions;
    }

    // Default logic

    const actions = [];
    if (hasChildren && item.typeId !== 'DATA_APP') {
      actions.push(openAllButton);
      actions.push(shareAllButton);
    }

    if (
      (objectType === 'CARD' &&
        (item.typeId === 'PAGE' || item.typeId === 'DATA_APP_VIEW')) ||
      (itemActions && itemActions?.includes('remove'))
    ) {
      actions.push(removeButton);
    }

    if (!isUnshareable) actions.push(shareButton);
    actions.push(copyButton);
    return actions;
  };

  const applicableActions = showActions ? getApplicableActions() : [];

  const labelTooltip = (
    <Tooltip delay={200} closeDelay={0} className='flex-1'>
      <Tooltip.Trigger className='flex items-center truncate'>
        {item.typeId === 'CARD' && (
          <IconChartBar
            stroke={1.5}
            size={14}
            className='mr-1 inline shrink-0 align-text-bottom'
          />
        )}
        {item.label}
      </Tooltip.Trigger>
      <Tooltip.Content placement='top left' offset={4}>
        ID: {item.id}
      </Tooltip.Content>
    </Tooltip>
  );

  const itemLabel =
    !item?.isVirtualParent &&
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
    ));

  const actions =
    applicableActions.length === 1
      ? applicableActions[0]
      : applicableActions.length > 1 && (
          <Popover>
            <Button variant='ghost' size='sm' isIconOnly>
              <IconDots stroke={1.5} />
            </Button>
            <Popover.Content placement='left' offset={4}>
              <Popover.Dialog className='p-0'>
                <ButtonGroup
                  variant='ghost'
                  size='sm'
                  className='flex max-w-xs justify-end'
                  fullWidth
                >
                  {applicableActions}
                </ButtonGroup>
              </Popover.Dialog>
            </Popover.Content>
          </Popover>
        );

  if (!hasChildren) {
    return (
      <div className='flex min-h-9 w-full flex-row items-center justify-between gap-1 border-t border-border py-1'>
        <div className='flex w-full min-w-0 flex-1 basis-4/5 items-center gap-2'>
          {itemLabel}
        </div>
        {actions}
      </div>
    );
  }

  return (
    <Disclosure
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      className='space-0 w-full border-t border-border'
    >
      <Disclosure.Heading className='my-1 flex min-h-9 w-full flex-row justify-between gap-1'>
        <div className='flex w-full min-w-0 flex-1 basis-4/5 items-center gap-2'>
          {itemLabel}
          <Disclosure.Trigger
            variant='tertiary'
            aria-label='Toggle'
            className='flex shrink-0 flex-row items-center gap-1'
          >
            {item.isVirtualParent && (
              <p className='truncate text-sm font-medium'>{item.label}</p>
            )}
            {showCounts && item.count !== undefined && (
              <p className='text-sm text-muted'>
                {' '}
                ({item.count}
                {item.countLabel ? ` ${item.countLabel}` : ''})
              </p>
            )}
            <Disclosure.Indicator>
              <IconChevronDown stroke={1.5} />
            </Disclosure.Indicator>
          </Disclosure.Trigger>
        </div>
        {actions}
      </Disclosure.Heading>
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
    </Disclosure>
  );
}
