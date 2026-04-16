import { getObjectType } from '@/models';
import { executeInPage } from '@/utils';

import { fetchObjectDetailsInPage } from './allObjects';
import { getAppDbCollectionPermission } from './appDb';
import {
  extractPageContentIds,
  getFormsForPage,
  getQueuesForPage
} from './appStudio';
import { getCardsForObject } from './cards';
import { getDataflowPermission } from './dataflows';
import { getChildPages, getPagesForCards, getSubpageIds } from './pages';
import { getUserReportsTo } from './users';
import { getVersionDefinition, getWorkflowPermission } from './workflows';

/**
 * Registry of async enrichments that run after primary metadata detection.
 * Each descriptor declares what to fetch, which types it applies to,
 * and where to store the result under domoObject.metadata.
 *
 * @typedef {Object} EnrichmentDescriptor
 * @property {string} id - Unique identifier for logging
 * @property {string[]} types - Object type IDs this enrichment applies to
 * @property {string|Object} storePath - Where to store under metadata:
 *   String: 'context.cards' stores the result directly at that path.
 *   Object: { 'context.cardPages': 'pages', ... } maps result keys to destination paths.
 * @property {Function} fetch - (ctx) => Promise — receives the enrichment context, returns value to store.
 *   Return undefined to skip storage entirely.
 * @property {*} [fallback] - Value to store on error. Omit to swallow errors silently.
 *   For object storePath, use matching shape: { pages: [], cardsByPage: {} }.
 * @property {string} [contentGroup] - If set, this enrichment participates in page content
 *   composition. After storing, the orchestrator checks if all content groups have resolved.
 */
const ENRICHMENTS = [
  // Stream parent for non-DataFlow DATA_SOURCE
  {
    fallback: undefined,
    fetch: async ({ enrichedMetadata, tabId }) => {
      const streamId = enrichedMetadata.details?.streamId;
      const isDataflow =
        enrichedMetadata.details?.type?.toLowerCase() === 'dataflow';
      if (!streamId || isDataflow) return undefined;

      const streamType = getObjectType('STREAM');
      const streamMetadata = await executeInPage(
        fetchObjectDetailsInPage,
        [
          {
            apiConfig: streamType.api,
            objectId: String(streamId),
            typeId: 'STREAM'
          }
        ],
        tabId
      );
      if (!streamMetadata?.details) return undefined;

      const name = streamType.api.nameTemplate.replace(
        /{([^}]+)}/g,
        (_, path) =>
          path === 'id'
            ? String(streamId)
            : (path
                .split('.')
                .reduce((o, k) => o?.[k], streamMetadata.details) ?? '')
      );
      return {
        details: streamMetadata.details,
        id: String(streamId),
        name,
        objectType: { id: 'STREAM', name: 'Stream' }
      };
    },
    id: 'stream-parent',
    storePath: 'parent',
    types: ['DATA_SOURCE']
  },

  // Child pages for PAGE (fast pre-check then full fetch)
  {
    fallback: [],
    fetch: async ({ objectId, tabId }) => {
      const subpageIds = await getSubpageIds({
        pageId: parseInt(objectId),
        tabId
      });
      if (!subpageIds || subpageIds.length === 0) return [];
      return getChildPages({
        includeGrandchildren: true,
        pageId: parseInt(objectId),
        pageType: 'PAGE',
        tabId
      });
    },
    id: 'page-child-pages',
    storePath: 'context.childPages',
    types: ['PAGE']
  },

  // App pages for app views
  {
    fallback: [],
    fetch: ({ domoObject, objectId, tabId, typeId }) => {
      const appId =
        typeId === 'DATA_APP_VIEW' && domoObject.parentId
          ? parseInt(domoObject.parentId)
          : null;
      return getChildPages({
        appId,
        pageId: parseInt(objectId),
        pageType: typeId,
        tabId
      });
    },
    id: 'app-pages',
    storePath: 'context.appPages',
    types: ['DATA_APP_VIEW', 'WORKSHEET_VIEW', 'REPORT_BUILDER_VIEW']
  },

  // Pages and cardsByPage for CARD
  {
    fallback: { cardsByPage: {}, pages: [] },
    fetch: async ({ objectId, tabId }) => {
      const result = await getPagesForCards([parseInt(objectId)], tabId);
      return {
        cardsByPage: result.cardsByPage || {},
        pages: result.pages || []
      };
    },
    id: 'card-pages',
    storePath: {
      'context.cardPages': 'pages',
      'context.cardsByPage': 'cardsByPage'
    },
    types: ['CARD']
  },

  // Cards for page-like and DATA_SOURCE types
  {
    contentGroup: 'cards',
    fallback: [],
    fetch: ({ objectId, tabId, typeId }) =>
      getCardsForObject({ objectId, objectType: typeId, tabId }),
    id: 'page-cards',
    storePath: 'context.cards',
    types: [
      'PAGE',
      'DATA_APP_VIEW',
      'DATA_SOURCE',
      'WORKSHEET_VIEW',
      'REPORT_BUILDER_VIEW'
    ]
  },

  // Forms for page-like types
  {
    contentGroup: 'forms',
    fallback: [],
    fetch: ({ enrichedMetadata, tabId }) => {
      const { formWidgetIds } = extractPageContentIds(
        enrichedMetadata.details
      );
      if (formWidgetIds.length === 0) return [];
      return getFormsForPage({ formWidgetIds, tabId });
    },
    id: 'page-forms',
    storePath: 'context.forms',
    types: [
      'DATA_APP_VIEW',
      'PAGE',
      'REPORT_BUILDER_VIEW',
      'WORKSHEET_VIEW'
    ]
  },

  // Queues for page-like types
  {
    contentGroup: 'queues',
    fallback: [],
    fetch: ({ enrichedMetadata, tabId }) => {
      const { queueWidgetIds } = extractPageContentIds(
        enrichedMetadata.details
      );
      if (queueWidgetIds.length === 0) return [];
      return getQueuesForPage({ queueWidgetIds, tabId });
    },
    id: 'page-queues',
    storePath: 'context.queues',
    types: [
      'DATA_APP_VIEW',
      'PAGE',
      'REPORT_BUILDER_VIEW',
      'WORKSHEET_VIEW'
    ]
  },

  // Workflow permission
  {
    fetch: async ({ objectId, tabId, userId }) => {
      if (!userId) return { values: [] };
      const values = await getWorkflowPermission(objectId, userId, tabId);
      return { values };
    },
    id: 'workflow-permission',
    storePath: 'permission',
    types: ['WORKFLOW_MODEL']
  },

  // Workflow version definition
  {
    fetch: ({ domoObject, objectId, tabId }) => {
      const modelId = domoObject.parentId;
      if (!modelId) return undefined;
      return getVersionDefinition(modelId, objectId, tabId);
    },
    id: 'workflow-version-definition',
    storePath: 'context.definition',
    types: ['WORKFLOW_MODEL_VERSION']
  },

  // AppDB collection permission
  {
    fetch: ({ objectId, tabId }) =>
      getAppDbCollectionPermission(objectId, tabId),
    id: 'appdb-permission',
    storePath: 'permission',
    types: ['MAGNUM_COLLECTION']
  },

  // DataFlow permission
  {
    fetch: ({ objectId, tabId }) => getDataflowPermission(objectId, tabId),
    id: 'dataflow-permission',
    storePath: 'permission',
    types: ['DATAFLOW_TYPE']
  },

  // User manager (reportsTo)
  {
    fetch: ({ objectId, tabId }) => getUserReportsTo(objectId, tabId),
    id: 'user-reports-to',
    storePath: 'context.reportsTo',
    types: ['USER']
  }
];

/**
 * Page content composition types and groups.
 * When all three groups (cards, forms, queues) have resolved for a page-like type,
 * the orchestrator builds a combined content array.
 */
const PAGE_CONTENT_TYPES = new Set([
  'DATA_APP_VIEW',
  'PAGE',
  'REPORT_BUILDER_VIEW',
  'WORKSHEET_VIEW'
]);

/**
 * Run all enrichments that match the given object type.
 * Each enrichment fires as a non-blocking promise with stale guards.
 *
 * @param {Object} ctx - Enrichment context
 * @param {string} ctx.objectId - The detected object ID
 * @param {string} ctx.typeId - The detected object type ID
 * @param {number} ctx.tabId - Chrome tab ID
 * @param {Object} ctx.domoObject - The DomoObject instance
 * @param {Object} ctx.enrichedMetadata - Primary metadata from fetchObjectDetailsInPage
 * @param {string|number|null} ctx.userId - Current user ID (may be null if not yet resolved)
 * @param {Function} ctx.isStale - Returns true if this detection generation is superseded
 * @param {Function} ctx.getTabContext - Gets current tab context
 * @param {Function} ctx.setTabContext - Stores updated tab context and broadcasts
 */
export function runEnrichments(ctx) {
  const { getTabContext, isStale, objectId, setTabContext, tabId, typeId } =
    ctx;

  const matching = ENRICHMENTS.filter((e) => e.types.includes(typeId));
  if (matching.length === 0) return;

  /**
   * Build combined content array when all three groups have resolved.
   * Only applies to page-like types.
   */
  function updatePageContent() {
    if (isStale() || !PAGE_CONTENT_TYPES.has(typeId)) return;
    const currentCtx = getTabContext(tabId);
    const ctxMeta = currentCtx?.domoObject?.metadata?.context;
    if (!ctxMeta) return;
    if (
      ctxMeta.cards == null ||
      ctxMeta.forms == null ||
      ctxMeta.queues == null
    ) {
      return;
    }

    const content = [];
    for (const card of ctxMeta.cards) content.push({ ...card, type: 'CARD' });
    for (const form of ctxMeta.forms)
      content.push({ ...form, type: 'ENIGMA_FORM' });
    for (const queue of ctxMeta.queues)
      content.push({ ...queue, type: 'HOPPER_QUEUE' });
    ctxMeta.content = content;
    setTabContext(tabId, currentCtx);
  }

  /**
   * Ensure metadata and context objects exist, then store the result
   * and broadcast the updated context.
   */
  function commitResult(enrichment, result) {
    const currentContext = getTabContext(tabId);
    if (currentContext?.domoObject?.id !== objectId) return;

    if (!currentContext.domoObject.metadata) {
      currentContext.domoObject.metadata = {};
    }
    if (!currentContext.domoObject.metadata.context) {
      currentContext.domoObject.metadata.context = {};
    }

    storeResult(currentContext.domoObject.metadata, enrichment.storePath, result);
    setTabContext(tabId, currentContext);

    if (enrichment.contentGroup) {
      updatePageContent();
    }
  }

  for (const enrichment of matching) {
    Promise.resolve(enrichment.fetch(ctx))
      .then((result) => {
        if (isStale()) return;
        if (result === undefined) return;
        commitResult(enrichment, result);
      })
      .catch((error) => {
        if (isStale()) return;
        console.warn(
          `[Enrichment:${enrichment.id}] Error for ${typeId} ${objectId}:`,
          error.message
        );

        if (enrichment.fallback !== undefined) {
          commitResult(enrichment, enrichment.fallback);
        }
      });
  }
}

/**
 * Set a value at a dot-path on an object, creating intermediate objects as needed.
 * e.g., setNestedValue(obj, 'context.cards', []) creates obj.context if needed
 * and sets obj.context.cards = [].
 */
function setNestedValue(obj, path, value) {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]]) current[parts[i]] = {};
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

/**
 * Store a result according to the storePath shape.
 * String storePath: stores the value directly.
 * Object storePath: maps result keys to destination paths.
 */
function storeResult(metadata, storePath, result) {
  if (typeof storePath === 'string') {
    setNestedValue(metadata, storePath, result);
  } else {
    for (const [destPath, sourceKey] of Object.entries(storePath)) {
      setNestedValue(metadata, destPath, result[sourceKey]);
    }
  }
}
