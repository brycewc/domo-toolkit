import { getCurrentUserId } from '@/services/users';

// Domo Support system user (27) and the support test account (1010101).
// When the signed-in Domo user is one of these, support-only features surface.
export const SUPPORT_USER_IDS = ['27', '1010101'];

// Sync check against a resolved context — the common case, since the popup,
// side panel, and getAvailableActions all already carry currentContext.user.id.
export function isSupportUser(currentContext) {
  const id = currentContext?.user?.id;
  return id != null && SUPPORT_USER_IDS.includes(String(id));
}

// Async check for surfaces that self-gate without a context in hand (the
// DevMenu pattern), reading the current user id straight from the page.
export async function isSupportUserForTab(tabId) {
  const id = await getCurrentUserId(tabId);
  return id != null && SUPPORT_USER_IDS.includes(String(id));
}
