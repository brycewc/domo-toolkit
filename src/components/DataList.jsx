import { useState } from 'react';
import { Accordion, Button, Card, Link } from '@heroui/react';
import { IconExternalLink, IconCopy, IconShare } from '@tabler/icons-react';

/**
 * DataList Component
 * A hierarchical list component for displaying nested data structures using HeroUI v3
 *
 * Features:
 * - Hierarchical/nested item display
 * - Expandable/collapsible sections with Accordion
 * - Item counts and metadata
 * - Clickable links to navigate
 * - Action buttons for each item
 * - Responsive design with Tailwind CSS
 *
 * @param {Object} props
 * @param {Array} props.items - Array of list items with optional children
 * @param {String} props.title - Title for the list
 * @param {String} props.subtitle - Subtitle/description for the list
 * @param {Function} props.onItemClick - Callback when an item is clicked
 * @param {Function} props.onItemAction - Callback when an action button is clicked
 * @param {Boolean} props.showActions - Whether to show action buttons
 * @param {Boolean} props.showCounts - Whether to show item counts
 */
export function DataList({
  items = [],
  title,
  subtitle,
  onItemClick,
  onItemAction,
  showActions = true,
  showCounts = true
}) {
  return (
    <Card className='w-full'>
      {(title || subtitle) && (
        <Card.Header>
          {title && <h2 className='text-xl font-semibold'>{title}</h2>}
          {subtitle && <p className='text-sm text-muted'>{subtitle}</p>}
        </Card.Header>
      )}
      <Card.Content className='space-y-2'>
        {items.map((item, index) => (
          <DataListItem
            key={item.id || index}
            item={item}
            onItemClick={onItemClick}
            onItemAction={onItemAction}
            showActions={showActions}
            showCounts={showCounts}
          />
        ))}
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
  onItemClick,
  onItemAction,
  showActions = true,
  showCounts = true,
  depth = 0
}) {
  const hasChildren = item.children && item.children.length > 0;
  const [isExpanded, setIsExpanded] = useState(false);

  const handleClick = (e) => {
    if (onItemClick) {
      e.preventDefault();
      onItemClick(item);
    }
  };

  const handleAction = (actionType, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onItemAction) {
      onItemAction(actionType, item);
    }
  };

  // If item has children, use Accordion
  if (hasChildren) {
    return (
      <Accordion className='rounded-lg border border-default'>
        <Accordion.Item>
          <Accordion.Heading>
            <Accordion.Trigger>
              <div className='flex flex-1 items-center gap-3'>
                <span className='font-medium'>{item.label}</span>
                {showCounts && item.count !== undefined && (
                  <span className='text-sm text-muted'>({item.count})</span>
                )}
                {item.metadata && (
                  <span className='text-xs text-muted'>{item.metadata}</span>
                )}
              </div>
              {showActions && (
                <div
                  className='flex items-center gap-1'
                  onClick={(e) => e.stopPropagation()}
                >
                  {item.url && (
                    <Button
                      variant='ghost'
                      size='sm'
                      isIconOnly
                      onPress={(e) => handleAction('open', e)}
                      aria-label='Open'
                    >
                      <IconExternalLink className='size-4' />
                    </Button>
                  )}
                  <Button
                    variant='ghost'
                    size='sm'
                    isIconOnly
                    onPress={(e) => handleAction('share', e)}
                    aria-label='Share'
                  >
                    <IconShare className='size-4' />
                  </Button>
                </div>
              )}
              <Accordion.Indicator />
            </Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <Accordion.Body>
              <div className='space-y-2 pl-4'>
                {item.children.map((child, index) => (
                  <DataListItem
                    key={child.id || index}
                    item={child}
                    onItemClick={onItemClick}
                    onItemAction={onItemAction}
                    showActions={showActions}
                    showCounts={showCounts}
                    depth={depth + 1}
                  />
                ))}
              </div>
            </Accordion.Body>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    );
  }

  // Simple item without children
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg px-4 py-2 transition-colors hover:bg-surface/50 ${
        depth > 0 ? 'ml-4' : ''
      }`}
    >
      <div className='flex min-w-0 flex-1 items-center gap-3'>
        {item.url ? (
          <Link
            href={item.url}
            onPress={handleClick}
            className='truncate font-medium'
          >
            {item.label}
          </Link>
        ) : (
          <span className='truncate font-medium'>{item.label}</span>
        )}
        {showCounts && item.count !== undefined && (
          <span className='text-sm whitespace-nowrap text-muted'>
            ({item.count})
          </span>
        )}
        {item.metadata && (
          <span className='truncate text-xs text-muted'>{item.metadata}</span>
        )}
      </div>
      {showActions && (
        <div className='flex flex-shrink-0 items-center gap-1'>
          {item.url && (
            <Button
              variant='ghost'
              size='sm'
              isIconOnly
              onPress={(e) => handleAction('open', e)}
              aria-label='Open'
            >
              <IconExternalLink className='size-4' />
            </Button>
          )}
          <Button
            variant='ghost'
            size='sm'
            isIconOnly
            onPress={(e) => handleAction('copy', e)}
            aria-label='Copy'
          >
            <IconCopy className='size-4' />
          </Button>
          <Button
            variant='ghost'
            size='sm'
            isIconOnly
            onPress={(e) => handleAction('share', e)}
            aria-label='Share'
          >
            <IconShare className='size-4' />
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Helper function to create list items from page hierarchy data
 * Useful for converting Domo page data into DataList format
 *
 * @param {Object} page - Page object with id, name, and optional children
 * @returns {Object} Formatted item for DataList
 */
export function createListItemFromPage(page) {
  return {
    id: page.id,
    label: page.name || page.title,
    url: page.url,
    count: page.cardCount || page.count,
    metadata: page.id ? `ID: ${page.id}` : undefined,
    children: page.children
      ? page.children.map(createListItemFromPage)
      : undefined
  };
}
