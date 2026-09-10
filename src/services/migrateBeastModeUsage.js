import { deleteFunction, getFunctionTemplate, updateDatasetFunctions } from './functions';
import { describeSwapFailure, swapCardInput } from './migrateDownstreamContent';

/** Content types repointed by this view, in the order their progress fills. */
export const MIGRATE_BEAST_MODE_TYPES = [{ key: 'beastModes' }, { key: 'cards' }];

/**
 * Repoint everything that uses one Beast Mode onto another Beast Mode saved to
 * the same dataset, then optionally delete the original.
 *
 * This is the single-Beast-Mode counterpart to `remapDatasetColumns`: it drives
 * the shared card executor with `targetId === originId === datasetId`, so that
 * executor's dataset-id sweep is a no-op and only the Beast Mode remaps take
 * effect. Nothing is created and no id changes, so the two phases are
 * independent; Beast Modes run first only so progress fills top-to-bottom like
 * the migrate and remap flows.
 *
 * Cards reference a dataset Beast Mode by `legacyId`, so a card-saved origin
 * cannot be repointed that way: its definition lives inside its own card, and
 * `swapCardInput`'s `cardBeastModeResolutions` is the path that drops the
 * card-level copy and repoints its references onto a dataset Beast Mode.
 *
 * @param {Object} params
 * @param {string} params.datasetId - The dataset both Beast Modes read; passed as both origin and target.
 * @param {boolean} [params.deleteOrigin] - Delete the origin once nothing references it. Only honored when every discovered usage was selected, every write succeeded, and no unmappable usage remains.
 * @param {boolean} [params.hasUnmappableUsage] - The origin has active links this tool can't repoint, so it can never become unused.
 * @param {(update: {completed: number, total: number}) => void} [params.onItemProgress] - Fired as individual items land, for a "12/29 items" style readout. Cards report one at a time because each is its own PUT; the nesting Beast Modes report as one batch, since Domo takes them in a single bulk write.
 * @param {(update: {count: number, result?: Object, status: string, typeKey: string}) => void} [params.onProgress] - Per-type, for the list's group rows.
 * @param {{id: any, legacyId: string|null, name: string, savedOn: Object|null}} params.origin
 * @param {Array<{id: any, isDrill?: boolean, name: string, urn?: string|null}>} params.selectedCards - Cards and drills to rewrite, including the owner card of any card-saved Beast Mode that nests the origin.
 * @param {Array<{id: any, name: string, template: Object|null}>} params.selectedNestingBeastModes - DATASET-saved nesting parents only; card-saved ones ride along in `selectedCards`.
 * @param {boolean} [params.selectionIsComplete] - Every discovered usage is in the selection.
 * @param {number|null} [params.tabId]
 * @param {{id: any, legacyId: string|null, name: string}} params.target
 * @returns {Promise<{
 *   originDelete: {attempted: boolean, error: string|null, skipReason: string|null, succeeded: boolean},
 *   results: Map<string, {attempted: Array, count: number, errors: Array, failed: number, succeeded: number}>
 * }>}
 */
export async function migrateBeastModeUsage({
  datasetId,
  deleteOrigin = false,
  hasUnmappableUsage = false,
  onItemProgress,
  onProgress,
  origin,
  selectedCards = [],
  selectedNestingBeastModes = [],
  selectionIsComplete = false,
  tabId = null,
  target
}) {
  const results = new Map();
  const numericRemap = { [String(origin.id)]: String(target.id) };

  // One shared counter across both phases, so the readout is a single
  // "N of M items" rather than a per-phase reset. A failed item still counts as
  // handled: the tally tracks work done, and the failures surface separately.
  const total = selectedCards.length + selectedNestingBeastModes.length;
  let completed = 0;
  const reportItems = (n) => {
    completed += n;
    onItemProgress?.({ completed, total });
  };

  onItemProgress?.({ completed: 0, total });

  await repointNestingBeastModes({
    numericRemap,
    onProgress,
    reportItems,
    results,
    selectedBeastModes: selectedNestingBeastModes,
    tabId
  });

  await repointCards({
    datasetId,
    numericRemap,
    onProgress,
    origin,
    reportItems,
    results,
    selectedCards,
    tabId,
    target
  });

  return {
    originDelete: await deleteOriginIfUnused({
      deleteOrigin,
      hasUnmappableUsage,
      origin,
      results,
      selectionIsComplete,
      tabId
    }),
    results
  };
}

/**
 * Reduce a nesting Beast Mode's template to an update entry whose only change is
 * the `DOMO_BEAST_MODE(<id>)` reference it nests.
 *
 * Identity fields (`id`, `legacyId`, `links`, `owner`, `persistedOnDataSource`)
 * are PRESERVED so this updates the existing Beast Mode rather than creating
 * one, keeping every card that references IT resolving. `links` go back as Domo
 * stored them: Domo rejects an update that changes them ("Function links cannot
 * be updated using the update template endpoint"), and a parent's links name its
 * own parents rather than the child being swapped, so they are genuinely
 * unchanged. `functionTemplateDependencies` is dropped rather than remapped
 * because Domo derives nesting server-side from the expression and sending the
 * list makes the bulk write reject a nested Beast Mode.
 *
 * Deliberately not `remapNestedBeastModeIds`, which also rewrites the dependency
 * list and the `FUNCTION_TEMPLATE` links: the two fields this endpoint won't
 * take.
 */
function buildNestingUpdateEntry(template, numericRemap) {
  const entry = JSON.parse(JSON.stringify(template));
  delete entry.checkSum;
  delete entry.created;
  delete entry.functionTemplateDependencies;
  delete entry.lastModified;
  if (typeof entry.expression === 'string') {
    entry.expression = entry.expression.replace(/DOMO_BEAST_MODE\(\s*(\d+)\s*\)/g, (match, id) =>
      numericRemap[id] ? `DOMO_BEAST_MODE(${numericRemap[id]})` : match
    );
  }
  return entry;
}

/**
 * Delete the origin once the repoint has left nothing referencing it. Refuses on
 * anything short of a clean sweep: a partial failure or a partial selection
 * means something still points at it, and Domo deletes a referenced Beast Mode
 * without complaint, breaking those cards silently.
 */
async function deleteOriginIfUnused({ deleteOrigin, hasUnmappableUsage, origin, results, selectionIsComplete, tabId }) {
  const idle = { attempted: false, error: null, skipReason: null, succeeded: false };
  if (!deleteOrigin) return idle;

  const failed = [...results.values()].reduce((sum, r) => sum + r.failed, 0);
  if (failed > 0) {
    return { ...idle, skipReason: 'something still uses it because part of the repoint failed' };
  }
  if (!selectionIsComplete) {
    return { ...idle, skipReason: 'some of what uses it was left out of the selection' };
  }
  if (hasUnmappableUsage) {
    return { ...idle, skipReason: "usage this tool can't repoint still references it" };
  }

  try {
    await deleteFunction({ functionId: origin.id, tabId });
    return { attempted: true, error: null, skipReason: null, succeeded: true };
  } catch (err) {
    return { attempted: true, error: err?.message || String(err), skipReason: null, succeeded: false };
  }
}

/**
 * Translate a Beast Mode bulk-update rejection into something actionable, or
 * pass it through unchanged.
 *
 * Two translated cases. `ILLEGAL_DEPTH`: Domo allows a Beast Mode to nest
 * another but not one that itself nests a third, so repointing a nesting Beast
 * Mode onto a target that already nests something makes it two levels deep. The
 * links rejection: Domo won't let this endpoint change a template's nesting at
 * all, which no payload of ours can work around.
 */
function describeBeastModeUpdateError(err) {
  const message = err?.message || String(err);
  if (message.includes('ILLEGAL_DEPTH')) {
    return (
      'Domo allows only one level of Beast Mode nesting, and the Beast Mode being pointed to already nests ' +
      'another. Pick a target that does not nest another Beast Mode.'
    );
  }
  if (message.includes('Function links cannot be updated')) {
    return "Domo would not change this Beast Mode's nesting. Edit its formula in Domo to reference the new Beast Mode.";
  }
  return message;
}

/**
 * Rewrite each selected card's references from the origin Beast Mode onto the
 * target, one PUT per card so a card that both uses the origin directly and
 * hosts a Beast Mode nesting it is fixed in a single write.
 *
 * A dataset-saved origin is repointed by `legacyId` (a `calculation_<uuid>`, so
 * the executor's whole-JSON sweep is collision-safe). A card-saved origin is
 * repointed by a `useTarget` resolution instead, which also drops its card-level
 * copy. `numericRemap` rides along either way for card-level formulas that nest
 * the origin.
 *
 * Writes the `results`/`onProgress` entry for the `cards` type in place.
 */
async function repointCards({
  datasetId,
  numericRemap,
  onProgress,
  origin,
  reportItems,
  results,
  selectedCards,
  tabId,
  target
}) {
  if (selectedCards.length === 0) return;

  const attempted = selectedCards.map((c) => ({ id: c.id, name: c.name || String(c.id) }));
  onProgress?.({ count: selectedCards.length, status: 'transferring', typeKey: 'cards' });

  const isCardSavedOrigin = Boolean(origin.savedOn);
  const beastModeIdRemap =
    !isCardSavedOrigin && origin.legacyId && target.legacyId ? { [origin.legacyId]: target.legacyId } : undefined;
  const cardBeastModeResolutions =
    isCardSavedOrigin && origin.legacyId && target.legacyId
      ? [
          {
            disposition: 'useTarget',
            originLegacyId: origin.legacyId,
            originTemplateId: origin.id,
            targetLegacyId: target.legacyId,
            targetTemplateId: target.id
          }
        ]
      : undefined;

  const errors = [];
  let succeeded = 0;
  for (const card of selectedCards) {
    const resp = await swapCardInput({
      beastModeIdRemap,
      beastModeNumericRemap: numericRemap,
      cardBeastModeResolutions,
      cardId: card.id,
      originId: datasetId,
      tabId,
      targetId: datasetId,
      urn: card.urn
    });
    if (resp?.success) succeeded++;
    else errors.push({ error: describeSwapFailure(resp), id: card.id });
    reportItems?.(1);
  }

  const result = { attempted, count: selectedCards.length, errors, failed: errors.length, succeeded };
  results.set('cards', result);
  onProgress?.({ count: selectedCards.length, result, status: 'done', typeKey: 'cards' });
}

/**
 * Repoint each selected dataset-saved Beast Mode that nests the origin so it
 * nests the target instead, saved with one bulk update.
 *
 * Writes the `results`/`onProgress` entry for the `beastModes` type in place.
 */
async function repointNestingBeastModes({ numericRemap, onProgress, reportItems, results, selectedBeastModes, tabId }) {
  if (selectedBeastModes.length === 0) return;

  const attempted = selectedBeastModes.map((bm) => ({ id: bm.id, name: bm.name || String(bm.id) }));
  onProgress?.({ count: selectedBeastModes.length, status: 'transferring', typeKey: 'beastModes' });

  const errors = [];
  const entries = [];
  for (const bm of selectedBeastModes) {
    try {
      // A definition that didn't come back is this Beast Mode's failure alone,
      // reported and skipped rather than failing the others with it.
      const template = bm.template || (await getFunctionTemplate(bm.id, tabId));
      if (!template) {
        errors.push({ error: `Could not read the formula of "${bm.name || bm.id}"`, id: bm.id });
        continue;
      }
      entries.push(buildNestingUpdateEntry(template, numericRemap));
    } catch (err) {
      errors.push({ error: err?.message || String(err), id: bm.id });
    }
  }

  let succeeded = 0;
  if (entries.length > 0) {
    try {
      await updateDatasetFunctions({ functions: entries, tabId });
      succeeded = entries.length;
    } catch (err) {
      // The bulk update is one call, so a failure fails the whole batch.
      const error = describeBeastModeUpdateError(err);
      for (const bm of selectedBeastModes) {
        if (!errors.some((e) => e.id === bm.id)) errors.push({ error, id: bm.id });
      }
    }
  }

  // Reported as one batch: Domo takes the whole set in a single bulk write, so
  // there is no per-Beast-Mode moment to report.
  reportItems?.(selectedBeastModes.length);

  const result = { attempted, count: selectedBeastModes.length, errors, failed: errors.length, succeeded };
  results.set('beastModes', result);
  onProgress?.({ count: selectedBeastModes.length, result, status: 'done', typeKey: 'beastModes' });
}
