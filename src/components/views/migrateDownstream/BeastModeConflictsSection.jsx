import { Input, ListBox, Select, TextField } from '@heroui/react';

import { Alert } from '@/components/Alert';
import { AlertStatusIcon } from '@/components/AlertStatusIcon';
import IconCheck from '@icons/check.svg?react';
import IconChevronDown from '@icons/chevron-down.svg?react';

import { DecisionSection } from './DecisionSection';
import { SetAllConflictsMenu } from './SetAllConflictsMenu';

const BEAST_MODE_DISPOSITIONS = [
  { id: 'keep', label: 'Keep existing' },
  { id: 'overwrite', label: 'Overwrite' },
  { id: 'rename', label: 'Rename new' }
];

const CARD_BEAST_MODE_DISPOSITIONS = [
  { id: 'useTarget', label: "Use target's" },
  { id: 'rename', label: "Rename card's" }
];

export function BeastModeConflictsSection({
  choices,
  conflicts,
  depthBlockedByDependency,
  depthBlockedMessage,
  onApplyAll,
  onChoice,
  status,
  targetNames
}) {
  if (conflicts.length === 0) return null;
  return (
    <DecisionSection
      description="The target already has a Beast Mode with each of these names. Keep the target's, overwrite it with the incoming one, or rename the incoming so both exist. Cards that use it are repointed either way."
      id='beastModes'
      status={status}
      title='Beast Mode Conflicts'
      toolbar={
        conflicts.length > 1 && (
          <SetAllConflictsMenu
            items={BEAST_MODE_DISPOSITIONS}
            tooltip="Applies one choice to all of these Beast Modes. Adjust individual ones afterward. Rename new still needs each row's name."
            onApply={onApplyAll}
          />
        )
      }
    >
      {depthBlockedMessage && (
        <Alert className='w-full' status='warning' variant='transparent'>
          <AlertStatusIcon />
          <Alert.Content>
            <Alert.Description>{depthBlockedMessage}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      <div className='flex flex-col divide-y divide-border'>
        {conflicts.map((bm) => (
          <ConflictRow
            choice={choices[bm.id]}
            depthBlocks={depthBlockedByDependency.get(String(bm.id)) || null}
            dispositions={BEAST_MODE_DISPOSITIONS}
            emptyNameMessage='Enter a name for the new Beast Mode.'
            key={bm.id}
            originName={bm.name}
            selectLabel={`Resolve ${bm.name}`}
            targetNames={targetNames}
            onChange={(disposition, newName) => onChoice(bm.id, disposition, newName)}
          />
        ))}
      </div>
    </DecisionSection>
  );
}

export function CardBeastModeConflictsSection({ choices, conflicts, onApplyAll, onChoice, status, targetNames }) {
  if (conflicts.length === 0) return null;
  return (
    <DecisionSection
      description="A selected card has a Beast Mode whose name already exists as a Beast Mode on the target dataset, which Domo won't allow. Use the target's Beast Mode instead, or rename the card's so both can exist."
      id='cardBeastModes'
      status={status}
      title='Card Beast Mode Conflicts'
      toolbar={
        conflicts.length > 1 && (
          <SetAllConflictsMenu
            items={CARD_BEAST_MODE_DISPOSITIONS}
            tooltip="Applies one choice to all of these Beast Modes. Adjust individual ones afterward. Rename card's still needs each row's name."
            onApply={onApplyAll}
          />
        )
      }
    >
      <div className='flex flex-col divide-y divide-border'>
        {conflicts.map((bm) => (
          <ConflictRow
            choice={choices[bm.id]}
            dispositions={CARD_BEAST_MODE_DISPOSITIONS}
            emptyNameMessage="Enter a name for the card's Beast Mode."
            key={bm.id}
            originName={bm.name}
            selectLabel={`Resolve card Beast Mode ${bm.name}`}
            targetNames={targetNames}
            onChange={(disposition, newName) => onChoice(bm.id, disposition, newName)}
          />
        ))}
      </div>
    </DecisionSection>
  );
}

// The origin Beast Mode's name plus its disposition, with an inline name field
// (and validation) when renaming. A null disposition renders the placeholder, so
// an untouched row reads as undecided rather than as a choice already made.
function ConflictRow({
  choice,
  depthBlocks,
  dispositions,
  emptyNameMessage,
  onChange,
  originName,
  selectLabel,
  targetNames
}) {
  const disposition = choice?.disposition ?? null;
  const newName = choice?.newName ?? '';
  const trimmed = newName.trim();
  const renameEmpty = disposition === 'rename' && trimmed === '';
  const renameCollides = disposition === 'rename' && trimmed !== '' && targetNames.has(trimmed);
  return (
    <div className='flex flex-col gap-1 py-1.5'>
      <div className='flex items-center gap-2'>
        <span className='min-w-0 flex-1 truncate font-mono text-xs' title={originName}>
          {originName}
        </span>
        <Select
          aria-label={selectLabel}
          className='w-36'
          placeholder='Choose…'
          value={disposition}
          variant='secondary'
          onChange={(value) => onChange(value, newName)}
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator>
              <IconChevronDown />
            </Select.Indicator>
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {dispositions.map((d) => (
                <ListBox.Item id={d.id} key={d.id}>
                  {d.label}
                  <ListBox.ItemIndicator>{({ isSelected }) => (isSelected ? <IconCheck /> : null)}</ListBox.ItemIndicator>
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </div>
      {disposition === 'rename' && (
        <TextField aria-label={`New name for ${originName}`} className='w-full' variant='secondary'>
          <Input
            className='h-8 font-mono text-xs'
            placeholder='New Beast Mode name…'
            value={newName}
            onChange={(e) => onChange('rename', e.target.value)}
          />
        </TextField>
      )}
      {renameEmpty && <p className='text-xs text-warning'>{emptyNameMessage}</p>}
      {renameCollides && <p className='text-xs text-warning'>That name also exists on the target.</p>}
      {depthBlocks?.length > 0 && (
        <p className='text-xs text-warning'>
          The target's copy is itself nested, so reusing it puts {depthBlocks.map((name) => `"${name}"`).join(', ')} a level
          deeper than Domo allows. Choose Rename new to bring a copy along instead.
        </p>
      )}
    </div>
  );
}
