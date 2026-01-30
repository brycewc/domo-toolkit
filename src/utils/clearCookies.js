import { executeInPage } from './executeInPage.js';
/**
 * Clear cookies for specified domains or all Domo cookies
 * @param {string[]} domains - Array of domains to match cookies against (null for all)
 * @param {boolean} excludeDomains - If true, clears cookies for all domains EXCEPT the specified domains
 * @param {number} tabId - The ID of the tab (used to get DA-SID for include mode)
 * @param {string[]} daSidsToPreserve - Array of DA-SID cookie names to preserve (used in exclude mode)
 * @returns {Promise<any>} - The result from the executed function
 */

export async function clearCookies({
  domains = null,
  excludeDomains = false,
  tabId = null,
  daSidsToPreserve = []
}) {
  try {
    // Get all cookies for domo.com and subdomains (doesn't get other domains because of host permissions)
    const domoCookies = await chrome.cookies.getAll({});

    // Get environment and company if clearing for specific domains in include mode
    // Needed to also clear the DA-SID cookie on the root domain
    let currentDaSid = null;
    if (domains && domains.length > 0 && !excludeDomains && tabId) {
      const data = await executeInPage(
        async () => {
          return window.bootstrap.data;
        },
        [],
        tabId
      );
      const environment = data?.environmentId;
      const company = data?.analytics?.company;
      if (environment && company) {
        currentDaSid = `DA-SID-${environment}-${company}`;
      }
    }

    // Remove each cookie
    let removedCount = 0;
    const errors = [];
    const removePromises = [];

    for (const cookie of domoCookies) {
      const cookieDomain = cookie.domain.startsWith('.')
        ? cookie.domain.substring(1)
        : cookie.domain;
      const protocol = cookie.secure ? 'https:' : 'http:';
      const url = `${protocol}//${cookieDomain}${cookie.path}`;

      // Determine if this cookie matches any of the specified domains
      const matchesDomains =
        domains && domains.some((domain) => cookieDomain.endsWith(domain));

      // Determine if cookie should be cleared based on excludeDomains flag
      let shouldClear = false;
      const isDaSidCookie = cookie.name.startsWith('DA-SID-');

      if (domains === null || domains.length === 0) {
        // No domains specified - clear all
        shouldClear = true;
      } else if (excludeDomains) {
        // Exclude mode - clear cookies that DON'T match any of the domains
        // But preserve specified DA-SID cookies on the root domain
        if (!matchesDomains) {
          // Cookie doesn't match any excluded domain
          // Keep DA-SIDs in the preserve list, clear all others
          if (isDaSidCookie && daSidsToPreserve.includes(cookie.name)) {
            shouldClear = false;
          } else {
            shouldClear = true;
          }
        }
      } else {
        // Include mode - clear cookies that match any domain (or the current DA-SID)
        shouldClear = matchesDomains || cookie.name === currentDaSid;
      }

      if (shouldClear) {
        console.log(
          `[ClearCookies] Removing cookie: ${cookie.name} from ${url}`
        );
        removePromises.push(
          chrome.cookies
            .remove({
              url,
              name: cookie.name,
              storeId: cookie.storeId
            })
            .then((result) => {
              if (result) {
                removedCount++;
              } else {
                errors.push(`Failed to remove: ${cookie.name}`);
              }
            })
            .catch((err) => {
              errors.push(`${cookie.name}: ${err.message}`);
            })
        );
      }
    }

    await Promise.all(removePromises);

    // Build description based on mode
    let description;
    if (domains === null || domains.length === 0) {
      description = `Successfully cleared ${removedCount} Domo cookie${removedCount !== 1 ? 's' : ''} for all instances`;
    } else if (excludeDomains) {
      const domainList = domains.join(', ');
      description = `Successfully cleared ${removedCount} Domo cookie${removedCount !== 1 ? 's' : ''} for all instances except ${domainList}`;
    } else {
      const domainList = domains.join(', ');
      description = `Successfully cleared ${removedCount} Domo cookie${removedCount !== 1 ? 's' : ''} for ${domainList}`;
    }

    // Show result message
    if (errors.length === 0) {
      if (tabId !== null && !excludeDomains) {
        chrome.tabs.reload(tabId);
      }
      return {
        title: 'Cookies Cleared',
        description,
        status: 'success'
      };
    } else {
      console.error('Errors while clearing cookies:', errors);
      return {
        title: 'Partial Success',
        description: `Cleared ${removedCount} Domo cookie${
          removedCount !== 1 ? 's' : ''
        }, but ${errors.length} error${
          errors.length !== 1 ? 's' : ''
        } occurred`,
        status: 'warning'
      };
    }
  } catch (error) {
    return { title: 'Error', description: error.message, status: 'danger' };
  }
}
