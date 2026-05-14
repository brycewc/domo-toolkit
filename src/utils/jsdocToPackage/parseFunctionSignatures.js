import { parse as parseAcorn } from 'acorn';

export function parseFunctionSignatures(source) {
  const result = { errors: [], signatures: {} };
  let ast;
  try {
    ast = parseAcorn(source, {
      allowAwaitOutsideFunction: true,
      allowImportExportEverywhere: false,
      allowReturnOutsideFunction: true,
      ecmaVersion: 'latest',
      sourceType: 'module'
    });
  } catch (moduleErr) {
    try {
      ast = parseAcorn(source, {
        allowReturnOutsideFunction: true,
        ecmaVersion: 'latest',
        sourceType: 'script'
      });
    } catch (scriptErr) {
      result.errors.push({
        message: `Failed to parse source: ${scriptErr.message}`,
        type: 'parse'
      });
      return result;
    }
    void moduleErr;
  }

  for (const node of ast.body) {
    collectFromNode(node, source, result.signatures);
  }
  return result;
}

function collectFromNode(node, source, signatures) {
  if (!node) return;
  if (node.type === 'FunctionDeclaration' && node.id?.name) {
    signatures[node.id.name] = { isAsync: !!node.async, params: extractParams(node.params, source) };
    return;
  }
  if (node.type === 'ExportNamedDeclaration' && node.declaration) {
    collectFromNode(node.declaration, source, signatures);
    return;
  }
  if (node.type === 'ExportDefaultDeclaration' && node.declaration) {
    collectFromNode(node.declaration, source, signatures);
    return;
  }
  if (node.type === 'VariableDeclaration') {
    for (const decl of node.declarations) {
      if (
        decl.id?.type === 'Identifier' &&
        (decl.init?.type === 'ArrowFunctionExpression' || decl.init?.type === 'FunctionExpression')
      ) {
        signatures[decl.id.name] = {
          isAsync: !!decl.init.async,
          params: extractParams(decl.init.params, source)
        };
      }
    }
  }
}

function evaluateLiteral(node) {
  if (!node) return { ok: false, value: undefined };
  switch (node.type) {
    case 'ArrayExpression': {
      const arr = [];
      for (const el of node.elements) {
        if (el === null) {
          arr.push(null);
          continue;
        }
        const inner = evaluateLiteral(el);
        if (!inner.ok) return { ok: false, value: undefined };
        arr.push(inner.value);
      }
      return { ok: true, value: arr };
    }
    case 'Identifier':
      if (node.name === 'undefined') return { ok: true, value: null };
      return { ok: false, value: undefined };
    case 'Literal':
      return { ok: true, value: node.value };
    case 'ObjectExpression': {
      const obj = {};
      for (const prop of node.properties) {
        if (prop.type !== 'Property' || prop.computed || prop.kind !== 'init') {
          return { ok: false, value: undefined };
        }
        let key;
        if (prop.key.type === 'Identifier') key = prop.key.name;
        else if (prop.key.type === 'Literal') key = String(prop.key.value);
        else return { ok: false, value: undefined };
        const v = evaluateLiteral(prop.value);
        if (!v.ok) return { ok: false, value: undefined };
        obj[key] = v.value;
      }
      return { ok: true, value: obj };
    }
    case 'TemplateLiteral':
      if (node.expressions.length === 0 && node.quasis.length === 1) {
        return { ok: true, value: node.quasis[0].value.cooked };
      }
      return { ok: false, value: undefined };
    case 'UnaryExpression':
      if (node.operator === '-' && node.argument?.type === 'Literal') {
        return { ok: true, value: -node.argument.value };
      }
      return { ok: false, value: undefined };
    default:
      return { ok: false, value: undefined };
  }
}

function extractParam(node, source) {
  if (node.type === 'Identifier') {
    return { hasDefault: false, name: node.name };
  }
  if (node.type === 'AssignmentPattern') {
    const name = node.left?.type === 'Identifier' ? node.left.name : null;
    if (!name) {
      return { hasDefault: false, isDestructured: true, name: null };
    }
    const right = node.right;
    const defaultRaw = right ? source.slice(right.start, right.end) : null;
    const defaultEvaluated = evaluateLiteral(right);
    return {
      defaultEvaluated,
      defaultRaw,
      hasDefault: true,
      isLiteralDefault: defaultEvaluated.ok,
      name
    };
  }
  if (node.type === 'RestElement') {
    return { hasDefault: false, isRest: true, name: node.argument?.name || null };
  }
  if (node.type === 'ObjectPattern' || node.type === 'ArrayPattern') {
    return { hasDefault: false, isDestructured: true, name: null };
  }
  return { hasDefault: false, name: null };
}

function extractParams(paramNodes, source) {
  return paramNodes.map((node) => extractParam(node, source));
}
