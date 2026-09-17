import { executeInPage } from '@/utils/executeInPage';

/**
 * Add a pvariables parameter to a URL, in Domo's name-keyed format
 *
 * Composes onto a URL that may already carry pfilters, so it only ever touches
 * its own parameter. The name-keyed format is portable between instances; the
 * id-keyed format Domo emits itself is not, since its keys are function template
 * IDs. Domo classifies the payload as name-keyed only when every value is a
 * string or a number, so a value that cannot be reduced to one is dropped rather
 * than allowed to discard the whole payload.
 * @param {string} baseUrl - URL to add the parameter to
 * @param {Object} variables - Map of variable name to value
 * @returns {string} URL with the pvariables parameter, or without it when there is nothing to set
 */
export function buildPvariablesUrl(baseUrl, variables) {
  try {
    const urlObj = new URL(baseUrl);

    urlObj.searchParams.delete('pvariables');

    const payload = {};
    if (variables && typeof variables === 'object') {
      Object.entries(variables).forEach(([name, value]) => {
        const sanitized = sanitizeVariableValue(value);
        if (sanitized !== null) {
          payload[name] = sanitized;
        }
      });
    }

    // An empty object is not a no-op: it still routes the page to the
    // query-string loader, which bypasses the page's saved filters.
    if (Object.keys(payload).length > 0) {
      urlObj.searchParams.set('pvariables', JSON.stringify(payload));
    }

    return urlObj.toString();
  } catch (error) {
    console.error('Failed to build pvariables URL:', error);
    return baseUrl;
  }
}

/**
 * Read the page's variable controls and their current values from Domo's store
 *
 * Domo keeps variable state in a different Redux slice on each surface, leaving
 * the others empty: a dashboard uses `page.variables`, an App Studio view uses
 * `stack.variables`, and a card details page uses `card.cardDetailsPage`. All
 * three are read and whichever is populated wins. A variable counts as changed
 * only when its value differs from what Domo would fall back to without it, since
 * setting one back to its default leaves the override behind in the store.
 * @param {Object} params - Parameters
 * @param {string} [params.cardId] - Card ID, when the variables come from a card rather than a page
 * @param {string} params.pageId - Page ID
 * @param {number} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<{changedVariables: Object, hasVariables: boolean, variables: Array<{controlId: string, dataType: string|null, defaultValue: any, entityType: string|null, functionId: any, isDefault: boolean, name: string, value: any}>}>}
 */
export async function getPageVariables({ cardId = null, pageId, tabId = null }) {
  const empty = { changedVariables: {}, hasVariables: false, variables: [] };

  try {
    const result = await executeInPage(
      (pageId, cardId) => {
        const empty = { changedVariables: {}, hasVariables: false, variables: [] };
        const scopeIds = [pageId, cardId].filter(Boolean).map(String);

        // The store is never on `window` outside Domo's dev builds, so reach it
        // through the react-redux provider's props. The anchor matters: a
        // dashboard is reachable from the document root, an App Studio view only
        // from deeper in the filter chrome.
        const findStore = () => {
          const selectors = ['#root', 'body > div', '[class*="filter"]', '[class*="control"]', '[class*="page"]'];
          for (const selector of selectors) {
            for (const anchor of Array.from(document.querySelectorAll(selector)).slice(0, 20)) {
              const key = Object.keys(anchor).find((name) => name.startsWith('__reactFiber$'));
              if (!key) continue;
              let fiber = anchor[key];
              for (let depth = 0; fiber && depth < 100; depth++, fiber = fiber.return) {
                const store = fiber.memoizedProps?.value?.store;
                if (typeof store?.getState === 'function') return store;
              }
            }
          }
          return null;
        };

        // Control IDs arrive as a bare array in one place and as a map keyed by
        // card ID in another, so every shape collapses to a flat list of IDs.
        const flatten = (value) => {
          if (Array.isArray(value)) return value.flatMap(flatten);
          if (value && typeof value === 'object') return Object.values(value).flatMap(flatten);
          return value === null || value === undefined ? [] : [value];
        };

        const scoped = (map, merge) => {
          if (!map) return merge([]);
          for (const id of scopeIds) {
            if (map[id]) return map[id];
          }
          return merge(Object.values(map));
        };
        const scopedList = (map) => flatten(scoped(map, (entries) => entries));
        const scopedMap = (map) => scoped(map, (entries) => Object.assign({}, ...entries));

        // A card details page keeps its controls in a third place, as an array
        // rather than a map, and keys its overrides by function template ID
        // rather than by control ID.
        const readCardSlice = (state) => {
          const byCard = state?.card?.cardDetailsPage?.dataControlsByCardURN;
          if (!byCard) return null;
          const entry = scoped(byCard, (entries) => entries[0]);
          if (!entry) return null;
          const controls = {};
          (entry.dataControls || []).forEach((control) => {
            controls[control.id] = control;
          });
          const overrides = entry.functionOverrides || {};
          return {
            controls,
            // This slice's `override` mirrors the applied value rather than the
            // fallback, so only the variable's own expression can serve as one.
            defaultFor: (control) => readExpression(control.function?.expression),
            ids: Object.keys(controls),
            valueFor: (control) => overrides[String(control.function?.id)]
          };
        };

        const readPageSlice = (state) => {
          const slice = state?.page?.variables;
          if (!slice?.variables) return null;
          const values = scopedMap(slice.controlValuesByPageId);
          return {
            controls: slice.variables,
            defaultFor: (control) => readValue(control.override) ?? readExpression(control.function?.expression),
            ids: [...scopedList(slice.pageVariableControlIdsByPageId), ...scopedList(slice.cardVariableControlIdsByPageId)],
            valueFor: (control, id) => values[id]
          };
        };

        const readStackSlice = (state) => {
          const slice = state?.stack?.variables;
          if (!slice?.variables) return null;
          const contexts = slice.contexts || {};
          let context = null;
          for (const id of scopeIds) {
            const key = Object.keys(contexts).find((name) => name === id || name.endsWith(':' + id));
            if (key) {
              context = contexts[key];
              break;
            }
          }
          if (!context) {
            const keys = Object.keys(contexts);
            context = keys.length === 1 ? contexts[keys[0]] : null;
          }
          if (!context) return null;
          const values = context.controlValues || {};
          return {
            controls: slice.variables,
            defaultFor: (control) => readValue(control.override) ?? readExpression(control.function?.expression),
            ids: [...flatten(context.pageVariableControlUrns), ...flatten(context.cardVariableControlUrns)],
            valueFor: (control, id) => values[id]
          };
        };

        // A variable's own default is its Beast Mode expression, a bare literal.
        // Anything else stays null so it is never treated as a known fallback.
        const readExpression = (expression) => {
          if (typeof expression !== 'string') return null;
          const trimmed = expression.trim();
          const quoted = trimmed.match(/^'(.*)'$/) || trimmed.match(/^"(.*)"$/);
          if (quoted) return quoted[1];
          if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
          return null;
        };

        const readValue = (expression) => {
          if (!expression || typeof expression !== 'object') return null;
          const node = expression.parsedExpression || expression;
          if (node.exprType === 'FUNCTION') {
            const argument = Array.isArray(node.arguments) ? node.arguments[0] : null;
            const raw = argument?.value ?? node.value;
            return typeof raw === 'string' ? raw.slice(0, 10) : raw;
          }
          return node.value ?? null;
        };

        const store = findStore();
        if (!store) return empty;

        const state = store.getState();
        const sources = [readPageSlice(state), readStackSlice(state), readCardSlice(state)].filter(Boolean);
        const source =
          sources.find((entry) => entry.ids.length > 0) || sources.find((entry) => Object.keys(entry.controls).length > 0);
        if (!source) return empty;

        const controlIds = source.ids.length > 0 ? source.ids : Object.keys(source.controls);

        // One variable can drive several controls (a page-level one and a
        // card-level one), but the name-keyed URL carries a single value per
        // name, so the page-level control wins, then a changed value over a default.
        const rank = (entry) => (entry.entityType === 'PAGE' ? 2 : 0) + (entry.isDefault ? 0 : 1);
        const byVariable = new Map();

        controlIds.forEach((controlId) => {
          const control = source.controls[controlId];
          if (!control || control.controlType !== 'VARIABLE') return;

          const name = control.function?.name || control.name;
          if (!name) return;

          // Setting a variable back to its default leaves the override behind in
          // the store rather than clearing it, so presence alone would carry a
          // value the link does not need. The baseline to compare against is the
          // value Domo falls back to when the variable is left out of the URL:
          // the control's saved value, or the variable's own default. An unknown
          // baseline stays null and the value rides along rather than risking a
          // wrong drop.
          const override = source.valueFor(control, controlId);
          const defaultValue = source.defaultFor(control);
          const value = override === undefined ? defaultValue : readValue(override);
          const entry = {
            controlId: String(controlId),
            dataType: control.dataType || control.function?.dataType || null,
            defaultValue,
            entityType: control.entityType || null,
            functionId: control.function?.id ?? null,
            isDefault:
              override === undefined ||
              (defaultValue !== null && defaultValue !== undefined && String(value) === String(defaultValue)),
            name,
            value
          };

          const key = control.function?.id ?? name;
          const existing = byVariable.get(key);
          if (!existing || rank(entry) > rank(existing)) {
            byVariable.set(key, entry);
          }
        });

        const variables = Array.from(byVariable.values());
        const changedVariables = {};
        variables.forEach((variable) => {
          if (!variable.isDefault && variable.value !== null && variable.value !== undefined) {
            changedVariables[variable.name] = variable.value;
          }
        });

        return { changedVariables, hasVariables: Object.keys(changedVariables).length > 0, variables };
      },
      [pageId, cardId],
      tabId
    );

    return result || empty;
  } catch (error) {
    console.warn('Failed to get page variables:', error);
    return empty;
  }
}

/**
 * Reduce a variable value to the string or number Domo's name-keyed parser accepts
 * @param {any} value - Raw value read from the store
 * @returns {string|number|null} Sanitized value, or null when it cannot be carried in the URL
 */
function sanitizeVariableValue(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  // Domo slices a date to its first ten characters, so send it that form already.
  return /^\d{4}-\d{2}-\d{2}T/.test(trimmed) ? trimmed.slice(0, 10) : trimmed;
}
