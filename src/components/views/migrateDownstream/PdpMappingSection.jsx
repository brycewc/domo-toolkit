import { ListBox, Select } from '@heroui/react';

import IconCheck from '@icons/check.svg?react';
import IconChevronDown from '@icons/chevron-down.svg?react';

import { DecisionSection } from './DecisionSection';

// Sentinel for the select's explicit "remove this policy so the alert watches
// all rows" choice. The unresolved state is a null value (no selection), which
// keeps the migration blocked until the user picks.
const PDP_REMOVE = '__pdp_remove__';

export function PdpMappingSection({ choices, isLoaded, onChoice, references, status, targetPolicies }) {
  if (!isLoaded || references.length === 0) return null;
  return (
    <DecisionSection
      description='These alerts are scoped by a PDP policy with no match on the target dataset. Map each to a target policy, or remove it so the moved alert watches all rows. Migration is blocked until each is resolved.'
      id='pdp'
      status={status}
      title='PDP Policy Mapping'
    >
      <div className='flex flex-col divide-y divide-border'>
        {references.map((p) => (
          <PdpMapRow
            choice={choices[String(p.filterGroupId)]}
            key={String(p.filterGroupId)}
            originName={p.name}
            targetPolicies={targetPolicies}
            onChange={(disposition, targetFilterGroupId) => onChoice(p.filterGroupId, disposition, targetFilterGroupId)}
          />
        ))}
      </div>
    </DecisionSection>
  );
}

function PdpMapRow({ choice, onChange, originName, targetPolicies }) {
  const namedTargets = targetPolicies.filter((p) => p.type !== 'open');
  const value =
    choice?.disposition === 'remove'
      ? PDP_REMOVE
      : choice?.disposition === 'map' && choice.targetFilterGroupId != null
        ? String(choice.targetFilterGroupId)
        : null;
  return (
    <div className='flex items-center gap-2 py-1.5'>
      <span className='min-w-0 flex-1 truncate font-mono text-xs' title={originName}>
        {originName}
      </span>
      <Select
        aria-label={`Map PDP policy ${originName}`}
        className='w-48'
        placeholder='Choose…'
        value={value}
        variant='secondary'
        onChange={(key) => (key === PDP_REMOVE ? onChange('remove') : onChange('map', key))}
      >
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator>
            <IconChevronDown />
          </Select.Indicator>
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {namedTargets.map((p) => (
              <ListBox.Item id={String(p.filterGroupId)} key={String(p.filterGroupId)} textValue={p.name}>
                {p.name}
                <ListBox.ItemIndicator>{({ isSelected }) => (isSelected ? <IconCheck /> : null)}</ListBox.ItemIndicator>
              </ListBox.Item>
            ))}
            <ListBox.Item id={PDP_REMOVE} textValue='Remove'>
              <span className='text-danger italic'>Remove (watch all rows)</span>
              <ListBox.ItemIndicator>{({ isSelected }) => (isSelected ? <IconCheck /> : null)}</ListBox.ItemIndicator>
            </ListBox.Item>
          </ListBox>
        </Select.Popover>
      </Select>
    </div>
  );
}
