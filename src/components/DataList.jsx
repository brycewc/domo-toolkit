import { useState } from 'react';
import {
  Button,
  ButtonGroup,
  Card,
  Disclosure,
  DisclosureGroup,
  Link,
  Separator,
  Tooltip
} from '@heroui/react';
import { IconClipboard, IconFolders, IconUserPlus } from '@tabler/icons-react';

/**
 * DataList Component
 * A hierarchical list component for displaying nested data structures using HeroUI v3
 *
 * Features:
 * - Hierarchical/nested item display
 * - Expandable/collapsible sections with Disclosure
 * - Item counts and metadata
 * - Clickable links to navigate
 * - Action buttons for each item
 * - Responsive design with Tailwind CSS
 *
 * @param {Object} props
 * @param {Array} props.items - Array of list items with optional children
 * @param {React.ReactNode} props.header - Optional header component to display above the list
 * @param {Function} props.onItemClick - Callback when an item is clicked
 * @param {Function} props.onItemAction - Callback when an action button is clicked
 * @param {Boolean} props.showActions - Whether to show action buttons
 * @param {Boolean} props.showCounts - Whether to show item counts
 */
export function DataList({
  items = [],
  header,
  onItemAction,
  showActions = true,
  showCounts = true
}) {
  return (
    <Card className='w-full'>
      {header && (
        <>
          <Card.Header>{header}</Card.Header>
          <Separator className='h-1' />
        </>
      )}

      <Card.Content>
        <DisclosureGroup className='gap-2'>
          {items.map((item, index) => (
            <DataListItem
              key={item.id || index}
              item={item}
              index={index}
              onItemAction={onItemAction}
              showActions={showActions}
              showCounts={showCounts}
            />
          ))}
        </DisclosureGroup>
      </Card.Content>
    </Card>
  );
}

/**
 * DataListItem Component
 * Individual item in the DataList, supports nested children
 *
 * @param {Object} props
 * @param {Object} props.item - Item data object
 * @param {String} props.item.id - Unique identifier
 * @param {String} props.item.label - Display label
 * @param {String} props.item.url - Optional URL for link
 * @param {Number} props.item.count - Optional count to display
 * @param {Array} props.item.children - Optional nested children
 * @param {Object} props.item.metadata - Optional additional metadata
 * @param {Function} props.onItemClick - Callback when item is clicked
 * @param {Function} props.onItemAction - Callback when action is clicked
 * @param {Boolean} props.showActions - Whether to show action buttons
 * @param {Boolean} props.showCounts - Whether to show counts
 */
function DataListItem({
  item,
  onItemAction,
  showActions = true,
  showCounts = true,
  index,
  depth = 0
}) {
  const hasChildren = item.children && item.children.length > 0;
  const [isOpen, setIsOpen] = useState(false);

  const handleAction = (actionType) => {
    if (onItemAction) {
      onItemAction(actionType, item);
    }
  };

  return (
    <>
      {index !== 0 && <Separator />}
      <Disclosure isOpen={isOpen} onOpenChange={setIsOpen} className='py-[5px]'>
        <Disclosure.Heading className='flex flex-row justify-between'>
          <div className='flex min-w-0 flex-1 items-center'>
            <Tooltip delay={100} closeDelay={0} className='flex-1'>
              {item.url ? (
                <Link
                  href={item.url}
                  target='_blank'
                  className='truncate text-sm font-medium no-underline decoration-accent/80 hover:text-accent/80 hover:underline'
                >
                  {item.label}
                </Link>
              ) : (
                <span className='truncate text-sm font-medium'>
                  {item.label}
                </span>
              )}
              <Tooltip.Content placement='right' offset={8}>
                ID: {item.id}
              </Tooltip.Content>
            </Tooltip>
            {hasChildren && (
              <Disclosure.Trigger
                variant='tertiary'
                aria-label='Toggle'
                className='button--sm flex flex-shrink-0 flex-row items-center gap-1'
              >
                {showCounts && item.count !== undefined && (
                  <span className='text-sm text-muted'>({item.count})</span>
                )}
                <Disclosure.Indicator />
              </Disclosure.Trigger>
            )}
          </div>
          {showActions && (
            <ButtonGroup variant='ghost' size='sm' className='flex-shrink-0'>
              {hasChildren && (
                <Tooltip delay={500} closeDelay={0}>
                  <Button
                    isIconOnly
                    onPress={() => handleAction('openAll')}
                    aria-label='Open All'
                  >
                    <IconFolders className='size-4' />
                  </Button>
                  <Tooltip.Content className='text-xs'>
                    Open all
                  </Tooltip.Content>
                </Tooltip>
              )}
              <Tooltip delay={500} closeDelay={0}>
                <Button
                  isIconOnly
                  onPress={() => handleAction('copy')}
                  aria-label='Copy'
                >
                  <IconClipboard className='size-4' />
                </Button>
                <Tooltip.Content className='text-xs'>Copy ID</Tooltip.Content>
              </Tooltip>
              <Tooltip delay={500} closeDelay={0}>
                <Button
                  isIconOnly
                  onPress={() => handleAction('share')}
                  aria-label='Share'
                >
                  <IconUserPlus className='size-4' />
                </Button>
                <Tooltip.Content className='text-xs'>
                  Share with yourself
                </Tooltip.Content>
              </Tooltip>
            </ButtonGroup>
          )}
        </Disclosure.Heading>
        {hasChildren && (
          <Disclosure.Content>
            <Disclosure.Body className='pl-[5px]'>
              <DisclosureGroup>
                {item.children.map((child, index) => (
                  <DataListItem
                    key={child.id || index}
                    item={child}
                    index={index}
                    onItemClick={onItemClick}
                    onItemAction={onItemAction}
                    showActions={showActions}
                    showCounts={showCounts}
                    depth={depth + 1}
                  />
                ))}
              </DisclosureGroup>
            </Disclosure.Body>
          </Disclosure.Content>
        )}
      </Disclosure>
    </>
  );
}
