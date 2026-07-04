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
 * Index every workflow variable AND its nested descendants by id, mapping each to
 * its node and its dotted name path (e.g. `employee.last_day_of_work`). A tile
 * param can bind to a nested field of an object variable, whose id looks like
 * `varId.childId[.grandchildId]` and is absent from the flat dataList. A plain
 * dataList lookup misses it, so callers fall back to showing the raw id and cannot
 * compare the bound field's type. Walking the tree fixes both.
 * @param {Object} definition
 * @returns {Map<string, { node: Object, path: string }>}
 */
export function indexVariablesById(definition) {
  const index = new Map();
  const walk = (node, prefix) => {
    if (!node) return;
    const path = prefix ? `${prefix}.${node.paramName}` : node.paramName;
    if (node.id) index.set(node.id, { node, path });
    for (const child of node.children || []) walk(child, path);
  };
  for (const variable of getWorkflowVariables(definition)) walk(variable, '');
  return index;
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
 *     updateVariableTypes: Record<variableId, boolean>,
 *     updateVariableSchemas: Record<variableId, boolean> }.
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
    schemaChanges: [],
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
  const id = generateTileId();
  return {
    aiDescription: null,
    children: manifestChildrenToParamChildren(entry.children, flag, id),
    configType: null,
    customMappingType: null,
    dataType: entry.type ?? null,
    displayName: entry.displayName ?? entry.name,
    entitySubType: entry.entitySubType ?? null,
    flag,
    id,
    isList: entry.isList ?? false,
    mappedTo: null,
    paramName: entry.name,
    required: entry.nullable === false,
    value: entry.value ?? null,
    visible: true
  };
}

function createOutputVariable(definition, entry) {
  const id = generateTileId();
  const variable = {
    children: manifestChildrenToVariableChildren(entry.children, id),
    dataType: entry.type ?? null,
    entitySubType: entry.entitySubType ?? null,
    id,
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

/**
 * Convert Code Engine manifest child nodes ({ name, type, nullable, children })
 * into the tile-param shape a workflow expects for a nested field ({ id,
 * paramName, dataType, required, flag, children, ... }). Child ids are namespaced
 * under the parent's id (`parentId.suffix`), matching how Domo composes them, and
 * `mappedTo` is left null since a freshly built field has no binding yet. Recurses
 * so an object-of-objects keeps its full shape. Copying the raw manifest children
 * instead is what made the workflow save reject the definition.
 * @param {Object[]|undefined} children - Manifest child entries.
 * @param {'input'|'output'} flag
 * @param {string} parentId - The id of the param these children hang off.
 * @returns {Object[]}
 */
function manifestChildrenToParamChildren(children, flag, parentId) {
  if (!Array.isArray(children)) return [];
  return children.map((entry) => {
    const id = `${parentId}.${generateTileId()}`;
    return {
      aiDescription: null,
      children: manifestChildrenToParamChildren(entry.children, flag, id),
      configType: null,
      customMappingType: null,
      dataType: entry.type ?? null,
      displayName: entry.displayName ?? entry.name,
      entitySubType: entry.entitySubType ?? null,
      flag,
      id,
      isList: entry.isList ?? false,
      mappedTo: null,
      paramName: entry.name,
      required: entry.nullable === false,
      value: entry.value ?? null,
      visible: true
    };
  });
}

/**
 * Convert Code Engine manifest child nodes into the workflow-variable shape a
 * dataList entry expects for a nested field ({ id, paramName, dataType,
 * showChildren, isOutput, children, ... }). Like the param variant, child ids are
 * namespaced under the parent variable's id. A variable requires a non-null `id`,
 * so writing the raw manifest children (which carry `name` but no `id`) is what
 * made the save fail with a missing-id parse error.
 * @param {Object[]|undefined} children - Manifest child entries.
 * @param {string} parentId - The id of the variable these children hang off.
 * @returns {Object[]}
 */
function manifestChildrenToVariableChildren(children, parentId) {
  if (!Array.isArray(children)) return [];
  return children.map((entry) => {
    const id = `${parentId}.${generateTileId()}`;
    return {
      children: manifestChildrenToVariableChildren(entry.children, id),
      dataType: entry.type ?? null,
      entitySubType: entry.entitySubType ?? null,
      id,
      isList: entry.isList ?? false,
      isOutput: false,
      paramName: entry.name,
      showChildren: false,
      value: entry.value ?? null
    };
  });
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
      // Re-sync the nested children to the target version's manifest instead of
      // freezing them at the old contract: fields the new version added appear,
      // fields it dropped fall away, and types update, while any field-level
      // binding a surviving child carried (its variable mapping, literal value,
      // and id) is preserved. Domo does this sync itself when a tile binds a
      // version; leaving the children untouched on an API-driven bump is what let
      // a tile keep an out-of-date field set (e.g. a field only a much older
      // version had), diverging from what the function actually returns.
      param.children = reconcileParamChildren(src.children, entry.children, flag, param.id);
      // A type change against a still-bound variable is the one case that can
      // break a workflow: the variable keeps its old dataType. Surface it, and
      // update the variable's type (and its property schema) only when the user
      // opted in.
      if (src.mappedTo && classified.typeChanged.some((t) => t.name === entry.name)) {
        report.typeChanges.push({
          dataType: entry.type ?? null,
          flag,
          paramName: entry.name,
          variableId: src.mappedTo
        });
        if (choices.updateVariableTypes?.[src.mappedTo]) {
          setVariableType(definition, src.mappedTo, {
            children: Array.isArray(entry.children) ? entry.children : [],
            dataType: entry.type ?? null,
            entitySubType: entry.entitySubType ?? null,
            isList: entry.isList ?? false
          });
        }
      }
      // The data type is unchanged but the object's property schema differs (e.g.
      // the fields of the objects in an array changed). It does not break the
      // binding, so updating the variable's properties is opt-in too.
      if (src.mappedTo && classified.schemaChanged.some((t) => t.name === entry.name)) {
        report.schemaChanges.push({ flag, paramName: entry.name, variableId: src.mappedTo });
        if (choices.updateVariableSchemas?.[src.mappedTo]) {
          setVariableType(definition, src.mappedTo, {
            children: Array.isArray(entry.children) ? entry.children : []
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

/**
 * Reconcile an object param's nested children against the target version's
 * manifest, the way Domo re-syncs a tile's fields to the package contract when it
 * binds a version. Structure always follows the manifest (fields the new version
 * added appear, fields it dropped fall away, types update); any binding an
 * existing field of the same name carried, its variable mapping, literal value,
 * and id, is preserved so a field-level mapping survives the bump. Recurses so a
 * nested object keeps its full shape. This is what stops a carried-over param from
 * freezing at an older version's contract.
 * @param {Object[]|undefined} existingChildren - The param's current children.
 * @param {Object[]|undefined} manifestChildren - The manifest entry's children.
 * @param {'input'|'output'} flag
 * @param {string} parentId - The id of the param these children hang off.
 * @returns {Object[]}
 */
function reconcileParamChildren(existingChildren, manifestChildren, flag, parentId) {
  if (!Array.isArray(manifestChildren)) return [];
  const existingByName = new Map((Array.isArray(existingChildren) ? existingChildren : []).map((c) => [c.paramName, c]));
  return manifestChildren.map((entry) => {
    const src = existingByName.get(entry.name);
    const id = src?.id ?? `${parentId}.${generateTileId()}`;
    return {
      aiDescription: src?.aiDescription ?? null,
      children: reconcileParamChildren(src?.children, entry.children, flag, id),
      configType: src?.configType ?? null,
      customMappingType: src?.customMappingType ?? null,
      dataType: entry.type ?? null,
      displayName: entry.displayName ?? entry.name,
      entitySubType: entry.entitySubType ?? null,
      flag,
      id,
      isList: entry.isList ?? false,
      mappedTo: src?.mappedTo ?? null,
      paramName: entry.name,
      required: entry.nullable === false,
      value: src?.value ?? entry.value ?? null,
      visible: src?.visible ?? true
    };
  });
}

/**
 * Reconcile a variable's nested children against a manifest entry's children,
 * preserving the id of every field that survives by name so references to those
 * fields keep resolving: rich-text variable mentions in email bodies, downstream
 * tiles' output mappings, and text substitutions all point at a child by its id.
 * Regenerating ids wholesale (as a naive rebuild does) orphans every such
 * reference and makes the workflow fail to deploy ("No variable found with id
 * ..."). Recurses so a nested object keeps its shape.
 * @param {Object[]|undefined} existingChildren - The variable's current children.
 * @param {Object[]|undefined} manifestChildren - The manifest entry's children.
 * @param {string} parentId - The id of the variable these children hang off.
 * @returns {Object[]}
 */
function reconcileVariableChildren(existingChildren, manifestChildren, parentId) {
  if (!Array.isArray(manifestChildren)) return [];
  const existingByName = new Map((Array.isArray(existingChildren) ? existingChildren : []).map((c) => [c.paramName, c]));
  return manifestChildren.map((entry) => {
    const src = existingByName.get(entry.name);
    const id = src?.id ?? `${parentId}.${generateTileId()}`;
    return {
      children: reconcileVariableChildren(src?.children, entry.children, id),
      dataType: entry.type ?? null,
      entitySubType: entry.entitySubType ?? null,
      id,
      isList: entry.isList ?? false,
      isOutput: false,
      paramName: entry.name,
      showChildren: src?.showChildren ?? false,
      value: src?.value ?? entry.value ?? null
    };
  });
}

function setVariableType(definition, variableId, { children, dataType, entitySubType, isList }) {
  const variable = (definition?.dataList || []).find((v) => v.id === variableId);
  if (!variable) return false;
  if (children !== undefined) variable.children = reconcileVariableChildren(variable.children, children, variable.id);
  if (dataType !== undefined) variable.dataType = dataType;
  if (entitySubType !== undefined) variable.entitySubType = entitySubType;
  if (isList !== undefined) variable.isList = isList;
  return true;
}
