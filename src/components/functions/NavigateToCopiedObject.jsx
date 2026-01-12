import { useState, useEffect, useRef } from 'react';
import {
  Button,
  Dropdown,
  Label,
  Tooltip,
  Chip,
  IconChevronDown
} from '@heroui/react';
import { DomoObject, getAllObjectTypes } from '@/models';
import { detectAndFetchObject } from '@/services';

export function NavigateToCopiedObject({ isDomoPage, currentInstance }) {
  const [copiedObjectId, setCopiedObjectId] = useState(null);
  const [objectDetails, setObjectDetails] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedType, setSelectedType] = useState(null);
  const [defaultDomoInstance, setDefaultDomoInstance] = useState('');
  const lastCheckedClipboard = useRef('');
  const [allTypes, setAllTypes] = useState([]);

  useEffect(() => {
    // Load all object types for dropdown
    const types = getAllObjectTypes()
      .filter((type) => !type.requiresParent() && type.hasUrl())
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

  // Check clipboard periodically only if on a Domo page
  useEffect(() => {
    // Only set up clipboard checking if on a Domo page
    if (!isDomoPage) {
      return;
    }

    const checkClipboard = async () => {
      try {
        // Read clipboard
        await navigator.clipboard.readText().then(async (text) => {
          // Skip if clipboard hasn't changed
          if (text === lastCheckedClipboard.current) {
            return;
          }

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
            if (currentInstance) {
              setIsLoading(true);
              // Fetch object details
              try {
                const details = await detectAndFetchObject(trimmedText);
                setObjectDetails(details);
                setError(null);
              } catch (err) {
                console.error('Error fetching object details:', err);
                setError(err.message);
                setObjectDetails(null);
              } finally {
                setIsLoading(false);
              }
            }
          } else {
            // Clear if clipboard doesn't contain a valid ID
            setCopiedObjectId(null);
            setObjectDetails(null);
            setError(null);
          }
        });
      } catch (err) {
        // Clipboard access might be denied or fail
        console.error('Error reading clipboard:', err);
      }
    };

    // Check immediately
    checkClipboard();

    // Check every 2 seconds
    const interval = setInterval(checkClipboard, 2000);

    return () => clearInterval(interval);
  }, [isDomoPage, currentInstance]);

  const handleClick = async (manuallySelectedType = null) => {
    // Use a local variable to track the ID throughout this function execution
    let objectIdToUse = copiedObjectId;
    // Use parameter if provided, otherwise fall back to state
    const typeToUse = manuallySelectedType || selectedType;

    // If not on a Domo page and no clipboard data yet, read clipboard now
    if (!isDomoPage && !objectIdToUse) {
      try {
        const text = await navigator.clipboard.readText();
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
        // Continue processing below
      } catch (err) {
        console.error('[NavigateToCopiedObject] Error reading clipboard:', err);
        alert('Could not read clipboard. Please copy an ID first.');
        return;
      }
    }

    if (!objectIdToUse) {
      return;
    }

    // Check if object is unknown or if manual type selection is needed
    if (!objectDetails && !typeToUse) {
      return;
    }

    try {
      let domoObject;

      if (typeToUse) {
        // Also update state for UI consistency
        if (manuallySelectedType) {
          setSelectedType(manuallySelectedType);
        }
        // User manually selected a type - create new DomoObject
        let baseUrl;

        // Check if on a Domo page
        if (isDomoPage && currentInstance) {
          // Use current Domo instance
          baseUrl = `https://${currentInstance}.domo.com`;
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
        // Use the already detected DomoObject
        domoObject = objectDetails;
      }

      try {
        // If we're on a Domo page, navigate in the current tab
        // Otherwise, create a new tab or update the current one
        await domoObject.navigateTo();
      } catch (err) {
        console.error('Error navigating to object:', err);
        alert(`Error navigating to object: ${err.message}`);
      }
    } catch (err) {
      console.error('Error:', err);
      alert('Error: ' + err.message);
    }
  };

  // If object type is unknown, show dropdown for manual selection
  return !objectDetails && !copiedObjectId ? (
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
            <Dropdown.Item id={type.id} textValue={type.name}>
              <Label>{type.name}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  ) : (
    <Tooltip delay={200}>
      <Button
        onPress={handleClick}
        isDisabled={
          isDomoPage
            ? !copiedObjectId || isLoading || !!error
            : isLoading || !!error
        }
        className='w-full'
        isPending={isLoading}
      >
        Navigate from Clipboard
      </Button>
      <Tooltip.Content showArrow placement='top'>
        <Tooltip.Arrow />
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
                    ? `${objectDetails.metadata.parent.type} > ${objectDetails.typeId}`
                    : objectDetails.typeId}
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
