import {
  Alert,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  ButtonGroup,
  Chip,
  DateField,
  DateRangePicker,
  Dropdown,
  Label,
  RangeCalendar,
  Skeleton,
  Switch
} from '@heroui/react';
import { getLocalTimeZone, parseDate, today } from '@internationalized/date';
import { AnimatePresence } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AnimatedCheck } from '@/components/AnimatedCheck';
import { CloseButton } from '@/components/CloseButton';
import { usePerInstanceSettings } from '@/hooks/usePerInstanceSettings';
import { useResolveTabId } from '@/hooks/useResolveTabId';
import { DomoObject } from '@/models/DomoObject';
import { fetchUserDisplayNames, getCustomAvatarUserIds } from '@/services/users';
import { ACTION_COLOR_PATTERNS } from '@/utils/constants';
import { getInitials } from '@/utils/general';
import IconCalendar from '@icons/calendar.svg?react';
import IconCheckCircle from '@icons/check-circle.svg?react';
import IconExclamationPointCircle from '@icons/exclamation-point-circle.svg?react';
import IconFunnel from '@icons/funnel.svg?react';

import { DataTable } from './components/DataTable';
import { UserFilterAutocomplete } from './components/UserFilterAutocomplete';
import { getActivityLogForObject, getEventTypesForObjectType } from './services/activityLog';
import { getActivityLogFromDataset } from './services/activityLogDataset';
import { findActivityLogDataset } from './services/findActivityLogDataset';

/**
 * ActivityLogTable Component
 * Displays activity log events for multiple Domo objects in a table
 * Handles complex pagination where each object type is fetched separately
 */
export function ActivityLogTable() {
  const [tabId, setTabId] = useState(null);
  const [objects, setObjects] = useState([]); // Array of {type, id}
  const [activityLogType, setActivityLogType] = useState(null);
  const [domoInstance, setDomoInstance] = useState(null);
  const [events, setEvents] = useState([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [source, setSource] = useState('api');
  const [dateRange, setDateRange] = useState(null);
  const [userFilter, setUserFilter] = useState([]);
  const [actionFilter, setActionFilter] = useState(new Set());
  const actionFilterRef = useRef(new Set());
  const [objectTypeFilter, setObjectTypeFilter] = useState(new Set());
  // Sort state lives here (not in DataTable) because the time column's sort
  // is server-side when source==='dataset'. Direction toggles trigger refetch.
  const [sortDescriptor, setSortDescriptor] = useState({
    column: 'time',
    direction: 'descending'
  });
  // Track pagination state per object: { "type:id": { offset, total, hasMore } }
  const [objectStates, setObjectStates] = useState({});
  // Dataset-source pagination — single global offset/total since the dataset query
  // is one call regardless of how many objects/actions/users are filtered
  const [datasetState, setDatasetState] = useState({ hasMore: false, offset: 0, total: 0 });
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryError, setDiscoveryError] = useState(null);
  // Soft error specific to the dataset path — surfaced in the header banner
  // (with Re-run discovery / Switch to API actions) rather than the global
  // `error` state which short-circuits the whole view.
  const [datasetFetchError, setDatasetFetchError] = useState(null);
  const {
    isLoading: perInstanceLoading,
    settings: perInstanceSettings,
    update: updatePerInstance
  } = usePerInstanceSettings();
  const initialSourceCheckRef = useRef(false);

  const dateRangeEpoch = useMemo(() => {
    if (!dateRange) return {};
    const start = dateRange.start.toDate(getLocalTimeZone());
    start.setHours(0, 0, 0, 0);
    const end = dateRange.end.toDate(getLocalTimeZone());
    end.setHours(23, 59, 59, 999);
    return { end: end.getTime(), start: start.getTime() };
  }, [dateRange]);

  const hasLoadedRef = useRef(false);
  const prevSourceRef = useRef(source);
  const isFetchingMoreRef = useRef(false);
  const objectStatesRef = useRef(objectStates);
  objectStatesRef.current = objectStates;
  const datasetStateRef = useRef(datasetState);
  datasetStateRef.current = datasetState;
  const dateRangeEpochRef = useRef(dateRangeEpoch);
  dateRangeEpochRef.current = dateRangeEpoch;
  // Stable string key for userFilter array to avoid unnecessary effect re-runs
  const userFilterKey = userFilter.slice().sort().join(',');
  const userFilterRef = useRef(userFilter);
  userFilterRef.current = userFilter;
  // Refetch trigger for dataset source when the user toggles time-sort
  // direction. Empty string for api source (no server-side sort) or when the
  // active sort isn't time (other columns are local-only).
  const datasetSortKey =
    source === 'dataset' && sortDescriptor?.column === 'time' ? sortDescriptor.direction : '';
  // Mirror source/domoInstance/objects into refs so fetchMoreEvents can read
  // current values without listing them as useCallback deps. Stable callback
  // identity matters here — HeroUI's Table.LoadMore wires its intersection
  // observer to onLoadMore once; if the reference churns, the observer can
  // miss scroll-into-view events.
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const domoInstanceRef = useRef(domoInstance);
  domoInstanceRef.current = domoInstance;
  const objectsRef = useRef(objects);
  objectsRef.current = objects;
  const sortDescriptorRef = useRef(sortDescriptor);
  sortDescriptorRef.current = sortDescriptor;

  const resolveTabId = useResolveTabId(tabId, domoInstance);

  const [customAvatarIds, setCustomAvatarIds] = useState(new Set());
  const checkedAvatarIdsRef = useRef(new Set());
  // userId → displayName map populated lazily for events that arrive without
  // a userName (DomoStats dataset rows store User_ID separately from
  // Source.Name, so we look up the user's display name ourselves).
  const [userNameMap, setUserNameMap] = useState({});
  const fetchedUserNameIdsRef = useRef(new Set());

  const pageSize = 100; // Fetch in chunks per object

  // Pre-select the dataset source on first mount when this instance has the
  // "Always use DomoStats Activity Log dataset" preference set. Runs once,
  // gated by both the per-instance settings finishing their initial load and
  // domoInstance being known.
  useEffect(() => {
    if (initialSourceCheckRef.current) return;
    if (perInstanceLoading) return;
    if (!domoInstance) return;
    initialSourceCheckRef.current = true;
    const instanceSettings = perInstanceSettings[domoInstance];
    if (instanceSettings?.preferActivityLogDataset && instanceSettings?.activityLogDatasetId) {
      setSource('dataset');
    }
  }, [perInstanceLoading, perInstanceSettings, domoInstance]);

  // Load objects from storage on mount
  useEffect(() => {
    const loadObjects = async () => {
      try {
        const result = await chrome.storage.session.get([
          'activityLogTabId',
          'activityLogObjects',
          'activityLogType',
          'activityLogInstance'
        ]);
        const loadedObjects = result.activityLogObjects || [];
        setObjects(loadedObjects);
        const tabId = result.activityLogTabId || null;
        setTabId(tabId);
        const activityLogType = result.activityLogType || null;
        setActivityLogType(activityLogType);
        const instance = result.activityLogInstance || null;
        setDomoInstance(instance);

        // Initialize state for each object
        const initialStates = {};
        loadedObjects.forEach((obj) => {
          const key = `${obj.type}:${obj.id}`;
          initialStates[key] = { hasMore: true, offset: 0, total: 0 };
        });
        setObjectStates(initialStates);
      } catch (err) {
        console.error('Error loading objects from storage:', err);
        setError('Failed to load activity log configuration');
      }
    };

    loadObjects();
  }, []);

  // Fetch all possible event types from the API for each unique object type
  const [actionOptions, setActionOptions] = useState([]);

  useEffect(() => {
    if (!tabId || objects.length === 0) return;

    const uniqueTypes = [...new Set(objects.map((obj) => obj.type))];

    resolveTabId()
      .then((resolvedTabId) => {
        if (!resolvedTabId) return;
        return Promise.all(
          uniqueTypes.map((type) => getEventTypesForObjectType(type, resolvedTabId).catch(() => []))
        );
      })
      .then((results) => {
        if (!results) return;
        const seen = new Set();
        const options = results
          .flat()
          .filter((item) => {
            const key = item.type.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .sort((a, b) => a.translation.localeCompare(b.translation));
        setActionOptions(options);
      });
  }, [tabId, objects]);

  // Check which users have custom avatars (non-blocking, incremental)
  useEffect(() => {
    if (!tabId || events.length === 0) return;

    const uniqueIds = [...new Set(events.map((e) => e.userId).filter(Boolean))];
    const uncheckedIds = uniqueIds.filter((id) => !checkedAvatarIdsRef.current.has(id));

    if (uncheckedIds.length === 0) return;

    uncheckedIds.forEach((id) => checkedAvatarIdsRef.current.add(id));

    resolveTabId()
      .then((resolvedTabId) => getCustomAvatarUserIds(uncheckedIds, resolvedTabId))
      .then((customIds) => {
        if (customIds.length === 0) return;
        setCustomAvatarIds((prev) => {
          const next = new Set(prev);
          let changed = false;
          for (const id of customIds) {
            if (!prev.has(id)) {
              next.add(id);
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      })
      .catch(() => {});
  }, [events, tabId]);

  // Look up display names for any event that arrives with a userId but no
  // userName (DomoStats path). Fires incrementally as new ids appear; the
  // ref tracks already-fetched ids so each id is requested at most once.
  useEffect(() => {
    if (!tabId || events.length === 0) return;
    const idsWithoutName = [
      ...new Set(events.filter((e) => e.userId && !e.userName).map((e) => String(e.userId)))
    ];
    const unfetched = idsWithoutName.filter((id) => !fetchedUserNameIdsRef.current.has(id));
    if (unfetched.length === 0) return;
    unfetched.forEach((id) => fetchedUserNameIdsRef.current.add(id));
    resolveTabId()
      .then((resolvedTabId) => fetchUserDisplayNames(unfetched, resolvedTabId))
      .then((map) => {
        if (!map || Object.keys(map).length === 0) return;
        setUserNameMap((prev) => ({ ...prev, ...map }));
      })
      .catch(() => {});
  }, [events, tabId, resolveTabId]);

  // Get unique object types for filter — only relevant for multi-object logs.
  // Stabilized to avoid new reference when events change but types stay the same.
  const prevObjectTypeOptionsRef = useRef([]);
  const objectTypeOptions = useMemo(() => {
    if (activityLogType === 'single-object') return prevObjectTypeOptionsRef.current;
    const types = new Set();
    events.forEach((event) => {
      if (event.objectType) {
        types.add(event.objectType);
      }
    });
    const next = Array.from(types).sort();
    const prev = prevObjectTypeOptionsRef.current;
    if (prev.length === next.length && prev.every((t, i) => t === next[i])) {
      return prev;
    }
    prevObjectTypeOptionsRef.current = next;
    return next;
  }, [events, activityLogType]);

  // Filter events locally (object type is client-side only)
  const filteredEvents = useMemo(() => {
    if (objectTypeFilter.size === 0) return events;

    return events.filter((event) => event.objectType && objectTypeFilter.has(event.objectType));
  }, [events, objectTypeFilter]);

  // Pre-compute object URLs so the cell renderer is synchronous
  const [objectUrlMap, setObjectUrlMap] = useState({});
  const resolvedUrlKeysRef = useRef(new Set());

  useEffect(() => {
    if (!domoInstance || !tabId || events.length === 0) return;

    const baseUrl = `https://${domoInstance}.domo.com`;

    resolveTabId().then((resolvedTabId) => {
      if (!resolvedTabId) return;

      const pending = [];

      for (const event of events) {
        const { objectId, objectType } = event;
        if (!objectType || !objectId) continue;
        const key = `${objectType}:${objectId}`;
        if (resolvedUrlKeysRef.current.has(key)) continue;
        resolvedUrlKeysRef.current.add(key);

        const obj = new DomoObject(objectType, objectId, baseUrl);
        if (!obj.hasUrl()) continue;

        pending.push(
          obj
            .buildUrl(baseUrl, resolvedTabId)
            .then((url) => ({ key, url }))
            .catch(() => null)
        );
      }

      if (pending.length === 0) return;

      Promise.all(pending).then((results) => {
        const resolved = results.filter(Boolean);
        if (resolved.length === 0) return;
        setObjectUrlMap((prev) => {
          let changed = false;
          for (const { key, url } of resolved) {
            if (prev[key] !== url) {
              changed = true;
              break;
            }
          }
          if (!changed) return prev;
          const next = { ...prev };
          for (const { key, url } of resolved) {
            next[key] = url;
          }
          return next;
        });
      });
    });
  }, [events, domoInstance, tabId, resolveTabId]);

  // Define columns. Time-column sort is server-side when source==='dataset'
  // (manualSort=true skips DataTable's local sort; toggling direction triggers
  // a refetch via datasetSortKey). On api source the time column behaves like
  // every other column — local-only sort of currently-loaded rows — until the
  // audit endpoint's server-side sort is verified.
  // Last column varies by source: Description (additionalComment) on api,
  // Source (sourceId/sourceName/sourceType) on dataset since the dataset has
  // no description field but does carry actor info the API doesn't expose.
  const columns = useMemo(() => {
    const baseUrl = domoInstance ? `https://${domoInstance}.domo.com` : null;
    const actionTranslations = Object.fromEntries(
      actionOptions.map((a) => [a.type, a.translation])
    );
    const isDataset = source === 'dataset';
    return [
      createTimestampColumn({ manualSort: isDataset }),
      createUserColumn({ customAvatarIds, domoInstance, userNameMap }),
      createActionColumn({ actionTranslations }),
      createObjectColumn({ baseUrl, objectUrlMap }),
      isDataset ? createSourceColumn() : createAdditionalCommentColumn()
    ];
  }, [domoInstance, tabId, actionOptions, customAvatarIds, objectUrlMap, source, userNameMap]);

  // Set initial column visibility based on number of objects
  const initialColumnVisibility = useMemo(
    () => ({
      // Show comment column only when single object
      additionalComment: activityLogType === 'single-object',
      // Show object column only when multiple objects
      objectName: activityLogType !== 'single-object'
    }),
    [activityLogType]
  );

  // Fetch activity log events from all objects (re-runs when userFilter changes)
  useEffect(() => {
    const fetchEvents = async () => {
      if (!tabId || objects.length === 0) {
        setIsInitialLoad(false);
        return;
      }

      // Source swaps (api ↔ dataset) should show the full initial-load skeleton —
      // the data shape is identical but the source is fundamentally different,
      // and lingering rows from the prior source are confusing during the swap.
      const sourceChanged = prevSourceRef.current !== source;
      prevSourceRef.current = source;
      if (sourceChanged) {
        hasLoadedRef.current = false;
        setEvents([]);
      }

      if (hasLoadedRef.current) {
        setIsSearching(true);
      } else {
        setIsInitialLoad(true);
        setEvents([]);
      }

      setError(null);
      setDatasetFetchError(null);

      try {
        const resolvedTabId = await resolveTabId();
        if (!resolvedTabId) return;

        if (source === 'dataset') {
          const datasetId = await resolveDatasetId(domoInstance);
          const result = await getActivityLogFromDataset({
            datasetId,
            filters: buildDatasetFilters({
              actionFilter: actionFilterRef.current,
              dateRangeEpoch,
              objects,
              userFilter: userFilterRef.current
            }),
            limit: pageSize,
            offset: 0,
            sortDirection:
              sortDescriptorRef.current?.column === 'time'
                ? sortDescriptorRef.current.direction
                : 'descending',
            tabId: resolvedTabId
          });
          const events = result?.events ?? [];
          const total = result?.total ?? 0;
          setDatasetState({
            hasMore: events.length < total,
            offset: events.length,
            total
          });
          // Clear API per-task state so derived totals/hasMore aren't polluted
          setObjectStates({});
          setEvents(events);
        } else {
          const tasks = buildFetchTasks(objects, userFilterRef.current, actionFilterRef.current);

          const fetchThunks = tasks.map(
            (task) => () =>
              getActivityLogForObject({
                end: dateRangeEpoch.end,
                eventType: task.eventType,
                limit: pageSize,
                objectId: task.objectId,
                objectType: task.objectType,
                offset: 0,
                start: dateRangeEpoch.start,
                tabId: resolvedTabId,
                user: task.user
              })
                .then((result) => ({
                  events: result?.events ?? [],
                  eventType: task.eventType,
                  key: task.key,
                  objectId: task.objectId,
                  objectType: task.objectType,
                  total: result?.total ?? 0,
                  user: task.user
                }))
                .catch((err) => {
                  console.error(`Error fetching for ${task.key}:`, err);
                  return {
                    events: [],
                    eventType: task.eventType,
                    key: task.key,
                    objectId: task.objectId,
                    objectType: task.objectType,
                    total: 0,
                    user: task.user
                  };
                })
          );

          const results = await promisePool(fetchThunks);

          const newStates = {};
          results.forEach(({ events, eventType, key, objectId, objectType, total, user }) => {
            newStates[key] = {
              eventType,
              hasMore: events.length < total,
              objectId,
              objectType,
              offset: events.length,
              total,
              user
            };
          });
          setObjectStates(newStates);
          // Clear dataset state so derived totals/hasMore aren't polluted
          setDatasetState({ hasMore: false, offset: 0, total: 0 });

          const allEvents = deduplicateEvents(results.flatMap((r) => r.events));
          allEvents.sort((a, b) => new Date(b.time) - new Date(a.time));

          setEvents(allEvents);
        }
      } catch (err) {
        console.error('Error fetching activity log:', err);
        if (source === 'dataset') {
          setDatasetFetchError(err.message || 'Failed to fetch from DomoStats dataset');
        } else {
          setError(err.message || 'Failed to fetch activity log');
        }
      } finally {
        hasLoadedRef.current = true;
        setIsInitialLoad(false);
        setIsSearching(false);
      }
    };

    fetchEvents();
    // datasetSortKey collapses to '' when irrelevant (api source, or non-time
    // active sort) so toggling User/Action sort doesn't trigger refetch.
  }, [
    objects,
    tabId,
    refreshKey,
    userFilterKey,
    dateRangeEpoch,
    source,
    domoInstance,
    datasetSortKey
  ]);

  const total = useMemo(() => {
    if (source === 'dataset') return datasetState.total;
    return Object.values(objectStates).reduce((sum, state) => sum + state.total, 0);
  }, [source, datasetState.total, objectStates]);

  // Check if any objects still have more events to fetch
  const hasMore = useMemo(() => {
    if (source === 'dataset') return datasetState.hasMore;
    return Object.values(objectStates).some((state) => state.hasMore);
  }, [source, datasetState.hasMore, objectStates]);

  // Fetch more events when scrolling — reads task info from objectStates (API
  // source) or from datasetState (DomoStats source). Reads source/domoInstance/
  // objects via refs so the callback identity stays stable (only changes when
  // isInitialLoad/isSearching toggle). HeroUI's Table.LoadMore wires its
  // intersection observer to onLoadMore once per reference; churning the
  // identity makes the observer miss scroll triggers.
  const fetchMoreEvents = useCallback(async () => {
    if (isFetchingMoreRef.current || isInitialLoad || isSearching) {
      return;
    }

    if (sourceRef.current === 'dataset') {
      const currentDatasetState = datasetStateRef.current;
      if (!currentDatasetState.hasMore) return;

      isFetchingMoreRef.current = true;
      setIsFetchingMore(true);

      try {
        const resolvedTabId = await resolveTabId();
        const datasetId = await resolveDatasetId(domoInstanceRef.current);
        const result = await getActivityLogFromDataset({
          datasetId,
          filters: buildDatasetFilters({
            actionFilter: actionFilterRef.current,
            dateRangeEpoch: dateRangeEpochRef.current,
            objects: objectsRef.current,
            userFilter: userFilterRef.current
          }),
          limit: pageSize,
          offset: currentDatasetState.offset,
          sortDirection:
            sortDescriptorRef.current?.column === 'time'
              ? sortDescriptorRef.current.direction
              : 'descending',
          tabId: resolvedTabId
        });
        const newEvents = result?.events ?? [];
        const total = result?.total ?? currentDatasetState.total;
        setDatasetState((prev) => {
          const newOffset = prev.offset + newEvents.length;
          return {
            hasMore: newOffset < total,
            offset: newOffset,
            total
          };
        });
        setEvents((prev) => {
          // Don't re-sort: the server returned this page in the user's chosen
          // sortDirection (asc or desc), and `prev` is in that same order from
          // the prior page. Concatenation preserves the order; deduplication
          // only filters, so the merged list stays correctly ordered. Sorting
          // here would override the server's order — and since the time column
          // is rendered with `manualSort: true` on dataset source, DataTable
          // doesn't re-sort either, so whatever order we set here is what the
          // user sees.
          return deduplicateEvents([...prev, ...newEvents]);
        });
      } catch (err) {
        console.error('Error fetching more events from dataset:', err);
      } finally {
        isFetchingMoreRef.current = false;
        setIsFetchingMore(false);
      }
      return;
    }

    const currentStates = objectStatesRef.current;
    const tasksWithMore = Object.entries(currentStates)
      .filter(([, state]) => state.hasMore)
      .map(([key, state]) => ({ key, ...state }));

    if (tasksWithMore.length === 0) return;

    isFetchingMoreRef.current = true;
    setIsFetchingMore(true);

    try {
      const resolvedTabId = await resolveTabId();
      const fetchThunks = tasksWithMore.map(
        (task) => () =>
          getActivityLogForObject({
            end: dateRangeEpochRef.current.end,
            eventType: task.eventType,
            limit: pageSize,
            objectId: task.objectId,
            objectType: task.objectType,
            offset: task.offset,
            start: dateRangeEpochRef.current.start,
            tabId: resolvedTabId,
            user: task.user
          })
            .then((result) => ({
              events: result?.events ?? [],
              key: task.key,
              total: result?.total ?? 0
            }))
            .catch((err) => {
              console.error(`Error fetching more for ${task.key}:`, err);
              return {
                events: [],
                key: task.key,
                total: task.total
              };
            })
      );

      const results = await promisePool(fetchThunks);

      setObjectStates((prev) => {
        const newStates = { ...prev };
        results.forEach(({ events, key, total }) => {
          const currentState = newStates[key];
          const newOffset = currentState.offset + events.length;
          newStates[key] = {
            ...currentState,
            hasMore: newOffset < total,
            offset: newOffset,
            total
          };
        });
        return newStates;
      });

      const newEvents = results.flatMap((r) => r.events);
      setEvents((prev) => {
        const allEvents = deduplicateEvents([...prev, ...newEvents]);
        allEvents.sort((a, b) => new Date(b.time) - new Date(a.time));
        return allEvents;
      });
    } catch (err) {
      console.error('Error fetching more events:', err);
    } finally {
      isFetchingMoreRef.current = false;
      setIsFetchingMore(false);
    }
  }, [resolveTabId, isInitialLoad, isSearching]);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  // "Use DomoStats" handler — runs discovery if no cached dataset ID exists
  // (or if `forceDiscovery: true` is passed to bypass the cache, used by the
  // stale-ID recovery action), persists the discovered ID, then flips source
  // to 'dataset' (or just refreshes if already there).
  const handleUseDomoStats = useCallback(
    async ({ forceDiscovery = false } = {}) => {
      setDiscoveryError(null);
      setDatasetFetchError(null);

      if (!forceDiscovery) {
        // Hot path: cached ID already exists, just flip
        try {
          const stored = await chrome.storage.local.get(['perInstance']);
          if (stored?.perInstance?.[domoInstance]?.activityLogDatasetId) {
            setSource('dataset');
            return;
          }
        } catch {
          // fall through to discovery
        }
      }

      setIsDiscovering(true);
      try {
        const resolvedTabId = await resolveTabId();
        if (!resolvedTabId) {
          throw new Error('Could not resolve a Domo tab to run discovery against');
        }
        const datasetId = await findActivityLogDataset({ tabId: resolvedTabId });
        if (!datasetId) {
          setDiscoveryError(
            'No DomoStats Activity Log dataset found in this instance. ' +
              'Add the Activity Log report from the DomoStats connector to use this option.'
          );
          return;
        }
        await updatePerInstance(domoInstance, 'activityLogDatasetId', datasetId);
        if (forceDiscovery) {
          // Already in dataset mode — trigger a re-fetch via refreshKey instead
          // of a redundant setSource('dataset')
          setRefreshKey((prev) => prev + 1);
        } else {
          setSource('dataset');
        }
      } catch (err) {
        console.error('Error discovering DomoStats Activity Log dataset:', err);
        setDiscoveryError(err.message || 'Failed to discover DomoStats Activity Log dataset');
      } finally {
        setIsDiscovering(false);
      }
    },
    [domoInstance, resolveTabId, updatePerInstance]
  );

  // Handle action filter changes — updates dropdown state and triggers re-fetch via ref
  const handleActionFilterChange = useCallback((newFilter) => {
    setActionFilter(newFilter);
    actionFilterRef.current = newFilter;
    setRefreshKey((prev) => prev + 1);
  }, []);

  // Fetch all data for export — paginates through all (object × user) tasks
  const fetchAllDataForExport = useCallback(async () => {
    if (objects.length === 0) {
      return filteredEvents;
    }

    const resolvedTabId = await resolveTabId();
    if (!resolvedTabId) return filteredEvents;

    const allEvents = [];
    const exportPageSize = 1000;
    const tasks = buildFetchTasks(objects, userFilterRef.current, actionFilterRef.current);

    for (const task of tasks) {
      let offset = 0;
      let taskHasMore = true;

      while (taskHasMore) {
        try {
          const result = await getActivityLogForObject({
            end: dateRangeEpoch.end,
            eventType: task.eventType,
            limit: exportPageSize,
            objectId: task.objectId,
            objectType: task.objectType,
            offset,
            start: dateRangeEpoch.start,
            tabId: resolvedTabId,
            user: task.user
          });

          const events = result?.events ?? [];
          const total = result?.total ?? 0;

          allEvents.push(...events);

          offset += events.length;
          taskHasMore = offset < total && events.length > 0;
        } catch (err) {
          console.error(`Error fetching all events for ${task.key}:`, err);
          taskHasMore = false;
        }
      }
    }

    allEvents.sort((a, b) => new Date(b.time) - new Date(a.time));

    if (objectTypeFilter.size > 0) {
      return allEvents.filter(
        (event) => event.objectType && objectTypeFilter.has(event.objectType)
      );
    }

    return allEvents;
  }, [resolveTabId, objects, filteredEvents, userFilterKey, dateRangeEpoch, objectTypeFilter]);

  // Memoize filter toolbar so it doesn't re-render during event fetches
  const customFilters = useMemo(
    () => (
      <div className='flex w-full flex-row flex-wrap items-center justify-start gap-1 sm:flex-nowrap'>
        {/* Date Range Filter */}
        <DateRangePicker
          shouldForceLeadingZeros
          aria-label='Date Range Picker'
          className='w-full sm:w-72'
          endName='endDate'
          granularity='day'
          maxValue={today(getLocalTimeZone())}
          minValue={parseDate('2008-01-01')}
          startName='startDate'
          value={dateRange}
          onChange={setDateRange}
        >
          <DateField.Group variant='secondary'>
            <DateField.Input slot='start'>
              {(segment) => <DateField.Segment segment={segment} />}
            </DateField.Input>
            <DateRangePicker.RangeSeparator />
            <DateField.Input slot='end'>
              {(segment) => <DateField.Segment segment={segment} />}
            </DateField.Input>
            <DateField.Suffix>
              {dateRange && (
                <CloseButton size='sm' variant='ghost' onPress={() => setDateRange(null)} />
              )}
              <DateRangePicker.Trigger>
                <DateRangePicker.TriggerIndicator>
                  <IconCalendar className='text-foreground' />
                </DateRangePicker.TriggerIndicator>
              </DateRangePicker.Trigger>
            </DateField.Suffix>
          </DateField.Group>
          <DateRangePicker.Popover>
            <RangeCalendar
              aria-label='Date Range Calendar'
              maxValue={today(getLocalTimeZone())}
              minValue={parseDate('2008-01-01')}
            >
              <RangeCalendar.Header>
                <RangeCalendar.YearPickerTrigger>
                  <RangeCalendar.YearPickerTriggerHeading />
                  <RangeCalendar.YearPickerTriggerIndicator />
                </RangeCalendar.YearPickerTrigger>
                <RangeCalendar.NavButton slot='previous' />
                <RangeCalendar.NavButton slot='next' />
              </RangeCalendar.Header>
              <RangeCalendar.Grid>
                <RangeCalendar.GridHeader>
                  {(day) => <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>}
                </RangeCalendar.GridHeader>
                <RangeCalendar.GridBody>
                  {(date) => <RangeCalendar.Cell date={date} />}
                </RangeCalendar.GridBody>
              </RangeCalendar.Grid>
              <RangeCalendar.YearPickerGrid>
                <RangeCalendar.YearPickerGridBody>
                  {({ year }) => <RangeCalendar.YearPickerCell year={year} />}
                </RangeCalendar.YearPickerGridBody>
              </RangeCalendar.YearPickerGrid>
            </RangeCalendar>
          </DateRangePicker.Popover>
        </DateRangePicker>
        <ButtonGroup className='w-72' variant='tertiary'>
          {/* Action Filter */}
          <Dropdown>
            <Button
              fullWidth
              className='min-w-0 flex-1'
              isDisabled={actionOptions.length === 0}
              variant='tertiary'
            >
              <IconFunnel />
              Action
            </Button>
            <Dropdown.Popover className='max-h-120! overflow-y-auto'>
              <Dropdown.Menu
                selectedKeys={actionFilter}
                selectionMode='multiple'
                onSelectionChange={handleActionFilterChange}
              >
                {actionOptions.map((action) => {
                  const color = getActionColor(action.type);
                  return (
                    <Dropdown.Item
                      id={action.type}
                      key={action.type}
                      textValue={action.translation}
                    >
                      <Dropdown.ItemIndicator>
                        {({ isSelected }) => (
                          <AnimatePresence>
                            {isSelected && <AnimatedCheck className='text-muted' stroke={1.5} />}
                          </AnimatePresence>
                        )}
                      </Dropdown.ItemIndicator>
                      <Label>
                        <Chip color={color} variant='soft'>
                          {action.translation}
                        </Chip>
                      </Label>
                    </Dropdown.Item>
                  );
                })}
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>

          {/* Object Type Filter — only shown for multi-object activity logs */}
          {activityLogType !== 'single-object' && (
            <Dropdown>
              <Button
                fullWidth
                className='min-w-0 flex-1'
                isDisabled={objectTypeOptions.length === 0}
                variant='tertiary'
              >
                <IconFunnel />
                Object Type
              </Button>
              <Dropdown.Popover className='max-h-64 overflow-y-auto'>
                <Dropdown.Menu
                  selectedKeys={objectTypeFilter}
                  selectionMode='multiple'
                  onSelectionChange={setObjectTypeFilter}
                >
                  {objectTypeOptions.map((type) => (
                    <Dropdown.Item id={type} key={type} textValue={type}>
                      <Dropdown.ItemIndicator>
                        {({ isSelected }) => (
                          <AnimatePresence>
                            {isSelected && <AnimatedCheck className='text-muted' stroke={1.5} />}
                          </AnimatePresence>
                        )}
                      </Dropdown.ItemIndicator>
                      <Label>{type}</Label>
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          )}
        </ButtonGroup>
        <UserFilterAutocomplete
          domoInstance={domoInstance}
          tabId={tabId}
          value={userFilter}
          onChange={setUserFilter}
        />
      </div>
    ),
    [
      activityLogType,
      dateRange,
      actionFilter,
      actionOptions,
      objectTypeOptions,
      objectTypeFilter,
      domoInstance,
      tabId,
      userFilter
    ]
  );

  // Memoize export config to avoid new object reference each render
  const exportConfig = useMemo(
    () => ({
      enabled: true,
      filename: `activity-log_${activityLogType || 'export'}`,
      onFetchAllData: fetchAllDataForExport
    }),
    [activityLogType, fetchAllDataForExport]
  );

  // Memoize header content
  const header = useMemo(
    () => (
      <div className='flex flex-col gap-2'>
        {source === 'api' && (
          <Alert status='warning'>
            <Alert.Indicator>
              <IconExclamationPointCircle data-slot='alert-default-icon' />
            </Alert.Indicator>
            <Alert.Content>
              <Alert.Title>Activity Log API only retains the past year</Alert.Title>
              <Alert.Description>
                For older history, switch to the DomoStats Activity Log dataset (preserves history
                from the day you connected it in Domo).
              </Alert.Description>
              {discoveryError && (
                <Alert.Description className='mt-1 text-danger'>{discoveryError}</Alert.Description>
              )}
            </Alert.Content>
            <Button
              isDisabled={isDiscovering}
              isPending={isDiscovering}
              size='sm'
              variant='secondary'
              onPress={handleUseDomoStats}
            >
              {isDiscovering ? 'Searching for dataset…' : 'Use DomoStats'}
            </Button>
          </Alert>
        )}
        {source === 'dataset' && !datasetFetchError && (
          <Alert status='success'>
            <Alert.Indicator>
              <IconCheckCircle data-slot='alert-default-icon' />
            </Alert.Indicator>
            <Alert.Content>
              <Alert.Title>Using DomoStats Activity Log dataset</Alert.Title>
              {/* <Alert.Description>
                History reaches back to when this dataset was first connected in Domo — older than
                the past year the Activity Log API exposes.
              </Alert.Description> */}
              <Switch
                isSelected={!!perInstanceSettings[domoInstance]?.preferActivityLogDataset}
                size='sm'
                onChange={(v) =>
                  domoInstance && updatePerInstance(domoInstance, 'preferActivityLogDataset', v)
                }
              >
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                <Switch.Content>
                  <Label className='text-xs'>Always for this instance</Label>
                </Switch.Content>
              </Switch>
            </Alert.Content>
            <Button size='sm' variant='secondary' onPress={() => setSource('api')}>
              Switch to API
            </Button>
          </Alert>
        )}
        {source === 'dataset' && datasetFetchError && (
          <Alert status='danger'>
            <Alert.Indicator>
              <IconExclamationPointCircle data-slot='alert-default-icon' />
            </Alert.Indicator>
            <Alert.Content>
              <Alert.Title>Couldn&apos;t load from the DomoStats dataset</Alert.Title>
              <Alert.Description>{datasetFetchError}</Alert.Description>
              <Alert.Description className='mt-1 text-xs'>
                The cached dataset may have been deleted or you may have lost access. Re-run
                discovery to find a fresh one, or switch back to the API source.
              </Alert.Description>
              <div className='mt-2 flex flex-wrap gap-2'>
                <Button
                  isDisabled={isDiscovering}
                  isPending={isDiscovering}
                  size='sm'
                  variant='secondary'
                  onPress={() => handleUseDomoStats({ forceDiscovery: true })}
                >
                  {isDiscovering ? 'Re-running discovery…' : 'Re-run discovery'}
                </Button>
                <Button size='sm' variant='ghost' onPress={() => setSource('api')}>
                  Switch to API
                </Button>
              </div>
            </Alert.Content>
          </Alert>
        )}
        <div className='flex flex-wrap items-center justify-between'>
          <span
            className='flex items-center justify-center gap-1 font-semibold'
            style={{ fontSize: '18px' }}
          >
            Activity Log for{' '}
            {activityLogType === 'single-object' ? (
              <>
                <span>{objects[0]?.type}</span>
                <span className='text-accent'>{objects[0]?.name} </span>
                <span> (ID: {objects[0].id})</span>
              </>
            ) : (
              ` ${objects.length} ${
                activityLogType === 'child-cards'
                  ? objects.length === 1
                    ? 'card'
                    : 'cards'
                  : activityLogType === 'child-pages'
                    ? objects.length === 1
                      ? 'page'
                      : 'pages'
                    : objects.length === 1
                      ? 'object'
                      : 'objects'
              }`
            )}
          </span>
          {total > 0 && (
            <p className='text-base text-muted'>
              {filteredEvents.length !== events.length ? (
                <>
                  Showing {filteredEvents.length.toLocaleString()} filtered of{' '}
                  {events.length.toLocaleString()} fetched ({total.toLocaleString()} total)
                </>
              ) : (
                <>
                  Showing {events.length.toLocaleString()} of {total.toLocaleString()} events
                </>
              )}
              {isFetchingMore && ' (loading more...)'}
              {isSearching && ' (searching...)'}
            </p>
          )}
        </div>
      </div>
    ),
    [
      activityLogType,
      datasetFetchError,
      discoveryError,
      domoInstance,
      events.length,
      filteredEvents.length,
      handleUseDomoStats,
      isDiscovering,
      isFetchingMore,
      isSearching,
      objects,
      perInstanceSettings,
      source,
      total,
      updatePerInstance
    ]
  );

  if (error) {
    return (
      <div className='p-4'>
        <Alert color='danger'>
          <Alert.Indicator>
            <IconExclamationPointCircle data-slot='alert-default-icon' />
          </Alert.Indicator>
          <Alert.Content>
            <Alert.Title>Error Loading Activity Log</Alert.Title>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      </div>
    );
  }

  if (isInitialLoad && events.length === 0) {
    return (
      <div className='skeleton--shimmer flex h-full min-h-0 w-full flex-1 flex-col gap-2 overflow-hidden p-4'>
        {/* Title + subtitle row */}
        <div className='flex items-center justify-between p-1'>
          <Skeleton animationType='none' className='h-6 w-80 rounded-lg' />
          <Skeleton animationType='none' className='h-4 w-44 rounded-lg' />
        </div>

        {/* Filter row */}
        <div className='flex w-full items-center justify-between gap-1'>
          <div className='flex flex-1 flex-row flex-wrap items-center gap-1'>
            <Skeleton animationType='none' className='h-9 w-72 rounded-xl' />
            <Skeleton animationType='none' className='h-9 w-72 rounded-xl' />
            <Skeleton animationType='none' className='h-9 min-w-72 flex-1 rounded-xl' />
          </div>
          <div className='flex flex-row items-center gap-1'>
            <Skeleton animationType='none' className='h-9 w-28 rounded-xl' />
            <Skeleton animationType='none' className='h-9 w-9 rounded-xl' />
            <Skeleton animationType='none' className='h-9 w-9 rounded-xl' />
          </div>
        </div>

        {/* Table: heading bar + data rows */}
        <div className='flex h-0 min-h-0 flex-1 flex-col gap-1 overflow-hidden'>
          <Skeleton animationType='none' className='h-10 w-full shrink-0 rounded-lg' />
          <div className='flex flex-1 flex-col gap-1 overflow-hidden'>
            {Array.from({ length: 15 }).map((_, i) => (
              <Skeleton
                animationType='none'
                className='h-13.25 w-full shrink-0 rounded-lg'
                key={i}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <DataTable
      columns={columns}
      customFilters={customFilters}
      data={filteredEvents}
      entityName='events'
      exportConfig={exportConfig}
      hasMore={hasMore}
      header={header}
      initialColumnVisibility={initialColumnVisibility}
      isRefreshing={isInitialLoad || isSearching}
      sortDescriptor={sortDescriptor}
      onLoadMore={fetchMoreEvents}
      onRefresh={handleRefresh}
      onSortChange={setSortDescriptor}
      getRowId={(row, i) =>
        `${row.objectType}:${row.objectId}:${row.time}:${row.actionType}:${row.userId}:${i}`
      }
    />
  );
}

/**
 * Pack the table's current filter state into the shape `getActivityLogFromDataset`
 * expects. Multi-object/multi-action/multi-user filters become `IN(...)` clauses
 * in the dataset query (no fan-out, unlike the audit-API path).
 */
function buildDatasetFilters({ actionFilter, dateRangeEpoch, objects, userFilter }) {
  const objectIds = objects.map((o) => String(o.id));
  const objectTypes = [...new Set(objects.map((o) => o.type))];
  const actions = actionFilter && actionFilter.size > 0 ? [...actionFilter] : [];
  const userIds = Array.isArray(userFilter) ? userFilter : [];
  const dateRange =
    dateRangeEpoch?.start && dateRangeEpoch?.end
      ? { end: dateRangeEpoch.end, start: dateRangeEpoch.start }
      : null;
  return { actions, dateRange, objectIds, objectTypes, userIds };
}

/**
 * Build a list of fetch tasks from objects and an optional user filter.
 * Each task maps to a single API call and a unique pagination key.
 */
function buildFetchTasks(objects, userFilter, actionFilter) {
  const actions = actionFilter.size > 0 ? [...actionFilter] : [undefined];
  const users = userFilter.length > 0 ? userFilter : [undefined];
  return objects.flatMap((obj) =>
    actions.flatMap((eventType) =>
      users.map((user) => {
        const parts = [obj.type, obj.id];
        if (user) parts.push(user);
        if (eventType) parts.push(eventType);
        return {
          eventType,
          key: parts.join(':'),
          objectId: obj.id,
          objectType: obj.type,
          user: user || undefined
        };
      })
    )
  );
}

/**
 * Helper function to create an action column with colored chips
 */
function createActionColumn({ actionTranslations = {}, key = 'actionType' } = {}) {
  return {
    allowsSorting: true,
    cell: (row) => {
      const action = row[key];
      const color = getActionColor(action);

      return (
        <span className={`chip chip--${color} chip--soft chip--lg w-fit`}>
          {actionTranslations[action] || action || '-'}
        </span>
      );
    },
    header: 'Action',
    id: key,
    minWidth: 120,
    width: '2fr'
  };
}

/**
 * Helper function to create an additional comment column with text wrapping
 */
function createAdditionalCommentColumn({ key = 'additionalComment' } = {}) {
  return {
    cell: (row) => {
      const comment = row[key];
      if (!comment) return '-';

      return (
        <span className='truncate text-sm' title={comment}>
          {comment}
        </span>
      );
    },
    header: 'Description',
    id: key,
    minWidth: 200,
    width: '3fr'
  };
}

/**
 * Helper function to create an object column with type and name
 */
function createObjectColumn({
  idKey = 'objectId',
  nameKey = 'objectName',
  objectUrlMap = {},
  typeKey = 'objectType'
} = {}) {
  return {
    accessor: (row) => row[nameKey],
    allowsSorting: true,
    cell: (row) => {
      const name = row[nameKey];
      const type = row[typeKey];
      const id = row[idKey];
      const url = objectUrlMap[`${type}:${id}`];

      return (
        <div className='flex flex-col gap-1'>
          {url ? (
            <a
              className='truncate text-sm font-medium text-foreground no-underline decoration-accent/80 hover:text-accent/80 hover:underline'
              href={url}
              rel='noopener noreferrer'
              target='_blank'
            >
              {name || '-'}
            </a>
          ) : (
            <span className='truncate text-sm font-medium'>{name || '-'}</span>
          )}
          {type && <span className='chip chip--accent chip--soft chip--sm w-fit'>{type}</span>}
        </div>
      );
    },
    header: 'Object',
    id: nameKey,
    minWidth: 180,
    width: '2fr'
  };
}

/**
 * Helper function to create a source column for the DomoStats dataset path.
 * The dataset's Source_ID/Name/Type identifies the actor (user, system job,
 * ETL, etc.). Renders name + type chip in the same shape as the Object column;
 * id is exposed via a `title` tooltip rather than an extra line so the row
 * height stays in lockstep with the rest of the table.
 */
function createSourceColumn({
  idKey = 'sourceId',
  nameKey = 'sourceName',
  typeKey = 'sourceType'
} = {}) {
  return {
    accessor: (row) => row[nameKey],
    allowsSorting: true,
    cell: (row) => {
      const name = row[nameKey];
      const type = row[typeKey];
      const id = row[idKey];
      const tooltip = id ? `${name || '-'} (${id})` : name || '-';

      return (
        <div className='flex flex-col gap-1'>
          <span className='truncate text-sm font-medium' title={tooltip}>
            {name || '-'}
          </span>
          {type && <span className='chip chip--accent chip--soft chip--sm w-fit'>{type}</span>}
        </div>
      );
    },
    header: 'Source',
    id: nameKey,
    minWidth: 180,
    width: '2fr'
  };
}

/**
 * Helper function to create a timestamp column with formatted date/time
 */
function createTimestampColumn({ allowsSorting = true, key = 'time', manualSort = false } = {}) {
  return {
    accessor: (row) => new Date(row[key]).getTime(),
    allowsSorting,
    cell: (row) => {
      const timestamp = row[key];
      if (!timestamp) return '-';

      const date = new Date(timestamp);
      const dateStr = date.toLocaleDateString();
      const timeStr = date.toLocaleTimeString();

      return (
        <div className='flex flex-col'>
          <span className='text-sm font-medium'>{dateStr}</span>
          <span className='text-xs text-muted'>{timeStr}</span>
        </div>
      );
    },
    header: `Timestamp (${getShortTimezone()})`,
    id: key,
    manualSort,
    minWidth: 140,
    width: '1fr'
  };
}

/**
 * Helper function to create a user column with name and email
 */
function createUserColumn({
  customAvatarIds = new Set(),
  domoInstance = null,
  idKey = 'userId',
  nameKey = 'userName',
  userNameMap = {}
} = {}) {
  const getAvatarUrl = (userId) =>
    domoInstance
      ? `https://${domoInstance}.domo.com/api/content/v1/avatar/USER/${userId}?size=100`
      : null;

  return {
    accessor: (row) => row[nameKey] || (row[idKey] != null ? userNameMap[row[idKey]] : null),
    allowsSorting: true,
    cell: (row) => {
      const id = row[idKey];
      // Prefer the row's own name, then the fetched-by-id map (DomoStats path
      // arrives without userName populated and we fill the map via
      // fetchUserDisplayNames).
      const name = row[nameKey] || (id != null ? userNameMap[id] : null);

      return (
        <div className='flex items-center gap-3'>
          <Avatar size='xs'>
            {customAvatarIds.has(id) && <AvatarImage src={getAvatarUrl(id)} />}
            <AvatarFallback>{getInitials(name)}</AvatarFallback>
          </Avatar>
          <div className='flex flex-col'>
            {id && domoInstance ? (
              <a
                className='truncate text-sm font-medium text-foreground no-underline decoration-accent/80 hover:text-accent/80 hover:underline'
                href={`https://${domoInstance}.domo.com/admin/people/${id}?tab=profile`}
                rel='noopener noreferrer'
                target='_blank'
                title={name}
              >
                {name || '-'}
              </a>
            ) : (
              <span className='truncate text-sm font-medium' title={name}>
                {name || '-'}
              </span>
            )}
            {id && (
              <span className='truncate text-xs text-muted' title={String(id)}>
                {id}
              </span>
            )}
          </div>
        </div>
      );
    },
    header: 'User',
    id: nameKey,
    minWidth: 180,
    width: '2fr'
  };
}

function deduplicateEvents(events) {
  const seen = new Set();
  return events.filter((event) => {
    const normalized = { ...event };
    if (normalized.time) {
      const d = new Date(normalized.time);
      d.setMilliseconds(0);
      normalized.time = d.toISOString();
    }
    const key = JSON.stringify(normalized);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Get color for an action based on exact match or partial match
 * @param {string} action - The action string
 * @returns {string} The color name
 */
function getActionColor(action) {
  if (!action) return 'accent';

  const actionLower = action.toLowerCase();

  for (const [pattern, color] of Object.entries(ACTION_COLOR_PATTERNS)) {
    if (!pattern.startsWith('^') && actionLower.includes(pattern)) {
      return color;
    }
  }

  for (const [pattern, color] of Object.entries(ACTION_COLOR_PATTERNS)) {
    if (pattern.startsWith('^') && actionLower.startsWith(pattern.slice(1))) {
      return color;
    }
  }

  return 'accent';
}

function getShortTimezone() {
  const parts = new Intl.DateTimeFormat(undefined, {
    timeZoneName: 'short'
  }).formatToParts(new Date());
  return (
    parts.find((p) => p.type === 'timeZoneName')?.value ??
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
}

/**
 * Run an array of thunks (functions returning promises) with limited concurrency.
 * Returns results in the same order as the input thunks.
 */
async function promisePool(taskFns, concurrency = 6) {
  const results = [];
  let index = 0;
  async function runNext() {
    while (index < taskFns.length) {
      const i = index++;
      results[i] = await taskFns[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, taskFns.length) }, runNext));
  return results;
}

/**
 * Resolve the DomoStats Activity Log dataset ID for a given Domo instance from
 * `chrome.storage.local.perInstance[<instance>].activityLogDatasetId`.
 *
 * Phase 3 (discovery) writes this key automatically; Phase 4 will surface it in
 * Settings. Until then, the user can populate it via DevTools to test the
 * dataset path against a real DomoStats Activity Log dataset.
 */
async function resolveDatasetId(domoInstance) {
  if (!domoInstance) {
    throw new Error('Cannot resolve DomoStats dataset: Domo instance is unknown');
  }
  const result = await chrome.storage.local.get(['perInstance']);
  const datasetId = result.perInstance?.[domoInstance]?.activityLogDatasetId;
  if (!datasetId) {
    throw new Error(
      `No DomoStats Activity Log dataset configured for "${domoInstance}". ` +
        'Switch to API and click "Use DomoStats" to run discovery again.'
    );
  }
  return datasetId;
}
