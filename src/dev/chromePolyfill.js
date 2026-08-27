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

import { instanceKeyFromUrl } from '@/utils/instance';

const baseUrl = import.meta.env.VITE_DOMO_BASE_URL || '';
// Handles a locally run instance too (e.g. http://dev.localhost:9128), where the
// key keeps the port and the origin keeps the scheme.
const instance = instanceKeyFromUrl(baseUrl) || '';
const origin = baseUrl ? new URL(baseUrl).origin : '';

const entityId = import.meta.env.VITE_DOMO_ENTITY_ID;
const entityType = import.meta.env.VITE_DOMO_ENTITY_TYPE;

const activityLogDatasetId = import.meta.env.VITE_DOMO_ACTIVITY_LOG_DATASET_ID;
const localData =
  instance && activityLogDatasetId
    ? { perInstance: { [instance]: { activityLogDatasetId, preferActivityLogDataset: true } } }
    : {};

const sessionData = {
  activityLogInstance: instance,
  activityLogObjects: entityId && entityType ? [{ id: entityId, type: entityType }] : [],
  activityLogOrigin: origin,
  activityLogTabId: 1,
  activityLogType: 'single-object',
  lineageEntityId: entityId,
  lineageEntityType: entityType,
  lineageInstance: instance,
  lineageObjectName: import.meta.env.VITE_DOMO_OBJECT_NAME,
  lineageOrigin: origin,
  lineageTabId: 1
};

globalThis.chrome = {
  storage: {
    local: (() => {
      const store = { ...localData };
      const toKeys = (input) => (input == null ? Object.keys(store) : Array.isArray(input) ? input : [input]);
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
