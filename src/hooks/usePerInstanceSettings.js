import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'perInstance';

/**
 * Read/write per-Domo-instance settings stored in `chrome.storage.local` under
 * a single nested object: `{ perInstance: { '<instance>': { <key>: <value>, ... } } }`.
 *
 * Returns the full per-instance map plus mutators that take an `instance`
 * argument. Subscribes to `chrome.storage.onChanged` so multiple consumers
 * (e.g. ActivityLogTable + the Settings page) stay in sync without re-reading.
 *
 * Used by the DomoStats Activity Log feature for the dataset ID and "always
 * prefer dataset" flag, but the shape is generic — any feature that needs
 * per-instance flags can add new keys without changing the hook.
 *
 * @returns {{
 *   settings: Object,
 *   isLoading: boolean,
 *   update: (instance: string, key: string, value: any) => Promise<void>,
 *   clear: (instance: string) => Promise<void>
 * }}
 */
export function usePerInstanceSettings() {
  const [settings, setSettings] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    chrome.storage.local.get([STORAGE_KEY]).then((stored) => {
      if (!mounted) return;
      setSettings(stored?.[STORAGE_KEY] || {});
      setIsLoading(false);
    });

    const onChanged = (changes, areaName) => {
      if (areaName !== 'local' || !changes[STORAGE_KEY]) return;
      setSettings(changes[STORAGE_KEY].newValue || {});
    };
    chrome.storage.onChanged.addListener(onChanged);

    return () => {
      mounted = false;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  const update = useCallback(async (instance, key, value) => {
    if (!instance) return;
    const stored = await chrome.storage.local.get([STORAGE_KEY]);
    const perInstance = stored?.[STORAGE_KEY] || {};
    await chrome.storage.local.set({
      [STORAGE_KEY]: {
        ...perInstance,
        [instance]: {
          ...(perInstance[instance] || {}),
          [key]: value
        }
      }
    });
  }, []);

  const clear = useCallback(async (instance) => {
    if (!instance) return;
    const stored = await chrome.storage.local.get([STORAGE_KEY]);
    const perInstance = stored?.[STORAGE_KEY] || {};
    if (!(instance in perInstance)) return;
    const next = { ...perInstance };
    delete next[instance];
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
  }, []);

  return { clear, isLoading, settings, update };
}
