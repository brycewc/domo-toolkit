import {
  Autocomplete,
  Button,
  EmptyState,
  Header,
  Label,
  ListBox,
  Popover,
  SearchField,
  Spinner,
  Switch,
  useFilter
} from '@heroui/react';
import { useMemo } from 'react';

import { Alert } from '@/components/Alert';
import IconExclamationPointCircle from '@icons/exclamation-point-circle.svg?react';
import IconSync from '@icons/sync.svg?react';

const PENDING_KEY = '__pending__';

/**
 * @param {Object} props
 * @param {Array<{id: string, label: string, options: Array<{count: number, key: string, label: string}>}>} props.sections
 * @param {string|null} props.excludedNote - What the scope left out, or null when nothing was
 * @param {{includeSubpages: boolean, locationKeys: Set<string>}|null} props.scope - null for All Content
 */
export function ScopeSection({
  error,
  excludedNote,
  isDisabled = false,
  onIncludeSubpagesChange,
  onOpen,
  onRetry,
  onScopeChange,
  pillLabel,
  scope,
  sections,
  showSubpagesSwitch,
  status,
  subpagesLoading
}) {
  const { contains } = useFilter({ sensitivity: 'base' });
  const selectedKeys = useMemo(() => (scope ? [...scope.locationKeys] : []), [scope]);

  const handleChange = (keys) => {
    const next = new Set(keys || []);
    next.delete(PENDING_KEY);
    onScopeChange(next.size === 0 ? null : { includeSubpages: scope?.includeSubpages ?? false, locationKeys: next });
  };

  return (
    <div className='flex w-full flex-col gap-1.5'>
      <Autocomplete
        aria-label='Scope'
        className='w-full'
        isDisabled={isDisabled}
        placeholder='All Content'
        selectionMode='multiple'
        value={selectedKeys}
        variant='secondary'
        onChange={handleChange}
        onClear={() => onScopeChange(null)}
        onOpenChange={(open) => open && onOpen?.()}
      >
        <Label>Scope</Label>
        <Autocomplete.Trigger aria-label='Scope trigger'>
          <Autocomplete.Value aria-label='Selected scope' className='min-w-0 flex-1 truncate'>
            {({ defaultChildren }) => (scope ? <span className='truncate'>{pillLabel}</span> : defaultChildren)}
          </Autocomplete.Value>
          <Autocomplete.ClearButton />
          <Autocomplete.Indicator />
        </Autocomplete.Trigger>
        <Autocomplete.Popover
          aria-label='Scope popover'
          className='flex h-fit max-h-120! w-[min(22rem,calc(100vw-1.5rem))]! min-w-0! flex-col overflow-hidden!'
          placement='bottom left'
        >
          <Popover.Heading className='sr-only'>Choose where to migrate content from</Popover.Heading>
          <Autocomplete.Filter filter={contains}>
            <SearchField autoFocus aria-label='Search locations' variant='secondary'>
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input placeholder='Search pages and apps...' />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
            <ListBox
              className='min-h-0 flex-1 overflow-y-auto'
              renderEmptyState={() => <EmptyState>No locations found</EmptyState>}
            >
              {status !== 'loaded' && (
                // An empty list disables the trigger, and opening it is what starts the lookup.
                <ListBox.Item isDisabled id={PENDING_KEY} textValue='Finding where these cards live'>
                  {status === 'error' ? (
                    <span className='text-sm text-muted'>Couldn't find where these cards live</span>
                  ) : (
                    <span className='flex items-center gap-2 text-sm text-muted'>
                      <Spinner size='sm' />
                      Finding where these cards live...
                    </span>
                  )}
                </ListBox.Item>
              )}
              {sections.map((section) => (
                <ListBox.Section key={section.id}>
                  <Header>{section.label}</Header>
                  {section.options.map((option) => (
                    <ListBox.Item id={option.key} key={option.key} textValue={option.label}>
                      <span className='min-w-0 flex-1 truncate'>{option.label}</span>
                      <span className='shrink-0 text-xs text-muted'>
                        {option.count} {option.count === 1 ? 'card' : 'cards'}
                      </span>
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox.Section>
              ))}
            </ListBox>
          </Autocomplete.Filter>
        </Autocomplete.Popover>
      </Autocomplete>

      {scope && showSubpagesSwitch && (
        <Switch isSelected={scope.includeSubpages} size='sm' onChange={onIncludeSubpagesChange}>
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            Include Subpages
            {subpagesLoading && <Spinner size='sm' />}
          </Switch.Content>
        </Switch>
      )}

      {status === 'error' && (
        <Alert className='w-full' status='danger' variant='transparent'>
          <Alert.Content>
            <Alert.Title className='flex items-center gap-1'>
              <Alert.Indicator>
                <IconExclamationPointCircle data-slot='alert-default-icon' />
              </Alert.Indicator>
              Couldn't Find Where These Cards Live
            </Alert.Title>
            <Alert.Description>{error}</Alert.Description>
            <Button className='mt-2' size='sm' variant='secondary' onPress={onRetry}>
              <IconSync />
              Retry
            </Button>
          </Alert.Content>
        </Alert>
      )}

      {scope && excludedNote && <p className='text-xs text-muted'>{excludedNote}</p>}
    </div>
  );
}
