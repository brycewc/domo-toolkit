import { isFusionView, makeItemKey } from './columnReferences';
import { hasEffectiveMapping, rewriteBeastModeColumns } from './columnRewriter';
import { updateDatasetFunctions } from './functions';
import { swapCardInput, swapDataflowInput, swapDatasetViewInput, swapFusionInput } from './migrateDownstreamContent';
import { swapAppColumns } from './proCodeApps';

/**
 * Downstream types remapped in phase 2 (everything except dataset Beast Modes,
 * which are handled in place in phase 1).
 */
const REMAP_TYPES = ['cards', 'datasets', 'dataflows', 'apps'];

/**
 * Rewrite every selected downstream object's references to renamed columns IN
 * PLACE on the same dataset (no dataset-id repoint). This is the single-dataset
 * counterpart to `migrateAllDownstreamContent`: it reuses the same per-type swap
 * executors with `targetId === originId === datasetId` and no Beast Mode id
 * remap, so the executors' dataset-id sweep and Beast Mode repoints are no-ops
 * and only the column-name rewrite takes effect.
 *
 * Dataset Beast Modes can't go through the card/dataset/dataflow swap path (they
 * aren't a downstream input to repoint, they live on the dataset itself), so
 * phase 1 rewrites their formulas directly and saves them via a bulk update.
 * Card-level Beast Modes ride along inside `swapCardInput` (it already rewrites
 * `formulas[].expression`). Nested `DOMO_BEAST_MODE(<id>)` references are
 * untouched because the numeric template ids don't change on the same dataset.
 *
 * @param {Object} params
 * @param {Record<string, string|null>} params.columnMap - old column name -> new column name.
 * @param {string} params.datasetId - The dataset whose downstream content is being repaired.
 * @param {string} [params.datasetName] - Used only for the dataflow version-history comment.
 * @param {Map<string, {definition: Object|null, usedColumns: Set<string>, error?: string}>} params.definitionsByItemKey - Cached definitions from `scanContentForColumns` (its `byItem`).
 * @param {(update: {count: number, result?: Object, status: string, typeKey: string}) => void} [params.onProgress]
 * @param {{ beastModes?: Array, cards?: Array, datasets?: Array, dataflows?: Array }} params.selectedItems
 * @param {number|null} [params.tabId]
 * @param {Record<string, string>} [params.targetColumnTypes] - Map of NEW column name -> type, from the dataset's own current schema. Drives view/fusion type propagation and palette regeneration.
 * @returns {Promise<Map<string, {attempted: Array, count: number, errors: Array, failed: number, manualReview?: Array, succeeded: number}>>}
 */
export async function remapDatasetColumns({
  columnMap,
  datasetId,
  datasetName,
  definitionsByItemKey,
  onProgress,
  selectedItems,
  tabId = null,
  targetColumnTypes
}) {
  const results = new Map();

  // Phase 1: dataset Beast Modes. Independent of phase 2 (cards reference Beast
  // Modes by id, and those ids don't change on the same dataset), but run first
  // so the progress display fills top-to-bottom like the migrate flow.
  await remapBeastModes({
    columnMap,
    definitionsByItemKey,
    onProgress,
    results,
    selectedBeastModes: selectedItems?.beastModes || [],
    tabId
  });

  // Phase 2: cards / datasets / dataflows, in parallel.
  await Promise.allSettled(
    REMAP_TYPES.map(async (typeKey) => {
      const items = selectedItems?.[typeKey] || [];
      const attempted = items.map((i) => ({ id: i.id, name: i.name || String(i.id) }));

      if (items.length === 0) {
        const result = { attempted: [], count: 0, errors: [], failed: 0, manualReview: [], succeeded: 0 };
        results.set(typeKey, result);
        onProgress?.({ count: 0, result, status: 'done', typeKey });
        return;
      }

      onProgress?.({ count: items.length, status: 'transferring', typeKey });

      const errors = [];
      const manualReview = [];
      let succeeded = 0;
      for (const item of items) {
        const resp = await dispatchRemap(typeKey, item, {
          columnMap,
          datasetId,
          datasetName,
          definitionsByItemKey,
          tabId,
          targetColumnTypes
        });
        if (resp?.success) {
          succeeded++;
          // SQL dataflow statements we couldn't safely rewrite (origin SELECT *,
          // etc.). The references the rewriter understood were renamed; the user
          // must fix the flagged statements by hand.
          if (Array.isArray(resp.unhandled) && resp.unhandled.length > 0) {
            manualReview.push({ id: item.id, name: item.name || String(item.id) });
          }
        } else {
          errors.push({ error: resp?.error || 'Unknown error', id: item.id });
        }
      }

      const result = { attempted, count: items.length, errors, failed: errors.length, manualReview, succeeded };
      results.set(typeKey, result);
      onProgress?.({ count: items.length, result, status: 'done', typeKey });
    })
  );

  return results;
}

/**
 * Reduce a (column-rewritten) Beast Mode template to the shape the bulk update
 * accepts. Identity fields (`id`, `legacyId`, `links`, `owner`,
 * `persistedOnDataSource`) are PRESERVED so this updates the existing Beast Mode
 * rather than creating a new one. Volatile metadata and
 * `functionTemplateDependencies` are dropped: Domo derives nesting server-side
 * from the expression, and sending the dependency list makes the bulk write
 * reject a nested Beast Mode.
 */
function buildBeastModeUpdateEntry(template) {
  const entry = JSON.parse(JSON.stringify(template));
  delete entry.checkSum;
  delete entry.created;
  delete entry.functionTemplateDependencies;
  delete entry.lastModified;
  return entry;
}

/**
 * Route one downstream item to its swap executor with `targetId === originId` so
 * the executor rewrites column references but leaves the dataset id alone.
 * Mirrors the migrate `dispatchSwap`/`dispatchDatasetSwap` routing minus the
 * Beast Mode remaps and column-drop options the single-dataset case never needs.
 */
async function dispatchRemap(typeKey, item, { columnMap, datasetId, datasetName, definitionsByItemKey, tabId, targetColumnTypes }) {
  const cached = definitionsByItemKey?.get?.(makeItemKey(typeKey, item.id))?.definition;
  if (typeKey === 'apps') {
    // In-place column repair: origin === target, so the swap rewrites
    // columnName only and leaves the binding's dataset id alone.
    return swapAppColumns({
      app: item,
      columnMap,
      originId: datasetId,
      tabId,
      targetId: datasetId
    });
  }
  if (typeKey === 'cards') {
    return swapCardInput({
      cachedDefinition: cached,
      cardId: item.id,
      columnMap,
      originId: datasetId,
      tabId,
      targetId: datasetId,
      urn: item.urn
    });
  }
  if (typeKey === 'dataflows') {
    // originName names the dataset for the version comment; targetName is null so
    // the comment reads "Remapped <dataset> via Domo Toolkit" rather than a
    // misleading "from X to X" (the input never moved).
    return swapDataflowInput({
      cachedDefinition: cached,
      columnMap,
      dataflowId: item.id,
      originId: datasetId,
      originName: datasetName,
      tabId,
      targetId: datasetId,
      targetName: null
    });
  }
  if (typeKey === 'datasets') {
    // Fusions and template/SQL views are distinct objects with different edit
    // endpoints; a fusion saved through the template-view PUT is rejected. Detect
    // from the scan-cached indexed schema and branch, same as the migrate path.
    if (cached && isFusionView(cached)) {
      return swapFusionInput({
        columnMap,
        fusionId: item.id,
        originId: datasetId,
        tabId,
        targetColumnTypes,
        targetId: datasetId
      });
    }
    return swapDatasetViewInput({
      cachedDefinition: cached,
      columnMap,
      originId: datasetId,
      tabId,
      targetColumnTypes,
      targetId: datasetId,
      viewId: item.id
    });
  }
  return { error: `Unknown remap type ${typeKey}`, success: false };
}

/**
 * Rewrite the column references inside each selected dataset Beast Mode's formula
 * and save them with one bulk update, preserving each Beast Mode's identity
 * (`id`, `legacyId`, `links`) so existing card references keep resolving. Unlike
 * the migrate Beast Mode path there is no create/keep/overwrite/rename choice,
 * no dependency-ordered creation, and no id remap: the Beast Modes stay on the
 * same dataset under the same ids, only their column references change.
 *
 * Writes the `results`/`onProgress` entry for the `beastModes` type in place.
 */
async function remapBeastModes({ columnMap, definitionsByItemKey, onProgress, results, selectedBeastModes, tabId }) {
  const attempted = selectedBeastModes.map((i) => ({ id: i.id, name: i.name || String(i.id) }));

  if (selectedBeastModes.length === 0) {
    const result = { attempted: [], count: 0, errors: [], failed: 0, succeeded: 0 };
    results.set('beastModes', result);
    onProgress?.({ count: 0, result, status: 'done', typeKey: 'beastModes' });
    return;
  }

  onProgress?.({ count: selectedBeastModes.length, status: 'transferring', typeKey: 'beastModes' });

  const errors = [];
  const entries = [];
  for (const bm of selectedBeastModes) {
    const template = definitionsByItemKey?.get?.(makeItemKey('beastModes', bm.id))?.definition;
    if (!template) {
      errors.push({ error: 'Beast Mode definition was not available', id: bm.id });
      continue;
    }
    // Skip Beast Modes whose formula doesn't actually reference a remapped column
    // — re-saving them would be a pointless write.
    if (!hasEffectiveMapping(columnMap)) continue;
    const rewritten = rewriteBeastModeColumns(template, columnMap);
    entries.push(buildBeastModeUpdateEntry(rewritten));
  }

  let succeeded = 0;
  if (entries.length > 0) {
    try {
      await updateDatasetFunctions({ functions: entries, tabId });
      succeeded = entries.length;
    } catch (err) {
      // The bulk update is one call, so a failure fails the whole batch.
      for (const bm of selectedBeastModes) {
        if (!errors.some((e) => e.id === bm.id)) errors.push({ error: err?.message || String(err), id: bm.id });
      }
    }
  }

  const result = { attempted, count: selectedBeastModes.length, errors, failed: errors.length, succeeded };
  results.set('beastModes', result);
  onProgress?.({ count: selectedBeastModes.length, result, status: 'done', typeKey: 'beastModes' });
}
