import { Button, Description, Modal, Tooltip } from '@heroui/react';
import { useMemo } from 'react';

import { DataList } from '@/components/views/DataList';
import { DataListItem } from '@/models/DataListItem';
import { DomoObject } from '@/models/DomoObject';
import IconInfoCircle from '@icons/info-circle.svg?react';
import IconX from '@icons/x.svg?react';

// Info-icon modal listing the selected cards a partial owner is on, via a
// read-only DataList of links. Shown on owner chips that aren't on every
// selected card (mirrors ColumnUsagesModal). The info icon is the modal trigger
// (React Aria wires onPress through the Modal's DialogTrigger). `cards` are the
// { id, name } cards this owner is on; `presentCount`/`total` form the "on N of
// M selected cards" denominator.
//
// The DataList owns the single scroll viewport (`fillHeight`), bounded by a
// flex-column Modal.Body that does not scroll itself (`overflow-hidden`). A
// scrollable Modal.Body plus the DataList's own scroll container would nest two
// scrollers and leave the mouse wheel scrolling neither (only the scrollbar
// drag worked), and the virtualized path never got a bounded height.
export function OwnerCardsModal({ cards, origin, ownerName, presentCount, total }) {
  const items = useMemo(
    () =>
      [...cards]
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }))
        .map((card) =>
          DataListItem.fromDomoObject(new DomoObject('CARD', card.id, origin, { name: card.name }), { label: card.name })
        ),
    [cards, origin]
  );
  return (
    <Modal>
      <Tooltip delay={300}>
        <Button
          isIconOnly
          aria-label={`Show which cards ${ownerName} is on`}
          className='ml-1 size-4 min-h-0 min-w-0 p-0'
          size='sm'
          variant='ghost'
        >
          <IconInfoCircle className='size-3' />
        </Button>
        <Tooltip.Content className='max-w-60'>Click to view which cards this owner is on</Tooltip.Content>
      </Tooltip>
      <Modal.Backdrop>
        <Modal.Container className='p-1' placement='center' scroll='outside'>
          <Modal.Dialog className='p-2 pt-3'>
            <Modal.CloseTrigger className='absolute top-2 right-2' variant='ghost'>
              <IconX />
            </Modal.CloseTrigger>
            <Modal.Header>
              <Modal.Heading className='flex flex-col gap-1 truncate pr-6'>
                <span className='truncate'>{ownerName}</span>
                <Description>
                  Owner on {presentCount} of {total} selected card{total === 1 ? '' : 's'}.
                </Description>
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className='flex max-h-[60vh] min-h-0 flex-col overflow-hidden text-foreground'>
              <DataList allowsMultipleExpanded fillHeight items={items} showActions={false} variant='transparent' />
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
