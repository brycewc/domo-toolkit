import {
  Button,
  Dropdown,
  Label,
  Separator,
  Spinner,
  Tooltip
} from '@heroui/react';
import {
  IconExternalLink,
  IconEye,
  IconLayoutSidebarRightExpand,
  IconRefresh
} from '@tabler/icons-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react';

import {
  DomoObject,
  getAllNavigableObjectTypes,
  getAllObjectTypesWithApiConfig
} from '@/models';
import { fetchObjectDetailsInPage } from '@/services';
import {
  executeInPage,
  isSidepanel,
  openSidepanel,
  storeSidepanelData
} from '@/utils';

const LONG_PRESS_DURATION = 1000;
const LONG_PRESS_SECONDS = LONG_PRESS_DURATION / 1000;

export const NavigateToCopiedObject = forwardRef(
  function NavigateToCopiedObject({ currentContext, onStatusUpdate }, ref) {
    const [copiedObjectId, setCopiedObjectId] = useState(null);
    const [objectDetails, setObjectDetails] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [selectedType, setSelectedType] = useState(null);
    const [defaultDomoInstance, setDefaultDomoInstance] = useState('');
    const lastCheckedClipboard = useRef('');
    const [allTypes, setAllTypes] = useState([]);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isHolding, setIsHolding] = useState(false);
    const holdTimeoutRef = useRef(null);

    const handlePressStart = () => {
      setIsHolding(true);
      holdTimeoutRef.current = setTimeout(() => {
        setIsHolding(false);
      }, LONG_PRESS_DURATION);
    };

    const handlePressEnd = () => {
      setIsHolding(false);
      if (holdTimeoutRef.current) {
        clearTimeout(holdTimeoutRef.current);
        holdTimeoutRef.current = null;
      }
    };

    const handleRefreshClipboard = async () => {
      try {
        const text = await navigator.clipboard.readText();
        lastCheckedClipboard.current = '';
        handleClipboardData(text);
        chrome.runtime
          .sendMessage({
            clipboardData: text.trim(),
            type: 'CLIPBOARD_COPIED'
          })
          .catch(() => {});
      } catch (err) {
        onStatusUpdate?.(
          'Clipboard Error',
          'Could not read clipboard.',
          'danger',
          3000
        );
      }
    };

    async function detectAndSetObject(objectId) {
      console.log('[NavigateToCopiedObject] detectAndSetObject called with:', {
        instance: currentContext.instance,
        objectId,
        tabId: currentContext.tabId
      });

      const baseUrl = `https://${currentContext.instance}.domo.com`;

      // Get all object types that have API configurations and match the ID pattern
      const allTypesWithApi = getAllObjectTypesWithApiConfig();

      const typesToTry = allTypesWithApi
        .filter((type) => type.isValidObjectId(objectId))
        .sort((a, b) => {
          const priority = [
            'CARD',
            'DATA_SOURCE',
            'DATAFLOW_TYPE',
            'DATA_APP',
            'DATA_APP_VIEW',
            'PAGE',
            'USER',
            'GROUP',
            'ALERT',
            'BEAST_MODE_FORMULA',
            'WORKFLOW_MODEL'
          ];
          const aIndex = priority.indexOf(a.id);
          const bIndex = priority.indexOf(b.id);
          if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
          if (aIndex !== -1) return -1;
          if (bIndex !== -1) return 1;
          return 0;
        });

      if (typesToTry.length === 0) {
        setError(`No object types match ID pattern for: ${objectId}`);
        setObjectDetails(null);
        setIsLoading(false);
        return;
      }

      // Try each type until we find a match
      for (const typeConfig of typesToTry) {
        try {
          // Prepare parameters for page-safe function
          const params = {
            apiConfig: typeConfig.api,
            baseUrl,
            objectId,
            parentId: null,
            requiresParent: typeConfig.requiresParentForApi(),
            throwOnError: false,
            typeId: typeConfig.id
          };

          // If parent is required, try to get it via executeInPage
          if (typeConfig.requiresParentForApi()) {
            try {
              const domoObject = new DomoObject(
                typeConfig.id,
                objectId,
                baseUrl
              );
              const parentId = await domoObject.getParent(
                false,
                null,
                currentContext.tabId
              );
              params.parentId = parentId;
            } catch (parentError) {
              continue; // Skip this type
            }
          }

          // Try fetching with this type
          const metadata = await executeInPage(
            fetchObjectDetailsInPage,
            [params],
            currentContext.tabId
          );

          if (metadata && metadata.details) {
            // Check if this is a deleted dataflow - skip it if so
            if (
              typeConfig.id === 'DATAFLOW_TYPE' &&
              metadata.details.deleted === true
            ) {
              continue;
            }

            // Success! Create DomoObject and set details
            const domoObject = new DomoObject(
              typeConfig.id,
              objectId,
              baseUrl,
              {
                details: metadata.details,
                name: metadata.name
              }
            );

            setObjectDetails(domoObject);
            setError(null);
            setIsLoading(false);
            return;
          }
        } catch (error) {
          console.error(
            `[NavigateToCopiedObject] Error trying type ${typeConfig.id}:`,
            error.message
          );
          continue;
        }
      }

      // If all types failed
      setError(`Could not determine object type for ID: ${objectId}`);
      setObjectDetails(null);
      setIsLoading(false);
    }

    // Expose method to parent to trigger detection when Copy ID is clicked
    useImperativeHandle(ref, () => ({
      triggerDetection: (copiedId, domoObjectData = null) => {
        if (!copiedId || !currentContext?.instance) return;

        setCopiedObjectId(copiedId);
        setSelectedType(null);
        setError(null);
        lastCheckedClipboard.current = copiedId;

        // If we already have the object info, use it directly (no API calls needed)
        if (domoObjectData) {
          const domoObject =
            domoObjectData instanceof DomoObject
              ? domoObjectData
              : DomoObject.fromJSON(domoObjectData);
          setObjectDetails(domoObject);
          setIsLoading(false);
        } else {
          // Fall back to detection via API calls
          setObjectDetails(null);
          setIsLoading(true);
          detectAndSetObject(copiedId);
        }
      }
    }));

    useEffect(() => {
      const seen = new Set();
      const types = getAllNavigableObjectTypes()
        .filter((type) => (type.hasUrl() ? !type.requiresParentForUrl() : true))
        .sort((a, b) => a.name.localeCompare(b.name))
        .filter((type) => {
          const key = type.urlPath || type.api?.endpoint;
          if (!key || !seen.has(key)) {
            if (key) seen.add(key);
            return true;
          }
          return false;
        });
      setAllTypes(types);
    }, []);

    const filteredTypes = useMemo(
      () =>
        copiedObjectId
          ? allTypes.filter((type) => type.isValidObjectId(copiedObjectId))
          : allTypes,
      [allTypes, copiedObjectId]
    );

    // Load default Domo instance from settings
    useEffect(() => {
      chrome.storage.sync.get(['defaultDomoInstance'], (result) => {
        setDefaultDomoInstance(result.defaultDomoInstance || '');
      });

      // Listen for changes to default instance
      const handleStorageChange = (changes, areaName) => {
        if (areaName === 'sync' && changes.defaultDomoInstance) {
          setDefaultDomoInstance(changes.defaultDomoInstance.newValue || '');
        }
      };

      chrome.storage.onChanged.addListener(handleStorageChange);

      return () => {
        chrome.storage.onChanged.removeListener(handleStorageChange);
      };
    }, []);

    // Load cached clipboard value from session storage on mount
    useEffect(() => {
      if (!currentContext?.isDomoPage) {
        return;
      }

      // Get cached clipboard value and object from session storage
      chrome.storage.session
        .get(['lastClipboardValue', 'lastClipboardObject'])
        .then((result) => {
          if (result.lastClipboardValue) {
            handleClipboardData(
              result.lastClipboardValue,
              result.lastClipboardObject
            );
          }
        })
        .catch((err) => {
          console.error(
            '[NavigateToCopiedObject] Error loading cached clipboard:',
            err
          );
        });
    }, [currentContext?.isDomoPage]);

    // Handle clipboard data from service worker
    const handleClipboardData = useCallback(
      (text, domoObjectData = null) => {
        // Skip if clipboard hasn't changed AND we already have the object ID set
        if (text === lastCheckedClipboard.current && copiedObjectId) {
          // console.log('[NavigateToCopiedObject] Clipboard unchanged, skipping');
          return;
        }

        // console.log('[NavigateToCopiedObject] Processing clipboard:', text);
        lastCheckedClipboard.current = text;
        const trimmedText = text.trim();

        // Check if it looks like a Domo object ID (numeric including negative, or UUID)
        const isNumeric = /^-?\d+$/.test(trimmedText);
        const isUuid =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            trimmedText
          );

        if (isNumeric || isUuid) {
          setCopiedObjectId(trimmedText);
          setSelectedType(null);
          setError(null);

          // If we have object data, use it directly (no API calls needed)
          if (domoObjectData) {
            const domoObject =
              domoObjectData instanceof DomoObject
                ? domoObjectData
                : DomoObject.fromJSON(domoObjectData);
            setObjectDetails(domoObject);
            setIsLoading(false);
          } else if (currentContext?.instance) {
            // Fall back to detection via API calls
            setObjectDetails(null);
            setIsLoading(true);
            detectAndSetObject(trimmedText);
          }
        } else {
          // Clear if clipboard doesn't contain a valid ID
          setCopiedObjectId(null);
          setObjectDetails(null);
          setError(null);
        }
      },
      [currentContext?.instance, copiedObjectId]
    );

    // Listen for clipboard updates from service worker
    useEffect(() => {
      const handleMessage = (message, _sender, _sendResponse) => {
        if (
          message.type === 'CLIPBOARD_UPDATED' &&
          message.clipboardData !== undefined
        ) {
          console.log(
            '[NavigateToCopiedObject] CLIPBOARD_UPDATED received:',
            message.clipboardData
          );
          handleClipboardData(message.clipboardData, message.domoObject);
        }
      };

      chrome.runtime.onMessage.addListener(handleMessage);

      return () => {
        chrome.runtime.onMessage.removeListener(handleMessage);
      };
    }, [handleClipboardData]);

    const handleClick = (manuallySelectedType = null) => {
      // Use a local variable to track the ID throughout this function execution
      let objectIdToUse = copiedObjectId;

      // If not on a Domo page and no clipboard data yet, read clipboard now
      if (!currentContext?.isDomoPage && !objectIdToUse) {
        navigator.clipboard
          .readText()
          .then((text) => {
            const trimmedText = text.trim();

            // Check if it looks like a Domo object ID (numeric including negative, or UUID)
            const isNumeric = /^-?\d+$/.test(trimmedText);
            const isUuid =
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                trimmedText
              );

            if (!isNumeric && !isUuid) {
              onStatusUpdate?.(
                'Invalid Clipboard',
                'Clipboard does not contain a valid Domo object ID',
                'warning',
                3000
              );
              return;
            }

            objectIdToUse = trimmedText;
            setCopiedObjectId(trimmedText);
            lastCheckedClipboard.current = trimmedText;

            // Continue with navigation logic
            handleNavigate(objectIdToUse, manuallySelectedType);
          })
          .catch((err) => {
            console.error(
              '[NavigateToCopiedObject] Error reading clipboard:',
              err
            );
            onStatusUpdate?.(
              'Clipboard Error',
              'Could not read clipboard. Please copy an ID first.',
              'danger',
              3000
            );
          });
        return;
      }

      if (
        objectIdToUse &&
        !objectDetails &&
        !manuallySelectedType &&
        !selectedType
      ) {
        setIsDropdownOpen(true);
        return;
      }

      handleNavigate(objectIdToUse, manuallySelectedType);
    };

    const handleNavigate = async (objectIdToUse, manuallySelectedType) => {
      const typeToUse = manuallySelectedType || selectedType;

      if (!objectIdToUse) {
        return;
      }

      // Check if object is unknown or if manual type selection is needed
      if (!objectDetails && !typeToUse) {
        return;
      }

      try {
        let domoObject;

        if (objectDetails && !manuallySelectedType) {
          // Use the already detected DomoObject (auto-detected path)
          domoObject = objectDetails;
        } else if (typeToUse) {
          // User manually selected a type - create new DomoObject
          if (manuallySelectedType) {
            setSelectedType(manuallySelectedType);
          }
          let baseUrl;

          // Check if on a Domo page
          if (currentContext?.isDomoPage && currentContext?.instance) {
            baseUrl = `https://${currentContext?.instance}.domo.com`;
          } else {
            baseUrl = `https://${defaultDomoInstance}.domo.com`;
          }

          domoObject = new DomoObject(typeToUse, objectIdToUse, baseUrl);
        } else {
          // No object details and no type selected
          return;
        }

        // For types without a URL, open the sidepanel with object details
        if (!domoObject.hasUrl()) {
          await storeSidepanelData({
            message: 'Loading object details...',
            timestamp: Date.now(),
            type: 'loading'
          });
          if (!isSidepanel()) {
            openSidepanel();
          }
          await storeSidepanelData({
            currentContext,
            domoObject: domoObject.toJSON(),
            type: 'viewObjectDetails'
          });
          return;
        }

        domoObject.navigateTo(currentContext?.tabId).catch((err) => {
          console.error('Error navigating to object:', err);
          onStatusUpdate?.(
            'Navigation Failed',
            err.message || 'Error navigating to object',
            'danger',
            4000
          );
        });
      } catch (err) {
        console.error('Error:', err);
        onStatusUpdate?.(
          'Error',
          err.message || 'An error occurred',
          'danger',
          4000
        );
      }
    };

    // Disable dropdown when not on Domo page and no default instance configured
    const needsDefaultInstance =
      !currentContext?.isDomoPage && !defaultDomoInstance;

    const longPressDisabled =
      needsDefaultInstance || (!currentContext?.isDomoPage && !copiedObjectId);

    if (needsDefaultInstance) {
      return (
        <Tooltip className='h-fit' closeDelay={0} delay={200}>
          <Button
            fullWidth
            isIconOnly
            className='cursor-not-allowed opacity-50'
            variant='tertiary'
            onPress={() => {}}
          >
            <IconExternalLink stroke={1.5} />
          </Button>
          <Tooltip.Content placement='top'>
            Set a default Domo instance in settings
          </Tooltip.Content>
        </Tooltip>
      );
    }

    return (
      <Dropdown
        isDisabled={longPressDisabled}
        isOpen={isDropdownOpen}
        trigger={longPressDisabled ? 'click' : 'longPress'}
        onOpenChange={setIsDropdownOpen}
      >
        <Tooltip closeDelay={0} delay={400}>
          <Button
            fullWidth
            isIconOnly
            isDisabled={isLoading || !copiedObjectId}
            isPending={isLoading}
            variant='tertiary'
            onPress={() => handleClick()}
            onPressEnd={longPressDisabled ? undefined : handlePressEnd}
            onPressStart={longPressDisabled ? undefined : handlePressStart}
          >
            {({ isPending }) =>
              isPending ? (
                <Spinner color='currentColor' size='sm' />
              ) : (
                <>
                  {objectDetails && !objectDetails.hasUrl() ? (
                    <IconEye stroke={1.5} />
                  ) : (
                    <IconExternalLink stroke={1.5} />
                  )}
                  <AnimatePresence>
                    {isHolding && (
                      <motion.div
                        animate={{ opacity: 1 }}
                        className='pointer-events-none absolute inset-0 overflow-hidden rounded-md'
                        exit={{ opacity: 0, transition: { duration: 0.1 } }}
                        initial={{ opacity: 0 }}
                      >
                        <motion.div
                          animate={{ scale: 1 }}
                          className='absolute top-1/2 left-1/2 aspect-square w-[200%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-soft-hover'
                          initial={{ scale: 0 }}
                          transition={{
                            duration: LONG_PRESS_SECONDS,
                            ease: 'linear'
                          }}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )
            }
          </Button>
          <Tooltip.Content
            className='flex flex-col items-center'
            placement='top'
          >
            {error ? (
              `Error: ${error}`
            ) : currentContext?.isDomoPage ? (
              copiedObjectId ? (
                objectDetails ? (
                  <>
                    <span className='text-wrap'>
                      {objectDetails.hasUrl() ? (
                        <>
                          Navigate to
                          <span className='font-medium'>
                            {' '}
                            {objectDetails.metadata?.name || 'Unknown'}
                          </span>
                        </>
                      ) : (
                        `View details for ${objectDetails.metadata?.name || 'Unknown'}`
                      )}
                    </span>
                  </>
                ) : isLoading ? (
                  'Loading object details...'
                ) : (
                  'Click to choose object type'
                )
              ) : (
                'No valid Domo object ID in clipboard'
              )
            ) : (
              'Click to read clipboard and navigate to object'
            )}
            <div className='flex flex-row items-center justify-start gap-1'>
              {objectDetails && (
                <span className='capitalize'>
                  {objectDetails?.typeName?.toLowerCase()}
                </span>
              )}
              {!longPressDisabled &&
                (objectDetails || isLoading || !copiedObjectId) && (
                  <span className='italic'> - Hold for more options</span>
                )}
            </div>
          </Tooltip.Content>
        </Tooltip>
        <Dropdown.Popover className='min-w-60' placement='bottom'>
          <Dropdown.Menu
            onAction={(key) => {
              if (key === 'refresh-clipboard') {
                handleRefreshClipboard();
                return;
              }
              handleClick(key);
            }}
          >
            <Dropdown.Section>
              <Dropdown.Item
                id='refresh-clipboard'
                textValue='Refresh Clipboard'
              >
                <IconRefresh className='size-5 shrink-0' stroke={1.5} />
                <Label>Refresh Clipboard</Label>
              </Dropdown.Item>
            </Dropdown.Section>
            <Separator />

            <Dropdown.Section>
              {filteredTypes.map((type) => (
                <Dropdown.Item id={type.id} key={type.id} textValue={type.name}>
                  <Tooltip closeDelay={0} delay={400} key={type.id}>
                    <Tooltip.Trigger>
                      {type.hasUrl() ? (
                        <IconExternalLink
                          className='size-5 shrink-0'
                          stroke={1.5}
                        />
                      ) : (
                        <IconLayoutSidebarRightExpand
                          className='size-5 shrink-0'
                          stroke={1.5}
                        />
                      )}
                    </Tooltip.Trigger>
                    <Tooltip.Content>
                      {type.hasUrl()
                        ? 'Open in new tab'
                        : 'View details in side panel'}
                    </Tooltip.Content>
                  </Tooltip>
                  <Label>{type.name}</Label>
                </Dropdown.Item>
              ))}
            </Dropdown.Section>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    );
  }
);
