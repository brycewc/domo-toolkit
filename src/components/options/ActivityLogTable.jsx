import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Chip,
  Alert,
  Button,
  Dropdown,
  Label,
  Skeleton,
  Link,
  DateField,
  DateInputGroup,
  Popover
} from '@heroui/react';
import { IconChevronDown, IconRefresh, IconFilter } from '@tabler/icons-react';
import { DataTable } from './DataTable';
import { getActivityLogForObject } from '@/services';
import { DomoObject } from '@/models';
import { ACTION_COLOR_PATTERNS } from '@/utils';

/**
 * Get color for an action based on exact match or partial match
 * @param {string} action - The action string
 * @returns {string} The color name
 */
function getActionColor(action) {
  if (!action) return 'default';

  const actionLower = action.toLowerCase();

  // Try partial matches
  for (const [pattern, color] of Object.entries(ACTION_COLOR_PATTERNS)) {
    if (actionLower.includes(pattern)) {
      return color;
    }
  }

  return 'default';
}

/**
 * Helper function to create a timestamp column with formatted date/time
 */
function createTimestampColumn({ accessorKey = 'time' } = {}) {
  return {
    accessorKey,
    header: 'Timestamp',
    size: 160,
    minSize: 160,
    maxSize: 160,
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
    size: 180,
    minSize: 180,
    maxSize: 180,
    cell: ({ row }) => {
      const name = row.getValue(nameKey);
      const id = row.original[idKey];

      return (
        <div className='flex flex-col'>
          <span className='truncate text-sm font-medium' title={name}>
            {name || '-'}
          </span>
          {id && (
            <span className='truncate text-xs text-muted' title={id}>
              {id}
            </span>
          )}
        </div>
      );
    }
  };
}

/**
 * Helper function to create an action column with colored chips
 */
function createActionColumn({ accessorKey = 'actionType' } = {}) {
  return {
    accessorKey,
    header: 'Action',
    size: 150,
    minSize: 150,
    maxSize: 150,
    cell: ({ row }) => {
      const action = row.getValue(accessorKey);
      const color = getActionColor(action);

      return (
        <Chip color={color} variant='soft' size='lg'>
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
        <div className='flex flex-col gap-1'>
          {url ? (
            <Link
              href={url}
              target='_blank'
              className='text-sm font-medium no-underline decoration-accent/80 hover:text-accent/80 hover:underline'
            >
              {name || '-'}
            </Link>
          ) : (
            <span className='text-sm font-medium'>{name || '-'}</span>
          )}
          {type && (
            <Chip size='sm' className='w-fit'>
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
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
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

  // Get unique users for filters
  const userOptions = useMemo(() => {
    const users = new Set();
    events.forEach((event) => {
      if (event.userName) {
        users.add(event.userName);
      }
    });
    return Array.from(users).sort();
  }, [events]);

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

    // Filter by date range
    if (startDate || endDate) {
      filtered = filtered.filter((event) => {
        const eventDate = new Date(event.time);
        eventDate.setHours(0, 0, 0, 0); // Reset time to start of day for comparison

        if (startDate && endDate) {
          const start = new Date(startDate);
          const end = new Date(endDate);
          start.setHours(0, 0, 0, 0);
          end.setHours(23, 59, 59, 999); // End of day
          return eventDate >= start && eventDate <= end;
        } else if (startDate) {
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          return eventDate >= start;
        } else if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          return eventDate <= end;
        }
        return true;
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
  }, [events, startDate, endDate, userFilter, actionFilter, objectTypeFilter]);

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
  }, [objects, tabId, refreshKey]);

  // Check if any objects still have more events to fetch
  const hasMore = useMemo(() => {
    const result = Object.values(objectStates).some((state) => state.hasMore);
    console.log('[ActivityLogTable] hasMore calculated:', {
      result,
      objectStates
    });
    return result;
  }, [objectStates]);

  // Fetch more events when scrolling - only from objects that still have more
  const fetchMoreEvents = useCallback(async () => {
    console.log('[ActivityLogTable] fetchMoreEvents called', {
      isFetchingMore,
      hasMore,
      isInitialLoad,
      isSearching,
      objectsCount: objects.length
    });

    if (isFetchingMore || !hasMore || isInitialLoad || isSearching) {
      console.log('[ActivityLogTable] Skipping fetch:', {
        reason: isFetchingMore
          ? 'already fetching'
          : !hasMore
            ? 'no more data'
            : isInitialLoad
              ? 'initial load'
              : 'searching'
      });
      return;
    }

    console.log('[ActivityLogTable] Starting to fetch more events...');
    setIsFetchingMore(true);

    try {
      // Log the objects array and objectStates before filtering
      console.log('[ActivityLogTable] Current objects array:', objects);
      console.log('[ActivityLogTable] Current objectStates:', objectStates);

      // Filter to only objects that still have more events
      const objectsWithMore = objects.filter(({ type, id }) => {
        const key = `${type}:${id}`;
        const hasMoreData = objectStates[key]?.hasMore;
        console.log('[ActivityLogTable] Checking object:', {
          type,
          id,
          key,
          hasMoreData,
          stateExists: !!objectStates[key],
          state: objectStates[key]
        });
        return hasMoreData;
      });

      console.log('[ActivityLogTable] Objects with more data:', {
        count: objectsWithMore.length,
        objects: objectsWithMore.map(({ type, id }) => ({
          type,
          id,
          state: objectStates[`${type}:${id}`]
        }))
      });

      if (objectsWithMore.length === 0) {
        console.log('[ActivityLogTable] No objects with more data, stopping');
        setIsFetchingMore(false);
        return;
      }

      // Fetch next page from all objects that have more
      const fetchPromises = objectsWithMore.map(({ type, id }) => {
        const key = `${type}:${id}`;
        const state = objectStates[key];

        console.log('[ActivityLogTable] Fetching events for object:', {
          type,
          id,
          key,
          offset: state.offset,
          pageSize,
          tabId
        });

        return getActivityLogForObject({
          objectType: type,
          objectId: id,
          limit: pageSize,
          offset: state.offset,
          tabId
        })
          .then((result) => {
            console.log('[ActivityLogTable] Received events for object:', {
              type,
              id,
              eventsCount: result?.events?.length ?? 0,
              total: result?.total ?? 0
            });

            return {
              objectType: type,
              objectId: id,
              events: result?.events ?? [],
              total: result?.total ?? 0
            };
          })
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

      console.log('[ActivityLogTable] Waiting for all fetch promises...', {
        promisesCount: fetchPromises.length
      });

      const results = await Promise.all(fetchPromises);

      console.log('[ActivityLogTable] All fetches complete:', {
        resultsCount: results.length,
        totalEventsReceived: results.reduce(
          (sum, r) => sum + r.events.length,
          0
        )
      });

      // Update object states
      const newStates = { ...objectStates };
      results.forEach(({ objectType, objectId, events, total }) => {
        const key = `${objectType}:${objectId}`;
        const currentState = newStates[key];
        const newOffset = currentState.offset + events.length;
        const newHasMore = newOffset < total;

        console.log('[ActivityLogTable] Updating state for object:', {
          key,
          oldOffset: currentState.offset,
          newOffset,
          eventsLength: events.length,
          total,
          newHasMore
        });

        newStates[key] = {
          offset: newOffset,
          total,
          hasMore: newHasMore
        };
      });
      setObjectStates(newStates);

      // Merge new events with existing, then sort by timestamp
      const newEvents = results.flatMap((r) => r.events);
      const allEvents = [...events, ...newEvents];
      allEvents.sort((a, b) => new Date(b.time) - new Date(a.time));

      console.log('[ActivityLogTable] Updated events:', {
        previousCount: events.length,
        newEventsCount: newEvents.length,
        totalCount: allEvents.length
      });

      setEvents(allEvents);
    } catch (err) {
      console.error('Error fetching more events:', err);
    } finally {
      console.log('[ActivityLogTable] Finished fetching more events');
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
    isSearching,
    pageSize
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
            Activity Log for{' '}
            {activityLogType === 'single-object' ? (
              <>
                <span className='text-accent'>{objects[0]?.name} </span>
                <Chip color='accent' variant='soft' size='md'>
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
          <IconRefresh />
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
            {/* Date Range Filter */}
            <Popover>
              <Button variant='tertiary'>
                <IconFilter stroke={1.5} />
                Date Range
                <IconChevronDown stroke={1.5} />
              </Button>
              <Popover.Content className='w-72'>
                <Popover.Dialog className='flex flex-col gap-3'>
                  <DateField
                    name='Start Date'
                    value={startDate}
                    onChange={setStartDate}
                    granularity='day'
                  >
                    <Label>Start Date</Label>
                    <DateInputGroup>
                      <DateInputGroup.Input>
                        {(segment) => (
                          <DateInputGroup.Segment segment={segment} />
                        )}
                      </DateInputGroup.Input>
                    </DateInputGroup>
                  </DateField>
                  <DateField
                    name='End Date'
                    value={endDate}
                    onChange={setEndDate}
                    granularity='day'
                  >
                    <Label>End Date</Label>
                    <DateInputGroup>
                      <DateInputGroup.Input>
                        {(segment) => (
                          <DateInputGroup.Segment segment={segment} />
                        )}
                      </DateInputGroup.Input>
                    </DateInputGroup>
                  </DateField>
                  <Button
                    variant='tertiary'
                    size='sm'
                    onPress={() => {
                      setStartDate(null);
                      setEndDate(null);
                    }}
                    isDisabled={!startDate && !endDate}
                  >
                    Clear
                  </Button>
                </Popover.Dialog>
              </Popover.Content>
            </Popover>

            {/* User Filter */}
            {userOptions.length > 0 && (
              <Dropdown>
                <Button variant='tertiary'>
                  <IconFilter stroke={1.5} />
                  User
                  <IconChevronDown stroke={1.5} />
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
                  <IconFilter stroke={1.5} />
                  Action
                  <IconChevronDown stroke={1.5} />
                </Button>
                <Dropdown.Popover className='max-h-64 overflow-y-auto'>
                  <Dropdown.Menu
                    selectionMode='multiple'
                    selectedKeys={actionFilter}
                    onSelectionChange={setActionFilter}
                  >
                    {actionOptions.map((action) => {
                      const color = getActionColor(action);
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
                  <IconFilter stroke={1.5} />
                  Object Type
                  <IconChevronDown stroke={1.5} />
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
