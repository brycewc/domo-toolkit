import { getAvailableActions } from '@/utils/availableActions';
import { launchView } from '@/utils/sidepanel';
import IconReset from '@icons/reset.svg?react';
import IconSync from '@icons/sync.svg?react';

// Shared builders for the standard "reload" and "refresh" header actions. Both
// DataList and the custom-header views feed the resulting specs into
// `ViewHeader`'s `actions` array, so reload/refresh look and behave identically
// everywhere. Each returns the generic action shape ViewHeader understands:
// `{ key, icon, tooltip, onPress, isActive?, isDisabled?, disabledReason?, ariaLabel? }`.
// A truthy `disabledReason` routes the button through DisabledTooltip (disabled
// but still hoverable, so the explanation shows).

/**
 * Refresh re-fetches the current object's data in place. The caller owns the
 * actual fetch via `onRefresh` and the `isRefreshing` flag (which spins the icon
 * and disables the button while in flight).
 */
export function buildRefreshAction({ isRefreshing = false, onRefresh }) {
  return {
    ariaLabel: 'Refresh',
    icon: <IconSync className={isRefreshing ? 'animate-spin' : ''} />,
    isDisabled: isRefreshing,
    key: 'refresh',
    onPress: () => onRefresh?.(),
    tooltip: 'Refresh'
  };
}

/**
 * Reload re-targets the view at whatever Domo object the user has since
 * navigated to, by re-launching `viewType` for `currentContext`. It disables
 * itself (with an explanatory reason) when there is no current object, when the
 * current object's type can't support this view, or when it already matches the
 * object this view was launched for.
 */
export function buildReloadAction({ currentContext, objectId, objectType, onStatusUpdate, viewType }) {
  const currentTypeId = currentContext?.domoObject?.typeId;
  const disabledReason = !currentTypeId
    ? 'Navigate to a Domo object to reload'
    : !getAvailableActions(currentContext).has(viewType)
      ? "Current object doesn't support this view"
      : currentContext.domoObject.id === objectId && currentTypeId === objectType
        ? 'Already showing data for the current object'
        : null;
  return {
    ariaLabel: 'Reload',
    disabledReason,
    icon: <IconReset />,
    key: 'reload',
    onPress: async () => {
      try {
        await launchView({ currentContext, type: viewType });
      } catch (err) {
        console.error('[headerActions] Error in reload:', err);
        onStatusUpdate?.('Error', err.message || 'Failed to reload', 'danger', 3000);
      }
    },
    tooltip: disabledReason ?? 'Reload for current object'
  };
}
