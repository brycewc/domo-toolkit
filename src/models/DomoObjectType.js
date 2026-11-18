import { getAccountIdsForDomoObject } from '@/services/accounts';
import { beastModeSaveTarget, datasetIdFromBeastModeLinks } from '@/utils/beastModeLinks';
import { isDataModelType, isDatasetTypeId, isDatasetViewType, isFusionType } from '@/utils/datasetTypes';
import {
  GOVERNANCE_TOOLKIT_APPLICATION_ID_BY_SLUG,
  GOVERNANCE_TOOLKIT_JOB_PARAM,
  GOVERNANCE_TOOLKIT_SLUG_BY_APPLICATION_ID
} from '@/utils/governanceToolkitApps';

/**
 * ObjectType class represents a Domo object id with its configuration
 */
export class DomoObjectType {
  get parentTypeIds() {
    return this.parent?.types.map((entry) => entry.typeId) ?? [];
  }

  /**
   * @param {string} id - The internal type identifier
   * @param {string} name - The human-readable type name
   * @param {Object} [options] - Configuration options
   * @param {Array<string>} [options.activityLogTypes] - The audit object types this object's own activity log
   *   covers, defaulting to `[id]`. Set it when Domo records an object's events under more than one type, or
   *   under a name other than the type ID: a view and a data model each log CREATED/EDITED as `VIEW` and
   *   everything else as `DATA_SOURCE`, and neither set appears in the other's log.
   * @param {Array<string>} [options.aliases] - Legacy or alternate type IDs that should resolve to this same config
   *   via `getObjectType()`. Use when Domo has renamed a type (e.g. OBJECTIVE → GOAL) so existing references
   *   to the old name keep working without a separate registry entry.
   * @param {Object} [options.api] - API configuration for fetching object details
   * @param {Array<Object>} [options.copyConfigs] - Additional copy actions for the long-press dropdown
   *   Each entry: { label: string, source: string|Function, primary?: boolean, when?: string|Object|Function }
   *   - label: display label (e.g., 'Package ID')
   *   - source: dot-path on DomoObject to resolve the copy value (e.g., 'parent.id', 'metadata.details.streamId'),
   *     or a function (domoObject) => value that derives the copy value — return null/undefined to hide the entry.
   *   - primary: if true, overrides the default copy action; original object ID moves to dropdown
   *   - when: visibility condition (see `matchesCondition`) — omit to show when source is truthy
   * @param {Object} [options.extractConfig] - Configuration for extracting ID from URL. A `valueMap` on the
   *   config (or on a parent's `extract`) translates the extracted segment through a lookup table, yielding null
   *   when the segment is absent from it — for a URL carrying a slug where the extension needs the mapped ID.
   * @param {string|string[]} [options.featureSwitch] - Instance feature switch this type requires. An array is met
   *   when any one is on; a `!` prefix means the switch must be off. Checked via `isTypeFeatureEnabled()` in
   *   `@/utils/featureSwitches`, which fails open while the switch list is unknown.
   *   Omit for types available on every instance.
   * @param {Object} [options.icon] - Icon config for this object type
   *   { component: string, rotation?: number } where component is a key in the ObjectTypeIcon registry
   * @param {RegExp} [options.idPattern] - Regular expression to validate IDs for this type
   * @param {string|Object} [options.parent] - The one object this object lives on. A bare type ID for a fixed
   *   parent type, `{ typeId, id, extract, fetcher }` for a fixed one with a source, or `{ type, types, ... }`.
   *   `types` maps each possible parent type ID to `{ match, id, extract, fetcher, urlPath }`, any of which
   *   overrides the shared field of the same name.
   *   - `id`: dot-path on the DomoObject, or `(domoObject) => value`, where a value may also be
   *     `{ id, parent }` to hand over the parent's own parent. An array tries each in order.
   *   - `extract`: reads the parent ID from the URL, in `extractConfig` form.
   *   - `fetcher`: a key in DomoObject's `PARENT_FETCHERS`, for a parent only an API call can find.
   *   - `type` + `match`: the dot-path naming the parent's type, and the value each type answers to. A
   *     `match` may instead be a `matchesCondition` condition. Without `type`, every type whose `match`
   *     passes, or that has none, is a candidate. Keep candidates exclusive: these keys sort
   *     alphabetically, so declaration order can't settle a tie.
   *   - `urlPath`: this type's URL when its parent is of that type, taking precedence over `urlPath`.
   * @param {string} [options.redirectsToType] - When this type has no UI of its own, navigating to it redirects
   *   to an object of this target type instead (e.g. STREAM → DATA_SOURCE). Setting this lets the UI advertise
   *   the type as URL-navigating even though it has no `urlPath` itself. The actual ID resolution from the
   *   response (e.g. STREAM's `dataSource.id`) lives in NavigateToCopiedObject's `buildResolvedDomoObject`.
   * @param {Array<Object>} [options.relatedData] - Array of related-data configs [{field, typeId, label, source?, itemIdField?}]
   *   Use { label: 'Short Name', source: 'self' } to override the current object's tab label.
   *   For an `isArray: true` entry, set `fetcher: '<key>'` (matching a key in
   *   ContextFooter's `LAZY_ARRAY_FETCHERS` registry) to defer the load until
   *   the user activates the tab. The presence of `fetcher` is the lazy signal;
   *   omit it for eager arrays read directly from metadata.
   *   For a lazy single-object tab (a JSON blob about the current object itself,
   *   like a card's full definition), set `fetcher: '<key>'` *without* `isArray`
   *   (matching a key in ContextFooter's `LAZY_OBJECT_FETCHERS` registry); the
   *   object is fetched on tab activation and rendered as plain JSON.
   *   Entries don't have to point at navigable Domo objects: omit `itemTypeId`/
   *   `itemIdField` (or `typeId` for single entries) to render plain data
   *   (e.g., dataset columns) without URL injection.
   *   When each row carries its own parent (so the tab-level `parentId` is the
   *   wrong one for every row), set `itemParentField: '<key>'` to read `{parent}`
   *   from that field on the row itself. A row missing the field falls back to the
   *   tab's `parentId`.
   *   For a single (non-array) entry whose type isn't fixed, set `typeField: '<path>'`
   *   to resolve the related object's type from a sibling field (read from the same
   *   base as `field`, e.g. a CONTAINER_VIEW's `resourceType` deciding whether
   *   `resourceId` is a PAGE/CARD/DATA_APP). This is the single-entry analog of
   *   `itemTypeField` for arrays; the entry then needs no static `typeId`.
   *   Any entry can carry `when: <condition>` (see `matchesCondition`) to drop the
   *   tab entirely for objects the entry doesn't apply to.
   * @param {string} [options.urlPath] - The URL path pattern. Supported placeholders:
   *   - `{id}`: the object ID
   *   - `{parent}`: the parent object ID (fetched async if needed)
   *   - `{metadata.<dot.path>}`: any value resolved by dot-path from the DomoObject's `metadata`
   *     (e.g., `{metadata.details.type}`). Unresolved placeholders fall back to `originalUrl`.
   *   - `{slug}`: resolved from `options.urlSlugs`
   * @param {Object} [options.urlSlugs] - Resolves `{slug}`: `{ map, source }`, `source` being `'id'` or `'parent'`
   *   and `map` keyed by that ID. `source: 'parent'` makes the type parent-requiring even with no `{parent}` in
   *   the path. An ID absent from the map leaves `{slug}` in place, which consumers read as "not navigable".
   */
  constructor(id, name, options = {}) {
    this.id = id;
    this.name = name;
    this.activityLogTypes = options.activityLogTypes ?? [id];
    this.aliases = options.aliases ?? null;
    this.api = options.api ?? null;
    this.copyConfigs = options.copyConfigs ?? null;
    this.extractConfig = options.extractConfig ?? null;
    this.featureSwitch = options.featureSwitch ?? null;
    this.icon = options.icon ?? null;
    this.idPattern = options.idPattern ?? null;
    this.parent = normalizeParentConfig(options.parent);
    this.redirectsToType = options.redirectsToType ?? null;
    this.relatedData = options.relatedData ?? null;
    this.urlPath = options.urlPath ?? null;
    this.urlSlugs = options.urlSlugs ?? null;
  }

  /**
   * Resolve {metadata.dot.path} placeholders in a string using the provided metadata object.
   * Placeholders whose values are null/undefined are left intact so callers can decide how to handle them.
   * @param {string} str - String containing metadata placeholders
   * @param {Object} [metadata] - Metadata object to resolve against
   * @returns {string} The string with resolvable placeholders replaced
   */
  static resolveMetadataPlaceholders(str, metadata) {
    if (!str || !metadata) return str;
    return str.replace(/\{metadata\.([^}]+)\}/g, (match, path) => {
      const value = path.split('.').reduce((current, prop) => current?.[prop], metadata);
      return value != null ? value : match;
    });
  }

  /**
   * Build the full URL for this object, its parent already resolved
   * @param {string} baseUrl - The base URL (e.g., https://instance.domo.com)
   * @param {string} id - The object ID
   * @param {{id: string, typeId: string}|null} parent - The parent, for types whose URL needs one
   * @param {Object} [metadata] - Optional metadata object for resolving {metadata.dot.path} placeholders
   * @returns {string} The full URL, with any placeholder it could not fill left in place
   */
  buildObjectUrl(baseUrl, id, parent, metadata) {
    const path = this.resolveUrlPath(parent?.typeId);
    if (!path) {
      throw new Error(`Object type ${this.id} does not have a navigable URL`);
    }

    let url = path.replace('{id}', id);
    if (parent?.id != null) url = url.replace('{parent}', parent.id);
    url = this.resolveSlugPlaceholder(url, id, parent?.id);
    url = DomoObjectType.resolveMetadataPlaceholders(url, metadata);

    return `${baseUrl}${url}`;
  }

  /**
   * Whether this type's parent can be found from just an object ID, without an originating URL or a
   * parent handed in, so a parent-requiring type stays reachable from a clipboard ID.
   * @returns {boolean}
   */
  canResolveParentFromIdAlone() {
    if (!this.parent) return false;
    return this.parent.types.some((entry) => entry.fetcher || (entry.id && this.api));
  }

  /**
   * Extract the ID from a URL for this object type
   * @param {string} url - The URL to extract from
   * @returns {string|null} The extracted ID or null if not found
   */
  extractObjectId(url) {
    const id = extractUrlPart(url, this.extractConfig);

    // Validate extracted ID against the type's pattern (rejects e.g. "new", "graph")
    if (id && !this.idPattern.test(id)) {
      return null;
    }

    return id;
  }

  /**
   * Extract the parent from a URL for this object type
   * @param {string} url - The URL to extract from
   * @returns {{id: string, typeId: string}|null} The extracted parent, or null if not found/configured
   */
  extractParent(url) {
    if (!url || !this.parent) return null;
    for (const entry of this.parent.types) {
      const id = entry.extract ? extractUrlPart(url, entry.extract) : null;
      if (id) return { id, typeId: entry.typeId };
    }
    return null;
  }

  /**
   * Extract additional URL parameters beyond id and parent
   * @param {string} url - The URL to extract from
   * @returns {Object} Map of parameter name to extracted value
   */
  extractUrlParams(url) {
    if (!this.extractConfig?.urlParamExtracts) return {};

    const parts = url.split(/[/?=&]/);
    const params = {};

    for (const [name, config] of Object.entries(this.extractConfig.urlParamExtracts)) {
      const { fromEnd = false, keyword, offset = 1 } = config;
      if (fromEnd) {
        params[name] = parts[parts.length - offset] || null;
      } else {
        // Lowercase keyword to match lowercased URLs from content script detection
        const index = parts.indexOf(keyword.toLowerCase());
        if (index !== -1) {
          params[name] = parts[index + offset] || null;
        }
      }
    }

    return params;
  }

  /**
   * Check if this object type has an API configuration
   * @returns {boolean} Whether the object type has an API configuration
   */
  hasApiConfig() {
    return this.api !== null && this.api !== undefined;
  }

  /**
   * Check if this object type has a navigable URL
   * @returns {boolean} Whether the object type has a URL path
   */
  hasUrl() {
    return !!this.urlPath || !!this.parent?.types.some((entry) => entry.urlPath);
  }

  /**
   * Check if an ID matches the pattern for this object type
   * @param {string} id - The ID to validate
   * @returns {boolean} Whether the ID matches the pattern
   */
  isValidObjectId(id) {
    return this.idPattern.test(id);
  }

  /**
   * Check if this object type requires a parent ID for API calls
   * @returns {boolean} Whether a parent ID is required for API calls
   */
  requiresParentForApi() {
    return (
      this.api &&
      this.api.endpoint &&
      (this.api.endpoint.includes('{parent}') ||
        (this.api.bodyTemplate && JSON.stringify(this.api.bodyTemplate).includes('{parent}')))
    );
  }

  /**
   * Check if this object type requires a parent ID for URL construction
   * @returns {boolean} Whether a parent ID is required for URL construction
   */
  requiresParentForUrl() {
    const paths = [this.urlPath, ...(this.parent?.types.map((entry) => entry.urlPath) ?? [])].filter(Boolean);
    if (paths.length === 0) return false;
    return !this.urlPath || paths.some((path) => path.includes('{parent}')) || this.urlSlugs?.source === 'parent';
  }

  /**
   * The parent type entries that can apply to an object, in the order to try them
   * @param {Object} domoObject - The DomoObject whose parent is wanted
   * @returns {Array<Object>} Normalized parent type entries
   */
  resolveCandidateParentTypes(domoObject) {
    if (!this.parent) return [];
    const discriminator = this.parent.type ? resolveParentSource(this.parent.type, domoObject) : undefined;
    return this.parent.types.filter((entry) => {
      if (entry.match === undefined) return !this.parent.type;
      if (typeof entry.match === 'string') return discriminator != null && String(discriminator) === entry.match;
      return matchesCondition(entry.match, domoObject);
    });
  }

  /**
   * The parent an object's own data names, without any API call
   * @param {Object} domoObject - The DomoObject whose parent is wanted
   * @returns {{id: string, parent?: Object, typeId: string}|null}
   */
  resolveParentFromData(domoObject) {
    for (const entry of this.resolveCandidateParentTypes(domoObject)) {
      const value = resolveParentSource(entry.id, domoObject);
      if (value == null || value === '') continue;
      if (typeof value === 'object') return { ...value, id: String(value.id), typeId: entry.typeId };
      return { id: String(value), typeId: entry.typeId };
    }
    return null;
  }

  /**
   * Resolve the `{slug}` placeholder from this type's `urlSlugs` table
   * @param {string} url - URL or path possibly containing `{slug}`
   * @param {string} id - The object ID
   * @param {string} [parentId] - The parent object ID
   * @returns {string} The string with `{slug}` replaced, or untouched when it cannot be resolved
   */
  resolveSlugPlaceholder(url, id, parentId) {
    if (!url || !this.urlSlugs || !url.includes('{slug}')) return url;
    const key = this.urlSlugs.source === 'parent' ? parentId : id;
    const slug = key == null ? null : this.urlSlugs.map[key];
    return slug ? url.replace('{slug}', slug) : url;
  }

  resolveUrlPath(parentTypeId) {
    return this.parent?.types.find((entry) => entry.typeId === parentTypeId)?.urlPath ?? this.urlPath;
  }
}

/**
 * Registry of all supported object types
 */
export const ObjectTypeRegistry = {
  ACCOUNT: new DomoObjectType('ACCOUNT', 'Account', {
    api: { endpoint: '/data/v1/accounts/{id}', paths: { created: 'createdAt', name: 'name' } },
    icon: { component: 'Key' },
    idPattern: /^\d+$/,
    relatedData: [
      {
        fetcher: 'datasetsForAccountDetails',
        field: 'accountDatasets',
        fieldSource: 'context',
        isArray: true,
        itemTypeId: 'DATA_SOURCE',
        label: 'DataSets'
      }
    ],
    urlPath: '/datacenter/accounts?id={id}'
  }),
  ACCOUNT_TEMPLATE: new DomoObjectType('ACCOUNT_TEMPLATE', 'Account Template', {
    icon: { component: 'Key' },
    idPattern: /.*/
  }),
  ACHIEVEMENT: new DomoObjectType('ACHIEVEMENT', 'Achievement', {
    aliases: ['ACHIEVEMENT_ADMIN', 'USER_ACHIEVEMENT'],
    api: { endpoint: '/content/v1/achievements/{id}', paths: { name: 'name' } },
    icon: { component: 'CertifiedCompany' },
    idPattern: /.*/
  }),
  ADC_COLUMN_POLICY: new DomoObjectType('ADC_COLUMN_POLICY', 'Column PDP Policy', {
    idPattern: /^\d+$/
  }),
  ADC_COLUMN_POLICY_GROUP: new DomoObjectType('ADC_COLUMN_POLICY_GROUP', 'Column PDP Policy Group', {
    idPattern: /^\d+$/
  }),
  ADC_COLUMN_POLICY_MAPPING: new DomoObjectType('ADC_COLUMN_POLICY_MAPPING', 'Column PDP Policy Mapping', {
    idPattern: /.*/
  }),
  ADC_FILTER: new DomoObjectType('ADC_FILTER', 'PDP Filter', {
    idPattern: /^\d+$/
  }),
  ADC_MASK: new DomoObjectType('ADC_MASK', 'PDP Mask', { idPattern: /^\d+$/ }),
  ADC_POLICY: new DomoObjectType('ADC_POLICY', 'PDP Policy', {
    icon: { component: 'Adc' },
    idPattern: /^\d+$/
  }),
  AGENT: new DomoObjectType('AGENT', 'Agent', {
    api: {
      endpoint: '/ai/v1/agents/{id}?include=all,context,toolkits,settings',
      paths: { name: 'name' }
    },
    extractConfig: { keyword: 'agents' },
    icon: { component: 'AiRobot' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    relatedData: [
      {
        field: 'toolkits',
        isArray: true,
        itemIdField: 'id',
        itemTypeId: 'AI_TOOLKIT',
        label: 'Toolkits'
      }
    ],
    urlPath: '/ai-library/agents/{id}'
  }),
  AI_CHAT: new DomoObjectType('AI_CHAT', 'AI Chat', { icon: { component: 'AiChat' }, idPattern: /.*/ }),
  AI_MODEL: new DomoObjectType('AI_MODEL', 'AI Model', {
    api: { endpoint: '/datascience/ml/v1/models/{id}', paths: { name: 'name' } },
    extractConfig: { keyword: 'model' },
    featureSwitch: 'ai-services',
    icon: { component: 'AiModel' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    urlPath: '/ai-services/models?model={id}'
  }),
  AI_PROJECT: new DomoObjectType('AI_PROJECT', 'AI Project', {
    api: { endpoint: '/datascience/ml/v1/projects/{id}', paths: { name: 'name' } },
    extractConfig: { keyword: 'projects' },
    featureSwitch: 'ai-services',
    icon: { component: 'AiBook' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    urlPath: '/ai-services/projects/{id}'
  }),
  AI_TOOLKIT: new DomoObjectType('AI_TOOLKIT', 'AI Toolkit', {
    api: { endpoint: '/ai/v1/toolkits/{id}', paths: { name: 'name' } },
    extractConfig: { keyword: 'toolkits' },
    featureSwitch: 'ai-services',
    icon: { component: 'Toolbox' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    urlPath: '/ai-library/toolkits/{id}'
  }),
  AI_TOOLKIT_DOMO_PROVIDED: new DomoObjectType('AI_TOOLKIT_DOMO_PROVIDED', 'AI Toolkit (Domo)', {
    api: {
      endpoint: '/ai/v1/toolkits/domo-provided',
      filterByIdField: 'id',
      paths: { name: 'name' }
    },
    extractConfig: { keyword: 'domo-provided' },
    icon: { component: 'Toolbox' },
    idPattern: /^[a-z][a-z0-9_]*$/,
    urlPath: '/ai-library/toolkits/domo-provided/{id}'
  }),
  ALERT: new DomoObjectType('ALERT', 'Alert', {
    api: { endpoint: '/social/v4/alerts/{id}', paths: { created: 'createdAt', name: 'name' } },
    extractConfig: { keyword: 'alerts' },
    icon: { component: 'RingingBell' },
    idPattern: /^\d+$/,
    parent: {
      id: 'metadata.details.resourceId',
      type: 'metadata.details.resourceType',
      types: {
        CARD: { match: 'CARD', urlPath: '/kpis/details/{parent}/alerts/{id}' },
        DATA_SOURCE: { match: 'DATASET', urlPath: '/datasources/{parent}/details/alerts/{id}' }
      }
    },
    relatedData: [{ source: 'parent' }, { fetcher: 'alertActions', field: 'actions', isArray: true, label: 'Actions' }]
  }),
  APP: new DomoObjectType('APP', 'Custom App Design (Brick)', {
    api: {
      endpoint: '/apps/v1/designs/{id}?parts=versions',
      paths: { created: 'createdDate', latestVersion: 'latestVersion', name: 'name', versions: 'versions' }
    },
    extractConfig: { keyword: 'assetlibrary' },
    icon: { component: 'CodeTags' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    relatedData: [
      { fetcher: 'designInstances', isArray: true, itemTypeId: 'APP_INSTANCE', label: 'Instances' },
      { fetcher: 'designCards', isArray: true, itemTypeId: 'CARD', label: 'Cards' }
    ],
    urlPath: '/assetlibrary/{id}/overview'
  }),
  APP_INSTANCE: new DomoObjectType('APP_INSTANCE', 'Custom App', {
    api: { endpoint: '/apps/v1/instances/{id}', paths: { created: 'createdDate' } },
    icon: { component: 'Code' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    parent: { id: 'metadata.details.designId', typeId: 'RYUU_APP' },
    relatedData: [{ label: 'App Design', source: 'parent' }]
    // No urlPath: an instance has no standalone page; it's reached as a related object from a card.
  }),
  APPROVAL: new DomoObjectType('APPROVAL', 'Approval', {
    api: {
      bodyTemplate: {
        operationName: 'getApprovalForDetails',
        query:
          'query getApprovalForDetails($id: ID!) {\n request: approval(id: $id) {\n ...approvalFields\n __typename\n }\n}\n\nfragment approvalFields on Approval {\n newActivity\n observers {\n id\n type\n displayName\n title\n ... on Group {\n currentUserIsMember\n memberCount: userCount\n __typename\n }\n __typename\n }\n lastViewed\n newActivity\n newMessage {\n created\n createdByType\n createdBy {\n id\n displayName\n __typename\n }\n content {\n text\n __typename\n }\n __typename\n }\n lastAction\n version\n submittedTime\n id\n title\n status\n providerName\n templateTitle\n buzzChannelId\n buzzGeneralThreadId\n templateID\n templateInstructions\n templateDescription\n acknowledgment\n snooze\n snoozed\n type\n categories {\n id\n name\n __typename\n }\n total {\n value\n currency\n __typename\n }\n modifiedTime\n previousApprover: previousApproverEx {\n id\n type\n displayName\n ... on User {\n title\n avatarKey\n isCurrentUser\n __typename\n }\n ... on Group {\n currentUserIsMember\n userCount\n isDeleted\n actor {\n displayName\n id\n __typename\n }\n __typename\n }\n __typename\n }\n pendingApprover: pendingApproverEx {\n id\n type\n displayName\n ... on User {\n title\n avatarKey\n isCurrentUser\n __typename\n }\n ... on Group {\n currentUserIsMember\n userCount\n isDeleted\n __typename\n }\n __typename\n }\n submitter {\n id\n displayName\n title\n avatarKey\n isCurrentUser\n type\n __typename\n }\n approvalChainIdx\n reminder {\n sent\n sentBy {\n displayName\n title\n id\n isCurrentUser\n type\n __typename\n }\n __typename\n }\n chain {\n actor {\n displayName\n __typename\n }\n approver {\n id\n type\n displayName\n ... on User {\n title\n avatarKey\n isCurrentUser\n __typename\n }\n ... on Group {\n currentUserIsMember\n userCount\n isDeleted\n __typename\n }\n __typename\n }\n status\n time\n type\n key\n __typename\n }\n fields {\n data\n name\n type\n key\n ... on HeaderField {\n fields {\n data\n name\n type\n key\n ... on HeaderField {\n fields {\n data\n name\n type\n key\n __typename\n }\n __typename\n }\n __typename\n }\n __typename\n }\n ... on ItemListField {\n fields {\n data\n name\n type\n key\n ... on HeaderField {\n fields {\n data\n name\n type\n key\n ... on HeaderField {\n fields {\n data\n name\n type\n key\n __typename\n }\n __typename\n }\n __typename\n }\n __typename\n }\n __typename\n }\n __typename\n }\n ... on NumberField {\n value\n __typename\n }\n ... on CurrencyField {\n number: value\n currency\n __typename\n }\n ... on DateField {\n date: value\n __typename\n }\n ... on DataSetAttachmentField {\n dataSet: value {\n id\n name\n description\n owner {\n id\n displayName\n __typename\n }\n provider\n cardCount\n __typename\n }\n __typename\n }\n __typename\n }\n history {\n actor {\n type\n id\n displayName\n ... on User {\n avatarKey\n isCurrentUser\n __typename\n }\n __typename\n }\n status\n time\n __typename\n }\n latestMessage {\n created\n __typename\n }\n latestMentioned {\n created\n __typename\n }\n workflowIntegration {\n modelId\n modelVersion\n startName\n instanceId\n modelName\n __typename\n }\n __typename\n}',
        variables: { id: '{id}' }
      },
      endpoint: '/synapse/approval/graphql',
      method: 'POST',
      paths: {
        created: 'data.request.submittedTime',
        details: 'data.request',
        // A request's own title is optional and comes back as an empty string when unset; Domo's
        // Approval Center shows the template's title in that case, so fall back the same way.
        name: ['data.request.title', 'data.request.templateTitle']
      }
    },
    copyConfigs: [{ label: 'Approval Template ID', source: 'parent.id' }],
    extractConfig: { keyword: 'request-details' },
    featureSwitch: 'approvalcenter',
    icon: { component: 'ApprovalCenter' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    parent: { id: 'metadata.details.templateID', typeId: 'TEMPLATE' },
    relatedData: [{ source: 'parent' }],
    urlPath: '/approval/request-details/{id}'
  }),
  AUTHORITY: new DomoObjectType('AUTHORITY', 'Grant', { idPattern: /.*/ }),
  BEAST_MODE_FORMULA: new DomoObjectType('BEAST_MODE_FORMULA', 'Beast Mode', {
    api: {
      endpoint: '/query/v1/functions/template/{id}?hidden=true',
      paths: { name: 'name' }
    },
    copyConfigs: [
      { label: 'DataSet ID', source: 'metadata.context.datasetId' },
      { label: 'Card ID', source: 'parent.id', when: { field: 'parent.typeId', matches: 'CARD' } },
      { label: 'Card ID', source: 'parent.parent.id', when: { field: 'parent.typeId', matches: 'DRILL_VIEW' } },
      { label: 'Drill ID', source: 'parent.id', when: { field: 'parent.typeId', matches: 'DRILL_VIEW' } }
    ],
    extractConfig: { keyword: 'id' },
    icon: { component: 'Function' },
    idPattern: /^\d+$/,
    // A Beast Mode saved to a card or drill can only ever live there, so that is its parent, even though it
    // still reads its dataset.
    parent: {
      types: {
        CARD: {
          id: ({ metadata }) => {
            const target = beastModeSaveTarget(metadata?.details?.links);
            return target?.typeId === 'CARD' ? target.id : null;
          }
        },
        DATA_SOURCE: {
          id: ({ metadata }) => datasetIdFromBeastModeLinks(metadata?.details?.links),
          match: ({ metadata }) => !beastModeSaveTarget(metadata?.details?.links)
        },
        DRILL_VIEW: {
          id: ({ metadata }) => {
            const target = beastModeSaveTarget(metadata?.details?.links);
            return target?.typeId === 'DRILL_VIEW' ? { id: target.id, parent: { id: target.parentId } } : null;
          }
        }
      }
    },
    relatedData: [
      { source: 'parent' },
      { field: 'datasetId', fieldSource: 'context', label: 'DataSet', typeId: 'DATA_SOURCE' },
      {
        fetcher: 'beastModeCards',
        field: 'usageCardIds',
        fieldSource: 'context',
        isArray: true,
        itemIdField: 'id',
        itemTypeId: 'CARD',
        label: 'Cards'
      }
    ],
    urlPath: '/datacenter/beastmode?id={id}'
  }),
  CARD: new DomoObjectType('CARD', 'Card', {
    api: {
      endpoint: '/content/v1/cards?urns={id}&includeFiltered=true&parts=metadata,datasources,domoapp,owners',
      paths: { created: '[0].created', details: '[0]', name: '[0].title' }
    },
    copyConfigs: [
      {
        label: 'DataSet ID',
        source: 'metadata.details.datasources.0.dataSourceId',
        when: { field: 'metadata.details.datasources', length: 1 }
      }
    ],
    extractConfig: { keyword: 'details' },
    icon: { component: 'Card' },
    idPattern: /^\d+$/,
    // An app card reads several datasets through its instance, and a notebook card can embed several, so
    // only an ordinary card has a dataset parent.
    parent: {
      types: {
        APP_INSTANCE: {
          id: 'metadata.details.domoapp.id',
          match: { field: 'metadata.details.type', matches: 'domoapp' }
        },
        DATA_SOURCE: {
          id: 'metadata.details.datasources.0.dataSourceId',
          match: ({ metadata }) =>
            !['domoapp', 'Text'].includes(metadata?.details?.type) && metadata?.details?.datasources?.length === 1
        }
      }
    },
    relatedData: [
      { source: 'parent' },
      {
        fetcher: 'cardDefinition',
        label: 'Definition',
        // The KPI definition endpoint doesn't resolve for custom app cards (brick or
        // pro-code); the Custom App and App Design tabs below cover those instead.
        when: { field: 'metadata.details.type', notMatches: 'domoapp' }
      },
      {
        field: 'datasources',
        isArray: true,
        itemIdField: 'dataSourceId',
        itemTypeId: 'DATA_SOURCE',
        label: 'DataSets'
      },
      {
        field: 'pageId',
        fieldSource: 'context',
        label: 'Page',
        typeId: 'PAGE'
      },
      {
        field: 'appViewId',
        fieldSource: 'context',
        label: 'App Page',
        parentFieldSource: 'context',
        parentSource: 'appId',
        typeId: 'DATA_APP_VIEW'
      },
      {
        field: 'appId',
        fieldSource: 'context',
        label: 'Studio App',
        typeId: 'DATA_APP'
      },
      {
        // Only present on domoapp cards (the app instance behind the card).
        field: 'domoapp.id',
        label: 'Custom App',
        typeId: 'APP_INSTANCE'
      },
      {
        // designId is enriched onto context from the instance (see enrichments.js).
        field: 'designId',
        fieldSource: 'context',
        label: 'App Design',
        typeId: 'RYUU_APP'
      }
    ],
    urlPath: '/kpis/details/{id}'
  }),
  CERTIFICATION: new DomoObjectType('CERTIFICATION', 'Certification', {
    api: {
      bodyTemplate: {
        operationName: 'getCertificationDetails',
        query:
          'query getCertificationDetails($id: ID!) {\n  certification: certificationByApprovalId(id: $id) {\n    id\n    request {\n      id\n      type\n      status\n      entityType\n      entityId\n      entityTitle\n      entityOwnerEx {\n        id\n        type\n        displayName\n        ... on User {\n          title\n          avatarKey\n          isCurrentUser\n          __typename\n        }\n        ... on Group {\n          currentUserIsMember\n          userCount\n          isDeleted\n          __typename\n        }\n        __typename\n      }\n      entityOwners {\n        id\n        type\n        displayName\n        ... on User {\n          title\n          avatarKey\n          isCurrentUser\n          __typename\n        }\n        ... on Group {\n          currentUserIsMember\n          userCount\n          isDeleted\n          __typename\n        }\n        __typename\n      }\n      requestor {\n        id\n        displayName\n        title\n        avatarKey\n        isCurrentUser\n        isDeleted\n        __typename\n      }\n      modifiedTime\n      createdTime\n      __typename\n    }\n    approval {\n      id\n      version\n      type\n      title\n      status\n      providerName\n      templateID\n      templateTitle\n      buzzChannelId\n      buzzGeneralThreadId\n      templateInstructions\n      templateDescription\n      total {\n        value\n        currency\n        __typename\n      }\n      modifiedTime\n      previousApprover: previousApproverEx {\n        id\n        type\n        displayName\n        ... on User {\n          title\n          avatarKey\n          isCurrentUser\n          __typename\n        }\n        ... on Group {\n          currentUserIsMember\n          userCount\n          isDeleted\n          actor {\n            displayName\n            id\n            __typename\n          }\n          __typename\n        }\n        __typename\n      }\n      pendingApprover: pendingApproverEx {\n        id\n        type\n        displayName\n        ... on User {\n          title\n          avatarKey\n          isCurrentUser\n          __typename\n        }\n        ... on Group {\n          userCount\n          isDeleted\n          currentUserIsMember\n          __typename\n        }\n        __typename\n      }\n      submitter {\n        id\n        displayName\n        title\n        avatarKey\n        isCurrentUser\n        __typename\n      }\n      approvalChainIdx\n      chain {\n        actor {\n          displayName\n          __typename\n        }\n        approver {\n          id\n          type\n          displayName\n          ... on User {\n            title\n            avatarKey\n            isCurrentUser\n            __typename\n          }\n          ... on Group {\n            userCount\n            isDeleted\n            __typename\n          }\n          __typename\n        }\n        status\n        time\n        type\n        key\n        __typename\n      }\n      observers {\n        id\n        type\n        displayName\n        avatarKey\n        title\n        ... on Group {\n          userCount\n          __typename\n        }\n        __typename\n      }\n      fields {\n        type\n        name\n        data\n        key\n        ... on NumberField {\n          value\n          __typename\n        }\n        ... on CurrencyField {\n          number: value\n          currency\n          __typename\n        }\n        ... on DateField {\n          date: value\n          __typename\n        }\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}',
        // The id in the certification URL is the approval id, not the certification
        // id, so the query resolves it via certificationByApprovalId (aliased back to
        // `certification` so the paths below stay unchanged).
        variables: { id: '{id}' }
      },
      endpoint: '/synapse/approval/graphql',
      method: 'POST',
      paths: {
        created: 'data.certification.request.createdTime',
        details: 'data.certification',
        name: 'data.certification.request.entityTitle'
      }
    },
    copyConfigs: [{ label: 'Certification Process ID', source: 'parent.id' }],
    extractConfig: { keyword: 'request-details' },
    featureSwitch: 'certified-content',
    icon: { component: 'Certified' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    parent: { id: 'metadata.details.approval.templateID', typeId: 'CERTIFICATION_PROCESS' },
    relatedData: [
      { field: 'request.entityId', label: 'Certified Object', typeField: 'request.entityType' },
      { source: 'parent' }
    ],
    urlPath: '/certification-center/request-details/{id}'
  }),
  CERTIFICATION_PROCESS: new DomoObjectType('CERTIFICATION_PROCESS', 'Certification Process', {
    api: {
      bodyTemplate: {
        operationName: 'getTemplateForEdit',
        query:
          'query getTemplateForEdit($id: ID!) {\n  template(id: $id) {\n    id\n    type\n    title\n    titleName\n    titlePlaceholder\n    acknowledgment\n    instructions\n    description\n    providerName\n    isPublic\n    isPublished\n    chainIsLocked\n   \n    categories {\n      id\n      name\n    }\n    owner {\n      id\n      displayName\n      avatarKey\n    }\n    fields {\n      key\n      type\n      name\n      data\n      placeholder\n      required\n      isPrivate\n    }\n    approvers {\n      type\n      originalType: type\n      key\n      ... on ApproverPerson {\n        id: approverId\n          userDetails {\n          id\n          type\n          displayName\n          title\n          avatarKey\n        }\n      }\n      ... on ApproverGroup {\n        id: approverId\n        \n        groupDetails {\n          id\n          type\n          displayName\n          userCount\n          isDeleted\n        }\n      }\n      ... on ApproverPlaceholder {\n        placeholderText\n      }\n    }\n  }\n  \n}',
        variables: { id: '{id}' }
      },
      endpoint: '/synapse/approval/graphql',
      method: 'POST',
      paths: { details: 'data.template', name: 'data.template.title' }
    },
    extractConfig: {
      keyword: 'edit-form'
    },
    featureSwitch: 'certified-content',
    icon: { component: 'CertifiedCompany' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    urlPath: '/admin/certifiedcontent/{metadata.context.certifiedType}/edit-form/{id}'
  }),
  CHANNEL: new DomoObjectType('CHANNEL', 'Buzz Channel', {
    aliases: ['GROUP_CHAT'],
    api: { endpoint: '/buzz/v1/channels/{id}', paths: { created: 'channel.created', name: 'channel.title' } },
    icon: { component: 'ChatBubbles' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  }),
  CODEENGINE_PACKAGE: new DomoObjectType('CODEENGINE_PACKAGE', 'Code Engine Package', {
    aliases: ['PACKAGE'],
    api: {
      endpoint: '/codeengine/v2/packages/{id}?parts=functions,versions,privateFunctions',
      paths: { created: 'createdOn', name: 'name' }
    },
    extractConfig: { keyword: 'codeengine' },
    featureSwitch: 'code-engine',
    icon: { component: 'CurlyBrackets' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    relatedData: [
      {
        fetcher: 'codeEngineWorkflowUsage',
        isArray: true,
        // One row per referencing model version, so the version is the id and the
        // row's own model is the parent.
        itemIdField: 'version',
        itemParentField: 'entityId',
        itemTypeId: 'WORKFLOW_MODEL_VERSION',
        label: 'Workflow Versions'
      },
      {
        fetcher: 'codeEngineDesignUsage',
        isArray: true,
        itemIdField: 'entityId',
        itemTypeId: 'RYUU_APP',
        label: 'App Designs'
      },
      {
        fetcher: 'codeEngineInstanceUsage',
        isArray: true,
        itemIdField: 'entityId',
        itemTypeId: 'APP_INSTANCE',
        label: 'Custom Apps'
      },
      {
        fetcher: 'codeEngineToolkitUsage',
        isArray: true,
        itemIdField: 'entityId',
        itemTypeId: 'AI_TOOLKIT',
        label: 'AI Toolkits'
      }
    ],
    urlPath: '/codeengine/{id}'
  }),
  CODEENGINE_PACKAGE_VERSION: new DomoObjectType('CODEENGINE_PACKAGE_VERSION', 'Code Engine Package Version', {
    api: {
      displayName: '{parent.name} - v{id}',
      endpoint: '/codeengine/v2/packages/{parent}/versions/{id}?parts=functions,privateFunctions',
      nameFromDisplayName: true,
      paths: { name: 'version' }
    },
    copyConfigs: [
      { label: 'Package ID', primary: true, source: 'parent.id' },
      { label: 'Version Number', source: 'id' },
      // Shown only when this CE version is viewed from inside a workflow (the
      // workflow back-references are absent on the standalone /codeengine page).
      { label: 'Workflow ID', source: 'metadata.context.workflowModelId' },
      { label: 'Workflow Version', source: 'metadata.context.workflowVersionNumber' }
    ],
    icon: { component: 'Package' },
    idPattern: /^[0-9]+\.[0-9]+\.[0-9]+$/,
    parent: 'CODEENGINE_PACKAGE',
    relatedData: [
      { label: 'Package Version', source: 'self' },
      { label: 'Code Engine', source: 'parent' },
      {
        field: 'workflowVersionNumber',
        fieldSource: 'context',
        label: 'Workflow Version',
        parentFieldSource: 'context',
        parentSource: 'workflowModelId',
        typeId: 'WORKFLOW_MODEL_VERSION'
      },
      {
        field: 'workflowModelId',
        fieldSource: 'context',
        label: 'Workflow',
        typeId: 'WORKFLOW_MODEL'
      },
      // Identical to the package's usage tabs: the fetchers resolve the package
      // from this version's own parent.
      {
        fetcher: 'codeEngineWorkflowUsage',
        isArray: true,
        itemIdField: 'version',
        itemParentField: 'entityId',
        itemTypeId: 'WORKFLOW_MODEL_VERSION',
        label: 'Workflow Versions'
      },
      {
        fetcher: 'codeEngineDesignUsage',
        isArray: true,
        itemIdField: 'entityId',
        itemTypeId: 'RYUU_APP',
        label: 'App Designs'
      },
      {
        fetcher: 'codeEngineInstanceUsage',
        isArray: true,
        itemIdField: 'entityId',
        itemTypeId: 'APP_INSTANCE',
        label: 'Custom Apps'
      },
      {
        fetcher: 'codeEngineToolkitUsage',
        isArray: true,
        itemIdField: 'entityId',
        itemTypeId: 'AI_TOOLKIT',
        label: 'AI Toolkits'
      }
    ]
  }),
  COLLECTION: new DomoObjectType('COLLECTION', 'Collection', {
    icon: { component: 'Folder' },
    idPattern: /.*/
  }),
  CONFIG_APP: new DomoObjectType('CONFIG_APP', 'Config App', {
    idPattern: /.*/
  }),
  CONFIG_APP_CONFIGURATION: new DomoObjectType('CONFIG_APP_CONFIGURATION', 'Config App Configuration', {
    idPattern: /.*/
  }),
  CONNECTOR: new DomoObjectType('CONNECTOR', 'Connector', {
    api: { endpoint: '/data/v1/connectors/{id}?language=en', paths: { name: 'label' } },
    copyConfigs: [{ label: 'Provider Key', source: 'metadata.details.connectionType' }],
    icon: { component: 'Connector' },
    idPattern: /^com\.[a-z0-9_-]+(\.[a-z0-9_-]+)+$/i,
    relatedData: [
      {
        fetcher: 'connectorStreams',
        isArray: true,
        itemIdField: 'datasetId',
        itemTypeId: 'DATA_SOURCE',
        label: 'Streams'
      },
      {
        fetcher: 'connectorAccounts',
        isArray: true,
        itemTypeId: 'ACCOUNT',
        label: 'Accounts'
      }
    ],
    urlPath: '/appstore/connectors/{id}'
  }),
  CONTAINER_VIEW: new DomoObjectType('CONTAINER_VIEW', 'Container View', {
    api: {
      endpoint: '/content/v2/views/{id}',
      paths: { created: 'created', name: 'name' }
    },
    icon: { component: 'Document' },
    idPattern: /^\d+$/,
    parent: {
      id: 'metadata.details.resourceId',
      type: 'metadata.details.resourceType',
      types: {
        CARD: { match: 'CARD' },
        DATA_APP: { match: 'DATA_APP' },
        PAGE: { match: 'PAGE' },
        REPORT_BUILDER_VIEW: { match: 'REPORT_BUILDER_VIEW' }
      }
    },
    relatedData: [{ label: 'Resource', source: 'parent' }]
  }),
  CUSTOMER: new DomoObjectType('CUSTOMER', 'Customer', { idPattern: /.*/ }),
  CUSTOMER_LANDING_ENTITY: new DomoObjectType('CUSTOMER_LANDING_ENTITY', 'Customer Landing Entity', { idPattern: /.*/ }),
  CUSTOMER_STATE: new DomoObjectType('CUSTOMER_STATE', 'Customer State', {
    api: { endpoint: '/content/v1/customer-states/{id}', paths: { name: 'name' } },
    icon: { component: 'Building' },
    idPattern: /.*/
  }),
  DATA_APP: new DomoObjectType('DATA_APP', 'Studio App', {
    api: { endpoint: '/content/v1/dataapps/{id}', paths: { name: 'title' } },
    extractConfig: { keyword: 'app-studio' },
    featureSwitch: 'data-app',
    icon: { component: 'DataApp' },
    idPattern: /^\d+$/,
    relatedData: [
      {
        field: 'views',
        isArray: true,
        itemTypeId: 'DATA_APP_VIEW',
        label: 'Pages'
      },
      {
        fetcher: 'reportsForApp',
        isArray: true,
        itemIdField: 'reportId',
        itemTypeId: 'REPORT_BUILDER',
        label: 'Reports'
      }
    ],
    urlPath: '/app-studio/{id}'
  }),
  DATA_APP_VIEW: new DomoObjectType('DATA_APP_VIEW', 'App Page', {
    api: {
      displayName: '{parent.name} > {name}',
      endpoint: '/content/v3/stacks/{id}',
      fallback: { endpoint: '/content/v1/pages/{id}/access', paths: { name: 'pageName' } },
      paths: { created: 'page.created', name: 'title' }
    },
    copyConfigs: [{ label: 'App ID', source: 'parent.id' }],
    extractConfig: { keyword: 'pages' },
    featureSwitch: 'data-app',
    icon: { component: 'PagesBars' },
    idPattern: /^\d+$/,
    parent: { extract: { keyword: 'app-studio', offset: 1 }, fetcher: 'appStudioPageParent', typeId: 'DATA_APP' },
    relatedData: [
      { source: 'parent' },
      {
        field: 'content',
        fieldSource: 'context',
        isArray: true,
        itemTypeField: 'type',
        label: 'Content'
      },
      {
        fetcher: 'datasetsForPage',
        isArray: true,
        itemIdField: 'id',
        itemTypeId: 'DATA_SOURCE',
        label: 'DataSets'
      }
    ],
    urlPath: '/app-studio/{parent}/pages/{id}'
  }),
  DATA_DICTIONARY: new DomoObjectType('DATA_DICTIONARY', 'Data Dictionary', {
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  }),
  DATA_FUSION: new DomoObjectType('DATA_FUSION', 'Data Fusion', {
    ...derivedDatasetConfig(),
    extractConfig: { keyword: 'fusion' },
    icon: { component: 'Domofusion' }
  }),
  DATA_MODEL: new DomoObjectType('DATA_MODEL', 'Data Model', {
    ...derivedDatasetConfig(),
    activityLogTypes: ['DATA_SOURCE', 'VIEW'],
    extractConfig: { keyword: 'datamodels' },
    featureSwitch: 'data-modeling',
    icon: { component: 'Model' }
  }),
  DATA_SCIENCE_NOTEBOOK: new DomoObjectType('DATA_SCIENCE_NOTEBOOK', 'Jupyter Workspace', {
    api: { endpoint: '/datascience/v1/workspaces/{id}', paths: { created: 'created', name: 'name' } },
    extractConfig: { keyword: 'jupyter-workspaces' },
    featureSwitch: ['jupyter-notebooks', 'jupyter-notebooks-ga'],
    icon: { component: 'Jupyter' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    relatedData: [
      {
        fetcher: 'jupyterWorkspaceInputs',
        field: 'inputConfiguration',
        isArray: true,
        itemIdField: 'dataSourceId',
        itemTypeId: 'DATA_SOURCE',
        label: 'Inputs'
      },
      {
        fetcher: 'jupyterWorkspaceOutputs',
        field: 'outputConfiguration',
        isArray: true,
        itemIdField: 'dataSourceId',
        itemTypeId: 'DATA_SOURCE',
        label: 'Outputs'
      },
      {
        fetcher: 'jupyterWorkspaceAccounts',
        field: 'accountConfiguration',
        isArray: true,
        itemIdField: 'account_id',
        itemTypeId: 'ACCOUNT',
        label: 'Accounts'
      }
    ],
    urlPath: '/jupyter-workspaces/{id}'
  }),
  DATA_SOURCE: new DomoObjectType('DATA_SOURCE', 'DataSet', {
    aliases: ['DATASOURCE', 'DATASET', 'DATA_LINEAGE'],
    api: {
      endpoint: '/data/v3/datasources/{id}?includeAllDetails=true',
      paths: { created: 'created', name: 'name' }
    },
    copyConfigs: [
      // Accounts live on the stream (`parent.metadata.details.accounts`) now
      // that the singular `accountId` field has been removed from the
      // datasource response. Only show this entry when the stream pulls
      // from exactly one account — multi-account is rare and a single Copy
      // affordance can't pick the "right" one; users can grab the IDs from
      // the JSON context footer in that case.
      {
        label: 'Account ID',
        source: (obj) => {
          const ids = getAccountIdsForDomoObject(obj);
          return ids.length === 1 ? ids[0] : null;
        }
      },
      { label: 'DataFlow ID', source: 'parent.id', when: { field: 'parent.typeId', matches: 'DATAFLOW_TYPE' } },
      { label: 'Stream ID', source: 'metadata.details.streamId' }
    ],
    extractConfig: { keyword: 'datasources' },
    icon: { component: 'Database' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    parent: {
      types: {
        DATAFLOW_TYPE: { fetcher: 'dataflowForOutput', match: { field: 'metadata.details.type', matches: 'dataflow' } },
        STREAM: {
          id: 'metadata.details.streamId',
          match: { field: 'metadata.details.type', notMatches: 'dataflow' }
        }
      }
    },
    relatedData: [
      { source: 'parent' },
      // Preferred: multi-account list from the stream definition.
      {
        field: 'accounts',
        fieldSource: 'parent',
        isArray: true,
        itemIdField: 'accountId',
        itemTypeId: 'ACCOUNT',
        label: 'Account'
      },
      // Fallback: legacy singular accountId on the datasource response.
      { field: 'accountId', label: 'Account', typeId: 'ACCOUNT' },
      // No `field` to seed it: the tab has to appear before the lookup runs,
      // because finding no workspace is itself the answer it reports.
      {
        fetcher: 'jupyterWorkspaceForDataset',
        isArray: true,
        itemTypeId: 'DATA_SCIENCE_NOTEBOOK',
        label: 'Jupyter Workspace',
        when: { field: 'metadata.details.type', matches: 'Jupyter' }
      },
      { field: 'approvalTemplateId', fieldSource: 'context', label: 'Approval Template', typeId: 'TEMPLATE' },
      { fetcher: 'datasetColumns', isArray: true, label: 'Columns' }
    ],
    urlPath: '/datasources/{id}/details/overview'
  }),
  DATAFLOW_TYPE: new DomoObjectType('DATAFLOW_TYPE', 'DataFlow', {
    aliases: ['DATAFLOW'],
    api: { endpoint: '/dataprocessing/v2/dataflows/{id}', paths: { created: 'created', name: 'name' } },
    extractConfig: { keyword: 'dataflows' },
    icon: { component: 'Dataflow' },
    idPattern: /^\d+$/,
    relatedData: [
      {
        fetcher: 'dataflowInputs',
        field: 'inputs',
        isArray: true,
        itemTypeId: 'DATA_SOURCE',
        label: 'Inputs'
      },
      {
        fetcher: 'dataflowOutputs',
        field: 'outputs',
        isArray: true,
        itemTypeId: 'DATA_SOURCE',
        label: 'Outputs'
      },
      {
        fetcher: 'jupyterWorkspaceForDataflow',
        isArray: true,
        itemTypeId: 'DATA_SCIENCE_NOTEBOOK',
        label: 'Jupyter Workspace',
        when: { field: 'metadata.details.databaseType', matches: 'JUPYTER' }
      }
    ],
    urlPath: '/datacenter/dataflows/{id}/details'
  }),
  DATAFLOW_TYPE_EXECUTION: new DomoObjectType('DATAFLOW_TYPE_EXECUTION', 'DataFlow Execution', {
    api: {
      displayName: 'Run of {parent.name} - {name}',
      endpoint: '/dataprocessing/v1/dataflows/{parent}/executions/{id}',
      nameFormat: 'timestamp',
      paths: { name: 'beginTime' }
    },
    copyConfigs: [{ label: 'DataFlow ID', source: 'parent.id' }],
    extractConfig: { keyword: 'details', offset: 1 },
    icon: { component: 'Play' },
    idPattern: /^\d+$/,
    parent: { extract: { keyword: 'dataflows', offset: 1 }, typeId: 'DATAFLOW_TYPE' },
    relatedData: [{ label: 'Execution', source: 'self' }, { source: 'parent' }],
    urlPath: '/datacenter/dataflows/{parent}/details/{id}'
  }),
  DEPLOYMENT: new DomoObjectType('DEPLOYMENT', 'Repository Deployment', {
    icon: { component: 'Package' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  }),
  DRILL_VIEW: new DomoObjectType('DRILL_VIEW', 'Drill Path', {
    api: {
      endpoint: '/content/v1/cards?urns=dr:{id}:{parent}&includeFiltered=true&parts=metadata,datasources',
      paths: { created: '[0].created', details: '[0]', name: '[0].title' }
    },
    copyConfigs: [
      {
        label: 'URN',
        source: 'metadata.details.urn'
      },
      {
        label: 'Card ID',
        source: 'parent.id'
      },
      {
        label: 'DataSet ID',
        source: 'metadata.details.datasources.0.dataSourceId',
        when: { field: 'metadata.details.datasources', length: 1 }
      }
    ],
    extractConfig: { keyword: 'drillviewid' },
    icon: { component: 'Drill' },
    idPattern: /^\d+$/,
    parent: { extract: { keyword: 'cardid', offset: 1 }, fetcher: 'drillParentCard', typeId: 'CARD' },
    relatedData: [
      { label: 'Parent Card', source: 'parent' },
      {
        field: 'datasources',
        isArray: true,
        itemIdField: 'dataSourceId',
        itemTypeId: 'DATA_SOURCE',
        label: 'DataSets'
      },
      {
        field: 'pageId',
        fieldSource: 'context',
        label: 'Page',
        typeId: 'PAGE'
      },
      {
        field: 'appViewId',
        fieldSource: 'context',
        label: 'App Page',
        parentFieldSource: 'context',
        parentSource: 'appId',
        typeId: 'DATA_APP_VIEW'
      },
      {
        field: 'appId',
        fieldSource: 'context',
        label: 'Studio App',
        typeId: 'DATA_APP'
      }
    ],
    urlPath: '/analyzer?cardid={parent}&drillviewid={id}'
  }),
  ENIGMA_FORM: new DomoObjectType('ENIGMA_FORM', 'Form', {
    api: { endpoint: '/forms/v2/{id}', paths: { name: 'name' } },
    icon: { component: 'CardNotebook' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    // A workflow form's domainId is "<modelId> - <version>".
    parent: {
      type: 'metadata.details.domainType',
      types: {
        DATA_APP: { id: 'metadata.details.domainId', match: 'APP_STUDIO_APP' },
        WORKFLOW_MODEL_VERSION: {
          id: ({ metadata }) => {
            const [modelId, version] = String(metadata?.details?.domainId ?? '').split(' - ');
            return modelId && version ? { id: version, parent: { id: modelId } } : null;
          },
          match: 'WORKFLOW'
        }
      }
    },
    relatedData: [{ source: 'parent' }]
  }),
  ENIGMA_FORM_INSTANCE: new DomoObjectType('ENIGMA_FORM_INSTANCE', 'Form Instance', {
    api: { endpoint: '/forms/v1/instances/{id}', paths: { name: 'revision' } },
    icon: { component: 'CardNotebook' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    parent: { id: 'metadata.details.formId', typeId: 'ENIGMA_FORM' },
    relatedData: [{ source: 'parent' }]
  }),
  EXECUTOR_APPLICATION: new DomoObjectType('EXECUTOR_APPLICATION', 'Governance Toolkit Application', {
    api: { endpoint: '/executor/v1/applications/{id}', paths: { name: 'name' } },
    extractConfig: { keyword: 'governance-toolkit', valueMap: GOVERNANCE_TOOLKIT_APPLICATION_ID_BY_SLUG },
    icon: { component: 'Domobox' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    urlPath: '/admin/governance-toolkit/{slug}',
    urlSlugs: { map: GOVERNANCE_TOOLKIT_SLUG_BY_APPLICATION_ID, source: 'id' }
  }),
  EXECUTOR_JOB: new DomoObjectType('EXECUTOR_JOB', 'Governance Toolkit Job', {
    api: {
      endpoint: '/executor/v1/applications/{parent}/jobs/{id}',
      paths: { name: 'jobName' }
    },
    // Domo publishes no deep link to a job, so the extension's own param is what
    // carries it; the background drives the toolkit UI to open it on arrival.
    extractConfig: { keyword: GOVERNANCE_TOOLKIT_JOB_PARAM },
    featureSwitch: ['executor-pipeline', 'governance-toolkit-ui'],
    icon: { component: 'Toolbox' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    parent: {
      extract: { keyword: 'governance-toolkit', valueMap: GOVERNANCE_TOOLKIT_APPLICATION_ID_BY_SLUG },
      fetcher: 'governanceToolkitApplication',
      typeId: 'EXECUTOR_APPLICATION'
    },
    relatedData: [
      { label: 'Job', source: 'self' },
      { label: 'Application', source: 'parent' },
      {
        field: 'executionPayload.configDatasetId',
        label: 'Config DataSet',
        typeId: 'DATA_SOURCE'
      },
      {
        field: 'executionPayload.metricsDatasetId',
        label: 'Log DataSet',
        typeId: 'DATA_SOURCE'
      }
    ],
    urlPath: `/admin/governance-toolkit/{slug}?${GOVERNANCE_TOOLKIT_JOB_PARAM}={id}`,
    urlSlugs: { map: GOVERNANCE_TOOLKIT_SLUG_BY_APPLICATION_ID, source: 'parent' }
  }),
  FILE: new DomoObjectType('FILE', 'Document', {
    api: { endpoint: '/data/v1/data-files/{id}/details', paths: { name: 'name' } },
    icon: { component: 'Document' },
    idPattern: /^\d+$/
  }),
  FILE_REVISION: new DomoObjectType('FILE_REVISION', 'File Version', {
    api: {
      endpoint: '/data/v1/data-files/{parent}/revisions/{id}',
      paths: { name: 'name' }
    },
    icon: { component: 'Document' },
    idPattern: /^\d+$/,
    parent: 'FILE',
    relatedData: [{ source: 'parent' }]
  }),
  FILESET: new DomoObjectType('FILESET', 'Document Collection', {
    api: { endpoint: '/files/v1/filesets/{id}', paths: { name: 'name' } },
    extractConfig: { keyword: 'documents' },
    icon: { component: 'Folder' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    urlPath: '/datacenter/documents/{id}/overview'
  }),
  FILESET_DIRECTORY: new DomoObjectType('FILESET_DIRECTORY', 'Document Collection Directory', {
    icon: { component: 'Folder' },
    idPattern: /.*/
  }),
  FILESET_FILE: new DomoObjectType('FILESET_FILE', 'Document Collection Document', {
    api: {
      endpoint: '/files/v1/filesets/{parent}/files/{id}',
      paths: { name: 'name' }
    },
    icon: { component: 'Document' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    parent: 'FILESET',
    relatedData: [{ label: 'Document', source: 'self' }, { source: 'parent' }]
  }),
  GOAL: new DomoObjectType('GOAL', 'Goal', {
    aliases: ['OBJECTIVE'],
    api: { endpoint: '/social/v1/objectives/{id}', paths: { name: 'name' } },
    extractConfig: { keyword: 'goals' },
    featureSwitch: ['goals-beta', 'goals-v1'],
    icon: { component: 'Goals' },
    idPattern: /^\d+$/,
    urlPath: '/goals/{id}'
  }),
  GOAL_DELEGATE: new DomoObjectType('GOAL_DELEGATE', 'Goal Delegate', {
    icon: { component: 'Person' },
    idPattern: /^\d+$/
  }),
  GOAL_PERIOD: new DomoObjectType('GOAL_PERIOD', 'Goal Period', {
    api: { endpoint: '/social/v1/objectives/periods/{id}', paths: { name: 'name' } },
    icon: { component: 'CalendarTime' },
    idPattern: /^\d+$/
  }),
  GOAL_TAG: new DomoObjectType('GOAL_TAG', 'Goal Tag', {
    api: { endpoint: '/social/v1/objectives/tags?all=true', filterByIdField: 'id', paths: { name: 'name' } },
    icon: { component: 'Tag' },
    idPattern: /^\d+$/,
    parent: { id: 'metadata.details.category.id', typeId: 'TAG_CATEGORY' },
    relatedData: [{ source: 'parent' }]
  }),
  GROUP: new DomoObjectType('GROUP', 'Group', {
    api: { endpoint: '/content/v2/groups/{id}', paths: { created: 'created', name: 'name' } },
    extractConfig: { keyword: 'groups' },
    icon: { component: 'People' },
    idPattern: /^\d+$/,
    relatedData: [{ field: 'members', isArray: true, itemTypeId: 'USER', label: 'Members' }],
    urlPath: '/admin/groups/{id}?tab=people'
  }),
  HOPPER_QUEUE: new DomoObjectType('HOPPER_QUEUE', 'Task Center Queue', {
    api: { endpoint: '/queues/v1/{id}', paths: { created: 'createdOn', name: 'name' } },
    copyConfigs: [
      // Shown only when the queue is viewed from inside a workflow (the back-references
      // are absent on the standalone queue page). The plain-click copy falls back to the
      // queue id, so no primary entry is needed here.
      { label: 'Workflow ID', source: 'metadata.context.workflowModelId' },
      { label: 'Workflow Version', source: 'metadata.context.workflowVersionNumber' }
    ],
    extractConfig: { keyword: 'queueId' },
    featureSwitch: 'hopper',
    icon: { component: 'FormatListChecks' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    relatedData: [
      { label: 'Queue', source: 'self' },
      {
        field: 'workflowVersionNumber',
        fieldSource: 'context',
        label: 'Workflow Version',
        parentFieldSource: 'context',
        parentSource: 'workflowModelId',
        typeId: 'WORKFLOW_MODEL_VERSION'
      },
      {
        field: 'workflowModelId',
        fieldSource: 'context',
        label: 'Workflow',
        typeId: 'WORKFLOW_MODEL'
      }
    ],
    urlPath: '/queues/tasks?queueId={id}&status=OPEN'
  }),
  HOPPER_TASK: new DomoObjectType('HOPPER_TASK', 'Task Center Task', {
    api: {
      // `render=true` is what returns `displayEntity` at all; without it the
      // response has no name anywhere for tasks whose queue defines no name
      // attribute.
      endpoint: '/queues/v1/{parent}/tasks/{id}?render=true',
      paths: { created: 'createdOn', name: 'displayEntity.name' }
    },
    extractConfig: { keyword: 'id' },
    featureSwitch: 'hopper',
    icon: { component: 'FormatListChecks' },
    // Task IDs are case-sensitive, business-defined references (e.g.
    // "15AUG25_TS551E") or system UUIDs, never plain integers, so accept any
    // alphanumeric string with underscores or hyphens rather than a UUID shape.
    idPattern: /^[A-Za-z0-9_-]+$/,
    parent: { extract: { keyword: 'queueId', offset: 1 }, typeId: 'HOPPER_QUEUE' },
    relatedData: [
      { label: 'Task', source: 'self' },
      { label: 'Queue', source: 'parent' }
    ],
    urlPath: '/queues/tasks?queueId={parent}&id={id}&openTaskDrawer=true'
  }),
  HUDDLE: new DomoObjectType('HUDDLE', 'Buzz Thread', {
    icon: { component: 'ChatBubble' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  }),
  KEY_RESULT: new DomoObjectType('KEY_RESULT', 'Key Result', {
    api: {
      endpoint: '/social/v1/objectives/key-results/{id}',
      paths: { name: 'name' }
    },
    extractConfig: { keyword: 'key-results' },
    icon: { component: 'Goals' },
    idPattern: /^\d+$/,
    parent: { id: 'metadata.details.objectiveId', typeId: 'GOAL' },
    relatedData: [{ source: 'parent' }],
    urlPath: '/goals/key-results/{id}'
  }),
  LANDING_ENTITY: new DomoObjectType('LANDING_ENTITY', 'Landing Entity', {
    icon: { component: 'Building' },
    idPattern: /.*/
  }),
  MAGNUM_COLLECTION: new DomoObjectType('MAGNUM_COLLECTION', 'AppDB Collection', {
    api: {
      endpoint: '/datastores/v1/collections/{id}',
      paths: { name: 'name' }
    },
    extractConfig: { keyword: 'appDb' },
    icon: { component: 'DataCollection' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    parent: { id: 'metadata.details.datastoreId', typeId: 'MAGNUM_DATASTORE' },
    relatedData: [
      { label: 'Collection', source: 'self' },
      { field: 'datasourceId', label: 'DataSet', typeId: 'DATA_SOURCE' },
      { label: 'DataStore', source: 'parent' }
    ],
    urlPath: '/appDb/{id}/permissions'
  }),
  MAGNUM_DATASTORE: new DomoObjectType('MAGNUM_DATASTORE', 'AppDB Datastore', {
    api: { endpoint: '/datastores/v1/{id}', paths: { created: 'createdOn', name: 'name' } },
    icon: { component: 'DataCollection' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  }),
  METRIC: new DomoObjectType('METRIC', 'Metric', {
    featureSwitch: 'metrics',
    icon: { component: 'ChartLine' },
    idPattern: /.*/
  }),
  NAV_PIN_ITEM: new DomoObjectType('NAV_PIN_ITEM', 'Nav Pin Item', {
    icon: { component: 'Pin' },
    idPattern: /^\d+$/
  }),
  OAUTH2_CLIENT_CREDENTIALS: new DomoObjectType('OAUTH2_CLIENT_CREDENTIALS', 'Oauth 2.0 Client Credentials', {
    icon: { component: 'Key' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  }),
  PAGE: new DomoObjectType('PAGE', 'Page', {
    aliases: ['PAGE_ANALYZER', 'STORY', 'DASHBOARD'],
    api: {
      endpoint: '/content/v3/stacks/{id}',
      fallback: { endpoint: '/content/v1/pages/{id}/access', paths: { name: 'pageName' } },
      paths: { created: 'page.created', name: 'title' }
    },
    extractConfig: { keyword: 'page' },
    icon: { component: 'PagesBars' },
    idPattern: /^-?\d+$/,
    parent: { fetcher: 'pageParentPage', typeId: 'PAGE' },
    relatedData: [
      { label: 'Parent Page', source: 'parent' },
      {
        field: 'content',
        fieldSource: 'context',
        isArray: true,
        itemTypeField: 'type',
        label: 'Content'
      },
      {
        fetcher: 'datasetsForPage',
        isArray: true,
        itemIdField: 'id',
        itemTypeId: 'DATA_SOURCE',
        label: 'DataSets'
      }
    ],
    urlPath: '/page/{id}'
  }),
  PAGE_COLLECTION: new DomoObjectType('PAGE_COLLECTION', 'Page Collection', {
    // A collection is stored as a page row, so the page endpoint returns it.
    api: { endpoint: '/content/v1/pages/{id}', paths: { name: 'title' } },
    icon: { component: 'Pages' },
    idPattern: /^\d+$/,
    parent: { id: 'metadata.details.parentPageId', typeId: 'PAGE' },
    relatedData: [{ source: 'parent' }]
  }),
  PROJECT: new DomoObjectType('PROJECT', 'Project', {
    api: { endpoint: '/content/v1/projects/{id}', paths: { created: 'created', name: 'projectName' } },
    extractConfig: { keyword: 'project' },
    featureSwitch: '!no-projects-tasks',
    icon: { component: 'Project' },
    idPattern: /^\d+$/,
    urlPath: '/project/{id}'
  }),
  PROJECT_LIST: new DomoObjectType('PROJECT_LIST', 'Project List', {
    api: { endpoint: '/content/mobile/v1/projects/lists?ids={id}', filterByIdField: 'id', paths: { name: 'name' } },
    icon: { component: 'ListBulleted' },
    idPattern: /^\d+$/,
    parent: { id: 'metadata.details.projectId', typeId: 'PROJECT' },
    relatedData: [{ source: 'parent' }]
  }),
  PROJECT_TASK: new DomoObjectType('PROJECT_TASK', 'Task', {
    api: { endpoint: '/content/v1/tasks/{id}', paths: { name: 'taskName' } },
    extractConfig: { keyword: 'taskId' },
    featureSwitch: '!no-projects-tasks',
    icon: { component: 'Project' },
    idPattern: /^\d+$/,
    parent: { id: 'metadata.details.projectId', typeId: 'PROJECT' },
    relatedData: [{ source: 'parent' }],
    urlPath: '/project?taskId={id}'
  }),
  PROJECT_TASK_ATTACHMENT: new DomoObjectType('PROJECT_TASK_ATTACHMENT', 'Task Attachment', {
    icon: { component: 'Document' },
    idPattern: /^\d+$/,
    // No endpoint goes from an attachment to its task, so only a caller listing a task's attachments knows it.
    parent: 'PROJECT_TASK'
  }),
  PROXY_USER: new DomoObjectType('PROXY_USER', 'Proxy User', {
    idPattern: /.*/
  }),
  PUBLIC_URL: new DomoObjectType('PUBLIC_URL', 'Embed URL', {
    // Cards, pages, and App Studio apps each keep their embeds behind a separate summary endpoint.
    api: {
      anyOf: [
        '/content/v1/cards/kpi/embed/summary',
        '/content/v1/pages/embed/summary',
        '/content/v1/dataapps/embed/summary'
      ].map((endpoint) => ({
        bodyTemplate: { embedIdSearchText: '{id}' },
        endpoint: `${endpoint}?limit=50&offset=0`,
        filterByIdField: 'gatewayToken',
        listPath: 'summaries',
        method: 'POST',
        paths: { name: 'gatewayToken' }
      }))
    },
    icon: { component: 'CodeTags' },
    idPattern: /^(?=.*[A-Za-z])[A-Za-z0-9]{5}$/
  }),
  PUBLICATION: new DomoObjectType('PUBLICATION', 'Publication', {
    api: { endpoint: '/publish/v2/publications/{id}', paths: { created: 'created', name: 'name' } },
    extractConfig: { keyword: 'id' },
    featureSwitch: ['publish-everywhere', 'publish-everywhere-v2'],
    icon: { component: 'Newspaper' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    urlPath: '/admin/domo-everywhere/publications?id={id}'
  }),
  PUBLICATION_GROUP: new DomoObjectType('PUBLICATION_GROUP', 'Publication Group', {
    idPattern: /^\d+$/
  }),
  REPORT: new DomoObjectType('REPORT', 'Report', {
    // Left id-only: the audit log mixes id spaces under this type (Unsubscribed
    // events key off a schedule id, Created/Updated/Deleted do not), so an api or
    // urlPath would resolve the wrong object for one action or the other.
    idPattern: /^\d+$/
  }),
  REPORT_BUILDER: new DomoObjectType('REPORT_BUILDER', 'Report Builder', {
    api: { endpoint: '/content/v1/reportbuilder/{id}', paths: { name: 'title' } },
    copyConfigs: [
      { label: 'App ID', source: 'metadata.context.dataAppId' },
      { label: 'Report Page ID', source: 'metadata.context.reportPageId' }
    ],
    featureSwitch: 'report-builder',
    // CheckIn looks unrelated to a report on its own, but it is the icon Domo uses
    // for reports in its own UI. Matching Domo is the point; don't "fix" it.
    icon: { component: 'CheckIn' },
    idPattern: /^\d+$/,
    // No urlPath: Domo has no working report URL. Its ?report= param on an
    // app-studio URL reaches a modal that keys its layout off an in-page
    // singleton, so a cold link renders a blank report. Navigate via the app.
    parent: { id: 'metadata.context.dataAppId', typeId: 'DATA_APP' },
    relatedData: [
      { source: 'parent' },
      { field: 'reportPageId', fieldSource: 'context', label: 'Report Page', typeId: 'REPORT_BUILDER_PAGE' },
      {
        fetcher: 'reportSchedules',
        isArray: true,
        itemIdField: 'reportViewId',
        itemTypeId: 'REPORT_BUILDER_VIEW',
        label: 'Deliveries'
      }
    ]
  }),
  REPORT_BUILDER_PAGE: new DomoObjectType('REPORT_BUILDER_PAGE', 'Report Page', {
    api: {
      endpoint: '/content/v3/stacks/{id}',
      paths: { created: 'page.created', name: 'title' }
    },
    featureSwitch: 'report-builder',
    icon: { component: 'PagesBars' },
    idPattern: /^\d+$/,
    parent: { id: 'metadata.context.reportId', typeId: 'REPORT_BUILDER' },
    relatedData: [
      { label: 'Report', source: 'parent' },
      { field: 'dataAppId', fieldSource: 'context', label: 'Studio App', typeId: 'DATA_APP' },
      {
        field: 'content',
        fieldSource: 'context',
        isArray: true,
        itemTypeField: 'type',
        label: 'Content'
      }
    ]
  }),
  REPORT_BUILDER_VIEW: new DomoObjectType('REPORT_BUILDER_VIEW', 'Report View', {
    api: {
      endpoint: '/content/v1/reportbuilder/views/{id}',
      paths: { name: 'subject' }
    },
    featureSwitch: 'report-builder',
    icon: { component: 'Document' },
    idPattern: /^\d+$/,
    parent: { id: 'metadata.context.reportId', typeId: 'REPORT_BUILDER' },
    relatedData: [{ label: 'Report', source: 'parent' }],
    // A delivery target, not a page. Shares an id space with REPORT_SCHEDULE (both
    // key off report_schedule.report_id), hence the same URL.
    urlPath: '/scheduled-reports/history/{id}'
  }),
  REPORT_SCHEDULE: new DomoObjectType('REPORT_SCHEDULE', 'Scheduled Report', {
    api: {
      endpoint: '/content/v1/reportschedules/{id}',
      paths: { created: 'schedule.startDate', name: 'title' }
    },
    featureSwitch: 'scheduled-reports',
    icon: { component: 'Calendar' },
    idPattern: /^\d+$/,
    parent: { id: 'metadata.details.viewId', typeId: 'CONTAINER_VIEW' },
    relatedData: [
      { label: 'View', source: 'parent' },
      { field: 'resourceId', fieldSource: 'parent', label: 'Resource', typeField: 'resourceType' },
      // Only present when the schedule belongs to a Report Builder report, which
      // is also the only case the enrichment spends a request on.
      { field: 'reportId', fieldSource: 'context', label: 'Report', typeId: 'REPORT_BUILDER' },
      { field: 'dataAppId', fieldSource: 'context', label: 'Studio App', typeId: 'DATA_APP' }
    ],
    urlPath: '/scheduled-reports/history/{id}'
  }),
  REPOSITORY: new DomoObjectType('REPOSITORY', 'Sandbox Repository', {
    api: { endpoint: '/version/v1/repositories/{id}', paths: { name: 'name' } },
    extractConfig: { keyword: 'repositories' },
    featureSwitch: ['domo-versions-standard', 'domo-versions-ui'],
    icon: { component: 'Sandcastle' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    urlPath: '/admin/sandbox/repositories/{id}'
  }),
  REPOSITORY_AUTHORIZATION: new DomoObjectType('REPOSITORY_AUTHORIZATION', 'Repository Authorization', {
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  }),
  ROLE: new DomoObjectType('ROLE', 'Role', {
    api: { endpoint: '/authorization/v1/roles/{id}', paths: { created: 'created', name: 'name' } },
    extractConfig: { keyword: 'roles' },
    icon: { component: 'Shield' },
    idPattern: /^\d+$/,
    urlPath: '/admin/roles/{id}?tab=grants'
  }),
  RYUU_APP: new DomoObjectType('RYUU_APP', 'Custom App Design (Pro-Code)', {
    api: {
      endpoint: '/apps/v1/designs/{id}?parts=versions',
      paths: { created: 'createdDate', latestVersion: 'latestVersion', name: 'name', versions: 'versions' }
    },
    extractConfig: { keyword: 'assetlibrary' },
    icon: { component: 'Code' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    relatedData: [
      { fetcher: 'designInstances', isArray: true, itemTypeId: 'APP_INSTANCE', label: 'Instances' },
      { fetcher: 'designCards', isArray: true, itemTypeId: 'CARD', label: 'Cards' }
    ],
    urlPath: '/assetlibrary/{id}/overview'
  }),
  SEGMENT: new DomoObjectType('SEGMENT', 'Segment', { idPattern: /^\d+$/ }),
  SESSION: new DomoObjectType('SESSION', 'Session', {
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  }),
  STREAM: new DomoObjectType('STREAM', 'Stream', {
    api: {
      endpoint: '/data/v1/streams/{id}?fields=all',
      nameTemplate: '{dataProvider.name} Stream {id}',
      paths: { created: 'createdAt', name: 'dataProvider.name' }
    },
    icon: { component: 'Database' },
    idPattern: /^\d+$/,
    parent: { id: 'metadata.details.dataSource.id', typeId: 'DATA_SOURCE' },
    redirectsToType: 'DATA_SOURCE',
    relatedData: [{ source: 'parent' }]
  }),
  SUBSCRIPTION: new DomoObjectType('SUBSCRIPTION', 'Subscription', {
    featureSwitch: ['publish-everywhere', 'publish-everywhere-v2'],
    icon: { component: 'FileDrawer' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  }),
  TAG_CATEGORY: new DomoObjectType('TAG_CATEGORY', 'Goal Tag Category', {
    api: { endpoint: '/social/v1/objectives/tags/categories?all=true', filterByIdField: 'id', paths: { name: 'name' } },
    icon: { component: 'Tag' },
    idPattern: /^\d+$/
  }),
  TEMPLATE: new DomoObjectType('TEMPLATE', 'Approval Template', {
    api: {
      bodyTemplate: {
        operationName: 'getTemplateForEdit',
        query:
          'query getTemplateForEdit($id: ID!) {\n template(id: $id) {\n datasetId \n id\n title\n titleName\n titlePlaceholder\n acknowledgment\n instructions\n description\n providerName\n isPublic\n chainIsLocked\n type\n isPublished\n observers {\n id\n type\n displayName\n avatarKey\n title\n ... on Group {\n userCount\n __typename\n }\n __typename\n }\n categories {\n id\n name\n __typename\n }\n owner {\n id\n displayName\n avatarKey\n __typename\n }\n fields {\n key\n type\n name\n data\n placeholder\n required\n isPrivate\n ... on SelectField {\n option\n multiselect\n datasource\n column\n order\n __typename\n }\n __typename\n }\n approvers {\n type\n originalType: type\n key\n ... on ApproverPerson {\n id: approverId\n approverId\n userDetails {\n id\n displayName\n title\n avatarKey\n isDeleted\n __typename\n }\n __typename\n }\n ... on ApproverGroup {\n id: approverId\n approverId\n groupDetails {\n id\n displayName\n userCount\n isDeleted\n __typename\n }\n __typename\n }\n ... on ApproverPlaceholder {\n placeholderText\n __typename\n }\n __typename\n }\n workflowIntegration {\n modelId\n modelVersion\n startName\n modelName\n parameterMapping {\n fields {\n field\n parameter\n required\n type\n __typename\n }\n __typename\n }\n __typename\n }\n __typename\n }\n}',
        variables: { id: '{id}' }
      },
      endpoint: '/synapse/approval/graphql',
      method: 'POST',
      paths: { details: 'data.template', name: 'data.template.title' }
    },
    extractConfig: { keyword: 'approval', offset: 2 },
    featureSwitch: 'approvalcenter',
    icon: { component: 'ApprovalCenter' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    relatedData: [
      {
        field: 'datasetId',
        label: 'DataSet',
        typeId: 'DATA_SOURCE'
      },
      {
        fetcher: 'templateApprovals',
        isArray: true,
        itemIdField: 'id',
        itemTypeId: 'APPROVAL',
        label: 'Approvals'
      }
    ],
    urlPath: '/approval/edit-request-form/{id}'
  }),
  TOKEN: new DomoObjectType('TOKEN', 'API Client', {
    icon: { component: 'Key' },
    idPattern: /^\d+$/
  }),
  USER: new DomoObjectType('USER', 'User', {
    api: {
      endpoint: '/content/v3/users/{id}?includeDetails=true',
      paths: { created: 'detail.created', name: 'displayName' }
    },
    extractConfig: { keyword: 'people' },
    icon: { component: 'Person' },
    idPattern: /^\d+$/,
    relatedData: [
      {
        field: 'roleId',
        label: 'Role',
        typeId: 'ROLE'
      }
    ],
    urlPath: '/admin/people/{id}?tab=profile'
  }),
  USER_CUSTOM_KEY: new DomoObjectType('USER_CUSTOM_KEY', 'User Custom Attribute', {
    idPattern: /.*/
  }),
  USER_TEMPLATE: new DomoObjectType('USER_TEMPLATE', 'User Template', {
    copyConfigs: true,
    idPattern: /^\d+$/
  }),
  VARIABLE: new DomoObjectType('VARIABLE', 'Variable', {
    api: {
      endpoint: '/query/v1/functions/template/{id}?hidden=true',
      paths: { name: 'name' }
    },
    icon: { component: 'Variable' },
    idPattern: /^\d+$/,
    urlPath: '/datacenter/beastmode?id={id}'
  }),
  VARIABLE_CONTROL: new DomoObjectType('VARIABLE_CONTROL', 'Variable Control', {
    api: { endpoint: '/content/v1/variable/controls?ids={id}', filterByIdField: 'id', paths: { name: 'name' } },
    idPattern: /^\d+$/,
    parent: { id: 'metadata.details.function.id', typeId: 'VARIABLE' },
    relatedData: [{ source: 'parent' }]
  }),
  VECTOR_INDEX: new DomoObjectType('VECTOR_INDEX', 'Vector Index', {
    icon: { component: 'Vector' },
    idPattern: /.*/
  }),
  VIEW: new DomoObjectType('VIEW', 'View', {
    // A view built on one dataset lives on it; one joining several has no single parent. A view's own
    // stream only carries its definition, so it never counts as the parent.
    ...derivedDatasetConfig({ fetcher: 'singleSourceDataset', typeId: 'DATA_SOURCE' }),
    activityLogTypes: ['DATA_SOURCE', 'VIEW'],
    extractConfig: { keyword: 'datasources' },
    icon: { component: 'TableSelect' }
  }),
  VIEW_ADVANCED_EDITOR: new DomoObjectType('VIEW_ADVANCED_EDITOR', 'View Advanced Editor', {
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  }),
  VIRTUAL_USER: new DomoObjectType('VIRTUAL_USER', 'Virtual User', {
    idPattern: /^vu:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  }),
  WAREHOUSE_ACCOUNT: new DomoObjectType('WAREHOUSE_ACCOUNT', 'Cloud Integration', {
    api: {
      endpoint: '/query/v1/byos/accounts/{id}',
      paths: { created: 'properties.friendlyName.created', name: 'friendlyName' }
    },
    extractConfig: { keyword: 'cloud-integrations' },
    icon: { component: 'DataWarehouse' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    parent: { id: 'metadata.details.serviceAccountId', typeId: 'ACCOUNT' },
    relatedData: [{ source: 'parent' }],
    urlPath: '/cloud-integrations/{id}/settings'
  }),
  WORKBENCH_AGENT: new DomoObjectType('WORKBENCH_AGENT', 'On Premise Agent', {
    idPattern: /.*/
  }),
  WORKBENCH_GROUP: new DomoObjectType('WORKBENCH_GROUP', 'Workbench Group', {
    idPattern: /^\d+$/
  }),
  WORKBENCH_JOB: new DomoObjectType('WORKBENCH_JOB', 'On Premise Job', {
    aliases: ['JOB'],
    idPattern: /^\d+$/
  }),
  WORKBENCH_SCHEDULE: new DomoObjectType('WORKBENCH_SCHEDULE', 'On Premise Job Schedule', {
    idPattern: /.*/
  }),
  WORKFLOW_INSTANCE: new DomoObjectType('WORKFLOW_INSTANCE', 'Workflow Execution', {
    api: {
      displayName: 'Run of {parent.name} - {name}',
      endpoint: '/workflow/v2/executions/{id}',
      nameFormat: 'timestamp',
      paths: { name: ['startedAt', 'createdAt'] }
    },
    copyConfigs: [{ label: 'Workflow ID', source: 'parent.id' }],
    extractConfig: {
      keyword: 'instances',
      offset: 3,
      urlParamExtracts: { version: { keyword: 'instances', offset: 2 } }
    },
    icon: { component: 'Play' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    parent: { extract: { keyword: 'instances', offset: 1 }, typeId: 'WORKFLOW_MODEL' },
    relatedData: [
      { label: 'Execution', source: 'self' },
      {
        field: 'modelVersion',
        label: 'Version',
        parentSource: 'parent',
        typeId: 'WORKFLOW_MODEL_VERSION'
      },
      { source: 'parent' }
    ],
    urlPath: '/workflows/instances/{parent}/{version}/{id}'
  }),
  WORKFLOW_MODEL: new DomoObjectType('WORKFLOW_MODEL', 'Workflow', {
    api: { endpoint: '/workflow/v1/models/{id}', paths: { created: 'createdOn', name: 'name' } },
    extractConfig: { keyword: 'workflows', offset: 2 },
    featureSwitch: 'workflows',
    icon: { component: 'Workflow' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    relatedData: [
      {
        field: 'versions',
        isArray: true,
        itemIdField: 'version',
        itemTypeId: 'WORKFLOW_MODEL_VERSION',
        label: 'Versions',
        parentSource: 'objectId'
      },
      {
        fetcher: 'workflowTriggers',
        isArray: true,
        itemIdField: 'id',
        itemTypeId: 'WORKFLOW_TRIGGER',
        label: 'Triggers',
        parentSource: 'objectId'
      }
    ],
    urlPath: '/workflows/models/{id}'
  }),
  WORKFLOW_MODEL_VERSION: new DomoObjectType('WORKFLOW_MODEL_VERSION', 'Workflow Version', {
    api: {
      displayName: '{parent.name} - {id}',
      endpoint: '/workflow/v2/models/{parent}/versions/{id}',
      nameFromDisplayName: true,
      paths: { name: 'version' }
    },
    copyConfigs: [
      { label: 'Workflow ID', primary: true, source: 'parent.id' },
      { label: 'Version Number', source: 'id' }
    ],
    extractConfig: { keyword: 'workflows', offset: 3 },
    icon: { component: 'Workflow' },
    idPattern: /^[0-9]+\.[0-9]+\.[0-9]+$/,
    parent: { extract: { keyword: 'workflows', offset: 2 }, typeId: 'WORKFLOW_MODEL' },
    relatedData: [{ label: 'Version', source: 'self' }, { source: 'parent' }],
    urlPath: '/workflows/models/{parent}/{id}?_wfv=view'
  }),
  WORKFLOW_TRIGGER: new DomoObjectType('WORKFLOW_TRIGGER', 'Workflow Trigger', {
    api: { endpoint: '/workflow/v2/triggers/{id}', paths: { name: 'name' } },
    icon: { component: 'Clock' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    parent: 'WORKFLOW_MODEL',
    relatedData: [{ label: 'Trigger', source: 'self' }, { source: 'parent' }],
    urlPath: '/workflows/triggers/{parent}'
  }),
  WORKSHEET: new DomoObjectType('WORKSHEET', 'Worksheet', {
    api: { endpoint: '/content/v1/dataapps/{id}', paths: { name: 'title' } },
    extractConfig: { keyword: 'app-studio' },
    featureSwitch: 'app-studio-worksheets',
    icon: { component: 'Worksheets' },
    idPattern: /^\d+$/,
    urlPath: '/app-studio/{id}'
  }),
  WORKSHEET_VIEW: new DomoObjectType('WORKSHEET_VIEW', 'Worksheet View', {
    api: {
      displayName: '{parent.name} > {name}',
      endpoint: '/content/v3/stacks/{id}',
      fallback: { endpoint: '/content/v1/pages/{id}/access', paths: { name: 'pageName' } },
      paths: { created: 'page.created', name: 'title' }
    },
    copyConfigs: [{ label: 'Worksheet ID', source: 'parent.id' }],
    extractConfig: { keyword: 'pages' },
    featureSwitch: 'app-studio-worksheets',
    icon: { component: 'PagesBars' },
    idPattern: /^\d+$/,
    parent: { extract: { keyword: 'app-studio', offset: 1 }, typeId: 'WORKSHEET' },
    relatedData: [
      { source: 'parent' },
      {
        fetcher: 'datasetsForPage',
        isArray: true,
        itemIdField: 'id',
        itemTypeId: 'DATA_SOURCE',
        label: 'DataSets'
      }
    ],
    urlPath: '/app-studio/{parent}/pages/{id}'
  }),
  WORKSPACE: new DomoObjectType('WORKSPACE', 'Workspace', {
    api: { endpoint: '/nav/v1/workspaces/{id}', paths: { name: 'name' } },
    extractConfig: { keyword: 'workspaces' },
    featureSwitch: ['workspaces-react', 'workspaces-v1'],
    icon: { component: 'Workspace' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    urlPath: '/workspaces/{id}'
  })
};

/**
 * Fetch object details from the Domo API and enrich metadata (page-safe version)
 * This version can be executed in page context via executeInPage
 * @param {Object} params - Parameters object
 * @param {string} params.typeId - The object type ID
 * @param {string} params.objectId - The object ID
 * @param {Object} params.apiConfig - The API configuration {method, endpoint, bodyTemplate, paths}.
 *   `paths` maps a metadata field to its dot-path in the response (e.g. {created, details, name, parentId}).
 *   Every entry except `details` is resolved generically, so new fields need only a `paths` entry here.
 *   An `anyOf` array of configs replaces the primary for a type spread across several endpoints; each is
 *   tried in order and the first to find the object wins. A config's `listPath` points at a list in the
 *   response whose first entry (or the one matching `filterByIdField`) is the object, a miss when empty.
 *   An optional `fallback` is a second config of the same shape, tried when the primary endpoint
 *   answers non-ok. It declares its own `endpoint` and `paths` rather than merging over the primary,
 *   because it reads a differently shaped response.
 * @param {boolean} params.requiresParent - Whether parent ID is required for API
 * @param {string} [params.parentId] - Optional parent ID if already known
 * @param {'auto'|'off'|'only'} [params.fallbackMode='auto'] - Whether `apiConfig.fallback` may run:
 *   'auto' tries it after the primary fails, 'off' never tries it, 'only' skips the primary. Pass
 *   'off' where a fallback shared by sibling types must not answer before each type's own endpoint.
 * @param {boolean} [params.throwOnError=true] - Whether to throw errors
 * @param {boolean} [params.expectMisses=false] - Set by callers that probe an ID against many types
 *   in turn, where a non-answer identifies the type rather than indicating a fault. Silences the
 *   two expected-failure warnings below; a thrown exception is still reported.
 * @returns {Promise<Object>} Metadata object {created, details, name, parentId}, carrying
 *   `viaFallback: true` when the fallback config produced it
 */
export async function fetchObjectDetailsInPage(params) {
  const {
    apiConfig,
    expectMisses = false,
    fallbackMode = 'auto',
    objectId,
    parentId,
    requiresParent,
    throwOnError = true,
    typeId
  } = params;

  try {
    if (requiresParent && !parentId) {
      const error = new Error(`Cannot fetch details for ${typeId} ${objectId} because parent ID is required`);
      if (throwOnError) throw error;
      if (!expectMisses) console.warn(error.message);
      return { details: null, name: null };
    }

    // Declared inside the exported function because this whole function is serialized and injected
    // into the page: it may close over these locals, but nothing at module scope exists there.
    const attemptFetch = async (config) => {
      const {
        bodyTemplate = null,
        endpoint,
        filterByIdField = null,
        listPath = null,
        method = 'GET',
        nameFormat = null,
        nameTemplate = null,
        paths = {}
      } = config;

      // Build the endpoint URL
      let url;
      if (requiresParent) {
        // Replace {parent} in endpoint
        url = endpoint.replace('{parent}', parentId);
        url = `/api${url.replace('{id}', objectId)}`;
      } else {
        url = `/api${endpoint}`.replace('{id}', objectId);
      }

      // Prepare fetch options
      const options = {
        method
      };

      // Add body for POST requests
      if (method !== 'GET' && bodyTemplate) {
        options.body = JSON.stringify(bodyTemplate).replace(/{id}/g, objectId);
        if (parentId) {
          options.body = options.body.replace(/{parent}/g, parentId);
        }
        options.headers = {
          'Content-Type': 'application/json'
        };
      }

      const response = await fetch(url, options);

      if (!response.ok) {
        return {
          ok: false,
          reason: `Failed to fetch details for ${typeId} ${objectId}: HTTP ${response.status}`
        };
      }

      let data = await response.json();

      if (listPath) {
        const list = (listPath.match(/[^.[\]]+/g) || []).reduce((current, prop) => current?.[prop], data);
        const items = Array.isArray(list) ? list : [];
        data =
          (filterByIdField ? items.find((item) => String(item[filterByIdField]) === String(objectId)) : items[0]) ?? null;
        if (!data) {
          return { ok: false, reason: `${typeId} ${objectId} not found in list response` };
        }
      } else if (filterByIdField && Array.isArray(data)) {
        data = data.find((item) => String(item[filterByIdField]) === String(objectId)) || null;
        if (!data) {
          return { ok: false, reason: `${typeId} ${objectId} not found in list response` };
        }
      }

      const resolvePath = (path) => (path.match(/[^.[\]]+/g) || []).reduce((current, prop) => current?.[prop], data);
      // A declared path may be an array of candidates, in which case the first one that resolves to
      // something non-empty wins. Needed where a field is optional in the API and the platform itself
      // falls back to another field (e.g. an approval request whose own `title` is blank shows its
      // template's title). An empty string counts as a miss, not a value.
      const resolveField = (path) =>
        Array.isArray(path) ? path.map(resolvePath).find((value) => value != null && value !== '') : resolvePath(path);
      const details = paths.details ? resolveField(paths.details) : data;
      // Resolve every declared path (other than `details`, handled above) generically against the
      // raw response. New metadata fields are added by declaring a path in the type's `api.paths`,
      // with no change needed here.
      const resolved = {};
      for (const field of Object.keys(paths)) {
        if (field === 'details') continue;
        resolved[field] = resolveField(paths[field]);
      }
      // Inline timestamp->locale formatter, kept self-contained because this function is serialized
      // and run in the page via executeInPage (no imports/closures). Mirrors formatTimestamp in
      // utils/general.js; falls back to the object id when the value is not a usable timestamp.
      const formatTimestampName = (value) => {
        if (value == null || value === '') return String(objectId);
        const num = Number(value);
        let ms = null;
        if (Number.isFinite(num) && num > 0) {
          if (num >= 1e12 && num < 1e14) {
            ms = num;
          } else if (num >= 1e9 && num < 1e11) {
            ms = num * 1000;
          }
        } else if (typeof value === 'string') {
          const parsed = new Date(value.trim()).getTime();
          if (!isNaN(parsed)) ms = parsed;
        }
        if (ms === null) return String(objectId);
        const date = new Date(ms);
        return isNaN(date.getTime()) ? String(objectId) : `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
      };
      const rawName = nameTemplate
        ? nameTemplate.replace(/{([^}]+)}/g, (_, path) => (path === 'id' ? objectId : (resolvePath(path) ?? '')))
        : resolved.name;
      resolved.name = nameFormat === 'timestamp' ? formatTimestampName(rawName) : rawName;
      // Created date: prefer the declared path (resolved above); otherwise scan the resolved details
      // for a common creation field so every type gets best-effort coverage. Top-level keys only, so
      // a nested unrelated timestamp is never mistaken for the object's creation date.
      const createdFallbackKeys = [
        'created',
        'createdAt',
        'createdDate',
        'createDate',
        'creationDate',
        'dateCreated',
        'createdOn',
        'createdTime',
        'createTime'
      ];
      if (resolved.created == null && details && typeof details === 'object' && !Array.isArray(details)) {
        for (const key of createdFallbackKeys) {
          if (details[key] != null) {
            resolved.created = details[key];
            break;
          }
        }
      }

      return { ok: true, value: { ...resolved, details } };
    };

    const configs = [];
    if (fallbackMode !== 'only') configs.push(...(apiConfig.anyOf ?? [apiConfig]));
    if (apiConfig.fallback && fallbackMode !== 'off') configs.push(apiConfig.fallback);

    let firstReason = null;
    for (const config of configs) {
      const attempt = await attemptFetch(config);
      if (attempt.ok) {
        return config === apiConfig.fallback ? { ...attempt.value, viaFallback: true } : attempt.value;
      }
      // Report the first attempt's failure: it is the one the caller asked for, and a fallback's
      // status says nothing useful about why the object's own endpoint refused.
      if (firstReason == null) firstReason = attempt.reason;
    }

    const error = new Error(firstReason || `Cannot fetch details for ${typeId} ${objectId}: no endpoint configured`);
    if (throwOnError) throw error;
    if (!expectMisses) console.warn(error.message);
    return { details: null, name: null };
  } catch (error) {
    console.error(`Error fetching details for ${typeId}:`, error);
    if (throwOnError) throw error;
    return { details: null, name: null };
  }
}

/**
 * Get all object types that have either a navigable URL or an API configuration.
 * Suitable for the clipboard navigation dropdown where non-URL types
 * can be viewed in the sidepanel instead.
 * @returns {DomoObjectType[]} Array of DomoObjectType instances
 */
export function getAllNavigableObjectTypes() {
  return Object.values(ObjectTypeRegistry).filter(
    (type) => (type.hasUrl() || type.hasApiConfig()) && type.idPattern !== null
  );
}

/**
 * Get all registered object types
 * @returns {DomoObjectType[]} Array of all DomoObjectType instances
 */
export function getAllObjectTypes() {
  return Object.values(ObjectTypeRegistry);
}

/**
 * Get all object types that have an API configuration
 * @returns {DomoObjectType[]} Array of DomoObjectType instances with apiConfig defined
 */
export function getAllObjectTypesWithApiConfig() {
  return Object.values(ObjectTypeRegistry).filter((type) => type.hasApiConfig());
}

/**
 * Get all object types that have a navigable URL
 * @returns {DomoObjectType[]} Array of DomoObjectType instances with urlPath defined
 */
export function getAllObjectTypesWithUrl() {
  return Object.values(ObjectTypeRegistry).filter((type) => type.hasUrl());
}

/**
 * Reverse lookup table: alias type ID → canonical DomoObjectType.
 * Built once at module load; the registry is static after that.
 */
const ALIAS_LOOKUP = (() => {
  const map = {};
  for (const type of Object.values(ObjectTypeRegistry)) {
    if (!type.aliases) continue;
    for (const alias of type.aliases) {
      map[alias] = type;
    }
  }
  return map;
})();

/**
 * Get a DomoObjectType by its type ID, falling back to alias lookup.
 * Aliases let renamed types (e.g. OBJECTIVE → GOAL) keep working without
 * duplicating their config; both IDs resolve to the same canonical instance.
 * @param {string} type - The type ID or alias
 * @returns {DomoObjectType|null} The canonical DomoObjectType instance, or null if not found
 */
export function getObjectType(type) {
  return ObjectTypeRegistry[type] || ALIAS_LOOKUP[type] || null;
}

/**
 * The registry config every derived dataset (view, data fusion, data model) shares.
 * All three are datasets carrying their own definition, so they sit on the dataset
 * endpoint and the dataset detail URL, and differ only in label, icon and how they
 * are logged. Sharing the URL is what lets `refineTypeFromMetadata` swap between
 * them without invalidating an already-built URL.
 * @returns {Object} Options for the `DomoObjectType` constructor
 */
function derivedDatasetConfig(parent = { id: 'metadata.details.streamId', typeId: 'STREAM' }) {
  return {
    api: {
      endpoint: '/data/v3/datasources/{id}?includeAllDetails=true',
      paths: { created: 'created', name: 'name' }
    },
    copyConfigs: [{ label: 'Stream ID', source: 'metadata.details.streamId' }],
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    parent,
    relatedData: [
      { source: 'parent' },
      { fetcher: 'datasetDefinition', label: 'Definition' },
      { field: 'approvalTemplateId', fieldSource: 'context', label: 'Approval Template', typeId: 'TEMPLATE' },
      { fetcher: 'datasetColumns', isArray: true, label: 'Columns' }
    ],
    urlPath: '/datasources/{id}/details/overview'
  };
}

/**
 * Pull one keyword-anchored segment out of a URL, optionally translating it through `valueMap`.
 * @param {string} url - The URL to extract from
 * @param {Object} [config] - `{ keyword, offset, fromEnd, valueMap }`
 * @returns {string|null} The extracted (and mapped) value, or null
 */
function extractUrlPart(url, config) {
  if (!config) {
    return null;
  }

  const parts = url.split(/[/?=&]/);
  const { fromEnd = false, keyword, offset = 1, valueMap } = config;

  let value;
  if (fromEnd) {
    value = parts[parts.length - offset] || null;
  } else {
    // Lowercase keyword to match lowercased URLs from content script detection
    const index = parts.indexOf(keyword.toLowerCase());
    if (index === -1) {
      return null;
    }
    value = parts[index + offset] || null;
  }

  if (value && valueMap) {
    return valueMap[value] ?? null;
  }

  return value;
}

// Each type entry inherits the shared fields it doesn't override.
function normalizeParentConfig(config) {
  if (!config) return null;
  if (typeof config === 'string') return { type: null, types: [{ typeId: config }] };
  if (config.typeId) return { type: null, types: [{ ...config }] };
  const { type = null, types, ...shared } = config;
  return {
    type,
    types: Object.entries(types).map(([typeId, entry]) => ({ ...shared, ...entry, typeId }))
  };
}

function resolveParentSource(source, domoObject) {
  if (source == null) return null;
  if (Array.isArray(source)) {
    for (const candidate of source) {
      const value = resolveParentSource(candidate, domoObject);
      if (value != null && value !== '') return value;
    }
    return null;
  }
  if (typeof source === 'function') return source(domoObject) ?? null;
  return source.split('.').reduce((current, key) => current?.[key], domoObject) ?? null;
}

const IRREGULAR_PLURAL_TYPE_NAMES = {
  AI_TOOLKIT_DOMO_PROVIDED: 'AI Toolkits (Domo)',
  APP: 'Custom App Designs (Brick)',
  CERTIFICATION_PROCESS: 'Certification Processes',
  OAUTH2_CLIENT_CREDENTIALS: 'Oauth 2.0 Client Credentials',
  RYUU_APP: 'Custom App Designs (Pro-Code)',
  VECTOR_INDEX: 'Vector Indexes'
};

/**
 * Plural display name for a type, e.g. `DATA_APP` → `Studio Apps`.
 * @param {string} typeId - The type ID or alias
 * @returns {string} Plural human-readable name, or the raw type ID when unknown
 */
export function getPluralTypeName(typeId) {
  if (IRREGULAR_PLURAL_TYPE_NAMES[typeId]) return IRREGULAR_PLURAL_TYPE_NAMES[typeId];
  const name = getObjectType(typeId)?.name;
  return name ? `${name}s` : typeId;
}

/**
 * Evaluate a `when` visibility condition against a Domo object. Shared by the
 * Copy button's `copyConfigs` and the Current Context footer's `relatedData`.
 * @param {string|Object|Function} when - String dot-path (truthy check), a function (domoObject) => boolean,
 *   or { field, matches } / { field, notMatches } for case-insensitive (in)equality,
 *   or { field, length } for array-length equality
 * @param {Object} domoObject - The DomoObject to resolve paths against
 * @returns {boolean} Whether the condition is met
 */
export function matchesCondition(when, domoObject) {
  if (typeof when === 'function') return !!when(domoObject);
  const resolve = (path) => path.split('.').reduce((cur, key) => cur?.[key], domoObject);
  if (typeof when === 'string') return !!resolve(when);
  const val = resolve(when.field);
  if (when.length !== undefined) return Array.isArray(val) && val.length === when.length;
  if (when.notMatches !== undefined) {
    return typeof val !== 'string' || val.toLowerCase() !== when.notMatches.toLowerCase();
  }
  return typeof val === 'string' && val.toLowerCase() === when.matches.toLowerCase();
}

// Keyed by the `type` /content/v3/stacks/{id} reports for the page types sharing it.
const STACKS_TYPE_BY_RESPONSE = { dav: 'DATA_APP_VIEW', page: 'PAGE', rbv: 'REPORT_BUILDER_PAGE' };
const STACKS_TYPE_IDS = new Set([...Object.values(STACKS_TYPE_BY_RESPONSE), 'WORKSHEET_VIEW']);

/**
 * Settle which of a group of sibling types an object actually is, once a response
 * from the endpoint they share is in hand. Siblings share a `urlPath` too, so an
 * already-built URL stays valid across the swap. Every such decision belongs here:
 * a caller holding a discriminator it fetched itself (`checkPageType`) passes it
 * in rather than acting on it.
 * @param {string} typeId - The type ID detection settled on
 * @param {Object} metadata - Metadata from `fetchObjectDetailsInPage`
 * @returns {string} The sibling type the response describes, or `typeId` unchanged
 */
export function refineTypeFromMetadata(typeId, metadata) {
  // A fallback endpoint returns a differently shaped response carrying none of the
  // discriminators below, so it can only produce a wrong answer.
  if (!metadata || metadata.viaFallback) return typeId;
  const details = metadata.details;

  // A dataset's flavor is only knowable from its provider type, so detection lands
  // on whichever one the URL implies and the response settles it.
  if (isDatasetTypeId(typeId)) {
    if (isDataModelType(details)) return 'DATA_MODEL';
    if (isDatasetViewType(details)) return 'VIEW';
    if (isFusionType(details)) return 'DATA_FUSION';
    return 'DATA_SOURCE';
  }

  // A brick's latest design version carries the `client-code-enabled` flag; without
  // version data, fall back to the older heuristic (a brick has no `createdBy`).
  if (typeId === 'APP' || typeId === 'RYUU_APP') {
    const versions = metadata.versions;
    let isBrick;
    if (Array.isArray(versions) && versions.length > 0) {
      const latest = versions.find((v) => v.version === metadata.latestVersion) ?? versions[versions.length - 1];
      isBrick = latest?.flags?.['client-code-enabled'] === true;
    } else {
      isBrick = details?.createdBy == null;
    }
    return isBrick ? 'APP' : 'RYUU_APP';
  }

  // `global` is true only for a Variable; anything else (false or absent) is a Beast Mode.
  if (typeId === 'BEAST_MODE_FORMULA' && details?.global === true) {
    return 'VARIABLE';
  }

  // A Worksheet View also reports 'dav', and only its app's type tells the two
  // apart, so one detection already settled on keeps its type.
  if (STACKS_TYPE_IDS.has(typeId)) {
    const refined = STACKS_TYPE_BY_RESPONSE[details?.type];
    if (!refined || (typeId === 'WORKSHEET_VIEW' && refined === 'DATA_APP_VIEW')) return typeId;
    return refined;
  }

  // Approval Templates and Certification Processes are both templates behind one
  // GraphQL query; 'AC' is an Approval Template.
  if ((typeId === 'CERTIFICATION_PROCESS' || typeId === 'TEMPLATE') && details?.type) {
    return details.type === 'AC' ? 'TEMPLATE' : 'CERTIFICATION_PROCESS';
  }

  return typeId;
}

/**
 * Resolve the primary copy value and label for a Domo object: the value the
 * Copy button (and the copy keyboard shortcut) places on the clipboard. Mirrors
 * the Copy button's precedence: a type's `primary` copyConfig overrides the
 * default object ID; otherwise the object's own ID is used.
 * @param {Object} domoObject - The DomoObject (or plain object with id/typeId/typeName)
 * @returns {{ label: string, value: string }|null} Copy value and human label, or null if there is nothing to copy
 */
export function resolvePrimaryCopy(domoObject) {
  if (!domoObject) return null;

  const typeModel = domoObject.typeId ? getObjectType(domoObject.typeId) : null;
  const primaryConfig = typeModel?.copyConfigs?.find((c) => c.primary);
  const resolve = (source) =>
    typeof source === 'function' ? source(domoObject) : source.split('.').reduce((cur, key) => cur?.[key], domoObject);

  const value = primaryConfig ? resolve(primaryConfig.source) : domoObject.id;
  if (value == null) return null;

  const label = primaryConfig?.label || `${domoObject.typeName} ID`;
  return { label, value };
}
