import { useState, useEffect, useMemo, useCallback } from 'react';
import { DataTable } from '@/components';
import {
  Chip,
  Alert,
  Button,
  Dropdown,
  Label,
  IconChevronDown,
  Skeleton,
  Link
} from '@heroui/react';
import { IconRefresh, IconFilter } from '@tabler/icons-react';
import { getActivityLogForObject } from '@/services';
import { DomoObject } from '@/models';

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
    created: 'success',
    updated: 'warning',
    deleted: 'danger',
    viewed: 'accent',
    shared: 'accent',
    exported: 'warning',
    imported: 'success'
  };

  return {
    accessorKey,
    header: 'Action',
    cell: ({ row }) => {
      const action = row.getValue(accessorKey);
      const actionLower = action?.toLowerCase() || '';
      const color = actionColorMap[actionLower] || 'default';

      return (
        <Chip color={color} variant='soft'>
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
  nameKey = 'objectName',
  idKey = 'objectId',
  baseUrl = null,
  tabId = null
} = {}) {
  return {
    accessorKey: nameKey,
    header: 'Object',
    cell: ({ row }) => {
      const name = row.getValue(nameKey);
      const type = row.original[typeKey];
      const id = row.original[idKey];
      const [url, setUrl] = useState(null);

      // Build URL asynchronously when component mounts or data changes
      useEffect(() => {
        const buildUrlAsync = async () => {
          if (!type || !id || !baseUrl) {
            setUrl(null);
            return;
          }

          try {
            // Create a DomoObject instance and use its buildUrl method
            const domoObject = new DomoObject(type, id, baseUrl);

            // Only build URL if the object type has a navigable URL
            if (domoObject.hasUrl()) {
              const builtUrl = await domoObject.buildUrl(baseUrl, tabId);
              setUrl(builtUrl);
            } else {
              setUrl(null);
            }
          } catch (error) {
            console.warn('Failed to build URL for object:', error);
            setUrl(null);
          }
        };

        buildUrlAsync();
      }, [type, id, baseUrl, tabId]);

      return (
        <div className='flex flex-col'>
          {url ? (
            <Link
              href={url}
              target='_blank'
              className='text-sm font-medium hover:text-accent/80'
            >
              {name || '-'}
            </Link>
          ) : (
            <span className='text-sm font-medium'>{name || '-'}</span>
          )}
          {type && (
            <Chip size='sm' className='w-fit text-muted'>
              {type}
            </Chip>
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
  const [objects, setObjects] = useState([]); // Array of {type, id}
  const [activityLogType, setActivityLogType] = useState(null);
  const [domoInstance, setDomoInstance] = useState(null);
  const [events, setEvents] = useState([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [error, setError] = useState(null);
  const [total, setTotal] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dateFilter, setDateFilter] = useState(new Set());
  const [userFilter, setUserFilter] = useState(new Set());
  const [actionFilter, setActionFilter] = useState(new Set());
  const [objectTypeFilter, setObjectTypeFilter] = useState(new Set());
  // Track pagination state per object: { "type:id": { offset, total, hasMore } }
  const [objectStates, setObjectStates] = useState({});

  const pageSize = 100; // Fetch in chunks per object

  // Load objects from storage on mount
  useEffect(() => {
    const loadObjects = async () => {
      try {
        const result = await chrome.storage.local.get([
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

  // Get unique dates and users for filters
  const dateOptions = useMemo(() => {
    const dates = new Set();
    events.forEach((event) => {
      if (event.time) {
        const date = new Date(event.time).toLocaleDateString();
        dates.add(date);
      }
    });
    return Array.from(dates).sort((a, b) => new Date(b) - new Date(a));
  }, [events]);

  const userOptions = useMemo(() => {
    const users = new Set();
    events.forEach((event) => {
      if (event.userName) {
        users.add(event.userName);
      }
    });
    return Array.from(users).sort();
  }, [events]);

  // Color map for action types
  const actionColorMap = {
    created: 'success',
    updated: 'warning',
    deleted: 'danger',
    viewed: 'accent',
    shared: 'accent',
    exported: 'warning',
    imported: 'success'
  };

  // Get unique action types for filter
  const actionOptions = useMemo(() => {
    const actions = new Set();
    events.forEach((event) => {
      if (event.actionType) {
        actions.add(event.actionType.toLowerCase());
      }
    });
    return Array.from(actions).sort();
  }, [events]);

  // Get unique object types for filter
  const objectTypeOptions = useMemo(() => {
    const types = new Set();
    events.forEach((event) => {
      if (event.objectType) {
        types.add(event.objectType);
      }
    });
    return Array.from(types).sort();
  }, [events]);

  // Filter events by date, user, and action
  const filteredEvents = useMemo(() => {
    let filtered = events;

    if (dateFilter.size > 0) {
      filtered = filtered.filter((event) => {
        const eventDate = new Date(event.time).toLocaleDateString();
        return dateFilter.has(eventDate);
      });
    }

    if (userFilter.size > 0) {
      filtered = filtered.filter((event) => {
        return userFilter.has(event.userName);
      });
    }

    if (actionFilter.size > 0) {
      filtered = filtered.filter((event) => {
        const action = event.actionType?.toLowerCase();
        return action && actionFilter.has(action);
      });
    }

    if (objectTypeFilter.size > 0) {
      filtered = filtered.filter((event) => {
        return event.objectType && objectTypeFilter.has(event.objectType);
      });
    }

    return filtered;
  }, [events, dateFilter, userFilter, actionFilter, objectTypeFilter]);

  // Define columns
  const columns = useMemo(() => {
    const baseUrl = domoInstance ? `https://${domoInstance}.domo.com` : null;
    return [
      createTimestampColumn(),
      createUserColumn(),
      createActionColumn(),
      createObjectColumn({ baseUrl, tabId }),
      createAdditionalCommentColumn()
    ];
  }, [domoInstance, tabId]);

  // Set initial column visibility based on number of objects
  const initialColumnVisibility = useMemo(
    () => ({
      // Show object column only when multiple objects
      objectName: activityLogType !== 'single-object',
      // Show comment column only when single object
      additionalComment: activityLogType === 'single-object'
    }),
    [activityLogType]
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
        const fetchPromises = objects.map(({ type, id }) =>
          getActivityLogForObject({
            objectType: type,
            objectId: id,
            limit: pageSize,
            offset: 0,
            tabId
          })
            .then((result) => ({
              objectType: type,
              objectId: id,
              events: result?.events ?? [],
              total: result?.total ?? 0
            }))
            .catch((err) => {
              console.error(`Error fetching for ${type}:${id}:`, err);
              return {
                objectType: type,
                objectId: id,
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
        results.forEach(({ type, id, events, total }) => {
          const key = `${type}:${id}`;
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
  }, [objects, tabId, refreshKey]);

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
      const objectsWithMore = objects.filter(({ type, id }) => {
        const key = `${type}:${id}`;
        return objectStates[key]?.hasMore;
      });

      if (objectsWithMore.length === 0) {
        setIsFetchingMore(false);
        return;
      }

      // Fetch next page from all objects that have more
      const fetchPromises = objectsWithMore.map(({ type, id }) => {
        const key = `${type}:${id}`;
        const state = objectStates[key];

        return getActivityLogForObject({
          objectType: type,
          objectId: id,
          limit: pageSize,
          offset: state.offset,
          tabId
        })
          .then((result) => ({
            objectType: type,
            objectId: id,
            events: result?.events ?? [],
            total: result?.total ?? 0
          }))
          .catch((err) => {
            console.error(`Error fetching more for ${type}:${id}:`, err);
            return {
              objectType: type,
              objectId: id,
              events: [],
              total: state.total,
              error: err.message
            };
          });
      });

      const results = await Promise.all(fetchPromises);

      // Update object states
      const newStates = { ...objectStates };
      results.forEach(({ type, id, events, total }) => {
        const key = `${type}:${id}`;
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
      <div className='skeleton--shimmer h-full w-full'>
        <Skeleton animationType='none' className='mb-4 h-4 w-1/3 rounded-lg' />
        <Skeleton animationType='none' className='mb-2 h-8 w-full rounded-lg' />
        <Skeleton
          animationType='none'
          className='mb-4 h-[calc(100vh-12rem)] w-full rounded-lg'
        />
      </div>
    );
  }

  return (
    <div className='h-full w-full'>
      <div className='mb-4 flex items-start justify-between'>
        <div>
          <h3 className='text-lg font-semibold'>
            Activity Log for
            {activityLogType === 'single-object' ? (
              <>
                <span className='text-accent'>{objects[0]?.name} </span>
                <Chip color='accent' variant='soft'>
                  {objects[0].type}
                </Chip>{' '}
                (ID: {objects[0].id})
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
        data={filteredEvents}
        onRowAction={handleRowAction}
        entityName='events'
        initialSorting={[{ id: 'time', desc: true }]}
        initialColumnVisibility={initialColumnVisibility}
        enableSelection={false}
        enableSearch={false}
        onLoadMore={fetchMoreEvents}
        customFilters={
          <>
            {/* Date Filter */}
            {dateOptions.length > 0 && (
              <Dropdown>
                <Button variant='tertiary'>
                  <IconFilter className='size-4' />
                  Date
                  <IconChevronDown className='size-4 text-foreground' />
                </Button>
                <Dropdown.Popover className='max-h-64 overflow-y-auto'>
                  <Dropdown.Menu
                    selectionMode='multiple'
                    selectedKeys={dateFilter}
                    onSelectionChange={setDateFilter}
                  >
                    {dateOptions.map((date) => (
                      <Dropdown.Item id={date} textValue={date}>
                        <Dropdown.ItemIndicator />
                        <Label>{date}</Label>
                      </Dropdown.Item>
                    ))}
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>
            )}

            {/* User Filter */}
            {userOptions.length > 0 && (
              <Dropdown>
                <Button variant='tertiary'>
                  <IconFilter className='size-4' />
                  User
                  <IconChevronDown className='size-4 text-foreground' />
                </Button>
                <Dropdown.Popover className='max-h-64 overflow-y-auto'>
                  <Dropdown.Menu
                    selectionMode='multiple'
                    selectedKeys={userFilter}
                    onSelectionChange={setUserFilter}
                  >
                    {userOptions.map((user) => (
                      <Dropdown.Item id={user} textValue={user}>
                        <Dropdown.ItemIndicator />
                        <Label>{user}</Label>
                      </Dropdown.Item>
                    ))}
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>
            )}

            {/* Action Filter */}
            {actionOptions.length > 0 && (
              <Dropdown>
                <Button variant='tertiary'>
                  <IconFilter className='size-4' />
                  Action
                  <IconChevronDown className='size-4 text-foreground' />
                </Button>
                <Dropdown.Popover className='max-h-64 overflow-y-auto'>
                  <Dropdown.Menu
                    selectionMode='multiple'
                    selectedKeys={actionFilter}
                    onSelectionChange={setActionFilter}
                  >
                    {actionOptions.map((action) => {
                      const color = actionColorMap[action] || 'default';
                      return (
                        <Dropdown.Item id={action} textValue={action}>
                          <Dropdown.ItemIndicator />
                          <Label>
                            <Chip
                              color={color}
                              variant='soft'
                              className='uppercase'
                            >
                              {action}
                            </Chip>
                          </Label>
                        </Dropdown.Item>
                      );
                    })}
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>
            )}

            {/* Object Type Filter */}
            {objectTypeOptions.length > 0 && (
              <Dropdown>
                <Button variant='tertiary'>
                  <IconFilter className='size-4' />
                  Object Type
                  <IconChevronDown className='size-4 text-foreground' />
                </Button>
                <Dropdown.Popover className='max-h-64 overflow-y-auto'>
                  <Dropdown.Menu
                    selectionMode='multiple'
                    selectedKeys={objectTypeFilter}
                    onSelectionChange={setObjectTypeFilter}
                  >
                    {objectTypeOptions.map((type) => (
                      <Dropdown.Item id={type} textValue={type}>
                        <Dropdown.ItemIndicator />
                        <Label>{type}</Label>
                      </Dropdown.Item>
                    ))}
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>
            )}
          </>
        }
      />
    </div>
  );
}
