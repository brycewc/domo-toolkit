import { useEffect, useState } from 'react';
import { Button, Dropdown, Label, Spinner, Tooltip } from '@heroui/react';
import { IconCookieOff } from '@tabler/icons-react';
import { clearCookies } from '@/utils';

export function ClearCookies({ currentContext, onStatusUpdate, isDisabled }) {
  const [isClearingCookies, setIsClearingCookies] = useState(false);
  const [currentDomain, setCurrentDomain] = useState(null);

  useEffect(() => {
    if (currentContext?.url) {
      const domain = new URL(currentContext.url).hostname;
      setCurrentDomain(domain);
    }
  }, [currentContext]);

  const handleAction = async (key) => {
    setIsClearingCookies(true);
    const result = await clearCookies({
      domains: key === 'clear-all' ? null : [currentDomain],
      excludeDomains: key === 'clear-others',
      tabId: currentContext?.tabId
    });
    onStatusUpdate(
      result.title,
      result.description,
      result.status,
      result.timeout
    );
    setIsClearingCookies(false);
  };

  return (
    <Tooltip delay={400} closeDelay={0}>
      <Dropdown trigger='longPress' isDisabled={isDisabled}>
        <Button
          variant='tertiary'
          fullWidth
          isIconOnly
          onPress={handleAction}
          isPending={isClearingCookies}
          isDisabled={isDisabled}
        >
          {({ isPending }) => (
            <>
              {isPending ? (
                <Spinner color='currentColor' size='sm' />
              ) : (
                <IconCookieOff size={4} className='text-danger' />
              )}
            </>
          )}
        </Button>
        <Dropdown.Popover
          className='w-full min-w-[12rem]'
          placement='bottom left'
        >
          <Dropdown.Menu onAction={handleAction}>
            <Dropdown.Item id='clear-others' textValue='Clear Other Instances'>
              <IconCookieOff size={4} className='size-4 shrink-0 text-warning' />
              <Label>Clear Other Instances</Label>
            </Dropdown.Item>
            <Dropdown.Item id='clear-all' textValue='Clear All Domo Cookies'>
              <IconCookieOff size={4} className='size-4 shrink-0 text-danger' />
              <Label>Clear All Domo Cookies</Label>
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
      <Tooltip.Content>
        Clear cookies for{' '}
        <span className='font-semibold lowercase'>{currentDomain}</span>
      </Tooltip.Content>
    </Tooltip>
  );
}
