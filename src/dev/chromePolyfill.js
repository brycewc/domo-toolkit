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

const entityId = import.meta.env.VITE_DOMO_ENTITY_ID;
const entityType = import.meta.env.VITE_DOMO_ENTITY_TYPE;

const sessionData = {
  activityLogInstance: instance,
  activityLogObjects: entityId && entityType ? [{ id: entityId, type: entityType }] : [],
  activityLogTabId: 1,
  activityLogType: 'single-object',
  lineageEntityId: entityId,
  lineageEntityType: entityType,
  lineageInstance: instance,
  lineageObjectName: import.meta.env.VITE_DOMO_OBJECT_NAME,
  lineageTabId: 1
};

globalThis.chrome = {
  storage: {
    local: (() => {
      const store = {};
      const toKeys = (input) =>
        input == null ? Object.keys(store) : Array.isArray(input) ? input : [input];
      return {
        get: async (input) => {
          const keys = toKeys(input);
          const result = {};
          for (const key of keys) if (key in store) result[key] = store[key];
          return result;
        },
        remove: async (input) => {
          for (const key of toKeys(input)) delete store[key];
        },
        set: async (items) => {
          Object.assign(store, items);
        }
      };
    })(),
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
        const data = { themePreference: 'light' };
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
