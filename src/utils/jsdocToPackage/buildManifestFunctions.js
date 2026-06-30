import { deriveDisplayName } from './displayName';
import { mapJSDocType } from './typeMap';

const EMPTY_TYPE = '';

export function buildManifestFunctions({ editorStartIndices = {}, reconciledDocs, typedefs }) {
  const functions = [];
  const warnings = [];
  const perFunctionMeta = {};

  for (const doc of reconciledDocs) {
    const variables = buildVariables(doc, typedefs, warnings);
    const inputs = deriveInputsFromVariables(variables);
    const output = doc.returns ? buildOutput(doc, typedefs, warnings) : null;

    const fn = {
      description: doc.description || '',
      displayName: doc.displayName || deriveDisplayName(doc.functionName),
      // Domo binds each manifest function to its code definition by this
      // parse-tree node index, recovered from the live editor. Falling back to 0
      // (the old hardcoded value) collapses every binding onto one node, which is
      // why workflows reported the function as nonexistent after a sync.
      editorStartIndex: editorStartIndices?.[doc.functionName] ?? 0,
      example: buildExampleStub(inputs, output),
      hasReturn: output != null,
      inputs,
      isPrivate: !!doc.isPrivate,
      name: doc.functionName,
      output,
      variables
    };
    functions.push(fn);
    perFunctionMeta[doc.functionName] = {
      explicitOutputName: !!doc.returns?.explicitName
    };
  }

  return { functions, perFunctionMeta, warnings };
}

function applyLTransform(entry) {
  return {
    ...entry,
    displayName: entry.name,
    nullable: entry.nullable ?? false,
    type: entry.type || EMPTY_TYPE,
    value: entry.value ?? entry.defaultValues
  };
}

function buildExampleStub(inputs, output) {
  const lines = ['### Input'];
  for (const input of inputs) lines.push(` - **${input.name}**: `);
  if (output) {
    lines.push('### Output');
    lines.push(` - **${output.name}**: `);
  }
  return lines.join('\n');
}

function buildOutput(doc, typedefs, warnings) {
  const ret = doc.returns;
  const typeInfo = mapJSDocType(ret.rawType);
  const name = ret.name || defaultOutputName(typeInfo);

  if (typeInfo.isUnknown) {
    warnings.push({
      functionName: doc.functionName,
      message: '@returns has no type, falling back to text.',
      severity: 'warning'
    });
  }

  // Inline nested output schema: dotted-path @returns tags (e.g. `users[].id`).
  // The paths are rooted at the output name, so strip that prefix to root the
  // tree at the output object itself, then walk each branch into a child entry.
  if (Array.isArray(ret.properties) && ret.properties.length > 0) {
    const childParams = ret.properties
      .map((prop) => ({ ...prop, rawName: stripOutputRoot(prop.rawName, name) }))
      .filter((prop) => prop.rawName);
    const tree = buildPathTree(childParams);
    return {
      children: tree.children.map((node) => buildOutputEntryFromNode(node, typedefs)),
      defaultValues: null,
      displayName: name,
      entitySubType: null,
      isList: typeInfo.isList,
      name,
      nullable: true,
      type: 'object',
      value: null
    };
  }

  if (typeInfo.isTypedef) {
    const typedef = typedefs[typeInfo.type];
    if (!typedef) {
      warnings.push({
        functionName: doc.functionName,
        message: `@returns references unknown typedef \`${typeInfo.type}\`, emitting empty children.`,
        severity: 'warning'
      });
      return primitiveOutputEntry({ isList: typeInfo.isList, name, type: 'object' });
    }
    const children = typedef.properties.map((prop) => buildOutputPropertyEntry(prop, typedefs));
    return {
      children,
      defaultValues: null,
      displayName: name,
      entitySubType: null,
      isList: typeInfo.isList,
      name,
      nullable: true,
      type: 'object',
      value: null
    };
  }

  return primitiveOutputEntry({ isList: typeInfo.isList, name, type: typeInfo.type });
}

function buildOutputEntryFromNode(node, typedefs) {
  const docParam = node.docParam;
  const typeInfo = docParam ? mapJSDocType(docParam.rawType) : null;
  const isList = (typeInfo?.isList ?? false) || !!node.segIsList;
  let resolvedType = typeInfo?.type ?? 'object';
  let resolvedChildren = null;

  if (typeInfo?.isTypedef) {
    const typedef = typedefs[typeInfo.type];
    resolvedType = 'object';
    resolvedChildren = typedef ? typedef.properties.map((nested) => buildOutputPropertyEntry(nested, typedefs)) : null;
  } else if (node.children.length > 0) {
    resolvedType = 'object';
    resolvedChildren = node.children.map((child) => buildOutputEntryFromNode(child, typedefs));
  }

  return {
    children: resolvedChildren,
    displayName: null,
    entitySubType: null,
    isList,
    name: node.name,
    nullable: !!(docParam && docParam.optional),
    type: resolvedType,
    value: null
  };
}

function buildOutputPropertyEntry(prop, typedefs) {
  const typeInfo = mapJSDocType(prop.rawType);
  const baseName = prop.rawName.split('.').pop().replace(/\[\]$/, '');
  let resolvedType = typeInfo.type;
  let resolvedChildren = null;

  if (typeInfo.isTypedef) {
    const typedef = typedefs[typeInfo.type];
    if (typedef) {
      resolvedType = 'object';
      resolvedChildren = typedef.properties.map((nested) => buildOutputPropertyEntry(nested, typedefs));
    } else {
      resolvedType = 'object';
      resolvedChildren = null;
    }
  }

  return {
    children: resolvedChildren,
    displayName: null,
    entitySubType: null,
    isList: typeInfo.isList,
    name: baseName,
    nullable: !!prop.optional,
    type: resolvedType,
    value: null
  };
}

function buildPathTree(params) {
  const root = { children: [], name: '__root__' };
  for (const p of params) {
    const segments = splitPath(p.rawName);
    let cursor = root;
    for (let i = 0; i < segments.length; i++) {
      const segRaw = segments[i];
      const isList = segRaw.endsWith('[]');
      const segName = isList ? segRaw.slice(0, -2) : segRaw;
      const isLast = i === segments.length - 1;
      let child = cursor.children.find((c) => c.name === segName);
      if (!child) {
        child = { children: [], name: segName, segIsList: false };
        cursor.children.push(child);
      }
      if (isList) child.segIsList = true;
      if (isLast) child.docParam = p;
      cursor = child;
    }
  }
  return root;
}

function buildVariableEntry({ depth, doc, node, typedefs, warnings }) {
  const docParam = node.docParam;
  const isTopLevel = depth === 0;

  if (!docParam) {
    const children = node.children.map((child) =>
      buildVariableEntry({ depth: depth + 1, doc, node: child, typedefs, warnings })
    );
    const entry = {
      children,
      displayName: node.name,
      entitySubType: null,
      isList: !!node.segIsList,
      name: node.name,
      nullable: false,
      type: 'object',
      value: null
    };
    if (isTopLevel) entry.defaultValues = null;
    return entry;
  }

  const typeInfo = mapJSDocType(docParam.rawType);

  if (typeInfo.isUnknown) {
    warnings.push({
      functionName: doc.functionName,
      message: `Param \`${docParam.rawName}\` has no type, falling back to text.`,
      paramName: docParam.rawName,
      severity: 'warning'
    });
  }

  let resolvedType = typeInfo.type;
  let resolvedChildren = null;
  const isList = typeInfo.isList || !!node.segIsList;

  if (typeInfo.isTypedef) {
    const typedef = typedefs[typeInfo.type];
    if (typedef) {
      resolvedType = 'object';
      resolvedChildren = typedef.properties.map((prop) => buildVariablePropertyEntry(prop, typedefs));
    } else {
      warnings.push({
        functionName: doc.functionName,
        message: `Param \`${docParam.rawName}\` references unknown typedef \`${typeInfo.type}\`, emitting empty children.`,
        paramName: docParam.rawName,
        severity: 'warning'
      });
      resolvedType = 'object';
      resolvedChildren = [];
    }
  } else if (resolvedType === 'object') {
    resolvedChildren = node.children.map((child) =>
      buildVariableEntry({ depth: depth + 1, doc, node: child, typedefs, warnings })
    );
  }

  const baseName = docParam.rawName.split('.').pop().replace(/\[\]$/, '');
  const children = resolvedChildren ?? (isTopLevel ? [] : null);
  // Domo stores nested list-primitive children with value=[] (matching the
  // type's "empty list" sentinel) even when no explicit default is provided,
  // while top-level entries use null. Mirror that asymmetry so the GET-vs-derived
  // comparator doesn't flag every nested list child as needing a value change.
  const value = docParam.defaultEvaluated ?? (!isTopLevel && isList ? [] : null);

  const entry = {
    children,
    displayName: baseName,
    entitySubType: null,
    isList,
    name: baseName,
    nullable: docParam.defaultRaw != null,
    type: resolvedType,
    value
  };
  if (isTopLevel) entry.defaultValues = value;
  return entry;
}

function buildVariablePropertyEntry(prop, typedefs) {
  const typeInfo = mapJSDocType(prop.rawType);
  const baseName = prop.rawName.split('.').pop().replace(/\[\]$/, '');
  let resolvedType = typeInfo.type;
  let resolvedChildren = null;

  if (typeInfo.isTypedef) {
    const typedef = typedefs[typeInfo.type];
    if (typedef) {
      resolvedType = 'object';
      resolvedChildren = typedef.properties.map((nested) => buildVariablePropertyEntry(nested, typedefs));
    } else {
      resolvedType = 'object';
      resolvedChildren = null;
    }
  }

  return {
    children: resolvedChildren,
    displayName: baseName,
    entitySubType: null,
    isList: typeInfo.isList,
    name: baseName,
    nullable: !!prop.optional,
    type: resolvedType,
    value: typeInfo.isList ? [] : null
  };
}

function buildVariables(doc, typedefs, warnings) {
  const usableParams = doc.params.filter((p) => p && !p.excludeFromManifest);
  const tree = buildPathTree(usableParams);
  return tree.children.map((node) => buildVariableEntry({ depth: 0, doc, node, typedefs, warnings }));
}

function camelLower(name) {
  if (!name) return 'result';
  return name.charAt(0).toLowerCase() + name.slice(1);
}

function defaultOutputName(typeInfo) {
  if (typeInfo.isList) return 'results';
  if (typeInfo.isTypedef) return camelLower(typeInfo.type);
  return 'result';
}

function deriveInputsFromVariables(variables) {
  return variables.map(({ children, ...rest }) => ({
    ...applyLTransform(rest),
    children: children == null ? children : children.map(applyLTransform)
  }));
}

function primitiveOutputEntry({ isList, name, type }) {
  return {
    children: [],
    defaultValues: null,
    displayName: name,
    entitySubType: null,
    isList,
    name,
    nullable: true,
    type,
    value: null
  };
}

function splitPath(path) {
  return path.split('.').filter(Boolean);
}

function stripOutputRoot(rawName, rootName) {
  for (const prefix of [`${rootName}[].`, `${rootName}.`]) {
    if (rawName.startsWith(prefix)) return rawName.slice(prefix.length);
  }
  return rawName;
}
