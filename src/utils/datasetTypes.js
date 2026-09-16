// Details-based dataset predicates: "what kind of dataset is this", answered from
// a `/data/v3/datasources` response. The shape-based family in
// `services/columnReferences.js` answers a different question, "what does this
// definition look like", from a fetched `/schema/indexed` payload.
//
// This module stays import-free so `models/DomoObjectType.js` can use it without
// a cycle through `services/datasets.js`.

/** Type IDs for the four dataset flavors, all backed by the same datasources endpoint. */
export const DATASET_TYPE_IDS = ['DATA_FUSION', 'DATA_MODEL', 'DATA_SOURCE', 'VIEW'];

/**
 * Whether a dataset is a DataFlow's output.
 *
 * Note the casing: the bulk datasources endpoint reports a DataFlow output as
 * `DataFlow` while the single-datasource endpoint reports `dataflow`, so the
 * comparison has to be case-insensitive to work against both.
 * @param {Object} details - A datasource object, or a `metadata.details` object
 * @returns {boolean}
 */
export function isDataflowOutput(details) {
  return details?.type?.toLowerCase() === 'dataflow';
}

/**
 * Whether a dataset is a data model (semantic model)
 * @param {Object} details - A datasource object, or a `metadata.details` object
 * @returns {boolean}
 */
export function isDataModelType(details) {
  return matchesProviderType(details, 'data-model');
}

/**
 * Whether a type ID is one of the dataset flavors
 * @param {string} typeId - A DomoObjectType ID
 * @returns {boolean}
 */
export function isDatasetTypeId(typeId) {
  return DATASET_TYPE_IDS.includes(typeId);
}

/**
 * Whether a dataset is a view
 * @param {Object} details - A datasource object, or a `metadata.details` object
 * @returns {boolean}
 */
export function isDatasetViewType(details) {
  return matchesProviderType(details, 'dataset-view');
}

/**
 * Whether a dataset carries its own definition (a view, a data fusion, or a data
 * model) rather than being loaded from a source or produced by a DataFlow.
 * @param {Object} details - A datasource object, or a `metadata.details` object
 * @returns {boolean}
 */
export function isDerivedDatasetType(details) {
  return isDatasetViewType(details) || isFusionType(details) || isDataModelType(details);
}

/**
 * Whether a dataset is a data fusion
 * @param {Object} details - A datasource object, or a `metadata.details` object
 * @returns {boolean}
 */
export function isFusionType(details) {
  return matchesProviderType(details, 'datafusion');
}

/**
 * Whether a dataset is produced inside Domo by a transform (a DataFlow's output,
 * a view, a fusion, or a data model) rather than loaded from a source.
 * @param {Object} details - A datasource object, or a `metadata.details` object
 * @returns {boolean}
 */
export function isTransformDataset(details) {
  return isDataflowOutput(details) || isDerivedDatasetType(details);
}

/**
 * Whether a dataset is a view or a data fusion. Deliberately excludes data
 * models: callers use this to mean "a definition the view/fusion column
 * rewriting machinery understands", which a data model's is not.
 * @param {Object} details - A datasource object, or a `metadata.details` object
 * @returns {boolean}
 */
export function isViewOrFusionType(details) {
  return isDatasetViewType(details) || isFusionType(details);
}

// The three fields disagree across endpoints, so a flavor is whichever one of
// them names it.
function matchesProviderType(details, providerType) {
  if (!details) return false;
  return details.dataProviderType === providerType || details.displayType === providerType || details.type === providerType;
}
