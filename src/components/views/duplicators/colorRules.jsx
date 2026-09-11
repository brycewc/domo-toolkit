import { Spinner, ToggleButton, ToggleButtonGroup } from '@heroui/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Alert } from '@/components/Alert';
import { AlertStatusIcon } from '@/components/AlertStatusIcon';
import { DatasetComboBox } from '@/components/DatasetComboBox';
import { DataListItem } from '@/models/DataListItem';
import { getColorRules, getDatasetBeastModes, getDatasetColumns, setColorRules } from '@/services/datasets';
import IconColor from '@icons/color.svg?react';

import { DUPLICATOR_DESCRIPTORS } from './descriptors';

// Domo rejects the whole list past this count, so append is gated client-side.
const MAX_COLOR_RULES = 100;

// The two shapes Domo's own validator accepts for a format color.
const HEX_COLOR_PATTERN = /^#([A-Fa-f0-9]{8}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
const NAMED_COLOR_PATTERN = /^[A-Za-z0-9 ]{1,32}$/;

const UNKNOWN_COLUMN_REF = '__unknown__';

// Display text for each operator, taken from the server enum's pageControlText.
// IN and NOT_IN carry their raw enum name there, so they get readable wording.
const OPERATOR_TEXT = {
  ABOVE_AVERAGE: 'is above average',
  BELOW_AVERAGE: 'is below average',
  BETWEEN: 'is between',
  CONTAINS: 'contains',
  ENDS_WITH: 'ends with',
  EQUALS: 'is',
  EQUALS_IGNORE_CASE: 'is',
  GREAT_THAN_EQUALS_TO: 'is greater than or equal to',
  GREATER_THAN: 'is greater than',
  IN: 'is any of',
  IN_IGNORE_CASE: 'is any of',
  LESS_THAN: 'is less than',
  LESS_THAN_EQUALS_TO: 'is less than or equal to',
  LIKE: 'like',
  NOT_BETWEEN: 'is not between',
  NOT_CONTAINS: 'not contains',
  NOT_ENDS_WITH: 'not ends with',
  NOT_EQUALS: 'is not',
  NOT_IN: 'is none of',
  NOT_LIKE: 'not like',
  NOT_STARTS_WITH: 'not starts with',
  STARTS_WITH: 'starts with'
};

export const colorRulesDuplicator = {
  ...DUPLICATOR_DESCRIPTORS.DATA_SOURCE.options[0],
  buildItemBadge:
    ({ preview }) =>
    (item) => {
      const rule = ruleForItemId(preview, item?.id);
      const color = safeCssColor(rule?.format?.color);
      if (!color) return null;
      return {
        icon: (
          <span
            className='size-3.5 shrink-0 rounded-sm border border-muted bg-(--rule-color)'
            style={{ '--rule-color': color }}
          />
        ),
        tooltip: describeFormat(rule.format)
      };
    },
  buildItems: ({ preview, target }) => {
    const missingRefs = new Set(target?.missingRefs || []);
    const byColumn = new Map();
    preview.rules.forEach((rule, index) => {
      const ref = rule?.condition?.column || UNKNOWN_COLUMN_REF;
      if (!byColumn.has(ref)) byColumn.set(ref, []);
      byColumn.get(ref).push({ index, rule });
    });

    const groupLeafMap = {};
    const allLeafIds = [];
    const items = [];
    for (const [ref, entries] of byColumn) {
      const parentId = `column:${ref}`;
      const childIds = entries.map(({ index }) => `rule:${index}`);
      groupLeafMap[parentId] = childIds;
      allLeafIds.push(...childIds);
      items.push(
        DataListItem.createGroup({
          annotation: missingRefs.has(ref)
            ? 'This column is not on the destination dataset, so its rules will not render there until it is.'
            : undefined,
          children: entries.map(
            ({ index, rule }) =>
              new DataListItem({
                id: `rule:${index}`,
                label: formatColorRuleLabel(rule, index)
              })
          ),
          id: parentId,
          label: columnDisplayName(ref, preview.beastModes),
          metadata: `${entries.length} rule${entries.length === 1 ? '' : 's'}`
        })
      );
    }
    return { allLeafIds, groupLeafMap, items };
  },
  canSubmit: ({ options, selectedIds, target }) => {
    if (!target?.resolved) return false;
    const selected = countSelectedRules(selectedIds);
    if (selected === 0) return false;
    return composedRuleCount(options, selected, target) <= MAX_COLOR_RULES;
  },
  closeOnSuccess: true,
  defaultOptions: { writeMode: 'replace' },
  emptyText: 'This dataset has no color rules to copy.',
  fetchPreview: async ({ context, source }) => {
    // Beast modes normally ride along on the stored context, but a storage-quota
    // fallback drops `details`, which would leave every reference unmapped.
    const stored = context.domoObject?.metadata?.details?.properties?.formulas?.formulas;
    const [rules, beastModes] = await Promise.all([
      getColorRules(source.id, context.tabId),
      stored ? Promise.resolve(stored) : getDatasetBeastModes(source.id, context.tabId)
    ]);
    return { beastModes: beastModes || {}, rules };
  },
  Form: ColorRulesForm,
  formatError: ({ error }) => ({
    description: error.message || 'Failed to copy color rules',
    status: 'danger',
    timeout: 5000,
    title: 'Copy Failed'
  }),
  formatResult: ({ result }) => ({
    description: `${result.appended ? 'Added' : 'Copied'} **${result.count}** color rule${
      result.count === 1 ? '' : 's'
    } to **${result.targetName}**.`,
    status: 'success',
    timeout: 5000,
    title: result.appended ? 'Color Rules Added' : 'Color Rules Copied'
  }),
  getHeader: ({ preview, source }) => ({
    feature: 'Copy Color Rules from',
    featureIcon: <IconColor />,
    subject: source?.name,
    subjectTypeId: 'DATA_SOURCE',
    subtext: preview ? `${preview.rules.length} color rule${preview.rules.length === 1 ? '' : 's'}` : undefined
  }),
  getSubmitLabel: ({ completedResult, options }) => {
    if (completedResult?.success) return 'Copied';
    return options.writeMode === 'append' ? 'Append Color Rules' : 'Copy Color Rules';
  },
  Preview: ColorRulesPreview,
  resolveSource: (context) => ({
    id: context.domoObject?.id,
    name: context.domoObject?.metadata?.name || context.domoObject?.id
  }),
  run: async ({ context, options, preview, selectedIds, target }) => {
    const selected = preview.rules
      .map((rule, index) => ({ index, rule }))
      .filter(({ index }) => selectedIds.has(`rule:${index}`))
      .map(({ rule }) => remapRule(rule, target.swap));

    let existing = [];
    if (options.writeMode === 'append') {
      // The endpoint replaces the whole list with no concurrency check, so a
      // snapshot taken when the destination was picked could silently resurrect
      // rules someone else deleted.
      existing = await getColorRules(target.id, context.tabId);
      if (existing.length + selected.length > MAX_COLOR_RULES) {
        throw new Error(
          `The destination now has ${existing.length} rules, so adding ${selected.length} more would pass the ${MAX_COLOR_RULES}-rule limit.`
        );
      }
    }

    await setColorRules(target.id, [...existing, ...selected], context.tabId);
    return {
      appended: options.writeMode === 'append',
      count: selected.length,
      success: true,
      targetName: target.name
    };
  }
};

function ColorRulesForm({
  context,
  isSubmitting,
  options,
  preview,
  resetProgress,
  selectedIds,
  setOption,
  setTarget,
  target
}) {
  const [isLoadingDestination, setIsLoadingDestination] = useState(false);
  const destGenRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Copying onto the source is a no-op, so it never appears in the picker.
  const excludeIds = useMemo(
    () => (context.domoObject?.id ? new Set([context.domoObject.id]) : null),
    [context.domoObject?.id]
  );

  const handleDestinationChange = async (destId, destName) => {
    if (destId == null) return;
    const name = destName ?? destId;
    setTarget({ id: destId, name });
    setOption('writeMode', 'replace');
    resetProgress();
    setIsLoadingDestination(true);
    destGenRef.current += 1;
    const gen = destGenRef.current;
    try {
      const tabId = context.tabId;
      const [columns, beastModes, existingRules] = await Promise.all([
        getDatasetColumns({ datasetId: destId, tabId }),
        getDatasetBeastModes(destId, tabId),
        getColorRules(destId, tabId)
      ]);
      if (!mountedRef.current || gen !== destGenRef.current) return;
      const { missingColumns, missingRefs, swap } = resolveColumnRefs(
        preview.rules,
        columns,
        preview.beastModes,
        beastModes
      );
      setTarget({ existingRules, id: destId, missingColumns, missingRefs, name, resolved: true, swap });
    } catch (error) {
      if (gen !== destGenRef.current) return;
      console.error('[colorRulesDuplicator] Error loading destination:', error);
      if (mountedRef.current) {
        setTarget({ error: error.message || 'Failed to load destination dataset', id: destId, name });
      }
    } finally {
      if (mountedRef.current && gen === destGenRef.current) setIsLoadingDestination(false);
    }
  };

  const handleWriteModeChange = (keys) => {
    const next = [...keys][0];
    if (!next || next === options.writeMode) return;
    setOption('writeMode', next);
    resetProgress();
  };

  const existingCount = target?.existingRules?.length ?? 0;
  const selectedCount = countSelectedRules(selectedIds);
  const swapCount =
    target?.resolved && preview
      ? preview.rules.filter((rule) => rule?.condition?.column && target.swap[rule.condition.column]).length
      : 0;
  const overCap = target?.resolved && composedRuleCount(options, selectedCount, target) > MAX_COLOR_RULES;

  return (
    <>
      <DatasetComboBox
        aria-label='Destination dataset'
        excludeIds={excludeIds}
        instanceBaseUrl={context.domoObject?.baseUrl}
        isDisabled={!preview}
        label='Destination'
        selectedDisplayName={target?.name}
        selectedKey={target?.id ?? null}
        tabId={context.tabId}
        onSelectionChange={handleDestinationChange}
      />

      {isLoadingDestination && (
        <div className='flex items-center gap-2 text-sm text-muted'>
          <Spinner size='sm' />
          Checking destination…
        </div>
      )}

      {target?.error && (
        <Alert className='w-full' status='danger' variant='transparent'>
          <AlertStatusIcon />
          <Alert.Content>
            <Alert.Title>Could Not Read the Destination</Alert.Title>
            <Alert.Description>{target.error}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {target?.resolved && existingCount > 0 && (
        <div className='flex flex-col gap-1'>
          <span className='text-xs font-medium text-muted uppercase'>
            Destination has {existingCount} existing rule{existingCount === 1 ? '' : 's'}
          </span>
          <ToggleButtonGroup
            disallowEmptySelection
            aria-label='How to write the copied rules'
            className='w-full'
            isDisabled={isSubmitting}
            selectedKeys={new Set([options.writeMode])}
            selectionMode='single'
            size='sm'
            onSelectionChange={handleWriteModeChange}
          >
            <ToggleButton className='flex-1' id='replace'>
              Replace
            </ToggleButton>
            <ToggleButton className='flex-1' id='append'>
              Append
            </ToggleButton>
          </ToggleButtonGroup>
          <p className='text-xs text-muted italic'>
            {options.writeMode === 'append'
              ? `The copied rules are added after the ${existingCount} already there.`
              : `The ${existingCount} rule${existingCount === 1 ? '' : 's'} already there ${
                  existingCount === 1 ? 'is' : 'are'
                } deleted.`}
          </p>
        </div>
      )}

      {overCap && (
        <Alert className='w-full' status='warning' variant='transparent'>
          <AlertStatusIcon />
          <Alert.Content>
            <Alert.Title>Over the {MAX_COLOR_RULES}-Rule Limit</Alert.Title>
            <Alert.Description>
              A dataset holds at most {MAX_COLOR_RULES} color rules, and this would leave{' '}
              {composedRuleCount(options, selectedCount, target)}. Deselect some rules or switch to Replace.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {target?.resolved && target.missingColumns.length === 0 && (
        <Alert className='w-full' status='success' variant='transparent'>
          <AlertStatusIcon />
          <Alert.Content>
            <Alert.Title>Schema Matches</Alert.Title>
            <Alert.Description>
              All rule column references exist on the destination
              {swapCount > 0
                ? ` (${swapCount} Beast Mode reference${swapCount === 1 ? '' : 's'} will be remapped to the destination's ids).`
                : '.'}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {target?.resolved && target.missingColumns.length > 0 && (
        <Alert className='w-full' status='warning' variant='transparent'>
          <AlertStatusIcon />
          <Alert.Content>
            <Alert.Title>
              {target.missingColumns.length} Column{target.missingColumns.length === 1 ? '' : 's'} Not on Destination
            </Alert.Title>
            <Alert.Description>
              Rules referencing {target.missingColumns.join(', ')} will be copied as-is and may not render until those
              columns exist.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}
    </>
  );
}

function ColorRulesPreview({ hasItems }) {
  if (!hasItems) return null;
  return (
    <>
      <div className='text-xs font-medium text-muted uppercase'>Choose what to copy</div>
      <p className='text-xs text-muted italic'>
        Rules are grouped by the column they test. Deselect anything you do not want to copy.
      </p>
    </>
  );
}

function columnDisplayName(ref, sourceBeastModes) {
  if (ref === UNKNOWN_COLUMN_REF) return 'Unknown column';
  return sourceBeastModes?.[ref]?.name || ref;
}

function composedRuleCount(options, selectedCount, target) {
  return options.writeMode === 'append' ? (target?.existingRules?.length ?? 0) + selectedCount : selectedCount;
}

function countSelectedRules(selectedIds) {
  let count = 0;
  for (const id of selectedIds) {
    if (String(id).startsWith('rule:')) count += 1;
  }
  return count;
}

function describeFormat(format) {
  const parts = [];
  if (format?.color) parts.push(`Fill ${format.color}`);
  if (format?.textColor) parts.push(`Text ${format.textColor}`);
  if (format?.textStyle && format.textStyle !== 'NONE' && format.textStyle !== 'PLAIN') {
    parts.push(format.textStyle.toLowerCase().replace(/_/g, ' '));
  }
  if (format?.applyToRow) parts.push('applied to the whole row');
  return parts.join(' · ') || 'No formatting';
}

function formatColorRuleLabel(rule, index) {
  const condition = rule?.condition;
  if (!condition) return `Rule ${index + 1}`;
  const operator = OPERATOR_TEXT[condition.operand] || condition.operand || '';
  const values = (condition.values || []).filter((v) => v != null).map(String);
  const rendered =
    (condition.operand === 'BETWEEN' || condition.operand === 'NOT_BETWEEN') && values.length === 2
      ? `${values[0]} and ${values[1]}`
      : values.join(', ');
  return [operator, rendered].filter(Boolean).join(' ') || `Rule ${index + 1}`;
}

function remapRule(rule, swap) {
  const column = rule?.condition?.column;
  if (!column || !swap?.[column]) return rule;
  return { ...rule, condition: { ...rule.condition, column: swap[column] } };
}

/**
 * Resolve each rule's `condition.column` against the destination dataset.
 *
 * Beast Modes (`calculation_<uuid>`) have per-dataset ids, so a source beast
 * mode is name-matched against the destination's and the swap is applied right
 * before the write. `missingColumns` holds friendly names for display, and
 * `missingRefs` the raw refs so rows can be marked.
 */
function resolveColumnRefs(rules, destColumns, sourceBeastModes, destBeastModes) {
  const knownColumns = new Set();
  for (const c of destColumns) {
    if (c.name) knownColumns.add(c.name);
    if (c.id) knownColumns.add(c.id);
  }
  const destBeastModeNameToId = {};
  for (const [id, def] of Object.entries(destBeastModes || {})) {
    if (def?.name) destBeastModeNameToId[def.name] = id;
  }
  const swap = {};
  for (const [srcId, def] of Object.entries(sourceBeastModes || {})) {
    const destId = def?.name && destBeastModeNameToId[def.name];
    if (destId) swap[srcId] = destId;
  }
  const missingColumns = new Set();
  const missingRefs = new Set();
  for (const rule of rules) {
    const ref = rule?.condition?.column;
    if (!ref) continue;
    if (knownColumns.has(ref)) continue;
    if (swap[ref]) continue;
    missingRefs.add(ref);
    missingColumns.add(sourceBeastModes?.[ref]?.name || ref);
  }
  return { missingColumns: [...missingColumns], missingRefs: [...missingRefs], swap };
}

function ruleForItemId(preview, itemId) {
  const id = String(itemId ?? '');
  if (!id.startsWith('rule:')) return null;
  const index = Number(id.slice('rule:'.length));
  return Number.isInteger(index) ? preview.rules[index] : null;
}

function safeCssColor(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return HEX_COLOR_PATTERN.test(trimmed) || NAMED_COLOR_PATTERN.test(trimmed) ? trimmed : null;
}
