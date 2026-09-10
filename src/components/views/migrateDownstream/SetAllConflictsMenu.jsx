import { Button, Dropdown, Label, Tooltip } from '@heroui/react';

import IconChevronDown from '@icons/chevron-down.svg?react';

export function SetAllConflictsMenu({ items, onApply, tooltip }) {
  return (
    <Dropdown>
      <Tooltip>
        <Button size='sm' variant='secondary'>
          Set All
          <IconChevronDown />
        </Button>
        <Tooltip.Content className='max-w-80 text-wrap'>{tooltip}</Tooltip.Content>
      </Tooltip>
      <Dropdown.Popover className='w-fit min-w-40' placement='bottom right'>
        <Dropdown.Menu onAction={(key) => onApply(String(key))}>
          {items.map((item) => (
            <Dropdown.Item id={item.id} key={item.id} textValue={item.label}>
              <Label>{item.label}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
