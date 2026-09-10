import { Chip, Description, Disclosure } from '@heroui/react';

import IconChevronDown from '@icons/chevron-down.svg?react';

export function DecisionSection({ children, description, id, status, title, toolbar }) {
  return (
    <Disclosure className='space-0 w-full' id={id}>
      <Disclosure.Heading className='my-1 flex min-h-9 w-full flex-row items-center justify-between gap-2'>
        <Disclosure.Trigger
          aria-label='Toggle'
          className='flex w-full min-w-0 flex-1 basis-4/5 flex-row items-center gap-2 self-stretch'
          variant='tertiary'
        >
          <p className='min-w-0 truncate text-sm font-medium' title={title}>
            {title}
          </p>
          <span aria-hidden='true' className='flex-1' />
          <div className='flex shrink-0 flex-row items-center gap-1'>
            <Chip color={status.color} size='sm' variant='soft'>
              <Chip.Label>{status.label}</Chip.Label>
            </Chip>
          </div>
          <Disclosure.Indicator>
            <IconChevronDown />
          </Disclosure.Indicator>
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body>
          <div className='flex flex-col gap-1'>
            {toolbar && <div className='flex items-center justify-end gap-2'>{toolbar}</div>}
            {description && <Description className='text-xs'>{description}</Description>}
            {children}
          </div>
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
}
