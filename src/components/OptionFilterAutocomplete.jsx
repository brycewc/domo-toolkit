import { Autocomplete, EmptyState, ListBox, Popover, SearchField, useFilter } from '@heroui/react';
import { useCallback, useMemo } from 'react';

import { FittedTagGroup } from '@/components/FittedTagGroup';

/**
 * OptionFilterAutocomplete Component
 * Multi-select autocomplete over a fixed, locally filtered option list. The search
 * matches an option's label and its raw ID, so both "Updated" and "DATA_SOURCE_UPDATED"
 * find the same action.
 * @param {Object} props
 * @param {string} props.className - Class name for the autocomplete root
 * @param {Function} props.getTagClassName - Optional class name for a selected option's tag, given its ID
 * @param {boolean} props.isDisabled - Whether the autocomplete is disabled
 * @param {string} props.label - Accessible name, and the noun in the search placeholder
 * @param {Function} props.onChange - Called with the new Set of selected IDs
 * @param {Array<{id: string, label: string}>} props.options - Options to choose from
 * @param {string} props.placeholder - Trigger text when nothing is selected
 * @param {Function} props.renderOption - Optional custom content for an option row
 * @param {Set<string>} props.value - Selected option IDs
 */
export function OptionFilterAutocomplete({
  className,
  getTagClassName,
  isDisabled = false,
  label,
  onChange,
  options,
  placeholder,
  renderOption,
  value
}) {
  const { contains } = useFilter({ sensitivity: 'base' });

  const selectedIds = useMemo(() => [...value], [value]);

  const labelsById = useMemo(() => new Map(options.map((option) => [option.id, option.label])), [options]);

  const matchesOption = useCallback(
    (textValue, inputValue, node) => contains(textValue, inputValue) || contains(String(node?.key ?? ''), inputValue),
    [contains]
  );

  const handleRemoveTags = useCallback(
    (keys) => onChange(new Set(selectedIds.filter((id) => !keys.has(id)))),
    [onChange, selectedIds]
  );

  return (
    <Autocomplete
      aria-label={label}
      className={className}
      isDisabled={isDisabled}
      placeholder={placeholder}
      selectionMode='multiple'
      value={selectedIds}
      variant='secondary'
      onChange={(keys) => onChange(new Set(keys || []))}
    >
      <Autocomplete.Trigger aria-label={`${label} autocomplete trigger`}>
        <Autocomplete.Value aria-label={`Selected ${label.toLowerCase()} filters`} className='min-w-0 flex-1 overflow-hidden'>
          {({ defaultChildren }) => {
            if (selectedIds.length === 0) return defaultChildren;
            return (
              <FittedTagGroup
                ariaLabel={`Selected ${label.toLowerCase()} filters`}
                onRemove={handleRemoveTags}
                items={selectedIds.map((id) => ({
                  className: getTagClassName?.(id),
                  id,
                  label: labelsById.get(id) ?? String(id)
                }))}
              />
            );
          }}
        </Autocomplete.Value>
        <Autocomplete.ClearButton />
        <Autocomplete.Indicator />
      </Autocomplete.Trigger>
      <Autocomplete.Popover
        aria-label={`${label} autocomplete popover`}
        className='flex h-fit max-h-120! w-[min(22rem,calc(100vw-1.5rem))]! min-w-0! flex-col overflow-hidden!'
        placement='bottom left'
      >
        {/* The popover renders an internal dialog that needs its own accessible name. */}
        <Popover.Heading className='sr-only'>Filter by {label.toLowerCase()}</Popover.Heading>
        <Autocomplete.Filter filter={matchesOption}>
          <SearchField autoFocus aria-label={`Search ${label.toLowerCase()} filter field`} variant='secondary'>
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder={`Search ${label.toLowerCase()}s...`} />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <ListBox
            className='min-h-0 flex-1 overflow-y-auto'
            renderEmptyState={() => <EmptyState>No {label.toLowerCase()}s found</EmptyState>}
          >
            {options.map((option) => (
              <ListBox.Item id={option.id} key={option.id} textValue={option.label}>
                {renderOption ? renderOption(option) : <span className='truncate'>{option.label}</span>}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Autocomplete.Filter>
      </Autocomplete.Popover>
    </Autocomplete>
  );
}
