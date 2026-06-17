import {
  Button,
  ButtonGroup,
  Card,
  Checkbox,
  CheckboxGroup,
  Disclosure,
  DisclosureGroup,
  Link,
  Popover,
  ScrollShadow,
  Separator,
  Spinner,
  Tooltip
} from '@heroui/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { memo, useCallback, useMemo, useRef, useState } from 'react';

import { launchActivityLog } from '@/utils/activityLog';
import { getAvailableActions } from '@/utils/availableActions';
import { getValidTabForInstance } from '@/utils/currentObject';
import { parseMarkdownBold, stripMarkdownBold } from '@/utils/markdown';
import { launchView } from '@/utils/sidepanel';
import IconArrowSquareOut from '@icons/arrow-square-out.svg?react';
import IconCancel from '@icons/cancel.svg?react';
import IconChevronDown from '@icons/chevron-down.svg?react';
import IconClipboardCopy from '@icons/clipboard-copy.svg?react';
import IconCompass from '@icons/compass.svg?react';
import IconDotsHorizontal from '@icons/dots-horizontal.svg?react';
import IconInfoCircle from '@icons/info-circle.svg?react';
import IconLineage from '@icons/lineage.svg?react';
import IconListSearch from '@icons/list-search.svg?react';
import IconPeoplePlus from '@icons/people-plus.svg?react';
import IconPersonPlus from '@icons/person-plus.svg?react';
import IconReset from '@icons/reset.svg?react';
import IconSync from '@icons/sync.svg?react';
import IconX from '@icons/x.svg?react';

import { AnimatedCheck } from '../AnimatedCheck';
import { DisabledTooltip } from '../DisabledTooltip';
import { ObjectTypeIcon } from '../ObjectTypeIcon';

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
 * @param {React.ReactNode} [props.banner] - Content rendered inside the Card between the header and the items list (after the header `<Separator>`), pinned above the scroll area. Use for status/context that belongs to the whole list (e.g. a dependency-check alert above a delete view's affected-objects list). Pass `null`/`false` to omit.
 * @param {Array} props.items - Array of list items with optional children
 * @param {string} props.title - Plain-text header title. Supports inline `**bold**` markdown for emphasis (parsed via `parseMarkdownBold`). The tooltip mirrors the same text with bold markers stripped so the overlay reads as unstyled prose.
 * @param {1|2} [props.titleLineClamp=1] - Max lines the header title clamps to before truncating. Defaults to 1; pass 2 for long titles (e.g. a bolded object name) that read better across two lines.
 * @param {HeaderActionType[]} props.headerActions - Array of action types to show in header
 * @param {Function} props.onClose - Callback when close button is clicked (shows close button if provided)
 * @param {boolean} props.isRefreshing - Whether refresh action is in progress
 * @param {string|number} props.objectId - The view's source object ID, used by the `reload` header action to detect when the current object already matches this view
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
 * @param {Number} props.virtualThreshold - Item array length above which virtualization activates at that level (default: 50). Both the top-level items map and any item's children map virtualize automatically when their length exceeds this. Pass `Infinity` to disable.
 * @param {'transparent' | 'default' | 'secondary' | 'tertiary'} [props.variant] - Card variant (default: HeroUI's `default`). Use `transparent` when nested inside another Card to avoid double shadows/borders.
 * @param {Boolean} [props.selectionMode] - When true, selectable rows render a leading `<Checkbox>` (control only, with `aria-label={item.label}` for screen readers). The row's label, count, empty space, and chevron all live inside the `Disclosure.Trigger` — so clicking the actual checkbox toggles selection while clicking anywhere else in the row toggles the disclosure. Non-selectable rows get a leading 16px placeholder so labels stay column-aligned. The trailing action slot is hidden in selection mode. Items are wrapped in a `CheckboxGroup` so a select-all in `selectionToolbar` can show indeterminate state. Selection state is controlled by the consumer via `selectedIds` + `onSelectionChange`.
 * @param {Set} [props.selectedIds] - Controlled set of currently-selected item ids. Required when `selectionMode` is true.
 * @param {Function} [props.onSelectionChange] - `(newSelectedIds: Set<string>) => void` callback fired when the selection set changes. Required when `selectionMode` is true. Receives the full new Set after any add/remove from the wrapping `CheckboxGroup`'s `onChange`.
 * @param {Function} [props.isSelectable] - `(item) => boolean` filter. When `selectionMode` is true, only items returning true get a checkbox-wrapped label; others get an empty 16px placeholder to preserve column alignment. Defaults to `() => true`.
 * @param {Function} [props.getItemLock] - `(item) => { locked: boolean, tooltip: string } | null`. When it returns `locked`, the item's checkbox renders read-only (kept checked, can't be unchecked) and muted, wrapped in a tooltip showing `tooltip`. Uses `aria-disabled` rather than `isDisabled` so the tooltip still fires and the row's label link stays clickable. The consumer must also keep the id in `selectedIds` (e.g. re-add it in `onSelectionChange`) so the lock holds. Applies to both leaf rows and parent (group-header) rows; a locked parent gets the same read-only + muted checkbox while its disclosure toggle stays interactive.
 * @param {React.ReactNode} [props.selectionToolbar] - Selection-mode-only content rendered as a third header row directly under the action buttons. Use for "Select all"/"Deselect all" or other bulk-selection controls. Ignored when `selectionMode` is false.
 * @param {Boolean} [props.fillHeight] - When true, the root Card fills its parent's available height (`h-full`) instead of being content-sized (`max-h-fit`), so the items list scrolls internally and the footer stays pinned at the bottom. Requires a parent that provides a constrained height (a flex/grid column). Default false preserves content-sizing.
 * @param {React.ReactNode} [props.footer] - Content rendered inside the Card below the items list, separated from the scroll area by a `<Separator>`. Use for a primary action that should sit pinned beneath the list (e.g. a full-width "Transfer ownership to…" button in selection mode). Consumers decide visibility; pass `null`/`false` to omit.
 * @param {string} [props.subtext] - Plain-text secondary content for the second header row (typically counts, status text, or a breadcrumb). Supports inline `**bold**` markdown the same way `title` does. Truncates if it can't fit alongside header actions, but does NOT get a hover tooltip; every subtext we render is a short, bounded count/status string and a tooltip mirroring already-visible text felt redundant.
 * @param {React.ReactNode} [props.subtextStartContent] - Node rendered inline at the start of the second header (subtext) row, before the subtext text (e.g. a status `Chip` such as "Beta"). Pass it `shrink-0` so the subtext truncates after it rather than the chip. Omit for no adornment.
 * @param {Array<{ key: string, icon: React.ReactNode, tooltipText: string, onPress: () => void, isDisabled?: boolean, isActive?: boolean, ariaLabel?: string }>} [props.customHeaderActions] - View-specific header buttons rendered inline after the built-in `headerActions`. Use this for actions that don't fit the preset enum (Transfer Ownership, Selection toggle, etc.).
 * @param {string} [props.viewType] - The action key for this view (e.g. `'getCards'`, `'getDatasets'`). Required when `'reload'` is in `headerActions`. Used as the `type` passed to `launchView` and as the key looked up against `getAvailableActions(currentContext)` to decide if reload is enabled.
 * @param {Object} [props.currentContext] - Live `DomoContext` for the user's currently-active object. Required when `'reload'` is in `headerActions`. Drives whether reload is enabled (current object differs from original AND supports the view).
 * @param {Boolean} [props.allowsMultipleExpanded=false] - When true, multiple rows can be expanded at once. Defaults to false (single-expansion: opening one collapses its siblings). Pair with `defaultExpandedIds` to render a tree fully expanded.
 * @param {Array|Set} [props.defaultExpandedIds] - Item ids to start expanded. Seeds each DisclosureGroup's initial (uncontrolled) expansion plus the shadow expansion state once on mount, so a consumer can render a tree fully expanded by default (e.g. a read-only list inside a modal). Omit for all-collapsed.
 */
export function DataList({
  allowsMultipleExpanded = false,
  banner,
  currentContext,
  customHeaderActions,
  defaultExpandedIds,
  fillHeight = false,
  footer,
  getItemLock,
  headerActions = [],
  isRefreshing = false,
  isSelectable,
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
  onSelectionChange,
  onShareAll,
  onStatusUpdate,
  selectedIds,
  selectionMode = false,
  selectionToolbar,
  showActions = true,
  showCounts = true,
  subtext,
  subtextStartContent,
  title,
  titleLineClamp = 1,
  variant,
  viewType,
  virtualThreshold = 50
}) {
  const [isHeaderShared, setIsHeaderShared] = useState(false);
  // Centralized expansion state, keyed by item.id, survives unmount/remount
  // when items virtualize. See `VirtualizedItems` below.
  const [expandedIds, setExpandedIds] = useState(() => new Set(defaultExpandedIds || []));
  const onToggleExpanded = useCallback((id, isOpen) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (isOpen) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // Loggable objects across the whole list (deduped) for the header "View
  // activity log for all" action. Drives both whether that header button shows
  // and what it logs (every real object in the list + its descendants).
  const headerLogObjects = useMemo(() => collectActivityLogObjects(items), [items]);
  const hasHeaderLog = headerLogObjects.length > 0;

  /**
   * Handle header action button clicks
   * Standard actions (copy, openAll) are handled here.
   * Custom actions are delegated to callbacks.
   */
  const handleHeaderAction = useCallback(
    async (actionType) => {
      try {
        switch (actionType) {
          case 'activityLogAll': {
            if (headerLogObjects.length === 0) break;
            const instance = activityLogInstanceFor(items) ?? currentContext?.instance ?? null;
            if (instance) {
              const tabId = await getValidTabForInstance(instance);
              await launchActivityLog({ instance, objects: headerLogObjects, tabId, type: 'multi-object' });
              window.close();
            }
            break;
          }

          case 'openAll': {
            // Filter out DATA_APP items (we want their children, not the app itself)
            const urls = collectAllUrls(items, (item) => item.typeId !== 'DATA_APP');
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

          case 'reload':
            // Re-launch the same view (`viewType`) for the user's currently
            // active object. Writes new sidepanel data; App.jsx's storage
            // listener bumps `viewKey`, remounting this view component which
            // re-reads the new context from sidepanel storage.
            await launchView({ currentContext, type: viewType });
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
        onStatusUpdate?.('Error', err.message || `Failed to ${actionType}`, 'danger', 3000);
      }
    },
    [currentContext, headerLogObjects, items, itemLabel, onRefresh, onShareAll, onStatusUpdate, viewType]
  );

  /**
   * Handle item action button clicks
   * Standard actions (copy, openAll, remove) are handled here.
   * Custom actions are delegated to callbacks.
   */
  const handleItemAction = useCallback(
    async (actionType, item) => {
      try {
        switch (actionType) {
          case 'activityLog': {
            const instance = item.domoObject?.baseUrl
              ? new URL(item.domoObject.baseUrl).hostname.replace('.domo.com', '')
              : null;
            if (item.id && item.typeId && instance) {
              const tabId = await getValidTabForInstance(instance);
              await launchActivityLog({
                instance,
                objects: [{ id: String(item.originalId ?? item.id), name: item.label ?? '', type: item.typeId }],
                tabId,
                type: 'single-object'
              });
              window.close();
            }
            break;
          }
          case 'activityLogAll': {
            const objects = collectActivityLogObjects([item]);
            if (objects.length === 0) {
              onStatusUpdate?.('No Objects', 'No loggable objects found here', 'warning', 3000);
              break;
            }
            const instance = activityLogInstanceFor([item]);
            if (instance) {
              const tabId = await getValidTabForInstance(instance);
              await launchActivityLog({ instance, objects, tabId, type: 'multi-object' });
              window.close();
            }
            break;
          }
          case 'copy': {
            // Prefer originalId for clipboard when present — consumers may
            // namespace `id` to avoid cross-namespace key collisions while
            // still wanting the canonical id available for paste.
            const copyId = item.originalId ?? item.id;
            await navigator.clipboard.writeText(copyId?.toString() || '');
            onStatusUpdate?.('Copied', `ID **${copyId}** copied to clipboard`, 'success', 2000);
            break;
          }
          case 'lineage': {
            const id = item.id;
            const instance = item.domoObject?.baseUrl
              ? new URL(item.domoObject.baseUrl).hostname.replace('.domo.com', '')
              : null;
            if (id && instance) {
              const tabId = await getValidTabForInstance(instance);
              await chrome.storage.session.set({
                lineageEntityId: id,
                lineageEntityType: item.typeId || 'DATA_SOURCE',
                lineageInstance: instance,
                lineageObjectName: item.label || `${item.typeId || 'DATA_SOURCE'} ${id}`,
                lineageTabId: tabId
              });
              const tab = await chrome.tabs.get(tabId);
              chrome.tabs.create({
                index: tab.index + 1,
                openerTabId: tab.id,
                url: chrome.runtime.getURL('src/options/index.html#lineage'),
                windowId: tab.windowId
              });
              window.close();
            }
            break;
          }
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

          case 'viewsExplorer': {
            const baseUrl = item.domoObject?.baseUrl;
            if (baseUrl && item.id) {
              window.open(`${baseUrl}/datasources/${item.id}/view/create`, '_blank', 'noopener,noreferrer');
            }
            break;
          }

          default:
            break;
        }
      } catch (err) {
        console.error(`[DataList] Error in item action ${actionType}:`, err);
        onStatusUpdate?.('Error', err.message || `Failed to ${actionType}`, 'danger', 3000);
      }
    },
    [itemLabel, onItemRemove, onItemShare, onItemShareAll, onStatusUpdate]
  );

  const hasInlineActions = headerActions.length > 0 || (customHeaderActions && customHeaderActions.length > 0);
  const hasSelectionToolbar = selectionMode && Boolean(selectionToolbar);
  const hasHeader = title || subtext || subtextStartContent || hasInlineActions || onClose || hasSelectionToolbar;
  // The header-level "View activity log for all" button shows only when a header
  // already exists for some other reason: it never conjures a blank header just
  // to host itself (headerless lists are still covered by the per-row "for all"
  // action). It also respects `showActions`, so selection-only lists stay clean.
  const showHeaderLogButton = hasHeaderLog && showActions && hasHeader;

  // In selection mode, wrap the rendered items in a HeroUI CheckboxGroup so
  // each row's `<Checkbox value={item.id}>` is driven by group context. The
  // wrapper uses `display: contents` (via the `render` prop) so it doesn't
  // disturb the Card's flex/scroll chain — CheckboxGroup's default
  // `flex flex-col gap-2` would interrupt the `min-h-0 flex-1` lineage that
  // makes ScrollShadow scroll. The group still emits `role="group"` for ARIA.
  // Selected ids are coerced to strings because React Aria's CheckboxGroup
  // values are strings; per-row `value={String(item.id)}` matches.
  const withSelectionGroup = (children) => {
    if (!selectionMode) return children;
    return (
      <CheckboxGroup
        aria-label='Select items'
        render={(props) => <div {...props} style={{ display: 'contents' }} />}
        value={selectedIds ? [...selectedIds].map(String) : []}
        onChange={(values) => onSelectionChange?.(new Set(values))}
      >
        {children}
      </CheckboxGroup>
    );
  };
  // sortItemsByLabel recurses through children — for 130-item parent lists with
  // 400 leaf children that's a non-trivial sort. Memoizing keeps it from
  // re-running on every state change (e.g. each Disclosure toggle).
  const sortedItems = useMemo(() => sortItemsByLabel(items), [items]);

  return (
    <Card
      className={`datalist-root flex min-h-0 w-full flex-1 flex-col gap-0 p-2 ${fillHeight ? 'h-full' : 'max-h-fit'}`}
      variant={variant}
    >
      {hasHeader && (
        // HeroUI canonical header pattern: close button is an absolute-positioned
        // sibling of Card.Title (NOT inside Card.Title). Card.Title is one line
        // with right padding to clear the close icon. Subtext + action buttons
        // live on a second row inside Card.Header. Actions render inline — no
        // IconDotsHorizontal Popover collapse — so primary actions like Refresh are one
        // click instead of two. Title and subtext are plain strings with optional
        // `**bold**` markdown rendered via `parseMarkdownBold`. Only the title
        // gets a HeroUI Tooltip (`stripMarkdownBold` flattens it for the
        // overlay so the hover text reads as unstyled prose) — subtext is
        // always a bounded short count/status string, so a tooltip mirroring
        // already-visible content would be redundant.
        <Card.Header className='gap-1'>
          {title && (
            <Tooltip>
              <Tooltip.Trigger className='min-w-0 pr-8'>
                <Card.Title className={titleLineClamp === 2 ? 'line-clamp-2' : 'line-clamp-1'}>
                  {parseMarkdownBold(title)}
                </Card.Title>
              </Tooltip.Trigger>
              <Tooltip.Content className='max-w-60'>{stripMarkdownBold(title)}</Tooltip.Content>
            </Tooltip>
          )}
          {onClose && (
            <Tooltip>
              <Button
                isIconOnly
                aria-label='Close view'
                className='absolute top-1 right-2'
                size='sm'
                variant='ghost'
                onPress={onClose}
              >
                <IconX />
              </Button>
              <Tooltip.Content className='max-w-60'>Close view</Tooltip.Content>
            </Tooltip>
          )}
          {(subtext || subtextStartContent || hasInlineActions || showHeaderLogButton) && (
            <div className='flex min-w-0 items-center justify-between gap-2'>
              {subtextStartContent}
              <div className='min-w-0 flex-1 truncate text-xs text-muted'>{parseMarkdownBold(subtext)}</div>
              {(hasInlineActions || showHeaderLogButton) && (
                <ButtonGroup hideSeparator className='flex shrink-0' size='sm' variant='ghost'>
                  {customHeaderActions?.map((action) => (
                    <Tooltip key={action.key}>
                      <Button
                        isIconOnly
                        aria-label={action.ariaLabel ?? action.tooltipText}
                        className={action.isActive ? 'text-accent' : undefined}
                        isDisabled={action.isDisabled}
                        size='sm'
                        variant='ghost'
                        onPress={action.onPress}
                      >
                        {action.icon}
                      </Button>
                      <Tooltip.Content className='max-w-60' placement='bottom'>
                        {action.tooltipText}
                      </Tooltip.Content>
                    </Tooltip>
                  ))}
                  {headerActions.includes('openAll') && (
                    <Tooltip>
                      <Button
                        isIconOnly
                        aria-label='Open All'
                        size='sm'
                        variant='ghost'
                        onPress={() => handleHeaderAction('openAll')}
                      >
                        <IconArrowSquareOut />
                      </Button>
                      <Tooltip.Content className='max-w-60' placement='bottom'>
                        Open all in new tabs
                      </Tooltip.Content>
                    </Tooltip>
                  )}
                  {onShareAll && headerActions.includes('shareAll') && (
                    <Tooltip>
                      <Button
                        isIconOnly
                        aria-label='Share All'
                        size='sm'
                        variant='ghost'
                        onPress={() => handleHeaderAction('shareAll')}
                      >
                        {isHeaderShared ? <AnimatedCheck stroke={1.5} /> : <IconPeoplePlus />}
                      </Button>
                      <Tooltip.Content className='max-w-60' placement='bottom'>
                        {isHeaderShared ? 'Shared!' : 'Share all with yourself'}
                      </Tooltip.Content>
                    </Tooltip>
                  )}
                  {/* Sits right of Open All / Share All but left of Reload and
                      Refresh, so the destructive/navigational controls stay at
                      the far edge. */}
                  {showHeaderLogButton && (
                    <Tooltip>
                      <Button
                        isIconOnly
                        aria-label='View Activity Log for all'
                        size='sm'
                        variant='ghost'
                        onPress={() => handleHeaderAction('activityLogAll')}
                      >
                        <IconListSearch />
                      </Button>
                      <Tooltip.Content className='max-w-60' placement='bottom'>
                        View activity log for all in this list
                      </Tooltip.Content>
                    </Tooltip>
                  )}
                  {headerActions.includes('reload') &&
                    viewType &&
                    (() => {
                      // Always rendered (when opted-in) to keep the action bar
                      // layout stable as the user navigates. When the current
                      // object can't reload, it renders through DisabledTooltip
                      // so the tooltip explaining *why* still shows (that
                      // component handles the disabled-but-hoverable mechanics).
                      const currentTypeId = currentContext?.domoObject?.typeId;
                      const reloadDisabledReason = !currentTypeId
                        ? 'Navigate to a Domo object to reload'
                        : !getAvailableActions(currentContext).has(viewType)
                          ? "Current object doesn't support this view"
                          : currentContext.domoObject.id === objectId && currentTypeId === objectType
                            ? 'Already showing data for the current object'
                            : null;
                      const isReloadDisabled = reloadDisabledReason !== null;
                      const tooltipText = reloadDisabledReason ?? 'Reload for current object';
                      return isReloadDisabled ? (
                        <DisabledTooltip content={tooltipText} placement='bottom'>
                          <Button isIconOnly aria-label='Reload' size='sm' variant='ghost'>
                            <IconReset />
                          </Button>
                        </DisabledTooltip>
                      ) : (
                        <Tooltip>
                          <Button
                            isIconOnly
                            aria-label='Reload'
                            size='sm'
                            variant='ghost'
                            onPress={() => handleHeaderAction('reload')}
                          >
                            <IconReset />
                          </Button>
                          <Tooltip.Content className='max-w-60' placement='bottom'>
                            {tooltipText}
                          </Tooltip.Content>
                        </Tooltip>
                      );
                    })()}
                  {headerActions.includes('refresh') && (
                    <Tooltip>
                      <Button
                        isIconOnly
                        aria-label='Refresh'
                        isDisabled={isRefreshing}
                        size='sm'
                        variant='ghost'
                        onPress={() => handleHeaderAction('refresh')}
                      >
                        <IconSync className={isRefreshing ? 'animate-spin' : ''} />
                      </Button>
                      <Tooltip.Content className='max-w-60' placement='bottom'>
                        Refresh
                      </Tooltip.Content>
                    </Tooltip>
                  )}
                </ButtonGroup>
              )}
            </div>
          )}
          {selectionMode && selectionToolbar && <div className='flex min-w-0 items-center'>{selectionToolbar}</div>}
        </Card.Header>
      )}
      <Separator className='mt-1.5' />
      {banner && <div className='shrink-0 pt-2'>{banner}</div>}
      {sortedItems.length > virtualThreshold
        ? // Virtualized top-level: VirtualizedItems is the scroll container.
          // Bypass ScrollShadow so TanStack Virtual listens for scroll on an
          // element that actually scrolls. Loses ScrollShadow's edge-fade
          // gradient — acceptable for high-volume lists where windowing matters
          // more than the visual flourish.
          withSelectionGroup(
            <Card.Content className='flex min-h-0 w-full flex-1 flex-col p-0'>
              <DisclosureGroup
                allowsMultipleExpanded={allowsMultipleExpanded}
                className='flex min-h-0 w-full flex-1 flex-col divide-y divide-border'
                defaultExpandedKeys={defaultExpandedIds}
              >
                <VirtualizedItems
                  items={sortedItems}
                  renderItem={(item) => (
                    <DataListItem
                      allowsMultipleExpanded={allowsMultipleExpanded}
                      canShare={!!onItemShare}
                      canShareAll={!!onItemShareAll}
                      defaultExpandedIds={defaultExpandedIds}
                      expandedIds={expandedIds}
                      getItemLock={getItemLock}
                      isSelectable={isSelectable}
                      item={item}
                      itemActions={itemActions}
                      objectType={objectType}
                      selectedIds={selectedIds}
                      selectionMode={selectionMode}
                      showActions={showActions}
                      showCounts={showCounts}
                      virtualThreshold={virtualThreshold}
                      onItemAction={handleItemAction}
                      onToggleExpanded={onToggleExpanded}
                    />
                  )}
                />
              </DisclosureGroup>
            </Card.Content>
          )
        : withSelectionGroup(
            <ScrollShadow
              hideScrollBar
              // `overscroll-y-contain` only when the DataList owns its scroll
              // viewport (`fillHeight`, bounded by a flex parent). When content-
              // sized (e.g. inside a modal body that owns the scroll), this
              // container isn't actually scrollable, and `contain` would still
              // block wheel events from chaining to the ancestor scroller — so
              // scrolling over the rows would do nothing while the margins and
              // scrollbar worked. `overscroll-y-auto` there lets the wheel reach
              // the real scroller. In the bounded case this stays scrollable, so
              // `auto` only matters at the edge, where it chains to the
              // overflow-hidden shell (a no-op): no regression.
              className={`min-h-0 flex-1 overflow-y-auto overscroll-x-none ${fillHeight ? 'overscroll-y-contain' : 'overscroll-y-auto'}`}
              offset={2}
              orientation='vertical'
            >
              <Card.Content>
                <DisclosureGroup
                  allowsMultipleExpanded={allowsMultipleExpanded}
                  className='flex w-full flex-col divide-y divide-border'
                  defaultExpandedKeys={defaultExpandedIds}
                >
                  {sortedItems.map((item, index) => (
                    <DataListItem
                      allowsMultipleExpanded={allowsMultipleExpanded}
                      canShare={!!onItemShare}
                      canShareAll={!!onItemShareAll}
                      defaultExpandedIds={defaultExpandedIds}
                      expandedIds={expandedIds}
                      getItemLock={getItemLock}
                      isSelectable={isSelectable}
                      item={item}
                      itemActions={itemActions}
                      key={item.id || index}
                      objectType={objectType}
                      selectedIds={selectedIds}
                      selectionMode={selectionMode}
                      showActions={showActions}
                      showCounts={showCounts}
                      virtualThreshold={virtualThreshold}
                      onItemAction={handleItemAction}
                      onToggleExpanded={onToggleExpanded}
                    />
                  ))}
                </DisclosureGroup>
              </Card.Content>
            </ScrollShadow>
          )}
      {footer && (
        // Mirrors the header's Separator pattern (`mt-1.5` on the top divider)
        // so the footer slot has the same 6px breathing room above its rule as
        // the header has below its rule. `shrink-0` keeps it pinned even when
        // the list above is taller than the viewport.
        <>
          <Separator className='mt-1.5' />
          <div className='shrink-0 pt-2'>{footer}</div>
        </>
      )}
    </Card>
  );
}

/**
 * Available header action types for DataList. `activityLogAll` is rendered
 * unconditionally (gated only on the list having loggable objects), not opt-in
 * via the `headerActions` prop.
 * @typedef {'openAll' | 'shareAll' | 'refresh' | 'reload' | 'activityLogAll'} HeaderActionType
 */

/**
 * Available item action types for DataList items. `activityLog` (single object)
 * and `activityLogAll` (item + all descendants) are added to every row
 * automatically, not opt-in via the `itemActions` prop.
 * @typedef {'remove' | 'openAll' | 'copy' | 'share' | 'shareAll' | 'viewsExplorer' | 'lineage' | 'activityLog' | 'activityLogAll'} ItemActionType
 */

/**
 * Finds the Domo instance subdomain for an item tree by walking to the first
 * row that carries a real object base URL. Used to resolve the instance for the
 * activity-log "for all" actions, where the clicked row may be a virtual group
 * header with no object of its own.
 * @param {Array} itemList - Array of items (and their children) to walk.
 * @returns {string|null} Instance subdomain (e.g. `my-co`) or null if none found.
 */
function activityLogInstanceFor(itemList) {
  for (const item of itemList) {
    const baseUrl = item.domoObject?.baseUrl;
    if (baseUrl) return new URL(baseUrl).hostname.replace('.domo.com', '');
    if (item.children && item.children.length > 0) {
      const fromChild = activityLogInstanceFor(item.children);
      if (fromChild) return fromChild;
    }
  }
  return null;
}

/**
 * Recursively collect loggable objects from an item tree for the activity-log
 * "for all" actions. Returns deduped `{ id, name, type }` records (keyed by
 * `type:id`). Skips virtual group headers (no real object) and rows missing a
 * type/id or carrying a negative numeric id (Overview/Favorites/Shared
 * pseudo-pages); UUID/string ids are kept.
 * @param {Array} itemList - Array of items (and their children) to walk.
 * @returns {Array<{ id: string, name: string, type: string }>}
 */
function collectActivityLogObjects(itemList) {
  const seen = new Set();
  const objects = [];
  const traverse = (list) => {
    for (const item of list) {
      const id = item.originalId ?? item.id;
      if (!item.isVirtualParent && id != null && item.typeId && !(Number(id) < 0)) {
        const key = `${item.typeId}:${id}`;
        if (!seen.has(key)) {
          seen.add(key);
          objects.push({ id: String(id), name: item.label ?? '', type: item.typeId });
        }
      }
      if (item.children && item.children.length > 0) {
        traverse(item.children);
      }
    }
  };
  traverse(itemList);
  return objects;
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

// Row geometry for virtualization. ROW_HEIGHT matches `min-h-9` on flat rows
// and Disclosure headings; long-wrapping labels self-correct via
// `measureElement`. MAX_VISIBLE_CHILDREN_ROWS caps the height of bounded child
// lists so an expanded group with 1000s of items doesn't push the page.
const ROW_HEIGHT = 36;
const MAX_VISIBLE_CHILDREN_ROWS = 12;
const VIRTUAL_OVERSCAN = 5;

/**
 * Renders an items array via TanStack Virtual when the array is large enough
 * that mounting every row would be wasteful. Used at two call sites in
 * `DataList`: the top-level items map and each `Disclosure.Body`'s children
 * map. Top-level usage passes `bounded=false` so the parent `ScrollShadow`
 * owns the scroll viewport; child usage passes `bounded=true` so an expanded
 * group's height is capped.
 *
 * The `renderItem` callback is passed the item — typically a `DataListItem`
 * with appropriate props for the call site (top-level has no `depth`, child
 * call site passes `depth + 1`).
 *
 * @param {Object} props
 * @param {boolean} props.bounded - When true, cap height at MAX_VISIBLE_CHILDREN_ROWS * ROW_HEIGHT.
 * @param {Array} props.items - Items to render.
 * @param {(item: Object, index: number) => React.ReactNode} props.renderItem
 */
function VirtualizedItems({ bounded = false, items, renderItem }) {
  const parentRef = useRef(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    estimateSize: () => ROW_HEIGHT,
    getScrollElement: () => parentRef.current,
    overscan: VIRTUAL_OVERSCAN
  });

  const containerStyle = bounded
    ? {
        height: Math.min(items.length * ROW_HEIGHT, MAX_VISIBLE_CHILDREN_ROWS * ROW_HEIGHT)
      }
    : undefined;

  return (
    <div
      ref={parentRef}
      style={containerStyle}
      className={
        bounded
          ? // `overscroll-auto` (not `contain`) lets a bounded child list chain
            // its scroll to the parent once it hits its top/bottom edge — so
            // scrolling inside an expanded group keeps scrolling the whole
            // DataList instead of dead-stopping at the group's boundary. The
            // unbounded top-level container keeps `overscroll-y-contain` so the
            // sidepanel/page itself never bounce-scrolls past the list.
            'w-full overflow-y-auto overscroll-auto'
          : 'min-h-0 w-full flex-1 overflow-y-auto overscroll-x-none overscroll-y-contain'
      }
    >
      <div
        className='divide-y divide-border'
        style={{
          height: virtualizer.getTotalSize(),
          position: 'relative',
          width: '100%'
        }}
      >
        {virtualizer.getVirtualItems().map((vRow) => {
          const item = items[vRow.index];
          return (
            <div
              data-index={vRow.index}
              key={item?.id ?? vRow.index}
              ref={virtualizer.measureElement}
              style={{
                left: 0,
                position: 'absolute',
                top: 0,
                transform: `translateY(${vRow.start}px)`,
                width: '100%'
              }}
            >
              {renderItem(item, vRow.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Allow-list of typeIds that the toolkit's "share with self" flow can target
 * directly. `share.js` also accepts DATA_APP_VIEW / WORKSHEET_VIEW / CARD, but
 * only as workarounds for current-object detection or for `domoapp` cards
 * specifically — neither concern applies inside a DataList, so we surface
 * share/shareAll only for the canonical shareable forms.
 */
const SHAREABLE_TYPES = new Set(['APP', 'DATA_APP', 'DATA_SOURCE', 'PAGE', 'WORKSHEET']);

/**
 * Custom React.memo comparator for DataListItem.
 *
 * Default `Object.is` comparison would treat every new `expandedIds` Set as a
 * prop change and re-render every visible row on every Disclosure toggle. This
 * comparator instead checks reference equality on all stable props, plus only
 * the specific bit `expandedIds.has(item.id)` for this item's own expansion.
 *
 * Result: when one Disclosure toggles, only the toggled row re-renders;
 * sibling rows skip. Big win for the Get Card Pages case (130+ groups).
 *
 * Nested Disclosures: a row also re-renders when one of its direct children's
 * own expansion toggles (see the child-open check below), so that child gets
 * the fresh `expandedIds` reference and can open/close. This covers one level
 * of nested Disclosures (e.g. drill cards under a parent card). A grandchild
 * Disclosure would still need a recursive check; no consumer nests that deep.
 */
function arePropsEqualForRow(prev, next) {
  if (prev.canShare !== next.canShare) return false;
  if (prev.canShareAll !== next.canShareAll) return false;
  if (prev.item !== next.item) return false;
  if (prev.itemActions !== next.itemActions) return false;
  if (prev.objectType !== next.objectType) return false;
  if (prev.showActions !== next.showActions) return false;
  if (prev.showCounts !== next.showCounts) return false;
  if (prev.virtualThreshold !== next.virtualThreshold) return false;
  if (prev.onItemAction !== next.onItemAction) return false;
  if (prev.onToggleExpanded !== next.onToggleExpanded) return false;
  if (prev.selectionMode !== next.selectionMode) return false;
  if (prev.isSelectable !== next.isSelectable) return false;
  if (prev.depth !== next.depth) return false;
  const prevOpen = prev.expandedIds?.has(prev.item.id) ?? false;
  const nextOpen = next.expandedIds?.has(next.item.id) ?? false;
  if (prevOpen !== nextOpen) return false;
  const prevSelected = prev.selectedIds?.has(prev.item.id) ?? false;
  const nextSelected = next.selectedIds?.has(next.item.id) ?? false;
  if (prevSelected !== nextSelected) return false;
  // A row's lock can change without its own selection changing (a Beast Mode's
  // lock depends on which CARDS are selected). getItemLock's identity changes
  // when that upstream selection changes, so resolve and compare the lock here.
  const prevLock = prev.getItemLock?.(prev.item) || null;
  const nextLock = next.getItemLock?.(next.item) || null;
  if ((prevLock?.locked ?? false) !== (nextLock?.locked ?? false)) return false;
  if ((prevLock?.tooltip ?? '') !== (nextLock?.tooltip ?? '')) return false;
  // Parent rows must re-render when any DESCENDANT's selection or expansion
  // changes: a descendant's selection drives this row's indeterminate visual,
  // and a descendant Disclosure needs the fresh `expandedIds` reference to
  // open/close. Recurses the whole subtree, so it holds at any nesting depth
  // (e.g. drills nested under a card under the Cards group). Leaf rows return
  // immediately; cost is O(subtree) and only parent rows pay it.
  if (subtreeStateChanged(prev.item, prev.selectedIds, next.selectedIds, prev.expandedIds, next.expandedIds)) {
    return false;
  }
  return true;
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
 * @param {Set} props.expandedIds - Centralized set of expanded item ids (lifted from local state to survive virtualization unmount/remount).
 * @param {Function} props.onToggleExpanded - (id, isExpanded) => void. Toggles expansion in the parent's expandedIds set.
 * @param {Number} props.virtualThreshold - Children array length above which children virtualize. Threaded recursively from DataList.
 */
function DataListItemImpl({
  allowsMultipleExpanded = false,
  canShare = false,
  canShareAll = false,
  defaultExpandedIds,
  depth = 0,
  expandedIds,
  getItemLock,
  isSelectable,
  item,
  itemActions,
  objectType,
  onItemAction,
  onToggleExpanded,
  selectedIds,
  selectionMode = false,
  showActions = true,
  showCounts = true,
  virtualThreshold = 50
}) {
  const hasChildren = item.children && item.children.length > 0;
  const isOpen = expandedIds?.has(item.id) ?? false;
  const [isCopied, setIsCopied] = useState(false);
  const [isShared, setIsShared] = useState(false);

  // Async-state rendering for virtual parents only. `status` field on
  // DataListItem spans both fetch and transfer phases; the count slot swaps
  // to a spinner or X icon to mirror the row's lifecycle without changing
  // its layout. See useParallelFetches for the producing hook.
  const isLoadingState = item.isVirtualParent && (item.status === 'loading' || item.status === 'transferring');
  const isErrorState = item.isVirtualParent && (item.status === 'error' || item.status === 'failed');
  const showsErrorBody = isErrorState && item.error;
  const statusIndicator = isLoadingState ? (
    <Spinner
      className={`shrink-0 ${item.status === 'transferring' ? 'text-warning' : 'text-accent'}`}
      color='current'
      size='sm'
    />
  ) : isErrorState ? (
    <IconX className='shrink-0 text-danger' size={18} />
  ) : null;

  // Selection-mode rendering: when the row is selectable, the row's label and
  // count move INTO a `<Checkbox>` as `Checkbox.Content` + `<Label>`. HeroUI's
  // `.checkbox` is `flex items-center gap-3`, so the Checkbox.Control (the
  // 16px square) and the Label text are vertically centered against each other
  // by the Checkbox itself — which is what we want, instead of trying to
  // coordinate two siblings sharing the heading's flexbox.
  //
  // Side benefit: the entire label area becomes the click target for selection
  // (standard `<label>` behavior), matching the Gmail/Jira pattern. The chevron
  // remains a separate sibling button on the right, so clicking the chevron
  // toggles disclosure with no event-handling conflict. For non-selectable
  // rows we render an empty 16px placeholder so the label X-position stays
  // consistent across selectable, forbidden, and zero-count rows.
  //
  // The `!mt-0` on the Checkbox is critical: HeroUI's CheckboxGroup CSS adds
  // `.checkbox-group [data-slot="checkbox"] { @apply mt-4 }` to space stacked
  // checkboxes vertically (the default CheckboxGroup layout). DataList wraps
  // items in a CheckboxGroup purely for state collection, but the rule still
  // matches and pushes each row's checkbox 16px down — bottom-aligning the
  // checkbox in the heading and inflating the row from 36px to 52px. The
  // descendant selector has specificity (0,0,2,0), which beats a plain `mt-0`
  // utility (0,0,1,0), so the `!` important modifier is needed to flip the
  // cascade.
  const isItemSelectableInMode = selectionMode && (typeof isSelectable === 'function' ? isSelectable(item) : true);
  const selectionPlaceholder = selectionMode && !isItemSelectableInMode ? <div className='h-9 w-4 shrink-0' /> : null;
  // Lock state for this row (leaf rows only). When locked, the checkbox is
  // read-only + muted and wrapped in a tooltip; the consumer keeps it selected.
  const itemLock = isItemSelectableInMode && typeof getItemLock === 'function' ? getItemLock(item) : null;
  const isLocked = Boolean(itemLock?.locked);

  // Visual indentation per nesting level so children read as descendants
  // rather than as siblings of their parent. Scoped to selection mode on
  // purpose: in default mode each nesting level already sits inside its own
  // `disclosure__body` (HeroUI's `p-2`), which gives ~8px of natural indent
  // per level, so adding an explicit indent here would double up and over-pad
  // the rows. In selection mode that body padding is stripped to `p-0` (see
  // the `[data-slot='checkbox-group'] .disclosure__body` rule in global.css),
  // so without this the nested leaf rows would sit flush against their parent
  // group header. Applied on the row's outer container (Disclosure.Heading or
  // the flat row's wrapper div), NOT on the whole <Disclosure>, because the
  // Disclosure body holds the next level of children and each child already
  // computes its own depth-based padding via `depth + 1` in childRenderProps;
  // padding the whole Disclosure would compound and over-indent. Inline style
  // (rather than a Tailwind class) because `depth` is runtime, so Tailwind's
  // JIT can't emit a class whose name doesn't appear as a static substring of
  // the source.
  const indentStyle = selectionMode && depth > 0 ? { paddingLeft: `${depth * 8}px` } : undefined;

  // Indeterminate state for parent rows: when *some but not all* of the row's
  // selectable children are in `selectedIds`, the parent checkbox should paint
  // the dash icon. Checked-state still comes from the parent's own membership
  // in the CheckboxGroup value (consumer's onChange propagates parent↔children
  // so all-children-selected ⇒ parent in set ⇒ checkbox checked). We filter
  // children by `isSelectable` first so rows whose children are non-selectable
  // (e.g. OwnershipView type rows) never go indeterminate, only the parents
  // in MigrateDownstreamContent-style trees where children are independently
  // selectable.
  const isParentIndeterminate = (() => {
    if (!isItemSelectableInMode || !hasChildren) return false;
    const selectableChildren = item.children.filter((child) =>
      typeof isSelectable === 'function' ? isSelectable(child) : true
    );
    if (selectableChildren.length === 0) return false;
    let selectedCount = 0;
    for (const child of selectableChildren) {
      if (selectedIds?.has(String(child.id))) selectedCount++;
    }
    return selectedCount > 0 && selectedCount < selectableChildren.length;
  })();

  const handleAction = useCallback(
    async (actionType) => {
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
    },
    [item, onItemAction]
  );

  // Memoize applicableActions: 7 button JSX trees + selection logic in one
  // pass. Steady-state, this saves rebuilding 70-140 React elements per
  // re-render across visible rows. With React.memo at the row level, most
  // rows skip render entirely, so this useMemo only fires when a row
  // genuinely needs to re-render (initial mount, expansion toggle, copy/share
  // feedback flicker).
  const applicableActions = useMemo(() => {
    if (!showActions) return [];

    const removeButton = (
      <Tooltip key='remove'>
        <Button fullWidth isIconOnly aria-label='Remove' size='sm' variant='ghost' onPress={() => handleAction('remove')}>
          <IconCancel className='text-danger' />
        </Button>
        <Tooltip.Content className='max-w-60'>
          Remove{' '}
          <span className='lowercase'>
            {objectType} from {item?.domoObject?.typeName || item?.typeId}
          </span>
        </Tooltip.Content>
      </Tooltip>
    );

    const openAllButton = (
      <Tooltip key='openAll'>
        <Button fullWidth isIconOnly aria-label='Open All' size='sm' variant='ghost' onPress={() => handleAction('openAll')}>
          <IconArrowSquareOut />
        </Button>
        <Tooltip.Content className='max-w-60'>Open all in new tabs</Tooltip.Content>
      </Tooltip>
    );

    const copyButton = (
      <Tooltip key='copy'>
        <Button fullWidth isIconOnly aria-label='Copy' size='sm' variant='ghost' onPress={() => handleAction('copy')}>
          {isCopied ? <AnimatedCheck stroke={1.5} /> : <IconClipboardCopy />}
        </Button>
        <Tooltip.Content className='max-w-60'>{isCopied ? 'Copied!' : 'Copy ID'}</Tooltip.Content>
      </Tooltip>
    );

    const shareAllButton = (
      <Tooltip key='shareAll'>
        <Button
          fullWidth
          isIconOnly
          aria-label='Share All'
          size='sm'
          variant='ghost'
          onPress={() => handleAction('shareAll')}
        >
          {isShared ? <AnimatedCheck stroke={1.5} /> : <IconPeoplePlus />}
        </Button>
        <Tooltip.Content className='max-w-60'>{isShared ? 'Shared!' : 'Share all with yourself'}</Tooltip.Content>
      </Tooltip>
    );

    const shareButton = (
      <Tooltip key='share'>
        <Button fullWidth isIconOnly aria-label='Share' size='sm' variant='ghost' onPress={() => handleAction('share')}>
          {isShared ? <AnimatedCheck stroke={1.5} /> : <IconPersonPlus />}
        </Button>
        <Tooltip.Content className='max-w-60'>{isShared ? 'Shared!' : 'Share with yourself'}</Tooltip.Content>
      </Tooltip>
    );

    const viewsExplorerButton = (
      <Tooltip key='viewsExplorer'>
        <Button
          fullWidth
          isIconOnly
          aria-label='Open in Views Explorer'
          size='sm'
          variant='ghost'
          onPress={() => handleAction('viewsExplorer')}
        >
          <IconCompass />
        </Button>
        <Tooltip.Content className='max-w-60'>Open in Views Explorer</Tooltip.Content>
      </Tooltip>
    );

    const lineageButton = (
      <Tooltip key='lineage'>
        <Button
          fullWidth
          isIconOnly
          aria-label='View Lineage'
          size='sm'
          variant='ghost'
          onPress={() => handleAction('lineage')}
        >
          <IconLineage />
        </Button>
        <Tooltip.Content className='max-w-60'>View Lineage</Tooltip.Content>
      </Tooltip>
    );

    const activityLogButton = (
      <Tooltip key='activityLog'>
        <Button
          fullWidth
          isIconOnly
          aria-label='View Activity Log'
          size='sm'
          variant='ghost'
          onPress={() => handleAction('activityLog')}
        >
          <IconListSearch />
        </Button>
        <Tooltip.Content className='max-w-60'>View activity log</Tooltip.Content>
      </Tooltip>
    );

    const activityLogAllButton = (
      <Tooltip key='activityLogAll'>
        <Button
          fullWidth
          isIconOnly
          aria-label='View Activity Log for all'
          size='sm'
          variant='ghost'
          onPress={() => handleAction('activityLogAll')}
        >
          <IconListSearch />
        </Button>
        <Tooltip.Content className='max-w-60'>View activity log for all</Tooltip.Content>
      </Tooltip>
    );

    if (item.isVirtualParent) {
      if (!hasChildren) return [];
      const actions = [];
      if (item.id !== 'REPORT_BUILDER_group') {
        actions.push(openAllButton);
        if (canShareAll && hasShareableChildren(item)) actions.push(shareAllButton);
      }
      // Virtual group headers have no object of their own, so only the "for all"
      // log applies, covering every real descendant beneath the header.
      actions.push(activityLogAllButton);
      return actions;
    }

    if (itemActions) {
      const actions = [];
      if (itemActions.includes('openAll') && hasChildren) actions.push(openAllButton);
      if (canShareAll && itemActions.includes('shareAll') && hasShareableChildren(item)) actions.push(shareAllButton);
      if (canShare && itemActions.includes('share') && isItemShareable(item)) actions.push(shareButton);
      if (itemActions.includes('lineage') && (item.typeId === 'DATA_SOURCE' || item.typeId === 'DATAFLOW_TYPE'))
        actions.push(lineageButton);
      if (itemActions.includes('viewsExplorer') && item.typeId === 'DATA_SOURCE') actions.push(viewsExplorerButton);
      if (itemActions.includes('copy')) actions.push(copyButton);
      // Activity-log actions are added to every object regardless of the view's
      // opted-in `itemActions`: the single-object log for this row, plus the
      // "for all" log when it has descendants.
      actions.push(activityLogButton);
      if (hasChildren) actions.push(activityLogAllButton);
      return actions;
    }

    // Default logic
    const actions = [];
    if (hasChildren && item.typeId !== 'DATA_APP') {
      actions.push(openAllButton);
    }
    if (canShareAll && hasShareableChildren(item)) {
      actions.push(shareAllButton);
    }

    if (
      ((objectType === 'CARD' && (item.typeId === 'PAGE' || item.typeId === 'DATA_APP_VIEW')) ||
        (itemActions && itemActions?.includes('remove'))) &&
      Number(item.id) >= 0
    ) {
      actions.push(removeButton);
    }

    if (canShare && isItemShareable(item)) actions.push(shareButton);
    actions.push(copyButton);
    // Activity-log actions on every object: single-object for this row, plus the
    // "for all" log when it has descendants.
    actions.push(activityLogButton);
    if (hasChildren) actions.push(activityLogAllButton);
    return actions;
  }, [canShare, canShareAll, hasChildren, handleAction, isCopied, isShared, item, itemActions, objectType, showActions]);

  // Optional leading info-icon marker rendered between the icon and the label
  // text. A plain `<span title>` rather than a React Aria Tooltip so it never
  // nests an interactive element inside the row's disclosure-toggle button, and
  // because it sits at the START of the label it survives the label's
  // `truncate`. The pointed-to explanation also appears as a legend near the
  // list, so the hover is a convenience, not the only path to it.
  // Match the marker icon to the adjacent ObjectTypeIcon's 16px box so the two
  // icons share an identical bottom-line; a smaller icon bottom-aligned next to
  // a 16px one reads as vertically staggered (its optical center sits higher).
  const annotationMarker = item.annotation ? (
    <span className='mr-1 inline-flex cursor-help align-text-bottom text-accent' title={item.annotation}>
      <IconInfoCircle className='size-4 shrink-0' />
    </span>
  ) : null;

  const labelInner = (
    <>
      <ObjectTypeIcon className='mr-1 inline-block shrink-0 align-text-bottom' size={16} typeId={item.typeId} />
      {annotationMarker}
      {item.label}
    </>
  );

  // Full label for the native `title` on truncating non-link rows (virtual
  // parents and non-link disclosure headings render the label inside a
  // `truncate` <p> with no <Link> to surface it). A long label (e.g. a card
  // flagged "(column not used here)") would otherwise truncate with nothing on
  // hover. Mirrors the link rows' native-title approach; only set when the
  // label is a plain string.
  const labelTitle = typeof item.label === 'string' ? item.label : undefined;

  // Muted rows read as secondary/container entries rather than direct results
  // (e.g. a card that only appears because a drill under it uses a column). The
  // class lands on the label wrapper, so the name and the `currentColor`-driven
  // ObjectTypeIcon both mute, while the annotation marker keeps its own
  // `text-accent` and stays prominent.
  const labelMutedClass = item.muted ? ' text-muted' : '';

  // Virtual-parent (group header) weight steps down with nesting: top-level
  // headers stay `font-medium` (500) to anchor each section, while nested
  // headers drop to a half-step (450) — lighter than the top level but still
  // heavier than the normal-weight (400) leaf rows beneath them, so the
  // hierarchy reads at a glance without any nested header looking like body text.
  const virtualHeaderWeightClass = depth > 0 ? 'font-[450]' : 'font-medium';

  // Link items: native `title` shows the full URL on hover. Lighter than
  // React Aria Tooltip (no portal, no delay state machine, no extra DOM) and
  // avoids nested-interactive-element accessibility issues from wrapping a
  // Tooltip.Trigger inside a Link. Non-link items keep the React Aria Tooltip
  // since they still benefit from a custom-positioned `ID:` hover. Virtual
  // parents (synthetic group headers like "App Studio Apps") render plain bold
  // text in the flex-1 slot so their count + chevron cluster on the right —
  // matching the layout of regular grouped items. `min-w-0 truncate` (no
  // `flex-1`) keeps the label content-sized so the count sits adjacent to it
  // instead of getting shoved to the right edge by an expanding label.
  const itemLabel = item?.isVirtualParent ? (
    // Virtual parents share the same `labelInner` (icon + label) as regular
    // items so the row's leading icon stays consistent between collapsed
    // group headers and their expanded leaves. ObjectTypeIcon returns null
    // when item.typeId is unset, so synthetic group rows (no typeId) render
    // identically to before.
    <p className={`min-w-0 truncate text-sm ${virtualHeaderWeightClass}${labelMutedClass}`} title={labelTitle}>
      {labelInner}
    </p>
  ) : item.url ? (
    // `min-w-0` (without `flex-1`) lets the Link be content-sized when text
    // is short and shrink/truncate when long — but never grow into empty
    // space. The Trigger (below) takes flex-1 so the empty space between the
    // link text and the count is part of the disclosure-toggle hit area.
    <Link
      className='block min-w-0 truncate text-sm font-normal decoration-accent hover:text-accent'
      href={item.url}
      isDisabled={!item.url}
      target='_blank'
      title={item.url}
    >
      <Tooltip>
        <Tooltip.Trigger className='block min-w-0 truncate'>{labelInner}</Tooltip.Trigger>
        <Tooltip.Content className='flex flex-col flex-wrap items-start gap-1 text-left' offset={4} placement='top left'>
          {labelTitle}
          <span>ID: {item.originalId ?? item.id}</span>
        </Tooltip.Content>
      </Tooltip>
    </Link>
  ) : (
    <span className={`text-sm${labelMutedClass}`}>
      <Tooltip className='flex-1'>
        <Tooltip.Trigger className='block min-w-0 truncate'>{labelInner}</Tooltip.Trigger>
        <Tooltip.Content className='flex flex-col flex-wrap items-start gap-1 text-left' offset={4} placement='top left'>
          {labelTitle}
          <span>ID: {item.originalId ?? item.id}</span>
        </Tooltip.Content>
      </Tooltip>
    </span>
  );

  const actions =
    applicableActions.length === 1
      ? applicableActions[0]
      : applicableActions.length > 1 && (
          <Popover>
            <Button isIconOnly size='sm' variant='ghost'>
              <IconDotsHorizontal />
            </Button>
            <Popover.Content offset={4} placement='left'>
              <Popover.Dialog className='p-0'>
                <ButtonGroup fullWidth className='flex max-w-xs justify-end' size='sm' variant='ghost'>
                  {applicableActions}
                </ButtonGroup>
              </Popover.Dialog>
            </Popover.Content>
          </Popover>
        );

  // Virtual parents in 'error'/'failed' state with an error message auto-promote
  // to a Disclosure so the user can expand to read the error, even when there
  // are no children. Pure 'loading' state stays as a flat row — nothing to
  // expand mid-fetch.
  if (!hasChildren && !showsErrorBody) {
    // Virtual parents that loaded with zero items render muted with a `(0)`
    // count so they read as "fetched-and-empty" rather than indistinguishable
    // from rows that have content. Distinct from `status === 'loading'` (which
    // shows a spinner) and `status === 'error'` (which auto-promotes to a
    // Disclosure with the error in the body).
    //
    // Outer div carries border-t; inner div carries `my-1 min-h-9`. This
    // mirrors the Disclosure structure so flat rows and Disclosure-heading
    // rows have identical vertical metrics, without the 8px gap that
    // appears when a flat row only has `py-1` while the Disclosure row has
    // `my-1` on its heading.
    //
    // A leaf row also shows a `(count countLabel)` badge when it sets `count`
    // (e.g. a related dataset showing its downstream dependency count), so the
    // count is no longer gated to virtual parents. The muted-empty treatment
    // stays virtual-parent-only.
    const isMutedEmpty = item.isVirtualParent && item.count === 0;
    const flatCount = showCounts && item.count !== undefined && (
      <p className='shrink-0 text-sm whitespace-nowrap text-muted'>
        ({item.count}
        {item.countLabel ? ` ${item.countLabel}` : ''})
      </p>
    );
    return (
      <div className='w-full'>
        <div
          className={`my-1 flex min-h-9 w-full flex-row items-center justify-between gap-2 ${isMutedEmpty ? 'text-muted' : ''}`}
          style={indentStyle}
        >
          {/* Selectable: Checkbox is control-only with `aria-label` for screen
              readers — toggling selection requires clicking the actual
              checkbox. Non-selectable: leading 16px placeholder for column
              alignment. Either way the label container is a separate sibling
              so its click semantics (Link navigation / tooltip ID surfacing)
              stay independent of the selection control. */}
          {isItemSelectableInMode ? (
            isLocked ? (
              // Locked: read-only (can't be unchecked) + muted, wrapped in a
              // tooltip. `aria-disabled` (not `isDisabled`) keeps pointer events
              // alive so the tooltip fires; the consumer keeps the id selected.
              <Tooltip delay={300}>
                <Tooltip.Trigger className='shrink-0 cursor-not-allowed!'>
                  <Checkbox
                    aria-disabled
                    isReadOnly
                    aria-label={typeof item.label === 'string' ? item.label : `Select ${item.id}`}
                    className='mt-0! shrink-0 opacity-60 [--cursor-interactive:var(--cursor-disabled)]'
                    value={String(item.id)}
                  >
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                  </Checkbox>
                </Tooltip.Trigger>
                <Tooltip.Content className='max-w-60'>{itemLock.tooltip}</Tooltip.Content>
              </Tooltip>
            ) : (
              <Checkbox
                aria-label={typeof item.label === 'string' ? item.label : `Select ${item.id}`}
                className='mt-0! shrink-0'
                value={String(item.id)}
              >
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
              </Checkbox>
            )
          ) : (
            selectionPlaceholder
          )}
          <div className='flex w-full min-w-0 flex-1 basis-4/5 items-center gap-2'>
            {itemLabel}
            {flatCount}
          </div>
          {statusIndicator ?? (selectionMode ? null : actions)}
        </div>
      </div>
    );
  }

  const childRenderProps = (child) => ({
    allowsMultipleExpanded,
    canShare,
    canShareAll,
    defaultExpandedIds,
    depth: depth + 1,
    expandedIds,
    getItemLock,
    isSelectable,
    item: child,
    itemActions,
    objectType,
    onItemAction,
    onToggleExpanded,
    selectedIds,
    selectionMode,
    showActions,
    showCounts,
    virtualThreshold
  });

  // When this row's only populated subcategory is a single virtual parent (the
  // others empty and hidden, e.g. a Beast Mode used only on cards), seed that
  // lone subcategory into the child group's initial expansion so it opens
  // together with this row instead of needing a second click. React Aria's
  // DisclosureGroup owns expansion once mounted and ignores a per-Disclosure
  // `isExpanded`, so this is the seam that actually drives it: the child group
  // mounts with the row (collapsed bodies stay mounted, just hidden), reading
  // these keys once. Deeper chains resolve on their own, each level seeds its
  // own child group, so a sole child that itself has a sole child opens too.
  const soleChildId = soleVirtualChildId(item);
  const childGroupExpandedKeys = soleChildId ? [...(defaultExpandedIds ?? []), soleChildId] : defaultExpandedIds;

  return (
    <Disclosure
      className='space-0 w-full'
      id={item.id}
      isExpanded={isOpen}
      onExpandedChange={(open) => onToggleExpanded?.(item.id, open)}
    >
      <Disclosure.Heading
        className='my-1 flex min-h-9 w-full flex-row items-center justify-between gap-2'
        style={indentStyle}
      >
        {isItemSelectableInMode ? (
          // Selection mode + selectable: the Checkbox is the control alone
          // (no label content), with an `aria-label` for screen readers.
          // The row's label, count, empty space, and chevron all live inside
          // the sibling Disclosure.Trigger — so the only way to toggle
          // selection is to click the actual checkbox, while clicking
          // anywhere else in the row toggles the disclosure. This matches
          // how a disclosure-with-selection row should feel: the checkbox is
          // a small focused affordance, not a wide hit area that swallows
          // every click.
          //
          // The trigger uses `flex-1 min-w-0 self-stretch` so it (a) claims
          // the remaining row width, (b) allows the inner label to truncate
          // for long names (`min-w-0` lets flex children shrink below their
          // content width), and (c) spans the full row height — so empty
          // space above/below text is also clickable, not just the
          // text bounding box. HeroUI's `.disclosure__indicator` has
          // `margin-inline-start: auto`, which pushes the chevron to the
          // trigger's right edge inside its flex context.
          //
          // `mt-0!` overrides HeroUI's CheckboxGroup CSS rule
          // `.checkbox-group [data-slot="checkbox"] { @apply mt-4 }`, which
          // would otherwise inflate the row to ~52px (descendant selector
          // wins over a plain `mt-0` utility on specificity).
          <>
            {isLocked ? (
              // Locked parent: every selectable child under it is itself locked,
              // so the parent toggle can't change anything. Render it read-only +
              // muted with an explanatory tooltip, mirroring the locked leaf rows.
              // `aria-disabled` (not `isDisabled`) keeps the tooltip firing.
              <Tooltip delay={300}>
                <Tooltip.Trigger className='shrink-0 cursor-not-allowed!'>
                  <Checkbox
                    aria-disabled
                    isReadOnly
                    aria-label={typeof item.label === 'string' ? item.label : `Select ${item.id}`}
                    className='mt-0! shrink-0 opacity-60 [--cursor-interactive:var(--cursor-disabled)]'
                    isIndeterminate={isParentIndeterminate}
                    value={String(item.id)}
                  >
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                  </Checkbox>
                </Tooltip.Trigger>
                <Tooltip.Content className='max-w-60'>{itemLock.tooltip}</Tooltip.Content>
              </Tooltip>
            ) : (
              <Checkbox
                aria-label={typeof item.label === 'string' ? item.label : `Select ${item.id}`}
                className='mt-0! shrink-0'
                isIndeterminate={isParentIndeterminate}
                value={String(item.id)}
              >
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
              </Checkbox>
            )}
            {/* Label stays OUTSIDE the Trigger so a selectable parent that is
                also a real object (e.g. a card with drill children) keeps its
                <Link> navigation. The Trigger holds only the count + chevron and
                claims the remaining width, so clicking the empty space or the
                chevron toggles, while the label navigates and the checkbox
                selects. */}
            <div className='flex w-full min-w-0 flex-1 basis-4/5 items-center gap-2'>
              {itemLabel}
              <Disclosure.Trigger
                aria-label='Toggle'
                className='flex flex-1 flex-row items-center gap-2 self-stretch'
                variant='tertiary'
              >
                {statusIndicator
                  ? statusIndicator
                  : showCounts &&
                    item.count !== undefined && (
                      <p className='shrink-0 text-sm whitespace-nowrap text-muted'>
                        ({item.count}
                        {item.countLabel ? ` ${item.countLabel}` : ''})
                      </p>
                    )}
                {!isLoadingState && (
                  <Disclosure.Indicator>
                    <IconChevronDown />
                  </Disclosure.Indicator>
                )}
              </Disclosure.Trigger>
            </div>
          </>
        ) : item.isVirtualParent ? (
          // Virtual parents: the entire label area IS the Trigger so clicking
          // the bold "App Studio Apps" text toggles expansion. Trigger claims
          // flex-1 to grow; the inner <p> takes flex-1 inside it so the label
          // stretches and the count + chevron sit on the right edge of the
          // Trigger, naturally clustered next to the actions.
          <>
            {selectionPlaceholder}
            <Disclosure.Trigger
              aria-label='Toggle'
              className='flex min-w-0 flex-1 basis-4/5 flex-row items-center gap-2'
              variant='tertiary'
            >
              <p
                className={`min-w-0 truncate text-left text-sm ${virtualHeaderWeightClass}${labelMutedClass}`}
                title={labelTitle}
              >
                {labelInner}
              </p>
              {statusIndicator
                ? statusIndicator
                : showCounts &&
                  item.count !== undefined && (
                    <p className='shrink-0 text-sm whitespace-nowrap text-muted'>
                      ({item.count}
                      {item.countLabel ? ` ${item.countLabel}` : ''})
                    </p>
                  )}
              <span aria-hidden='true' className='flex-1' />
              {!isLoadingState && (
                <Disclosure.Indicator>
                  <IconChevronDown />
                </Disclosure.Indicator>
              )}
            </Disclosure.Trigger>
          </>
        ) : item.url ? (
          // Regular LINK items: the label stays OUTSIDE the Trigger so the
          // <Link> keeps its own click semantics (navigate). The count moves
          // INTO the Trigger as its first child so the trigger's min-content
          // size is count + chevron, and the Trigger keeps flex-1 to claim the
          // empty space so clicking it (or the chevron) toggles. HeroUI's
          // `.disclosure__indicator` has `margin-inline-start: auto`, pinning
          // the chevron to the trigger's right edge.
          <>
            {selectionPlaceholder}
            <div className='flex w-full min-w-0 flex-1 basis-4/5 items-center gap-2'>
              {itemLabel}
              <Disclosure.Trigger aria-label='Toggle' className='flex flex-1 flex-row items-center gap-2' variant='tertiary'>
                {showCounts && item.count !== undefined && (
                  <p className='shrink-0 text-sm whitespace-nowrap text-muted'>
                    ({item.count}
                    {item.countLabel ? ` ${item.countLabel}` : ''})
                  </p>
                )}
                <Disclosure.Indicator>
                  <IconChevronDown />
                </Disclosure.Indicator>
              </Disclosure.Trigger>
            </div>
          </>
        ) : (
          // Regular NON-LINK items: there's no <Link> to preserve, so the label
          // goes INSIDE the Trigger (like a virtual parent). A long label then
          // truncates within the trigger instead of overflowing and pushing the
          // chevron off-screen, and the whole row toggles.
          <>
            {selectionPlaceholder}
            <Disclosure.Trigger
              aria-label='Toggle'
              className='flex min-w-0 flex-1 basis-4/5 flex-row items-center gap-2'
              variant='tertiary'
            >
              <p className={`min-w-0 truncate text-left text-sm${labelMutedClass}`} title={labelTitle}>
                {labelInner}
              </p>
              {showCounts && item.count !== undefined && (
                <p className='shrink-0 text-sm whitespace-nowrap text-muted'>
                  ({item.count}
                  {item.countLabel ? ` ${item.countLabel}` : ''})
                </p>
              )}
              <span aria-hidden='true' className='flex-1' />
              <Disclosure.Indicator>
                <IconChevronDown />
              </Disclosure.Indicator>
            </Disclosure.Trigger>
          </>
        )}
        {selectionMode ? null : actions}
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body>
          {showsErrorBody && <p className='px-2 py-1 text-xs text-danger'>{item.error}</p>}
          {hasChildren && (
            // Each nesting level needs its own DisclosureGroup so React Aria
            // scopes expansion coordination to siblings at that level only.
            // Without this, nested Disclosures inherit the outer group's context
            // and expanding a child would collapse its parent. This wrapper
            // recurses naturally via DataListItemImpl, so arbitrary depth is
            // handled. `allowsMultipleExpanded`/`defaultExpandedKeys` flow down
            // so a consumer can render every level expanded at once.
            <DisclosureGroup
              allowsMultipleExpanded={allowsMultipleExpanded}
              className='flex w-full flex-col divide-y divide-border'
              defaultExpandedKeys={childGroupExpandedKeys}
            >
              {item.children.length > virtualThreshold ? (
                <VirtualizedItems
                  bounded
                  items={item.children}
                  renderItem={(child) => <DataListItem {...childRenderProps(child)} />}
                />
              ) : item.children.length > MAX_VISIBLE_CHILDREN_ROWS ? (
                // Cap height + scroll without paying virtualization's DOM cost.
                // Virtualization only kicks in past `virtualThreshold` (default
                // 50), but past `MAX_VISIBLE_CHILDREN_ROWS` (12) an inline map
                // already grows the disclosure tall enough to push the rest of
                // the list, so we wrap in a bounded scroll viewport. Dividers
                // move from `DisclosureGroup` onto this wrapper since the
                // group now has a single child.
                <div
                  className='w-full divide-y divide-border overflow-y-auto overscroll-auto'
                  style={{ height: MAX_VISIBLE_CHILDREN_ROWS * ROW_HEIGHT }}
                >
                  {item.children.map((child, index) => (
                    <DataListItem key={child.id || index} {...childRenderProps(child)} />
                  ))}
                </div>
              ) : (
                item.children.map((child, index) => <DataListItem key={child.id || index} {...childRenderProps(child)} />)
              )}
            </DisclosureGroup>
          )}
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
}

// Recursively reports whether any descendant of `item` changed selection or
// expansion between renders. Lets arePropsEqualForRow re-render a parent row
// when a nested child toggles, keeping indeterminate state and nested
// Disclosure open/close in sync at any nesting depth.
function subtreeStateChanged(item, prevSelected, nextSelected, prevExpanded, nextExpanded) {
  const children = item?.children;
  if (!Array.isArray(children) || children.length === 0) return false;
  for (const child of children) {
    const id = String(child.id);
    if ((prevSelected?.has(id) ?? false) !== (nextSelected?.has(id) ?? false)) return true;
    if ((prevExpanded?.has(child.id) ?? false) !== (nextExpanded?.has(child.id) ?? false)) return true;
    if (subtreeStateChanged(child, prevSelected, nextSelected, prevExpanded, nextExpanded)) return true;
  }
  return false;
}

const DataListItem = memo(DataListItemImpl, arePropsEqualForRow);

function hasShareableChildren(item) {
  if (item?.unshareable === true) return false;
  if (!item?.children?.length) return false;
  return item.children.some((c) => isItemShareable(c) || hasShareableChildren(c));
}

function isItemShareable(item) {
  if (!item) return false;
  if (item.unshareable === true) return false;
  if (Number(item.id) < 0) return false;
  return SHAREABLE_TYPES.has(item.typeId);
}

/**
 * Returns the id of `item`'s sole populated subcategory, or null. A match means
 * `item` has exactly one virtual-parent child that itself has children (e.g. a
 * Beast Mode whose only non-empty category is "Cards", its Drills and Other
 * Beast Modes being empty and hidden). Used to auto-expand that lone
 * subcategory with its parent. Only the immediate child is returned; deeper
 * chains resolve because each level seeds its own child group in turn.
 */
function soleVirtualChildId(item) {
  if (!item?.children?.length) return null;
  const populated = item.children.filter((child) => child.isVirtualParent && child.children?.length > 0);
  return populated.length === 1 ? populated[0].id : null;
}

/**
 * Recursively sort items alphabetically by label using locale-aware,
 * case-insensitive comparison. Returns a new array — does not mutate input.
 * Items with `children` get a new shallow copy so their children can be sorted
 * without touching the caller's data.
 */
function sortItemsByLabel(items) {
  if (!Array.isArray(items)) return items;
  return [...items]
    .sort((a, b) => {
      const labelA = (a?.label ?? '').toString();
      const labelB = (b?.label ?? '').toString();
      return labelA.localeCompare(labelB, undefined, { sensitivity: 'base' });
    })
    .map((item) =>
      Array.isArray(item?.children) && item.children.length > 0
        ? { ...item, children: sortItemsByLabel(item.children) }
        : item
    );
}
