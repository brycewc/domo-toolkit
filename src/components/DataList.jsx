import {
  Button,
  ButtonGroup,
  Card,
  Disclosure,
  DisclosureGroup,
  Link,
  Popover,
  ScrollShadow,
  Tooltip
} from '@heroui/react';
import {
  IconChartBar,
  IconChevronDown,
  IconClipboard,
  IconCopyX,
  IconDots,
  IconFolders,
  IconRefresh,
  IconUserPlus,
  IconUsersPlus,
  IconX
} from '@tabler/icons-react';
import { useState } from 'react';

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
  closeLabel = 'Close',
  headerActions = [],
  isRefreshing = false,
  itemActions,
  itemLabel = 'item',
  items = [],
  objectId,
  objectType,
  onClose,
  onItemRemove,
  onItemShare,
  onItemShareAll,
  onRefresh,
  onShareAll,
  onStatusUpdate,
  showActions = true,
  showCounts = true,
  title
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
        case 'remove':
          onItemRemove?.(item);
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
    <Card className='flex max-h-fit min-h-0 w-full flex-1 flex-col p-2'>
      {(title || hasHeaderActions) && (
        <Card.Header>
          <Card.Title className='flex items-start justify-between gap-2'>
            <div className='min-w-0 flex-1 pt-1'>{title}</div>
            {hasHeaderActions && (
              <ButtonGroup hideSeparator className='flex shrink-0'>
                {headerActions.length > 0 && (
                  <Popover>
                    <Button isIconOnly size='sm' variant='ghost'>
                      <IconDots stroke={1.5} />
                    </Button>
                    <Popover.Content offset={2} placement='left'>
                      <Popover.Dialog className='p-0'>
                        <ButtonGroup fullWidth size='sm' variant='ghost'>
                          {headerActions.includes('openAll') && (
                            <Tooltip closeDelay={0} delay={400}>
                              <Button
                                isIconOnly
                                aria-label='Open All'
                                size='sm'
                                variant='ghost'
                                onPress={() => handleHeaderAction('openAll')}
                              >
                                <IconFolders stroke={1.5} />
                              </Button>
                              <Tooltip.Content className='text-xs'>
                                Open all in new tabs
                              </Tooltip.Content>
                            </Tooltip>
                          )}
                          {headerActions.includes('shareAll') && (
                            <Tooltip closeDelay={0} delay={400}>
                              <Button
                                isIconOnly
                                aria-label='Share All'
                                size='sm'
                                variant='ghost'
                                onPress={() => handleHeaderAction('shareAll')}
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
                            <Tooltip closeDelay={0} delay={400}>
                              <Button
                                isIconOnly
                                aria-label='Copy'
                                size='sm'
                                variant='ghost'
                                onPress={() => handleHeaderAction('copy')}
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
                            <Tooltip closeDelay={0} delay={400}>
                              <Button
                                isIconOnly
                                isDisabled={isRefreshing}
                                size='sm'
                                variant='ghost'
                                onPress={() => handleHeaderAction('refresh')}
                              >
                                <IconRefresh
                                  className={isRefreshing ? 'animate-spin' : ''}
                                  size={16}
                                  stroke={1.5}
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
                  <Tooltip closeDelay={0} delay={400}>
                    <Button
                      isIconOnly
                      size='sm'
                      variant='ghost'
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
        hideScrollBar
        className='min-h-0 flex-1 overflow-y-auto overscroll-x-none overscroll-y-contain'
        offset={2}
        orientation='vertical'
      >
        <Card.Content>
          <DisclosureGroup
            allowsMultipleExpanded
            className='flex w-full flex-col'
          >
            {items.map((item, index) => (
              <DataListItem
                item={item}
                itemActions={itemActions}
                key={item.id || index}
                objectType={objectType}
                showActions={showActions}
                showCounts={showCounts}
                onItemAction={handleItemAction}
              />
            ))}
          </DisclosureGroup>
        </Card.Content>
      </ScrollShadow>
    </Card>
  );
}

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
  depth = 0,
  item,
  itemActions,
  objectType,
  onItemAction,
  showActions = true,
  showCounts = true
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
    <Tooltip closeDelay={0} delay={400} key='remove'>
      <Button
        fullWidth
        isIconOnly
        aria-label='Remove'
        size='sm'
        variant='ghost'
        onPress={() => handleAction('remove')}
      >
        <IconCopyX className='text-danger' stroke={1.5} />
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
    <Tooltip closeDelay={0} delay={400} key='openAll'>
      <Button
        fullWidth
        isIconOnly
        aria-label='Open All'
        size='sm'
        variant='ghost'
        onPress={() => handleAction('openAll')}
      >
        <IconFolders stroke={1.5} />
      </Button>
      <Tooltip.Content className='text-xs'>
        Open all in new tabs
      </Tooltip.Content>
    </Tooltip>
  );

  const copyButton = (
    <Tooltip closeDelay={0} delay={400} key='copy'>
      <Button
        fullWidth
        isIconOnly
        aria-label='Copy'
        size='sm'
        variant='ghost'
        onPress={() => handleAction('copy')}
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
    <Tooltip closeDelay={0} delay={400} key='shareAll'>
      <Button
        fullWidth
        isIconOnly
        aria-label='Share All'
        size='sm'
        variant='ghost'
        onPress={() => handleAction('shareAll')}
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
    <Tooltip closeDelay={0} delay={400} key='share'>
      <Button
        fullWidth
        isIconOnly
        aria-label='Share'
        size='sm'
        variant='ghost'
        onPress={() => handleAction('share')}
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
    <Tooltip className='flex-1' closeDelay={0} delay={200}>
      <Tooltip.Trigger className='flex items-center truncate'>
        {item.typeId === 'CARD' && (
          <IconChartBar
            className='mr-1 inline shrink-0 align-text-bottom'
            size={14}
            stroke={1.5}
          />
        )}
        {item.label}
      </Tooltip.Trigger>
      <Tooltip.Content offset={4} placement='top left'>
        ID: {item.id}
      </Tooltip.Content>
    </Tooltip>
  );

  const itemLabel =
    !item?.isVirtualParent &&
    (item.url ? (
      <Link
        className='truncate text-sm font-normal no-underline decoration-accent hover:text-accent hover:underline'
        href={item.url}
        isDisabled={!item.url}
        target='_blank'
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
          <Button isIconOnly size='sm' variant='ghost'>
            <IconDots stroke={1.5} />
          </Button>
          <Popover.Content offset={4} placement='left'>
            <Popover.Dialog className='p-0'>
              <ButtonGroup
                fullWidth
                className='flex max-w-xs justify-end'
                size='sm'
                variant='ghost'
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
      className='space-0 w-full border-t border-border'
      isOpen={isOpen}
      onOpenChange={setIsOpen}
    >
      <Disclosure.Heading className='my-1 flex min-h-9 w-full flex-row justify-between gap-1'>
        <div className='flex w-full min-w-0 flex-1 basis-4/5 items-center gap-2'>
          {itemLabel}
          <Disclosure.Trigger
            aria-label='Toggle'
            className='flex shrink-0 flex-row items-center gap-1'
            variant='tertiary'
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
              depth={depth + 1}
              index={index}
              item={child}
              itemActions={itemActions}
              key={child.id || index}
              objectType={objectType}
              showActions={showActions}
              showCounts={showCounts}
              onItemAction={onItemAction}
            />
          ))}
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
}
