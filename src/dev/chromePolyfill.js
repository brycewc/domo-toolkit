/**
 * Chrome API polyfill for standalone dev pages.
 *
 * Stubs the chrome.storage and chrome.tabs APIs so that components
 * designed for the extension context can run on localhost.
 * Must be imported as a side-effect BEFORE any code that accesses chrome.*.
 *
 * NOTE: chrome.scripting is intentionally omitted — executeInPage uses
 * its absence to detect dev mode and call functions directly.
 */

const baseUrl = import.meta.env.VITE_DOMO_BASE_URL || '';
const instance = baseUrl.match(/\/\/([^.]+)\.domo\.com/)?.[1] || '';

const sessionData = {
  lineageEntityId: import.meta.env.VITE_DOMO_ENTITY_ID,
  lineageEntityType: import.meta.env.VITE_DOMO_ENTITY_TYPE,
  lineageInstance: instance,
  lineageObjectName: import.meta.env.VITE_DOMO_OBJECT_NAME,
  lineageTabId: 1
};

globalThis.chrome = {
  storage: {
    onChanged: {
      addListener: () => {},
      removeListener: () => {}
    },
    session: {
      get: async (keys) => {
        const result = {};
        for (const key of keys) {
          if (key in sessionData) result[key] = sessionData[key];
        }
        return result;
      }
    },
    sync: {
      get: (keys, callback) => {
        const data = { themePreference: 'system' };
        if (typeof callback === 'function') {
          callback(data);
          return undefined;
        }
        return Promise.resolve(data);
      }
    }
  },
  tabs: {
    get: async () => ({ id: 1, url: `${baseUrl}/page/1` }),
    query: async () => []
  }
};
