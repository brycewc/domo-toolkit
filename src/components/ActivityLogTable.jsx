import { useState, useEffect, useMemo, useCallback } from 'react';
import { DataTable } from '@/components';
import { Chip, Alert, Button } from '@heroui/react';
import { IconRefresh } from '@tabler/icons-react';
import { getActivityLogForObject } from '@/services';

/**
 * Helper function to create a timestamp column with formatted date/time
 */
function createTimestampColumn({ accessorKey = 'time' } = {}) {
  return {
    accessorKey,
    header: 'Timestamp',
    cell: ({ row }) => {
      const timestamp = row.getValue(accessorKey);
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
    }
  };
}

/**
 * Helper function to create a user column with name and email
 */
function createUserColumn({ nameKey = 'userName', idKey = 'userId' } = {}) {
  return {
    accessorKey: nameKey,
    header: 'User',
    cell: ({ row }) => {
      const name = row.getValue(nameKey);
      const id = row.original[idKey];

      return (
        <div className='flex flex-col'>
          <span className='text-sm font-medium'>{name || '-'}</span>
          {id && <span className='text-xs text-muted'>{id}</span>}
        </div>
      );
    }
  };
}

/**
 * Helper function to create an action column with colored chips
 */
function createActionColumn({ accessorKey = 'actionType' } = {}) {
  const actionColorMap = {
    create: 'success',
    update: 'warning',
    delete: 'danger',
    view: 'accent',
    share: 'accent',
    export: 'warning',
    import: 'success'
  };

  return {
    accessorKey,
    header: 'Action',
    cell: ({ row }) => {
      const action = row.getValue(accessorKey);
      const actionLower = action?.toLowerCase() || '';
      const color = actionColorMap[actionLower] || 'default';

      return (
        <Chip color={color} variant='soft' className='capitalize'>
          {action || '-'}
        </Chip>
      );
    }
  };
}

/**
 * Helper function to create an object column with type and name
 */
function createObjectColumn({
  typeKey = 'objectType',
  nameKey = 'objectName'
} = {}) {
  return {
    accessorKey: nameKey,
    header: 'Object',
    cell: ({ row }) => {
      const name = row.getValue(nameKey);
      const type = row.original[typeKey];

      return (
        <div className='flex flex-col'>
          <span className='text-sm font-medium'>{name || '-'}</span>
          {type && (
            <span className='text-xs text-muted capitalize'>{type}</span>
          )}
        </div>
      );
    }
  };
}

/**
 * Helper function to create an additional comment column with text wrapping
 */
function createAdditionalCommentColumn({
  accessorKey = 'additionalComment'
} = {}) {
  return {
    accessorKey,
    header: 'Comment',
    cell: ({ row }) => {
      const comment = row.getValue(accessorKey);
      if (!comment) return '-';

      return (
        <div className='max-w-sm text-wrap'>
          <span className='text-sm' title={comment}>
            {comment}
          </span>
        </div>
      );
    }
  };
}

/**
 * ActivityLogTable Component
 * Displays activity log events for multiple Domo objects in a table
 * Handles complex pagination where each object type is fetched separately
 */
export function ActivityLogTable() {
  const [tabId, setTabId] = useState(null);
  const [events, setEvents] = useState([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [error, setError] = useState(null);
  const [total, setTotal] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [objects, setObjects] = useState([]); // Array of {objectType, objectId}
  // Track pagination state per object: { "objectType:objectId": { offset, total, hasMore } }
  const [objectStates, setObjectStates] = useState({});

  const pageSize = 100; // Fetch in chunks per object

  // Load objects from storage on mount
  useEffect(() => {
    const loadObjects = async () => {
      try {
        const result = await chrome.storage.local.get([
          'activityLogObjects',
          'activityLogTabId'
        ]);
        const loadedObjects = result.activityLogObjects || [];
        setObjects(loadedObjects);
        const tabId = result.activityLogTabId || null;
        setTabId(tabId);

        // Initialize state for each object
        const initialStates = {};
        loadedObjects.forEach((obj) => {
          const key = `${obj.objectType}:${obj.objectId}`;
          initialStates[key] = { offset: 0, total: 0, hasMore: true };
        });
        setObjectStates(initialStates);
      } catch (err) {
        console.error('Error loading objects from storage:', err);
        setError('Failed to load activity log configuration');
      }
    };

    loadObjects();
  }, []);

  // Debounce search to avoid too many API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Define columns
  const columns = useMemo(
    () => [
      createTimestampColumn(),
      createUserColumn(),
      createActionColumn(),
      createAdditionalCommentColumn()
    ],
    []
  );

  // Fetch activity log events from all objects
  useEffect(() => {
    const fetchEvents = async () => {
      if (!tabId || objects.length === 0) {
        setIsInitialLoad(false);
        return;
      }

      // Determine if this is a search or initial load
      const isSearch = events.length > 0;

      if (isSearch) {
        setIsSearching(true);
      } else {
        setIsInitialLoad(true);
        setEvents([]);
      }

      setError(null);

      try {
        // Fetch from all objects in parallel
        const fetchPromises = objects.map(({ objectType, objectId }) =>
          getActivityLogForObject({
            objectType,
            objectId,
            limit: pageSize,
            offset: 0,
            tabId
          })
            .then((result) => ({
              objectType,
              objectId,
              events: result?.events ?? [],
              total: result?.total ?? 0
            }))
            .catch((err) => {
              console.error(
                `Error fetching for ${objectType}:${objectId}:`,
                err
              );
              return {
                objectType,
                objectId,
                events: [],
                total: 0,
                error: err.message
              };
            })
        );

        const results = await Promise.all(fetchPromises);

        // Update object states with totals and hasMore
        const newStates = {};
        let combinedTotal = 0;
        results.forEach(({ objectType, objectId, events, total }) => {
          const key = `${objectType}:${objectId}`;
          newStates[key] = {
            offset: events.length,
            total,
            hasMore: events.length < total
          };
          combinedTotal += total;
        });
        setObjectStates(newStates);
        setTotal(combinedTotal);

        // Combine and sort all events by timestamp
        const allEvents = results.flatMap((r) => r.events);
        allEvents.sort((a, b) => new Date(b.time) - new Date(a.time));

        setEvents(allEvents);
      } catch (err) {
        console.error('Error fetching activity log:', err);
        setError(err.message || 'Failed to fetch activity log');
      } finally {
        setIsInitialLoad(false);
        setIsSearching(false);
      }
    };

    fetchEvents();
  }, [objects, tabId, refreshKey, debouncedSearch]);

  // Check if any objects still have more events to fetch
  const hasMore = useMemo(() => {
    return Object.values(objectStates).some((state) => state.hasMore);
  }, [objectStates]);

  // Fetch more events when scrolling - only from objects that still have more
  const fetchMoreEvents = useCallback(async () => {
    if (isFetchingMore || !hasMore || isInitialLoad || isSearching) return;

    setIsFetchingMore(true);

    try {
      // Filter to only objects that still have more events
      const objectsWithMore = objects.filter(({ objectType, objectId }) => {
        const key = `${objectType}:${objectId}`;
        return objectStates[key]?.hasMore;
      });

      if (objectsWithMore.length === 0) {
        setIsFetchingMore(false);
        return;
      }

      // Fetch next page from all objects that have more
      const fetchPromises = objectsWithMore.map(({ objectType, objectId }) => {
        const key = `${objectType}:${objectId}`;
        const state = objectStates[key];

        return getActivityLogForObject({
          objectType,
          objectId,
          limit: pageSize,
          offset: state.offset,
          tabId
        })
          .then((result) => ({
            objectType,
            objectId,
            events: result?.events ?? [],
            total: result?.total ?? 0
          }))
          .catch((err) => {
            console.error(
              `Error fetching more for ${objectType}:${objectId}:`,
              err
            );
            return {
              objectType,
              objectId,
              events: [],
              total: state.total,
              error: err.message
            };
          });
      });

      const results = await Promise.all(fetchPromises);

      // Update object states
      const newStates = { ...objectStates };
      results.forEach(({ objectType, objectId, events, total }) => {
        const key = `${objectType}:${objectId}`;
        const currentState = newStates[key];
        newStates[key] = {
          offset: currentState.offset + events.length,
          total,
          hasMore: currentState.offset + events.length < total
        };
      });
      setObjectStates(newStates);

      // Merge new events with existing, then sort by timestamp
      const newEvents = results.flatMap((r) => r.events);
      const allEvents = [...events, ...newEvents];
      allEvents.sort((a, b) => new Date(b.time) - new Date(a.time));

      setEvents(allEvents);
    } catch (err) {
      console.error('Error fetching more events:', err);
    } finally {
      setIsFetchingMore(false);
    }
  }, [
    events,
    objects,
    objectStates,
    tabId,
    hasMore,
    isFetchingMore,
    isInitialLoad,
    isSearching
  ]);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  // Handle row action
  const handleRowAction = (action, selectedRows) => {
    console.log(
      `Action "${action}" on ${selectedRows.length} event(s):`,
      selectedRows
    );
    // TODO: Implement actions like export, copy details, etc.
  };

  if (error) {
    return (
      <div className='p-4'>
        <Alert color='danger'>
          <Alert.Indicator />
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
      <div className='flex items-center justify-center p-8'>
        <p className='text-muted'>Loading activity log...</p>
      </div>
    );
  }

  return (
    <div className='h-full w-full'>
      <div className='mb-4 flex items-start justify-between'>
        <div>
          <h3 className='text-lg font-semibold'>
            Activity Log
            {objects.length === 1
              ? ` for ${objects[0].objectType} ${objects[0].objectId}`
              : ` (${objects.length} objects)`}
          </h3>
          {total > 0 && (
            <p className='text-base text-muted'>
              Showing {events.length.toLocaleString()} of{' '}
              {total.toLocaleString()} events
              {isFetchingMore && ' (loading more...)'}
              {isSearching && ' (searching...)'}
            </p>
          )}
        </div>
        <Button
          variant='tertiary'
          size='sm'
          onPress={handleRefresh}
          isDisabled={isInitialLoad || isSearching}
          isPending={isInitialLoad}
        >
          <IconRefresh className='h-4 w-4' />
          Refresh
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={events}
        onRowAction={handleRowAction}
        searchPlaceholder='Search activity log...'
        entityName='events'
        initialSorting={[{ id: 'time', desc: true }]}
        enableSelection={false}
        onLoadMore={fetchMoreEvents}
        onSearchChange={setSearchQuery}
        searchValue={searchQuery}
      />
    </div>
  );
}
