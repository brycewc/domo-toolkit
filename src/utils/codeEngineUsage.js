import { DataListItem } from '@/models/DataListItem';
import { DomoObject } from '@/models/DomoObject';
import { withCanonicalGroups } from '@/utils/dataListGroups';

export const ACTIVE_CHIP = { color: 'success', label: 'Active' };

export const INACTIVE_CHIP = { color: 'danger', label: 'Inactive' };

// The workflow endpoint returns a row per model version, so its totals count
// versions rather than workflows. Shared by the group subtext and the header.
export const USAGE_NOUNS = { designs: 'app design', instances: 'custom app', workflows: 'workflow version' };

/**
 * Build the three Code Engine usage groups, applying the client-side version filter.
 *
 * Only workflows carry a version, so only they can be filtered. Domo records no
 * version for a design or an app instance, and dropping those would wrongly
 * report them as not using the version, so they stay listed under every version
 * with a note saying why.
 *
 * @param {Object} params
 * @param {Map<string, Set<string>>} params.activeByModel - Live versions per workflow model
 * @param {Object} params.designs - Usage result for app designs
 * @param {string|null} params.filterToVersion - Package version to narrow to, or null for all
 * @param {Object} params.instances - Usage result for deployed app instances
 * @param {string} params.origin - The instance origin (https://<instance>.domo.com)
 * @param {Object<string, string>} params.ownerNames - userId -> display name
 * @param {Object} params.workflows - Usage result for workflows
 * @returns {{counts: Object, items: DataListItem[]}} Group rows and their per-kind totals
 */
export function buildUsageItems({
  activeByModel,
  activeOnly = false,
  designs,
  filterToVersion,
  instances,
  origin,
  ownerNames,
  workflows
}) {
  const counts = {};
  const hidden = {};
  const items = [];
  const versionlessNote = filterToVersion ? NO_VERSION_NOTE : null;

  const workflowRows = buildWorkflowRows({
    activeByModel,
    activeOnly,
    filterToVersion,
    origin,
    ownerNames,
    usage: workflows
  });
  const designRows = buildSimpleRows({
    annotation: versionlessNote,
    origin,
    ownerNames,
    typeId: 'RYUU_APP',
    usage: designs
  });
  const instanceRows = buildSimpleRows({
    annotation: versionlessNote,
    origin,
    ownerNames,
    typeId: 'RYUU_INSTANCE',
    usage: instances
  });

  for (const [id, key, label, rows, result, isVersioned] of [
    ['designs_group', 'designs', 'Custom App Designs', designRows, designs, false],
    ['instances_group', 'instances', 'Custom Apps', instanceRows, instances, false],
    ['workflows_group', 'workflows', 'Workflows', workflowRows, workflows, true]
  ]) {
    if (!result.totalCount && !result.error) continue;
    // A filter that applies narrows the count to what's visible; otherwise
    // totalCount is the honest answer, since it includes rows nulled out by
    // permissions that never become children.
    const isNarrowed = Boolean(filterToVersion || activeOnly) && isVersioned;
    const count = isNarrowed ? countObjects(rows) : result.totalCount;
    counts[key] = count;
    hidden[key] = result.privateCount || 0;
    items.push(
      DataListItem.createGroup({
        annotation: result.privateCount ? hiddenNote(result.privateCount, isNarrowed) : null,
        children: rows,
        childTypeId: USAGE_GROUPS.find((group) => group.id === id).childTypeId,
        count,
        // The workflow group counts versions while its label names workflows, so
        // only it spells the unit out. The unreadable tally rides along too,
        // which is why a count can outrun the rows beneath it; a narrowed count
        // omits it rather than pairing two different denominators in one badge.
        countLabel: groupCountLabel({
          count,
          privateCount: isNarrowed ? 0 : result.privateCount,
          unit: isVersioned ? 'version' : null
        }),
        error: result.error,
        id,
        label,
        status: result.error ? 'error' : undefined
      })
    );
  }

  return { counts, hidden, items: withCanonicalGroups(items, USAGE_GROUPS) };
}

const NO_LINK_NOTE = 'No card shows this app, so there is nowhere to open it.';

const NO_VERSION_NOTE = "Domo doesn't record which package version this uses, so it is listed under every version.";

// Rendered order comes from DataList's alphabetical sort, so this matches it.
const USAGE_GROUPS = [
  { childTypeId: 'RYUU_APP', id: 'designs_group', label: 'Custom App Designs' },
  { childTypeId: 'RYUU_INSTANCE', id: 'instances_group', label: 'Custom Apps' },
  { childTypeId: 'WORKFLOW_MODEL', id: 'workflows_group', label: 'Workflows' }
];

/**
 * Rows for a usage kind that maps one item to one object (designs, app instances).
 * Rows whose `entityId` is null are consumers the caller can't read; they are
 * dropped here and reported through the group's count and metadata instead.
 * @param {Object} params
 * @returns {DataListItem[]}
 */
function buildSimpleRows({ annotation = null, origin, ownerNames, typeId, usage }) {
  return usage.items
    .filter((item) => item.entityId)
    .map((item) => {
      const label = item.name || `${typeId === 'RYUU_APP' ? 'Design' : 'App'} ${item.entityId}`;
      const domoObject = new DomoObject(typeId, item.entityId, origin, { name: label });
      // A deployed instance has no page of its own, so the endpoint hands back a
      // card link instead; it is null when no card references the instance.
      if (!domoObject.url && item.link) domoObject.url = item.link;
      return new DataListItem({
        annotation: annotation ?? (domoObject.url ? null : NO_LINK_NOTE),
        domoObject,
        id: item.entityId,
        label,
        metadata: rowMetadata({ id: item.entityId, ownerId: item.owner, ownerNames, version: item.version }),
        typeId,
        url: domoObject.url
      });
    });
}

/**
 * Workflow rows, grouped by model with the referencing versions nested beneath.
 * Each inactive version is chipped, and so is a model with no active version at
 * all, so the "nothing running uses this" case reads without expanding.
 * @param {Object} params
 * @returns {DataListItem[]}
 */
function buildWorkflowRows({ activeByModel, activeOnly, filterToVersion, origin, ownerNames, usage }) {
  const byModel = new Map();
  for (const item of usage.items) {
    if (!item.entityId) continue;
    if (filterToVersion && item.version !== filterToVersion) continue;
    let entry = byModel.get(item.entityId);
    if (!entry) {
      entry = { name: item.name, owner: item.owner, versions: [] };
      byModel.set(item.entityId, entry);
    }
    if (item.version && !entry.versions.includes(item.version)) entry.versions.push(item.version);
  }

  return [...byModel.entries()].reduce((rows, [modelId, entry]) => {
    const label = entry.name || `Workflow ${modelId}`;
    // null when the version lookup failed, which leaves deployment unmarked
    // rather than asserting a version is undeployed on missing data.
    const activeVersions = activeByModel.get(modelId) ?? null;
    const versionRows = entry.versions
      // Three states, not two: an unreadable model leaves deployment unknown, so
      // an unchipped row says so rather than claiming the version is inactive,
      // and the active-only filter keeps it rather than hiding what it can't verify.
      .map((version) => ({ isActive: activeVersions ? activeVersions.has(String(version)) : null, version }))
      .filter(({ isActive }) => !activeOnly || isActive !== false)
      .map(({ isActive, version }) => {
        const versionObject = new DomoObject('WORKFLOW_MODEL_VERSION', version, origin, { name: version }, null, modelId);
        return new DataListItem({
          chip: isActive === null ? null : isActive ? ACTIVE_CHIP : INACTIVE_CHIP,
          domoObject: versionObject,
          id: `${modelId}-${version}`,
          label: version,
          metadata: `Version ${version}`,
          muted: isActive === false,
          originalId: version,
          typeId: 'WORKFLOW_MODEL_VERSION',
          url: versionObject.url
        });
      });

    // Under the active-only filter a model whose versions all dropped out is not
    // usage the user asked to see, and a childless row would read as a workflow
    // using the package with nothing under it.
    if (activeOnly && versionRows.length === 0) return rows;

    // Only the all-inactive case chips the model: it is the one worth spotting
    // while collapsed, and an Active chip on nearly every model would be noise.
    const noneActive =
      activeVersions && entry.versions.length > 0 && entry.versions.every((version) => !activeVersions.has(String(version)));
    const modelObject = new DomoObject('WORKFLOW_MODEL', modelId, origin, { name: label });

    rows.push(
      new DataListItem({
        children: versionRows.length > 0 ? versionRows : undefined,
        chip: noneActive ? INACTIVE_CHIP : null,
        // Bare count: the group header already says these are versions, and the
        // rows are tight once an Active/Inactive chip lands beside the count.
        count: versionRows.length > 0 ? versionRows.length : undefined,
        domoObject: modelObject,
        id: modelId,
        label,
        metadata: rowMetadata({ id: modelId, ownerId: entry.owner, ownerNames }),
        // Newest version first: it is the one most likely still deployed.
        sortChildrenDescending: true,
        typeId: 'WORKFLOW_MODEL',
        url: modelObject.url
      })
    );
    return rows;
  }, []);
}

/**
 * Total objects a set of rows represents, counting a workflow model's nested
 * versions rather than the model row itself.
 * @param {DataListItem[]} rows
 * @returns {number}
 */
function countObjects(rows) {
  return rows.reduce((total, row) => total + (row.children?.length || 1), 0);
}

/**
 * The text after a group's count, e.g. `versions, 269 hidden`. Null when there
 * is nothing to add, leaving a bare `(4)`.
 * @param {Object} params
 * @returns {string|null}
 */
function groupCountLabel({ count, privateCount, unit }) {
  const parts = [];
  if (unit) parts.push(`${unit}${count === 1 ? '' : 's'}`);
  if (privateCount) parts.push(`${privateCount} hidden`);
  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * Explains a group count that outruns the rows beneath it. A narrowed group says
 * so explicitly, since the unreadable rows hide their version too and therefore
 * can't be matched against the filter either way.
 * @param {number} privateCount
 * @param {boolean} isNarrowed
 * @returns {string}
 */
function hiddenNote(privateCount, isNarrowed) {
  const subject = privateCount === 1 ? 'one' : privateCount;
  const verb = privateCount === 1 ? 'it is' : 'they are';
  if (isNarrowed) {
    return `${subject} more use this package, but you don't have permission to see ${privateCount === 1 ? 'it' : 'them'} or which version ${privateCount === 1 ? 'it uses' : 'they use'}.`;
  }
  return `You don't have permission to see ${subject} of these, so ${verb} not listed.`;
}

/**
 * A row's secondary line: its id, the package version it references, and its owner.
 * @param {Object} params
 * @returns {string}
 */
function rowMetadata({ id, ownerId, ownerNames, version = null }) {
  return [`ID: ${id}`, version ? `Version ${version}` : null, ownerNames?.[ownerId] || null].filter(Boolean).join(' · ');
}
