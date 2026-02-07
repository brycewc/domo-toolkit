import { Button } from '@heroui/react';
import { IconFilter } from '@tabler/icons-react';

/**
 * FilterActivityLog - Navigate to activity log page and auto-filter by object type
 * Opens /admin/logging in a new tab and filters by the current object's type
 */
export function FilterActivityLog({ currentContext, isDisabled }) {
  const handleFilter = async () => {
    try {
      // Get the current tab to extract the instance URL
      const [currentTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      });

      if (!currentTab?.url) {
        console.error('[FilterActivityLog] Could not get current tab URL');
        return;
      }

      const url = new URL(currentTab.url);

      // Check if we're already on the logging page (for debugging)
      if (url.pathname.includes('/admin/logging')) {
        console.log(
          '[FilterActivityLog] Already on logging page, using hardcoded test object'
        );

        // Use hardcoded test object for debugging
        const testObject = {
          typeName: 'DataFlow',
          id: '26922',
          name: 'MajorDomo | All Active Objects'
        };

        console.log('[FilterActivityLog] Using test object:', testObject);

        // Store the filter and trigger it immediately
        await chrome.storage.session.set({
          activityLogFilter: {
            typeName: testObject.typeName,
            objectId: testObject.id,
            objectName: testObject.name,
            timestamp: Date.now()
          }
        });

        // Reload the page to trigger the filter
        chrome.tabs.reload(currentTab.id);
        return;
      }

      // Normal flow - navigate to logging page
      if (!currentContext?.domoObject?.typeName) {
        console.error('[FilterActivityLog] No current object or typeName');
        return;
      }

      console.log(
        '[FilterActivityLog] Opening /admin/logging and filtering by:',
        currentContext.domoObject.typeName
      );

      // Extract the instance domain (e.g., customer.domo.com)
      const loggingUrl = `${url.protocol}//${url.hostname}/admin/logging`;

      console.log('[FilterActivityLog] Storing filter value and creating tab');

      // Store the filter value in local storage to be picked up by content script
      await chrome.storage.session.set({
        activityLogFilter: {
          typeName: currentContext.domoObject.typeName,
          objectId: currentContext.domoObject.id,
          objectName:
            currentContext.domoObject.metadata?.name ||
            currentContext.domoObject.id,
          timestamp: Date.now()
        }
      });

      // Create a new tab with the activity log page
      window.open(loggingUrl, '_blank', 'noopener,noreferrer');

      console.log(
        '[FilterActivityLog] Tab created, filter will be applied on page load'
      );
    } catch (error) {
      console.error('[FilterActivityLog] Error filtering activity log:', error);
    }
  };

  return (
    <Button
      variant='tertiary'
      fullWidth
      onPress={handleFilter}
      isDisabled={isDisabled}
      className='relative min-w-fit flex-1 basis-[48%] overflow-visible'
    >
      <IconFilter stroke={1.5} />
      Activity Log
    </Button>
  );
}
