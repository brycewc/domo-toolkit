// Shared "drop this column instead of remapping it" policy for Remap Columns and
// Migrate Content. Kept in one place so the two views offer the choice on
// identical terms and warn about it in identical words; when they disagreed, the
// same column was droppable in one and not the other for no reason the user
// could see.

import { isDroppableCardChartType } from '@/services/columnRewriter';

/**
 * The sentence warning that dropping a column also removes output columns from a
 * dataset view, or null when no view is involved. Dropping from a card or an
 * alert edits that one object; dropping from a view narrows the view's schema, so
 * everything reading that view loses the column too. Neither view's scan reaches
 * a downstream view's own consumers, so this states the consequence rather than
 * blocking on it.
 *
 * @param {Array<{dropOutputs?: string[], name?: string, type: string}>} usages - `byColumn` entries from `scanContentForColumns`.
 * @returns {string|null}
 */
export function describeViewOutputDrop(usages) {
  const views = (usages || []).filter((usage) => usage?.type === 'datasets' && usage.dropOutputs?.length > 0);
  if (views.length === 0) return null;
  const outputs = [...new Set(views.flatMap((view) => view.dropOutputs))];
  const columnList = outputs.map((column) => `"${column}"`).join(', ');
  const viewList = views.map((view) => view.name).join(', ');
  return `Also removes ${columnList} from ${viewList}, so anything reading ${
    views.length === 1 ? 'that view' : 'those views'
  } loses ${outputs.length === 1 ? 'that column' : 'those columns'}.`;
}

/**
 * Whether a column can be dropped from the content that uses it rather than
 * remapped onto another column: true only when EVERY usage is one the drop leaves
 * intact.
 *
 * Droppable usages:
 *   - an alert, where the column comes out of the rule's column list;
 *   - a flat-table card or drill, where it comes out of the table (see
 *     `DROPPABLE_CARD_CHART_TYPES`);
 *   - a dataset view that only SELECTS the column, which the scan reports as the
 *     `dropOutputs` removing it would take with it (see
 *     `collectViewDroppableColumns`).
 * Everything else blocks the drop: another chart type, a dataflow, a Beast Mode,
 * a pro-code app, and a view that also filters, joins, groups, or sorts on the
 * column. So does an empty usage list, since there is nothing to drop it from.
 *
 * @param {Array<{dropOutputs?: string[], id: any, type: string}>} usages - `byColumn` entries from `scanContentForColumns`.
 * @param {Map<string, {chartType?: string}>} [cardsById] - Card metadata by id, for the chart-type check.
 * @returns {boolean}
 */
export function isColumnDroppable(usages, cardsById) {
  if (!Array.isArray(usages) || usages.length === 0) return false;
  return usages.every((usage) => {
    if (usage?.type === 'alerts') return true;
    if (usage?.type === 'cards') return isDroppableCardChartType(cardsById?.get(String(usage.id))?.chartType);
    if (usage?.type === 'datasets') return Array.isArray(usage.dropOutputs) && usage.dropOutputs.length > 0;
    return false;
  });
}
