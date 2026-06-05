/**
 * Accessors and the reconciliation transform for Code Engine tiles inside a
 * Domo workflow definition. This is the single place that encodes the concrete
 * JSON shape of a workflow definition (verified against a live workflow):
 *
 *   definition = { version, designElements[], dataList[], schema }
 *   - dataList[]: workflow variable table. Each variable:
 *       { id, paramName, dataType, isList, children, showChildren,
 *         entitySubType, value, isOutput }
 *   - a nebulaFunction designElement's data.input[] / data.output[] are the
 *     tile's bound params. Each param:
 *       { id, paramName, displayName, dataType, isList, entitySubType, children,
 *         value, mappedTo, required, flag, visible, ... }
 *     `mappedTo` is the id of a dataList variable (the binding). When null, the
 *     param uses the literal `value`. A param maps to the SAME variable id that
 *     downstream tiles read, so renaming a function param only requires keeping
 *     `mappedTo` pointed at that id; downstream consumers are untouched.
 *
 * The Code Engine manifest joins to a tile param by name: manifest `name` ->
 * `paramName`, `type` -> `dataType`, `nullable` -> inverse of `required`.
 */

/**
 * Read the binding of a tile param: a variable mapping or a literal value.
 * @param {Object} param
 * @returns {{ variableId: string }|{ value: * }}
 */
export function getBinding(param) {
  if (param?.mappedTo != null) return { variableId: param.mappedTo };
  return { value: param?.value ?? null };
}

/**
 * Read a tile's params for a given flag.
 * @param {Object} element - A designElement.
 * @param {'input'|'output'} flag
 * @returns {Object[]}
 */
export function getTileParams(element, flag) {
  return element?.data?.[flag] || [];
}

/**
 * Find every tile param across the whole definition that maps to a given
 * variable. This is the blast radius of changing that variable's type.
 * @param {Object} definition
 * @param {string} variableId
 * @returns {Array<{ elementId: string, flag: string, paramName: string, title: string }>}
 */
export function getVariableConsumers(definition, variableId) {
  const consumers = [];
  if (!variableId) return consumers;
  for (const el of definition?.designElements || []) {
    for (const flag of ['input', 'output']) {
      for (const param of el?.data?.[flag] || []) {
        if (param.mappedTo === variableId) {
          consumers.push({ elementId: el.id, flag, paramName: param.paramName, title: el.data?.title });
        }
      }
    }
  }
  return consumers;
}

/**
 * Read the workflow variable table.
 * @param {Object} definition
 * @returns {Object[]}
 */
export function getWorkflowVariables(definition) {
  return definition?.dataList || [];
}

/**
 * Whether a param carries a binding, either a variable mapping or a literal
 * value (false/0/'' count as real literal bindings; only null/undefined do not).
 * @param {Object} param
 * @returns {boolean}
 */
export function hasBinding(param) {
  return param?.mappedTo != null || (param?.value !== null && param?.value !== undefined);
}

/**
 * Rebuild a tile's input/output param arrays to match a new function manifest,
 * preserving bindings wherever possible. Pure with respect to the caller: it
 * mutates the passed (already-cloned) `element` and `definition` and returns a
 * report of what it did. A no-op when there are no contract changes.
 *
 * @param {Object} params
 * @param {Object} [params.choices] - User reconciliation choices:
 *   { addOutputs: string[], inputRemap: Record<oldName, newName|'drop'|'unset'>,
 *     updateVariableTypes: Record<variableId, boolean> }.
 * @param {Object} params.classified - Result of classifyContractChanges.
 * @param {Object} params.definition - The (cloned) workflow definition.
 * @param {Object} params.element - The (cloned) nebulaFunction designElement.
 * @param {Object} params.newFn - The target version's function manifest.
 * @returns {Object} report
 */
export function reconcileTileForVersionBump({ choices = {}, classified, definition, element, newFn }) {
  const report = {
    addedInputs: [],
    addedOutputs: [],
    droppedBindings: [],
    remappedInputs: [],
    renamedParams: [],
    typeChanges: [],
    unmappedRequiredInputs: []
  };
  if (!classified || !classified.hasChanges || classified.functionDeleted || !newFn) {
    return report;
  }

  element.data.input = reconcileFlagParams({
    choices,
    classified: classified.inputs,
    definition,
    existingParams: element.data.input,
    flag: 'input',
    manifestEntries: Array.isArray(newFn.inputs) ? newFn.inputs : [],
    report
  });
  element.data.output = reconcileFlagParams({
    choices,
    classified: classified.outputs,
    definition,
    existingParams: element.data.output,
    flag: 'output',
    manifestEntries: newFn.output ? [newFn.output] : [],
    report
  });

  return report;
}

function buildParamFromManifest(entry, flag) {
  return {
    aiDescription: null,
    children: Array.isArray(entry.children) ? entry.children : [],
    configType: null,
    customMappingType: null,
    dataType: entry.type ?? null,
    displayName: entry.displayName ?? entry.name,
    entitySubType: entry.entitySubType ?? null,
    flag,
    id: generateTileId(),
    isList: entry.isList ?? false,
    mappedTo: null,
    paramName: entry.name,
    required: entry.nullable === false,
    value: entry.value ?? null,
    visible: true
  };
}

function createOutputVariable(definition, entry) {
  const variable = {
    children: Array.isArray(entry.children) ? entry.children : [],
    dataType: entry.type ?? null,
    entitySubType: entry.entitySubType ?? null,
    id: generateTileId(),
    isList: entry.isList ?? false,
    isOutput: true,
    paramName: entry.name,
    showChildren: false,
    value: null
  };
  if (!Array.isArray(definition.dataList)) definition.dataList = [];
  definition.dataList.push(variable);
  return variable.id;
}

function generateTileId() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(15));
  let id = '';
  for (let i = 0; i < bytes.length; i++) id += alphabet[bytes[i] % alphabet.length];
  return id;
}

function reconcileFlagParams({ choices, classified, definition, existingParams, flag, manifestEntries, report }) {
  const existing = Array.isArray(existingParams) ? existingParams : [];
  const existingByName = new Map(existing.map((p) => [p.paramName, p]));
  const inputRemap = choices.inputRemap || {};

  // new paramName -> existing param whose binding it should inherit.
  const sourceByNewName = new Map();

  // Carry over bindings for params kept under the same name.
  for (const entry of manifestEntries) {
    if (existingByName.has(entry.name)) sourceByNewName.set(entry.name, existingByName.get(entry.name));
  }
  // Auto-detected renames re-point the old binding onto the new name.
  for (const r of classified.renamed) {
    const src = existingByName.get(r.from);
    if (src) {
      sourceByNewName.set(r.to, src);
      report.renamedParams.push({ flag, from: r.from, to: r.to });
    }
  }
  // User-chosen remaps for removed/ambiguous inputs.
  for (const [oldName, target] of Object.entries(inputRemap)) {
    const src = existingByName.get(oldName);
    if (!src) continue;
    if (target === 'drop' || target === 'unset') {
      report.droppedBindings.push({ flag, paramName: oldName });
      continue;
    }
    sourceByNewName.set(target, src);
    report.remappedInputs.push({ from: oldName, to: target });
  }

  const result = manifestEntries.map((entry) => {
    const param = buildParamFromManifest(entry, flag);
    const src = sourceByNewName.get(entry.name);
    if (src) {
      param.aiDescription = src.aiDescription ?? null;
      param.configType = src.configType ?? null;
      param.customMappingType = src.customMappingType ?? null;
      param.id = src.id;
      param.mappedTo = src.mappedTo ?? null;
      param.value = src.value ?? null;
      param.visible = src.visible ?? true;
      // A type change against a still-bound variable is the one case that can
      // break a workflow: the variable keeps its old dataType. Surface it, and
      // update the variable's type only when the user opted in.
      if (src.mappedTo && classified.typeChanged.some((t) => t.name === entry.name)) {
        report.typeChanges.push({
          dataType: entry.type ?? null,
          flag,
          paramName: entry.name,
          variableId: src.mappedTo
        });
        if (choices.updateVariableTypes?.[src.mappedTo]) {
          setVariableType(definition, src.mappedTo, {
            dataType: entry.type ?? null,
            entitySubType: entry.entitySubType ?? null,
            isList: entry.isList ?? false
          });
        }
      }
      return param;
    }
    if (classified.added.some((a) => a.name === entry.name)) {
      if (flag === 'output' && (choices.addOutputs || []).includes(entry.name)) {
        param.mappedTo = createOutputVariable(definition, entry);
        report.addedOutputs.push({ mapped: true, paramName: entry.name });
      } else if (flag === 'output') {
        report.addedOutputs.push({ mapped: false, paramName: entry.name });
      } else {
        report.addedInputs.push({ paramName: entry.name });
        if (param.required) report.unmappedRequiredInputs.push({ paramName: entry.name });
      }
    }
    return param;
  });

  // Removed params that had a binding the user did not remap: note the drop so
  // the summary can warn that downstream readers of that variable lose a writer.
  for (const removed of classified.removed) {
    const src = existingByName.get(removed.name);
    if (src && hasBinding(src) && inputRemap[removed.name] == null) {
      report.droppedBindings.push({ flag, paramName: removed.name });
    }
  }

  return result;
}

function setVariableType(definition, variableId, { dataType, entitySubType, isList }) {
  const variable = (definition?.dataList || []).find((v) => v.id === variableId);
  if (!variable) return false;
  if (dataType !== undefined) variable.dataType = dataType;
  if (entitySubType !== undefined) variable.entitySubType = entitySubType;
  if (isList !== undefined) variable.isList = isList;
  return true;
}
