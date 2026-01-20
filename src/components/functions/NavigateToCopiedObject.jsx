import {
  useState,
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  useCallback
} from 'react';
import {
  Button,
  Dropdown,
  Label,
  Tooltip,
  Chip,
  IconChevronDown,
  Spinner
} from '@heroui/react';
import { DomoObject, getAllObjectTypes } from '@/models';
import { detectAndFetchObject } from '@/services';
import { IconExternalLink } from '@tabler/icons-react';

export const NavigateToCopiedObject = forwardRef(
  function NavigateToCopiedObject({ isDomoPage, currentContext }, ref) {
    const [copiedObjectId, setCopiedObjectId] = useState(null);
    const [objectDetails, setObjectDetails] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [selectedType, setSelectedType] = useState(null);
    const [defaultDomoInstance, setDefaultDomoInstance] = useState('');
    const lastCheckedClipboard = useRef('');
    const [allTypes, setAllTypes] = useState([]);

    // Expose method to parent to trigger detection when Copy ID is clicked
    useImperativeHandle(ref, () => ({
      triggerDetection: (copiedId) => {
        if (!copiedId || !currentContext?.instance) return;

        setIsLoading(true);
        setCopiedObjectId(copiedId);
        setSelectedType(null);
        setObjectDetails(null);
        setError(null);
        lastCheckedClipboard.current = copiedId;

        detectAndFetchObject(copiedId)
          .then((details) => {
            console.log('Fetched object details:', details);
            setObjectDetails(details);
            setError(null);
          })
          .catch((err) => {
            console.error('Error fetching object details:', err);
            setError(err.message);
            setObjectDetails(null);
          })
          .finally(() => {
            setIsLoading(false);
          });
      }
    }));

    useEffect(() => {
      // Load all object types for dropdown
      const types = getAllObjectTypes()
        .filter((type) => !type.requiresParentForUrl() && type.hasUrl())
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
      if (!isDomoPage || !currentContext?.instance) {
        return;
      }

      // Get cached clipboard value from session storage
      chrome.storage.session
        .get(['lastClipboardValue'])
        .then((result) => {
          if (result.lastClipboardValue) {
            console.log(
              '[NavigateToCopiedObject] Loaded cached clipboard:',
              result.lastClipboardValue
            );
            handleClipboardData(result.lastClipboardValue);
          }
        })
        .catch((err) => {
          console.error(
            '[NavigateToCopiedObject] Error loading cached clipboard:',
            err
          );
        });
    }, [isDomoPage, currentContext?.instance]);

    // Handle clipboard data from service worker
    const handleClipboardData = useCallback(
      (text) => {
        // Skip if clipboard hasn't changed AND we already have the object ID set
        if (text === lastCheckedClipboard.current && copiedObjectId) {
          console.log('[NavigateToCopiedObject] Clipboard unchanged, skipping');
          return;
        }

        console.log('[NavigateToCopiedObject] Processing clipboard:', text);
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
          setObjectDetails(null);
          setError(null);
          if (currentContext?.instance) {
            setIsLoading(true);
            // Fetch object details
            detectAndFetchObject(trimmedText)
              .then((details) => {
                console.log('Fetched object details:', details);
                setObjectDetails(details);
                setError(null);
              })
              .catch((err) => {
                console.error('Error fetching object details:', err);
                setError(err.message);
                setObjectDetails(null);
              })
              .finally(() => {
                setIsLoading(false);
              });
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
          handleClipboardData(message.clipboardData);
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
      if (!isDomoPage && !objectIdToUse) {
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
              alert('Clipboard does not contain a valid Domo object ID');
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
            alert('Could not read clipboard. Please copy an ID first.');
          });
        return;
      }

      handleNavigate(objectIdToUse, manuallySelectedType);
    };

    const handleNavigate = (objectIdToUse, manuallySelectedType) => {
      const typeToUse = manuallySelectedType || selectedType;

      console.log('[handleNavigate] objectIdToUse:', objectIdToUse);
      console.log(
        '[handleNavigate] manuallySelectedType:',
        manuallySelectedType
      );
      console.log('[handleNavigate] selectedType:', selectedType);
      console.log('[handleNavigate] typeToUse:', typeToUse);
      console.log('[handleNavigate] objectDetails:', objectDetails);

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
          console.log('[handleNavigate] Using auto-detected objectDetails');
          domoObject = objectDetails;
        } else if (typeToUse) {
          // User manually selected a type - create new DomoObject
          console.log(
            '[handleNavigate] Creating new DomoObject with typeToUse:',
            typeToUse,
            typeof typeToUse
          );
          // Also update state for UI consistency
          if (manuallySelectedType) {
            setSelectedType(manuallySelectedType);
          }
          let baseUrl;

          // Check if on a Domo page
          if (isDomoPage && currentContext?.instance) {
            // Use current Domo instance
            baseUrl = `https://${currentContext?.instance}.domo.com`;
          } else {
            // Use default Domo instance from settings
            if (!defaultDomoInstance) {
              alert(
                'Please set a default Domo instance in Settings or open a Domo page first'
              );
              return;
            }
            // Build the base URL from the instance name
            baseUrl = `https://${defaultDomoInstance}.domo.com`;
          }

          domoObject = new DomoObject(typeToUse, objectIdToUse, baseUrl);
        } else {
          // No object details and no type selected
          return;
        }
        console.log(domoObject);
        // If we're on a Domo page, navigate in the current tab
        // Otherwise, create a new tab or update the current one
        domoObject.navigateTo().catch((err) => {
          console.error('Error navigating to object:', err);
          alert(`Error navigating to object: ${err.message}`);
        });
      } catch (err) {
        console.error('Error:', err);
        alert('Error: ' + err.message);
      }
    };

    // If object type is unknown, show dropdown for manual selection
    // Show dropdown when: not on Domo page with copied ID but no objectDetails, or no ID at all
    const showDropdown = !isDomoPage || (!objectDetails && copiedObjectId);

    return showDropdown ? (
      <Dropdown>
        <Button className='w-full'>
          Navigate from Clipboard
          <IconChevronDown className='size-4' />
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
    ) : (
      <Tooltip delay={200}>
        <Button
          onPress={() => handleClick()}
          isDisabled={!copiedObjectId || isLoading || !!error}
          className='w-full'
          isPending={isLoading}
        >
          {isLoading ? (
            <Spinner className='size-4' color='current' />
          ) : (
            <>
              <span>Navigate from Clipboard</span>
              <IconExternalLink />
            </>
          )}
        </Button>
        <Tooltip.Content placement='top'>
          {error ? (
            `Error: ${error}`
          ) : isDomoPage ? (
            copiedObjectId ? (
              objectDetails ? (
                <div className='flex items-center gap-2'>
                  <span>
                    Navigate to {objectDetails.metadata?.name || 'Unknown'}
                  </span>
                  <Chip size='sm' variant='soft' color='accent'>
                    {objectDetails.metadata?.parent
                      ? `${objectDetails.metadata.parent.objectType.name} > ${objectDetails.typeName}`
                      : `${objectDetails.typeName} (${objectDetails.typeId})`}
                  </Chip>
                </div>
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
