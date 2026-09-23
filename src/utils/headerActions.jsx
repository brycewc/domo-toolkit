import { getObjectType } from '@/models/DomoObjectType';
import { getActivityLogTarget, launchActivityLogForOrigin } from '@/utils/activityLog';
import { getAvailableActions } from '@/utils/availableActions';
import { instanceKeyFromUrl } from '@/utils/instance';
import { launchView } from '@/utils/sidepanel';
import IconListSearch from '@icons/list-search.svg?react';
import IconReset from '@icons/reset.svg?react';
import IconSync from '@icons/sync.svg?react';

// Shared builders for the standard "activity log", "reload" and "refresh" header actions. Both
// DataList and the custom-header views feed the resulting specs into
// `ViewHeader`'s `actions` array, so reload/refresh look and behave identically
// everywhere. Each returns the generic action shape ViewHeader understands:
// `{ key, icon, tooltip, onPress, isActive?, isDisabled?, disabledReason?, ariaLabel? }`.
// A truthy `disabledReason` routes the button through DisabledTooltip (disabled
// but still hoverable, so the explanation shows).

// Only a context on the object's instance can speak to the Audit right; with none,
// the button stays enabled and the log itself reports a permission failure.
export function buildActivityLogAction({ contexts = [], domoObject, onStatusUpdate }) {
  const target = getActivityLogTarget(domoObject);
  const instance = instanceKeyFromUrl(domoObject.baseUrl);
  const userRights = contexts.find((context) => instance && context?.instance === instance && context.user)?.user
    ?.metadata?.USER_RIGHTS;
  const parentTypeName = getObjectType(getObjectType(domoObject.typeId)?.parents?.[0])?.name;
  const disabledReason = !target
    ? `Could not determine the parent ${parentTypeName ?? 'object'}`
    : userRights && !userRights.includes('audit')
      ? 'You need the Audit permission to view activity logs'
      : null;
  return {
    ariaLabel: 'View Activity Log',
    disabledReason,
    icon: <IconListSearch />,
    key: 'activityLog',
    onPress: async () => {
      try {
        const launched = await launchActivityLogForOrigin({
          objects: target.objects,
          origin: domoObject.baseUrl,
          type: target.type
        });
        if (!launched) throw new Error('Could not determine the Domo instance for this object');
        onStatusUpdate?.(
          'Opening Activity Log',
          `Navigating to activity log for **${domoObject.metadata?.name || domoObject.id}**`,
          'success'
        );
      } catch (err) {
        console.error('[headerActions] Error opening activity log:', err);
        onStatusUpdate?.('Error', `Failed to open activity log: ${err.message}`, 'danger', 5000);
      }
    },
    tooltip: disabledReason ?? 'View activity log'
  };
}

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
 * object this view was launched for. `extras` reach `launchView` for views whose
 * action key alone does not identify them, such as the aspect behind `duplicate`,
 * and `unsupportedReason` disables reload for a constraint the key cannot express.
 */
export function buildReloadAction({
  currentContext,
  extras,
  objectId,
  objectType,
  onStatusUpdate,
  unsupportedReason,
  viewType
}) {
  const currentTypeId = currentContext?.domoObject?.typeId;
  const disabledReason = !currentTypeId
    ? 'Navigate to a Domo object to reload'
    : !getAvailableActions(currentContext).has(viewType)
      ? "Current object doesn't support this view"
      : (unsupportedReason ??
        (currentContext.domoObject.id === objectId && currentTypeId === objectType
          ? 'Already showing data for the current object'
          : null));
  return {
    ariaLabel: 'Reload',
    disabledReason,
    icon: <IconReset />,
    key: 'reload',
    onPress: async () => {
      try {
        await launchView({ currentContext, type: viewType, ...extras });
      } catch (err) {
        console.error('[headerActions] Error in reload:', err);
        onStatusUpdate?.('Error', err.message || 'Failed to reload', 'danger', 3000);
      }
    },
    tooltip: disabledReason ?? 'Reload for current object'
  };
}
