import { Button, Description, Modal, Tooltip } from '@heroui/react';
import { useMemo } from 'react';

import { DataList } from '@/components/views/DataList';
import { DataListItem } from '@/models/DataListItem';
import { DomoObject } from '@/models/DomoObject';
import IconInfoCircle from '@icons/info-circle.svg?react';
import IconX from '@icons/x.svg?react';

// Info-icon modal listing the cards that already reference a Beast Mode, as a
// read-only DataList of links (mirrors OwnerCardsModal). The info icon is the
// modal trigger (React Aria wires onPress through the Modal's DialogTrigger).
// `cards` are the { id, name, parentId, typeId } rows; `total` forms the
// "N of M selected cards" denominator.
//
// The DataList owns the single scroll viewport (`fillHeight`), bounded by a
// flex-column Modal.Body that does not scroll itself (`overflow-hidden`). Making
// Modal.Body scrollable too would nest two scrollers and leave the mouse wheel
// scrolling neither; see OwnerCardsModal for the longer version.
export function BeastModeCardsModal({ beastModeName, cards, origin, total }) {
  const items = useMemo(
    () =>
      [...cards]
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }))
        .map((card) =>
          DataListItem.fromDomoObject(
            new DomoObject(card.typeId || 'CARD', card.id, origin, { name: card.name }, null, card.parentId || null),
            { label: card.name }
          )
        ),
    [cards, origin]
  );
  return (
    <Modal>
      <Tooltip delay={300}>
        {/* Sized to match the Current Context footer's status icon (a 16px glyph
            in a 20px box) rather than the smaller triggers on the column and
            owner modals, which sit inline in dense list rows. */}
        <Button
          isIconOnly
          aria-label={`Show which cards already use ${beastModeName}`}
          className='ml-1 size-5 min-h-0 min-w-0 p-0'
          size='sm'
          variant='ghost'
        >
          <IconInfoCircle className='size-4' />
        </Button>
        <Tooltip.Content className='max-w-60'>Click to view which cards already use this Beast Mode</Tooltip.Content>
      </Tooltip>
      <Modal.Backdrop>
        <Modal.Container className='p-1' placement='center' scroll='outside'>
          <Modal.Dialog className='p-2 pt-3'>
            <Modal.CloseTrigger className='absolute top-2 right-2' variant='ghost'>
              <IconX />
            </Modal.CloseTrigger>
            <Modal.Header>
              <Modal.Heading className='flex flex-col gap-1 truncate pr-6'>
                <span className='truncate'>{beastModeName}</span>
                <Description>
                  Already used by {cards.length} of {total} selected card{total === 1 ? '' : 's'}.
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
