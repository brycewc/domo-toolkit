import {
  useState,
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  useCallback
} from 'react';
import { Button, Dropdown, Label, Tooltip, Chip, Spinner } from '@heroui/react';
import {
  DomoObject,
  getAllObjectTypesWithApiConfig,
  getAllObjectTypesWithUrl
} from '@/models';
import { fetchObjectDetailsInPage } from '@/services';
import { executeInPage } from '@/utils';
import { IconExternalLink } from '@tabler/icons-react';

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

    async function detectAndSetObject(objectId) {
      // console.log('[NavigateToCopiedObject] detectAndSetObject called with:', {
      //   objectId,
      //   instance: currentContext.instance,
      //   tabId: currentContext.tabId
      // });

      const baseUrl = `https://${currentContext.instance}.domo.com`;

      // Get all object types that have API configurations and match the ID pattern
      const allTypesWithApi = getAllObjectTypesWithApiConfig();
      // console.log(
      //   `[NavigateToCopiedObject] Total object types with API: ${allTypesWithApi.length}`
      // );

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

      // console.log(
      //   `[NavigateToCopiedObject] Found ${typesToTry.length} types to try for ID ${objectId}:`,
      //   typesToTry.map((t) => t.id)
      // );

      if (typesToTry.length === 0) {
        setError(`No object types match ID pattern for: ${objectId}`);
        setObjectDetails(null);
        setIsLoading(false);
        return;
      }

      // Try each type until we find a match
      for (const typeConfig of typesToTry) {
        // console.log(`[NavigateToCopiedObject] Trying type: ${typeConfig.id}`);

        try {
          // Prepare parameters for page-safe function
          const params = {
            typeId: typeConfig.id,
            objectId,
            baseUrl,
            apiConfig: typeConfig.api,
            requiresParent: typeConfig.requiresParentForApi(),
            parentId: null,
            throwOnError: false
          };

          // If parent is required, try to get it via executeInPage
          if (typeConfig.requiresParentForApi()) {
            try {
              const domoObject = new DomoObject(
                typeConfig.id,
                objectId,
                baseUrl
              );
              const parentId = await domoObject.getParentWithTabId(
                currentContext.tabId
              );
              params.parentId = parentId;
              // console.log(
              //   `[NavigateToCopiedObject] Got parent ${parentId} for ${typeConfig.id}`
              // );
            } catch (parentError) {
              // console.log(
              //   `[NavigateToCopiedObject] Could not get parent for ${typeConfig.id}:`,
              //   parentError.message
              // );
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
              // console.log(
              //   `[NavigateToCopiedObject] Skipping deleted dataflow ${objectId}`
              // );
              continue;
            }

            // Success! Create DomoObject and set details
            // console.log(
            //   `[NavigateToCopiedObject] ✓ Successfully detected type ${typeConfig.id}`
            // );
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
          console.log(
            `[NavigateToCopiedObject] Error trying type ${typeConfig.id}:`,
            error.message
          );
          continue;
        }
      }

      // If all types failed
      // console.warn(
      //   `[NavigateToCopiedObject] ⚠ All ${typesToTry.length} type(s) failed for ID ${objectId}`
      // );
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
      // Load all object types for dropdown
      const types = getAllObjectTypesWithUrl()
        .filter((type) => !type.requiresParentForUrl())
        .sort((a, b) => a.name.localeCompare(b.name));
      setAllTypes(types);
    }, []);

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
            // console.log(
            //   '[NavigateToCopiedObject] Loaded cached clipboard:',
            //   result.lastClipboardValue
            // );
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
      const handleMessage = (message, sender, sendResponse) => {
        if (message.type === 'CLIPBOARD_UPDATED' && message.clipboardData) {
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

      handleNavigate(objectIdToUse, manuallySelectedType);
    };

    const handleNavigate = (objectIdToUse, manuallySelectedType) => {
      const typeToUse = manuallySelectedType || selectedType;

      // console.log('[handleNavigate] objectIdToUse:', objectIdToUse);
      // console.log(
      //   '[handleNavigate] manuallySelectedType:',
      //   manuallySelectedType
      // );
      // console.log('[handleNavigate] selectedType:', selectedType);
      // console.log('[handleNavigate] typeToUse:', typeToUse);
      // console.log('[handleNavigate] objectDetails:', objectDetails);

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
          // console.log('[handleNavigate] Using auto-detected objectDetails');
          domoObject = objectDetails;
        } else if (typeToUse) {
          // User manually selected a type - create new DomoObject
          // console.log(
          //   '[handleNavigate] Creating new DomoObject with typeToUse:',
          //   typeToUse,
          //   typeof typeToUse
          // );
          // Also update state for UI consistency
          if (manuallySelectedType) {
            setSelectedType(manuallySelectedType);
          }
          let baseUrl;

          // Check if on a Domo page
          if (currentContext?.isDomoPage && currentContext?.instance) {
            // Use current Domo instance
            baseUrl = `https://${currentContext?.instance}.domo.com`;
          } else {
            // Use default Domo instance from settings (button should be disabled if not set)
            baseUrl = `https://${defaultDomoInstance}.domo.com`;
          }

          domoObject = new DomoObject(typeToUse, objectIdToUse, baseUrl);
        } else {
          // No object details and no type selected
          return;
        }
        // console.log(domoObject);
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

    // If object type is unknown, show dropdown for manual selection
    // Show dropdown when: not on Domo page with copied ID but no objectDetails, or no ID at all
    const showDropdown =
      !currentContext?.isDomoPage || (!objectDetails && copiedObjectId);

    // Disable dropdown when not on Domo page and no default instance configured
    const needsDefaultInstance =
      !currentContext?.isDomoPage && !defaultDomoInstance;

    return showDropdown ? (
      needsDefaultInstance ? (
        <Tooltip delay={200} closeDelay={0} className='h-fit'>
          <Button
            variant='tertiary'
            className='min-w-fit flex-1 basis-[48%] cursor-not-allowed opacity-50'
            onPress={() => {}}
          >
            <IconExternalLink stroke={1.5} />
            From Clipboard
          </Button>
          <Tooltip.Content placement='top'>
            Set a default Domo instance in settings
          </Tooltip.Content>
        </Tooltip>
      ) : (
        <Dropdown>
          <Button variant='tertiary' className='min-w-fit flex-1 basis-[48%]'>
            <IconExternalLink stroke={1.5} />
            From Clipboard
          </Button>
          <Dropdown.Popover className='min-w-[18rem]' placement='bottom end'>
            <Dropdown.Menu
              onAction={(key) => {
                handleClick(key);
              }}
            >
              {allTypes.map((type) => (
                <Dropdown.Item id={type.id} textValue={type.name} key={type.id}>
                  <Label>{type.name}</Label>
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      )
    ) : (
      <Tooltip delay={400} closeDelay={0}>
        <Button
          className='min-w-fit flex-1 basis-[48%]'
          variant='tertiary'
          onPress={() => handleClick()}
          isDisabled={!copiedObjectId || isLoading || !!error}
          isPending={isLoading}
          isIconOnly={isLoading}
        >
          <IconExternalLink stroke={1.5} />
          From Clipboard
        </Button>
        <Tooltip.Content
          placement='top'
          className='flex flex-row flex-wrap items-center gap-1'
        >
          {error ? (
            `Error: ${error}`
          ) : currentContext?.isDomoPage ? (
            copiedObjectId ? (
              objectDetails ? (
                <>
                  <span>
                    Navigate to {objectDetails.metadata?.name || 'Unknown'}
                  </span>
                  <Chip
                    size='sm'
                    variant='soft'
                    color='accent'
                    className='w-fit'
                  >
                    {objectDetails.metadata?.parent
                      ? `${objectDetails.metadata?.parent?.objectType?.name} > ${objectDetails?.typeName}`
                      : `${objectDetails?.typeName}`}
                  </Chip>
                </>
              ) : (
                'Loading object details...'
              )
            ) : (
              'No valid Domo object ID in clipboard'
            )
          ) : (
            'Click to read clipboard and navigate to object'
          )}
        </Tooltip.Content>
      </Tooltip>
    );
  }
);
