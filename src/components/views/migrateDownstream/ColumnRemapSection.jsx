import {
  Autocomplete,
  Button,
  Collection,
  Description,
  EmptyState,
  Header,
  Link,
  ListBox,
  ListLayout,
  Modal,
  Popover,
  SearchField,
  Spinner,
  Tooltip,
  useFilter,
  Virtualizer
} from '@heroui/react';
import { Fragment, useMemo, useState } from 'react';

import { Alert } from '@/components/Alert';
import { AlertStatusIcon } from '@/components/AlertStatusIcon';
import { ObjectTypeIcon } from '@/components/ObjectTypeIcon';
import { ColumnUsagesModal } from '@/components/views/ColumnUsagesModal';
import { describeViewOutputDrop } from '@/utils/columnDrops';
import IconCheck from '@icons/check.svg?react';
import IconExclamationTriangle from '@icons/exclamation-triangle.svg?react';
import IconInfoCircle from '@icons/info-circle.svg?react';
import IconWand from '@icons/wand.svg?react';
import IconX from '@icons/x.svg?react';

import { buildObjectUrl, DROP, UNMAPPED } from './contentTypes';
import { DecisionSection } from './DecisionSection';

export function ColumnRemapSection({
  autoMapStatus,
  cardOnlyColumnNames,
  cardsById,
  columnMap,
  dataflowCollisions,
  droppableColumnNames,
  onAutoMap,
  onColumnChoice,
  origin,
  rows,
  status,
  targetBeastModes,
  targetColumns,
  totalSelected
}) {
  if (rows.length === 0) return null;
  return (
    <DecisionSection
      description="Map each origin column to a column on the target dataset, or leave it unmapped (you'll need to fix references manually). Only columns actually referenced by the selected content are shown."
      id='columns'
      status={status}
      title='Column Remap'
      toolbar={
        <Tooltip>
          <Button isPending={autoMapStatus === 'mapping'} size='sm' variant='secondary' onPress={onAutoMap}>
            {autoMapStatus === 'mapping' ? (
              <Spinner color='currentColor' size='sm' />
            ) : autoMapStatus === 'done' ? (
              <IconCheck className='text-success' />
            ) : (
              <IconWand />
            )}
            {autoMapStatus === 'mapping' ? 'Mapping…' : autoMapStatus === 'done' ? 'Mapped' : 'Auto Map'}
          </Button>
          <Tooltip.Content className='max-w-80 text-wrap'>
            Fills each column with its closest match by name. Columns with no clear match are left unmapped. Review before
            migrating.
          </Tooltip.Content>
        </Tooltip>
      }
    >
      <div className='flex flex-col divide-y divide-border'>
        {rows.map(({ items, name, type }) => (
          <ColumnMapRow
            canDrop={droppableColumnNames.has(name)}
            canMapBeastMode={cardOnlyColumnNames.has(name)}
            cardsById={cardsById}
            collisions={dataflowCollisions?.get?.(name) || null}
            items={items}
            key={name}
            mappedTo={columnMap[name] ?? UNMAPPED}
            origin={origin}
            originName={name}
            originType={type}
            targetBeastModes={targetBeastModes}
            targetColumns={targetColumns}
            totalSelected={totalSelected}
            onChange={(choice) => onColumnChoice(name, choice)}
          />
        ))}
      </div>
    </DecisionSection>
  );
}

function ColumnMapRow({
  canDrop = false,
  canMapBeastMode = false,
  cardsById,
  collisions,
  items,
  mappedTo,
  onChange,
  origin,
  originName,
  originType,
  targetBeastModes,
  targetColumns,
  totalSelected
}) {
  // Case-insensitive "contains" match for the Autocomplete's local filter, so
  // the user can type to narrow a long target-column list.
  const { contains } = useFilter({ sensitivity: 'base' });
  // Controlled search text. The option list is virtualized, so the collection
  // must BE the filtered set (a dynamic `items` array) rather than static
  // children auto-filtered by the Autocomplete.
  const [query, setQuery] = useState('');

  // Target Beast Modes offered as mapping targets: only those with a legacyId
  // (the id a card references them by; without it we couldn't rewrite the ref).
  // Shown only for card-only columns. Sorted by name to match the column list.
  const mappableBeastModes = useMemo(() => {
    if (!canMapBeastMode) return [];
    return (targetBeastModes || [])
      .filter((b) => b?.legacyId)
      .slice()
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [canMapBeastMode, targetBeastModes]);

  // When the current choice is a Beast Mode (its legacyId), resolve it for the
  // trigger so it shows the Beast Mode's name rather than the raw id.
  const selectedBeastMode = useMemo(
    () => mappableBeastModes.find((b) => b.legacyId === mappedTo) || null,
    [mappableBeastModes, mappedTo]
  );

  // Options for the virtualized picker, filtered by the search box. Actions
  // (Leave unmapped / Drop) come first; columns and Beast Modes split into
  // labeled sections only when Beast Modes are offered, otherwise one flat list.
  // The "Columns" header only appears alongside "Beast Modes"; on its own it
  // would just hint at options that aren't there. Empty sections are dropped so
  // no bare header shows when a search filters a group to nothing.
  const optionSections = useMemo(() => {
    const matches = (text) => !query || contains(text, query);
    const sections = [];
    const actions = [{ id: UNMAPPED, kind: 'unmapped', label: 'Leave unmapped' }];
    if (canDrop) actions.push({ id: DROP, kind: 'drop', label: 'Drop column' });
    const visibleActions = actions.filter((a) => matches(a.label));
    if (visibleActions.length > 0)
      sections.push({ header: null, id: '__actions__', items: visibleActions, label: 'Mapping options' });
    const cols = targetColumns
      .filter((c) => matches(c.name))
      .map((c) => ({ id: c.name, kind: 'column', name: c.name, type: c.type || 'STRING' }));
    const beastModes = mappableBeastModes
      .filter((b) => matches(b.name))
      .map((b) => ({ id: b.legacyId, kind: 'beastMode', name: b.name, type: b.dataType || 'STRING' }));
    const showHeaders = mappableBeastModes.length > 0;
    if (cols.length > 0)
      sections.push({ header: showHeaders ? 'Columns' : null, id: '__columns__', items: cols, label: 'Columns' });
    if (showHeaders && beastModes.length > 0)
      sections.push({ header: 'Beast Modes', id: '__beastModes__', items: beastModes, label: 'Beast Modes' });
    return sections;
  }, [canDrop, contains, mappableBeastModes, query, targetColumns]);

  // Render one option row for the virtualized collection, by kind.
  const renderOption = (item) => {
    if (item.kind === 'unmapped') {
      return (
        <ListBox.Item id={UNMAPPED} textValue='Leave unmapped'>
          <span className='text-muted italic'>Leave unmapped</span>
          <ListBox.ItemIndicator>{({ isSelected }) => (isSelected ? <IconCheck /> : null)}</ListBox.ItemIndicator>
        </ListBox.Item>
      );
    }
    if (item.kind === 'drop') {
      return (
        <ListBox.Item id={DROP} textValue='Drop column'>
          <span className='text-danger italic'>Drop column</span>
          <ListBox.ItemIndicator>{({ isSelected }) => (isSelected ? <IconCheck /> : null)}</ListBox.ItemIndicator>
        </ListBox.Item>
      );
    }
    if (item.kind === 'beastMode') {
      return (
        <ListBox.Item id={item.id} textValue={item.name}>
          <span className='flex min-w-0 items-center gap-1'>
            <ObjectTypeIcon className='size-3.5 shrink-0' typeId='BEAST_MODE_FORMULA' />
            <div className='flex min-w-0 flex-col'>
              <span className='truncate text-xs' title={item.name}>
                {item.name}
              </span>
              <span className='text-[10px] text-muted'>{item.type}</span>
            </div>
          </span>
          <ListBox.ItemIndicator>{({ isSelected }) => (isSelected ? <IconCheck /> : null)}</ListBox.ItemIndicator>
        </ListBox.Item>
      );
    }
    return (
      <ListBox.Item id={item.id} textValue={item.name}>
        <div className='flex min-w-0 flex-col'>
          <span className='truncate font-mono text-xs' title={item.name}>
            {item.name}
          </span>
          <span className='text-[10px] text-muted'>{item.type}</span>
        </div>
        <ListBox.ItemIndicator>{({ isSelected }) => (isSelected ? <IconCheck /> : null)}</ListBox.ItemIndicator>
      </ListBox.Item>
    );
  };

  // Aggregate collisions by dataflow. Many other-inputs may share the same
  // column name; the user mostly cares which dataflows are affected.
  const collisionByDataflow = useMemo(() => {
    if (!collisions || collisions.length === 0) return [];
    const m = new Map();
    for (const c of collisions) {
      if (!m.has(c.dataflowId)) {
        m.set(c.dataflowId, { dataflowName: c.dataflowName, otherInputs: new Map() });
      }
      // Dedup each dataflow's other inputs by dataset id (the same input can
      // surface for several colliding columns), keeping the input's name so it
      // can render as a link to the dataset.
      m.get(c.dataflowId).otherInputs.set(c.otherInputId, c.otherInputName);
    }
    return [...m.entries()].map(([id, v]) => ({
      dataflowId: id,
      dataflowName: v.dataflowName,
      otherInputs: [...v.otherInputs].map(([inputId, name]) => ({ id: inputId, name }))
    }));
  }, [collisions]);

  const singleCollision = collisionByDataflow.length === 1 ? collisionByDataflow[0] : null;
  const singleCollisionUrl = singleCollision
    ? buildObjectUrl('dataflows', { id: singleCollision.dataflowId, name: singleCollision.dataflowName }, origin)
    : null;

  // What dropping this column takes out of a dataset view, in the same words
  // Remap Columns uses.
  const viewDropWarning = useMemo(() => (mappedTo === DROP ? describeViewOutputDrop(items) : null), [items, mappedTo]);

  // After a target is picked, flag when its data type differs from the origin
  // column's. A silent type change can break a dataflow (e.g. an integer column
  // dropped into a UNION of text values), so surface it on the row.
  const selectedTargetType = mappedTo && mappedTo !== UNMAPPED ? targetColumns.find((c) => c.name === mappedTo)?.type : null;
  const typeMismatch = Boolean(originType && selectedTargetType && originType !== selectedTargetType);

  return (
    <div className='flex flex-col gap-1 py-1.5'>
      {collisionByDataflow.length > 0 && (
        <Alert className='w-full' status='warning' variant='transparent'>
          <Alert.Content>
            <Alert.Title className='flex items-start gap-1'>
              <AlertStatusIcon />
              <span>
                Cross-input collision: <span className='font-mono font-bold'>{originName}</span> also exists on{' '}
                {singleCollision ? (
                  <>
                    another input of{' '}
                    <span>
                      <ObjectTypeIcon className='mr-0.5 inline size-3.5 align-middle' typeId='DATAFLOW_TYPE' />
                      {singleCollisionUrl ? (
                        <Link
                          className='inline! text-current no-underline decoration-accent hover:text-accent hover:underline'
                          href={singleCollisionUrl}
                          target='_blank'
                          title={singleCollision.dataflowName}
                        >
                          {singleCollision.dataflowName}
                        </Link>
                      ) : (
                        singleCollision.dataflowName
                      )}
                    </span>
                  </>
                ) : (
                  <>
                    other inputs of {collisionByDataflow.length} dataflows{' '}
                    <span className='inline-flex align-middle'>
                      <DataflowCollisionModal dataflows={collisionByDataflow} origin={origin} originName={originName} />
                    </span>
                  </>
                )}
              </span>
            </Alert.Title>
            <Alert.Description>
              Remapping will rewrite every reference to <span className='font-mono font-medium'>{originName}</span> in the
              affected dataflow
              {collisionByDataflow.length === 1 ? '' : 's'}, including refs that came from{' '}
              {collisionByDataflow.length === 1
                ? collisionByDataflow[0].otherInputs.map((input, i) => {
                    const inputUrl = buildObjectUrl('datasets', { id: input.id, name: input.name }, origin);
                    return (
                      <Fragment key={input.id}>
                        {i > 0 ? ', ' : ''}
                        <span>
                          <ObjectTypeIcon className='mr-0.5 inline size-3.5 align-middle' typeId='DATA_SOURCE' />
                          {inputUrl ? (
                            <Link
                              className='inline! font-medium text-current no-underline decoration-accent hover:text-accent hover:underline'
                              href={inputUrl}
                              target='_blank'
                              title={input.name}
                            >
                              {input.name}
                            </Link>
                          ) : (
                            <span className='font-medium'>{input.name}</span>
                          )}
                        </span>
                      </Fragment>
                    );
                  })
                : 'other inputs'}
              . Consider leaving this unmapped and fixing the dataflow manually.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      <div className='flex items-center gap-2'>
        <div className='flex min-w-0 flex-1 flex-col'>
          <span className='truncate font-mono text-xs' title={originName}>
            {originName}
          </span>
          <span className='flex items-center gap-1 text-[10px] text-muted'>
            {originType && (
              <>
                <span className='font-mono'>{originType}</span>
                <span aria-hidden='true'>·</span>
              </>
            )}
            <span>
              {items.length} use{items.length === 1 ? '' : 's'}
            </span>
            <ColumnUsagesModal
              cardsById={cardsById}
              columnName={originName}
              items={items}
              origin={origin}
              total={totalSelected}
            />
          </span>
        </div>
        {typeMismatch && (
          <Tooltip delay={300}>
            <Button isIconOnly aria-label='Data type mismatch' className='shrink-0 text-warning' size='sm' variant='ghost'>
              <IconExclamationTriangle />
            </Button>
            <Tooltip.Content className='w-fit max-w-60'>
              Selected column's type <span className='font-mono text-muted'>{selectedTargetType}</span> doesn't match the
              original <span className='font-mono text-muted'>{originType}</span>
            </Tooltip.Content>
          </Tooltip>
        )}
        <Autocomplete
          allowsEmptyCollection
          aria-label={`Map ${originName} to`}
          className='w-44'
          selectionMode='single'
          value={mappedTo}
          variant='secondary'
          onChange={(key) => onChange(key)}
        >
          <Autocomplete.Trigger className='w-full'>
            {/* Render only the name (not its type) so the value stays one line.
                `flex-1 min-w-0` lets a long name truncate within the trigger
                instead of growing it and pushing the clear/indicator controls. */}
            <Autocomplete.Value className='flex min-w-0 flex-1 items-center gap-1'>
              {() =>
                mappedTo === UNMAPPED ? (
                  <span className='min-w-0 truncate text-muted italic'>Leave unmapped</span>
                ) : mappedTo === DROP ? (
                  <span className='min-w-0 truncate text-danger italic'>Drop column</span>
                ) : selectedBeastMode ? (
                  <>
                    <ObjectTypeIcon className='size-3.5 shrink-0' typeId='BEAST_MODE_FORMULA' />
                    <span className='min-w-0 truncate text-xs'>{selectedBeastMode.name}</span>
                  </>
                ) : (
                  <span className='min-w-0 truncate font-mono text-xs'>{mappedTo}</span>
                )
              }
            </Autocomplete.Value>
            <Autocomplete.ClearButton />
            <Autocomplete.Indicator />
          </Autocomplete.Trigger>
          <Autocomplete.Popover className='w-fit max-w-9/10 min-w-72' placement='bottom end'>
            {/* The Autocomplete popover renders an internal dialog; give it a
                screen-reader title so it has an accessible name (React Aria warns
                when a dialog has neither a title slot nor an aria-label). Visually
                hidden, so the popover layout is unchanged. */}
            <Popover.Heading className='sr-only'>Map {originName} to a column</Popover.Heading>
            <Autocomplete.Filter inputValue={query} onInputChange={setQuery}>
              <SearchField
                autoFocus
                aria-label={`Search columns for ${originName}`}
                className='sticky top-0 z-10'
                name='column-search'
                variant='secondary'
              >
                <SearchField.Group>
                  <SearchField.SearchIcon />
                  <SearchField.Input placeholder='Search columns...' />
                  <SearchField.ClearButton />
                </SearchField.Group>
              </SearchField>
              {/* Virtualized so a dataset with hundreds of columns only renders
                  the visible rows. Row/heading heights are estimated (rows are
                  variable: one-line actions vs two-line columns) so React Aria
                  measures actual heights and self-corrects. */}
              <Virtualizer layout={ListLayout} layoutOptions={{ estimatedHeadingHeight: 28, estimatedRowHeight: 44 }}>
                <ListBox
                  aria-label={`Columns for ${originName}`}
                  className='max-h-80 overflow-y-auto'
                  items={optionSections}
                  renderEmptyState={() => <EmptyState>No columns found</EmptyState>}
                >
                  {(section) => (
                    <ListBox.Section aria-label={section.header ? undefined : section.label} id={section.id}>
                      {section.header ? <Header>{section.header}</Header> : null}
                      <Collection items={section.items}>{(item) => renderOption(item)}</Collection>
                    </ListBox.Section>
                  )}
                </ListBox>
              </Virtualizer>
            </Autocomplete.Filter>
          </Autocomplete.Popover>
        </Autocomplete>
      </div>
      {viewDropWarning && <p className='text-xs text-warning'>{viewDropWarning}</p>}
    </div>
  );
}

// Info-icon modal listing the dataflows whose other inputs collide on the
// origin column name, each linking to the dataflow. Mirrors ColumnUsagesModal,
// shown when the collision spans more than one dataflow (a single one links

function DataflowCollisionModal({ dataflows, origin, originName }) {
  return (
    <Modal>
      <Tooltip delay={300}>
        <Button
          isIconOnly
          aria-label={`Show dataflows where ${originName} collides`}
          className='size-4 min-h-0 p-0 text-current hover:opacity-70'
          size='sm'
          variant='ghost'
        >
          <IconInfoCircle className='size-3.5' />
        </Button>
        <Tooltip.Content className='max-w-60'>Click to view dataflows with a column that has the same name</Tooltip.Content>
      </Tooltip>
      <Modal.Backdrop isDissmissable>
        <Modal.Container className='p-1' placement='center' scroll='outside'>
          <Modal.Dialog className='p-2 pt-3'>
            <Modal.CloseTrigger className='absolute top-2 right-2' variant='ghost'>
              <IconX />
            </Modal.CloseTrigger>
            <Modal.Header>
              <Modal.Heading className='flex flex-col gap-1 truncate pr-6'>
                <span className='font-mono'>{originName}</span>
                <Description>
                  Also on another input of {dataflows.length} dataflow{dataflows.length === 1 ? '' : 's'}.
                </Description>
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className='flex max-h-[60vh] flex-col gap-3 overflow-y-auto text-foreground'>
              <ul className='flex min-w-0 flex-col gap-1'>
                {[...dataflows]
                  .sort((a, b) => (a.dataflowName || '').localeCompare(b.dataflowName || ''))
                  .map((df) => {
                    const url = buildObjectUrl('dataflows', { id: df.dataflowId, name: df.dataflowName }, origin);
                    return (
                      <li className='flex min-w-0 items-center gap-1.5' key={df.dataflowId}>
                        <ObjectTypeIcon className='size-4 shrink-0' typeId='DATAFLOW_TYPE' />
                        {url ? (
                          <Link
                            className='min-w-0 truncate text-sm no-underline decoration-accent underline-offset-2 hover:text-accent hover:underline'
                            href={url}
                            target='_blank'
                            title={df.dataflowName}
                          >
                            {df.dataflowName}
                          </Link>
                        ) : (
                          <span className='min-w-0 truncate text-sm' title={df.dataflowName}>
                            {df.dataflowName}
                          </span>
                        )}
                      </li>
                    );
                  })}
              </ul>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

// Concise one-line title for the error Alert's header. The full per-item
// breakdown rides along as structured `errorDetail` (rendered as JSON in the
