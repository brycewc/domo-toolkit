import { deriveDisplayName } from './displayName';
import { mapJSDocType } from './typeMap';

export function buildManifestFunctions({ reconciledDocs, typedefs }) {
  const functions = [];
  const warnings = [];
  const perFunctionMeta = {};

  for (const doc of reconciledDocs) {
    const inputs = buildInputs(doc, typedefs, warnings);
    const output = doc.returns ? buildOutput(doc, typedefs, warnings) : null;
    const fn = {
      description: doc.description || '',
      displayName: doc.displayName || deriveDisplayName(doc.functionName),
      example: buildExampleStub(inputs, output),
      inputs,
      isPrivate: !!doc.isPrivate,
      name: doc.functionName
    };
    if (output) fn.output = output;
    functions.push(fn);
    perFunctionMeta[doc.functionName] = {
      explicitOutputName: !!doc.returns?.explicitName
    };
  }

  return { functions, perFunctionMeta, warnings };
}

function applyDescendantChildrenRule(entries) {
  return entries.map((entry) => {
    const next = { ...entry };
    if (next.type !== 'object') {
      next.children = null;
    } else if (next.children == null) {
      next.children = [];
    }
    next.displayName = null;
    return next;
  });
}

function buildEntry({ depth, doc, node, typedefs, warnings }) {
  const docParam = node.docParam;
  const isTopLevel = depth === 0;

  if (!docParam) {
    const children = node.children.map((child) =>
      buildEntry({ depth: depth + 1, doc, node: child, typedefs, warnings })
    );
    return {
      children: applyDescendantChildrenRule(children, true),
      displayName: isTopLevel ? node.name : null,
      entitySubType: null,
      isList: !!node.segIsList,
      name: node.name,
      nullable: false,
      type: 'object',
      value: null
    };
  }

  const typeInfo = mapJSDocType(docParam.rawType);

  if (typeInfo.isUnknown) {
    warnings.push({
      functionName: doc.functionName,
      message: `Param \`${docParam.rawName}\` has no type — falling back to text.`,
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
      resolvedChildren = typedef.properties.map((prop) =>
        buildPropertyEntry(prop, typedefs, warnings, doc)
      );
    } else {
      warnings.push({
        functionName: doc.functionName,
        message: `Param \`${docParam.rawName}\` references unknown typedef \`${typeInfo.type}\` — emitting empty children.`,
        paramName: docParam.rawName,
        severity: 'warning'
      });
      resolvedType = 'object';
      resolvedChildren = [];
    }
  } else if (resolvedType === 'object') {
    resolvedChildren = node.children.map((child) =>
      buildEntry({ depth: depth + 1, doc, node: child, typedefs, warnings })
    );
  }

  const childrenForOutput = resolvedChildren
    ? applyDescendantChildrenRule(resolvedChildren, true)
    : isTopLevel
      ? []
      : null;

  return {
    children: childrenForOutput,
    displayName: isTopLevel ? docParam.rawName.split('.').pop() : null,
    entitySubType: null,
    isList,
    name: docParam.rawName.split('.').pop().replace(/\[\]$/, ''),
    nullable: !!docParam.optional || docParam.defaultSource === 'signature',
    type: resolvedType,
    value: docParam.defaultEvaluated ?? null
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

function buildInputs(doc, typedefs, warnings) {
  const usableParams = doc.params.filter((p) => p && !p.excludeFromManifest);
  const tree = buildPathTree(usableParams);
  return tree.children.map((node) =>
    buildEntry({ depth: 0, doc, node, typedefs, warnings })
  );
}

function buildOutput(doc, typedefs, warnings) {
  const ret = doc.returns;
  const typeInfo = mapJSDocType(ret.rawType);
  const name = ret.name || defaultOutputName(typeInfo, ret.rawType);

  if (typeInfo.isUnknown) {
    warnings.push({
      functionName: doc.functionName,
      message: '@returns has no type — falling back to text.',
      severity: 'warning'
    });
  }

  if (typeInfo.isTypedef) {
    const typedef = typedefs[typeInfo.type];
    if (!typedef) {
      warnings.push({
        functionName: doc.functionName,
        message: `@returns references unknown typedef \`${typeInfo.type}\` — emitting empty children.`,
        severity: 'warning'
      });
      return primitiveOutputEntry({ isList: typeInfo.isList, name, type: 'object' });
    }
    const children = typedef.properties.map((prop) => buildPropertyEntry(prop, typedefs, warnings, doc));
    return {
      children,
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

function buildPropertyEntry(prop, typedefs, warnings, doc) {
  const typeInfo = mapJSDocType(prop.rawType);
  const baseName = prop.rawName.split('.').pop().replace(/\[\]$/, '');
  if (typeInfo.isTypedef) {
    const typedef = typedefs[typeInfo.type];
    if (typedef) {
      return {
        children: typedef.properties.map((nested) =>
          buildPropertyEntry(nested, typedefs, warnings, doc)
        ),
        displayName: null,
        entitySubType: null,
        isList: typeInfo.isList,
        name: baseName,
        nullable: !!prop.optional,
        type: 'object',
        value: prop.defaultEvaluated ?? null
      };
    }
    return {
      children: [],
      displayName: null,
      entitySubType: null,
      isList: typeInfo.isList,
      name: baseName,
      nullable: !!prop.optional,
      type: 'object',
      value: null
    };
  }
  if (typeInfo.type === 'object') {
    return {
      children: [],
      displayName: null,
      entitySubType: null,
      isList: typeInfo.isList,
      name: baseName,
      nullable: !!prop.optional,
      type: 'object',
      value: prop.defaultEvaluated ?? null
    };
  }
  return {
    children: null,
    displayName: null,
    entitySubType: null,
    isList: typeInfo.isList,
    name: baseName,
    nullable: !!prop.optional,
    type: typeInfo.type,
    value: prop.defaultEvaluated ?? null
  };
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

function primitiveOutputEntry({ isList, name, type }) {
  return {
    children: type === 'object' ? [] : [],
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
