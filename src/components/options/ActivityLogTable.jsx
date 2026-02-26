import {
  Alert,
  Button,
  ButtonGroup,
  Chip,
  DateField,
  DateRangePicker,
  Dropdown,
  Label,
  Link,
  RangeCalendar,
  Skeleton
} from '@heroui/react';
import { getLocalTimeZone, parseDate, today } from '@internationalized/date';
import { IconCalendarWeek, IconFilter } from '@tabler/icons-react';
import { AnimatePresence } from 'motion/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { DomoObject } from '@/models';
import { getActivityLogForObject } from '@/services';
import { ACTION_COLOR_PATTERNS } from '@/utils';

import { AnimatedCheck } from './../AnimatedCheck';
import { DataTable } from './DataTable';
import { UserFilterAutocomplete } from './UserFilterAutocomplete';

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
  const [dateRange, setDateRange] = useState(null);
  const [userFilter, setUserFilter] = useState([]); // Array of user IDs for Autocomplete
  const [actionFilter, setActionFilter] = useState(new Set());
  const [objectTypeFilter, setObjectTypeFilter] = useState(new Set());
  // Track pagination state per object: { "type:id": { offset, total, hasMore } }
  const [objectStates, setObjectStates] = useState({});

  const pageSize = 100; // Fetch in chunks per object

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
    if (dateRange) {
      filtered = filtered.filter((event) => {
        const eventDate = new Date(event.time);
        eventDate.setHours(0, 0, 0, 0); // Reset time to start of day for comparison
        const start = dateRange.start.toDate(getLocalTimeZone());
        const end = dateRange.end.toDate(getLocalTimeZone());
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999); // End of day
        return eventDate >= start && eventDate <= end;
      });
    }

    if (userFilter.length > 0) {
      filtered = filtered.filter((event) => {
        // Filter by userId - handle both numeric and string ID types
        const eventUserId = event.userId;
        return userFilter.some(
          (filterId) =>
            filterId === eventUserId || String(filterId) === String(eventUserId)
        );
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
  }, [events, dateRange, userFilter, actionFilter, objectTypeFilter]);

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
      // Show comment column only when single object
      additionalComment: activityLogType === 'single-object',
      // Show object column only when multiple objects
      objectName: activityLogType !== 'single-object'
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
        const fetchPromises = objects.map(({ id, type }) =>
          getActivityLogForObject({
            limit: pageSize,
            objectId: id,
            objectType: type,
            offset: 0,
            tabId
          })
            .then((result) => ({
              events: result?.events ?? [],
              objectId: id,
              objectType: type,
              total: result?.total ?? 0
            }))
            .catch((err) => {
              console.error(`Error fetching for ${type}:${id}:`, err);
              return {
                error: err.message,
                events: [],
                objectId: id,
                objectType: type,
                total: 0
              };
            })
        );

        const results = await Promise.all(fetchPromises);

        // Update object states with totals and hasMore
        const newStates = {};
        let combinedTotal = 0;
        results.forEach(({ events, objectId, objectType, total }) => {
          const key = `${objectType}:${objectId}`;
          newStates[key] = {
            hasMore: events.length < total,
            offset: events.length,
            total
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
    if (isFetchingMore || !hasMore || isInitialLoad || isSearching) {
      return;
    }

    setIsFetchingMore(true);

    try {
      // Filter to only objects that still have more events
      const objectsWithMore = objects.filter(({ id, type }) => {
        const key = `${type}:${id}`;
        const hasMoreData = objectStates[key]?.hasMore;
        return hasMoreData;
      });

      if (objectsWithMore.length === 0) {
        setIsFetchingMore(false);
        return;
      }

      // Fetch next page from all objects that have more
      const fetchPromises = objectsWithMore.map(({ id, type }) => {
        const key = `${type}:${id}`;
        const state = objectStates[key];

        return getActivityLogForObject({
          limit: pageSize,
          objectId: id,
          objectType: type,
          offset: state.offset,
          tabId
        })
          .then((result) => {
            return {
              events: result?.events ?? [],
              objectId: id,
              objectType: type,
              total: result?.total ?? 0
            };
          })
          .catch((err) => {
            console.error(`Error fetching more for ${type}:${id}:`, err);
            return {
              error: err.message,
              events: [],
              objectId: id,
              objectType: type,
              total: state.total
            };
          });
      });

      const results = await Promise.all(fetchPromises);

      // Update object states
      const newStates = { ...objectStates };
      results.forEach(({ events, objectId, objectType, total }) => {
        const key = `${objectType}:${objectId}`;
        const currentState = newStates[key];
        const newOffset = currentState.offset + events.length;
        const newHasMore = newOffset < total;

        newStates[key] = {
          hasMore: newHasMore,
          offset: newOffset,
          total
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
    isSearching,
    pageSize
  ]);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  // Fetch all data for export - paginates through all objects
  const fetchAllDataForExport = useCallback(async () => {
    if (!tabId || objects.length === 0) {
      return filteredEvents; // Return currently filtered events if no tab/objects
    }

    const allEvents = [];
    const exportPageSize = 1000; // Use max page size for export

    // Fetch all events from each object
    for (const { id, type } of objects) {
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        try {
          const result = await getActivityLogForObject({
            limit: exportPageSize,
            objectId: id,
            objectType: type,
            offset,
            tabId
          });

          const events = result?.events ?? [];
          const total = result?.total ?? 0;

          allEvents.push(...events);

          offset += events.length;
          hasMore = offset < total && events.length > 0;
        } catch (err) {
          console.error(`Error fetching all events for ${type}:${id}:`, err);
          hasMore = false; // Stop on error for this object
        }
      }
    }

    // Sort all events by timestamp descending
    allEvents.sort((a, b) => new Date(b.time) - new Date(a.time));

    // Apply filters to match current view
    let filtered = allEvents;

    // Filter by date range
    if (dateRange) {
      filtered = filtered.filter((event) => {
        const eventDate = new Date(event.time);
        eventDate.setHours(0, 0, 0, 0);

        const start = dateRange.start.toDate(getLocalTimeZone());
        const end = dateRange.end.toDate(getLocalTimeZone());
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        return eventDate >= start && eventDate <= end;
      });
    }

    if (userFilter.length > 0) {
      filtered = filtered.filter((event) =>
        userFilter.includes(String(event.userId))
      );
    }

    if (actionFilter.size > 0) {
      filtered = filtered.filter((event) => {
        const action = event.actionType?.toLowerCase();
        return action && actionFilter.has(action);
      });
    }

    if (objectTypeFilter.size > 0) {
      filtered = filtered.filter(
        (event) => event.objectType && objectTypeFilter.has(event.objectType)
      );
    }

    return filtered;
  }, [
    tabId,
    objects,
    filteredEvents,
    dateRange,
    userFilter,
    actionFilter,
    objectTypeFilter
  ]);

  // Handle row action
  const handleRowAction = (action, selectedRows) => {
    console.log(
      `Action "${action}" on ${selectedRows.length} event(s):`,
      selectedRows
    );
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
                <Chip color='accent' size='md' variant='soft'>
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
              {filteredEvents.length !== events.length ? (
                <>
                  Showing {filteredEvents.length.toLocaleString()} filtered of{' '}
                  {events.length.toLocaleString()} fetched (
                  {total.toLocaleString()} total)
                </>
              ) : (
                <>
                  Showing {events.length.toLocaleString()} of{' '}
                  {total.toLocaleString()} events
                </>
              )}
              {isFetchingMore && ' (loading more...)'}
              {isSearching && ' (searching...)'}
            </p>
          )}
        </div>
      </div>
      <DataTable
        columns={columns}
        data={filteredEvents}
        enableSearch={false}
        enableSelection={false}
        entityName='events'
        initialColumnVisibility={initialColumnVisibility}
        initialSorting={[{ desc: true, id: 'time' }]}
        isRefreshing={isInitialLoad || isSearching}
        onLoadMore={fetchMoreEvents}
        onRefresh={handleRefresh}
        onRowAction={handleRowAction}
        customFilters={(
          <div className='flex w-full flex-row items-center justify-start gap-1'>
            {/* Date Range Filter */}
            <DateRangePicker
              shouldForceLeadingZeros
              aria-label='Date Range Picker'
              className='w-72'
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
                  <DateRangePicker.Trigger>
                    <DateRangePicker.TriggerIndicator>
                      <IconCalendarWeek
                        className='text-foreground'
                        stroke={1.5}
                      />
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
                      {(day) => (
                        <RangeCalendar.HeaderCell>
                          {day}
                        </RangeCalendar.HeaderCell>
                      )}
                    </RangeCalendar.GridHeader>
                    <RangeCalendar.GridBody>
                      {(date) => <RangeCalendar.Cell date={date} />}
                    </RangeCalendar.GridBody>
                  </RangeCalendar.Grid>
                  <RangeCalendar.YearPickerGrid>
                    <RangeCalendar.YearPickerGridBody>
                      {({ year }) => (
                        <RangeCalendar.YearPickerCell year={year} />
                      )}
                    </RangeCalendar.YearPickerGridBody>
                  </RangeCalendar.YearPickerGrid>
                </RangeCalendar>
              </DateRangePicker.Popover>
            </DateRangePicker>
            <ButtonGroup fullWidth className='flex-1/2' variant='tertiary'>
              {/* Action Filter */}
              {actionOptions.length > 0 && (
                <Dropdown>
                  <Button fullWidth variant='tertiary'>
                    <IconFilter stroke={1.5} />
                    Action
                  </Button>
                  <Dropdown.Popover className='max-h-64 overflow-y-auto'>
                    <Dropdown.Menu
                      selectedKeys={actionFilter}
                      selectionMode='multiple'
                      onSelectionChange={setActionFilter}
                    >
                      {actionOptions.map((action) => {
                        const color = getActionColor(action);
                        return (
                          <Dropdown.Item
                            id={action}
                            key={action}
                            textValue={action}
                          >
                            <Dropdown.ItemIndicator>
                              {({ isSelected }) => (
                                <AnimatePresence>
                                  {isSelected && (
                                    <AnimatedCheck
                                      className='text-muted'
                                      stroke={1.5}
                                    />
                                  )}
                                </AnimatePresence>
                              )}
                            </Dropdown.ItemIndicator>
                            <Label>
                              <Chip
                                className='uppercase'
                                color={color}
                                variant='soft'
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
                  <Button fullWidth variant='tertiary'>
                    <IconFilter stroke={1.5} />
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
                                {isSelected && (
                                  <AnimatedCheck
                                    className='text-muted'
                                    stroke={1.5}
                                  />
                                )}
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
        )}
        exportConfig={{
          enabled: true,
          filename: `activity-log_${activityLogType || 'export'}`,
          onFetchAllData: fetchAllDataForExport
        }}
      />
    </div>
  );
}

/**
 * Helper function to create an action column with colored chips
 */
function createActionColumn({ accessorKey = 'actionType' } = {}) {
  return {
    accessorKey,
    cell: ({ row }) => {
      const action = row.getValue(accessorKey);
      const color = getActionColor(action);

      return (
        <Chip color={color} size='lg' variant='soft'>
          {action || '-'}
        </Chip>
      );
    },
    header: 'Action',
    maxSize: 150,
    minSize: 60,
    size: 75
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
    },
    header: 'Comment',
    maxSize: 300,
    minSize: 40,
    size: 75
  };
}

/**
 * Helper function to create an object column with type and name
 */
function createObjectColumn({
  baseUrl = null,
  idKey = 'objectId',
  nameKey = 'objectName',
  tabId = null,
  typeKey = 'objectType'
} = {}) {
  return {
    accessorKey: nameKey,
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
              className='text-sm font-medium no-underline decoration-accent/80 hover:text-accent/80 hover:underline'
              href={url}
              target='_blank'
            >
              {name || '-'}
            </Link>
          ) : (
            <span className='text-sm font-medium'>{name || '-'}</span>
          )}
          {type && (
            <Chip className='w-fit' size='sm'>
              {type}
            </Chip>
          )}
        </div>
      );
    },
    header: 'Object'
  };
}

/**
 * Helper function to create a timestamp column with formatted date/time
 */
function createTimestampColumn({ accessorKey = 'time' } = {}) {
  return {
    accessorKey,
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
    },
    header: 'Timestamp',
    maxSize: 75,
    minSize: 75,
    size: 75
  };
}

/**
 * Helper function to create a user column with name and email
 */
function createUserColumn({ idKey = 'userId', nameKey = 'userName' } = {}) {
  return {
    accessorKey: nameKey,
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
    },
    header: 'User',
    maxSize: 180,
    minSize: 60,
    size: 75
  };
}

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
