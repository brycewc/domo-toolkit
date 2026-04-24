import { DomoObject } from '@/models';

/**
 * ObjectType class represents a Domo object id with its configuration
 */
export class DomoObjectType {
  /**
   * @param {string} id - The internal type identifier
   * @param {string} name - The human-readable type name
   * @param {Object} [options] - Configuration options
   * @param {Object} [options.api] - API configuration for fetching object details
   * @param {Array<Object>} [options.copyConfigs] - Additional copy actions for the long-press dropdown
   *   Each entry: { label: string, source: string, primary?: boolean, when?: string|Object }
   *   - label: display label (e.g., 'Package ID')
   *   - source: dot-path on DomoObject to resolve the copy value (e.g., 'parentId', 'metadata.details.streamId')
   *   - primary: if true, overrides the default copy action; original object ID moves to dropdown
   *   - when: visibility condition — omit to show when source is truthy,
   *     string path for truthy check, or { field, matches } for case-insensitive equality
   * @param {Object} [options.extractConfig] - Configuration for extracting ID from URL
   * @param {Object} [options.icon] - Icon config for this object type
   *   { component: string, rotation?: number } where component is a key in the ObjectTypeIcon registry
   * @param {RegExp} [options.idPattern] - Regular expression to validate IDs for this type
   * @param {Array<string>} [options.parents] - Array of parent object type IDs this object can have
   * @param {Array<Object>} [options.relatedObjects] - Array of related object configs [{field, typeId, label, source?, itemIdField?}]
   *   Use { label: 'Short Name', source: 'self' } to override the current object's tab label
   * @param {string} [options.urlPath] - The URL path pattern. Supported placeholders:
   *   - `{id}`: the object ID
   *   - `{parent}`: the parent object ID (fetched async if needed)
   *   - `{metadata.<dot.path>}`: any value resolved by dot-path from the DomoObject's `metadata`
   *     (e.g., `{metadata.details.type}`). Unresolved placeholders fall back to `originalUrl`.
   */
  constructor(id, name, options = {}) {
    this.id = id;
    this.name = name;
    this.api = options.api ?? null;
    this.copyConfigs = options.copyConfigs ?? null;
    this.extractConfig = options.extractConfig ?? null;
    this.icon = options.icon ?? null;
    this.idPattern = options.idPattern ?? null;
    this.parents = options.parents ?? null;
    this.relatedObjects = options.relatedObjects ?? null;
    this.urlPath = options.urlPath ?? null;
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
      const value = path
        .split('.')
        .reduce((current, prop) => current?.[prop], metadata);
      return value != null ? value : match;
    });
  }

  /**
   * Build the full URL for this object
   * @param {string} baseUrl - The base URL (e.g., https://instance.domo.com)
   * @param {string} id - The object ID
   * @param {string} [parentId] - Optional parent ID for types that require it
   * @param {number} [tabId] - Optional Chrome tab ID for executing in-page lookups
   * @param {Object} [metadata] - Optional metadata object for resolving {metadata.dot.path} placeholders
   * @returns {string|Promise<string>} The full URL (may be async if parent lookup is needed)
   */
  async buildObjectUrl(baseUrl, id, parentId, tabId, metadata) {
    if (!this.hasUrl()) {
      throw new Error(`Object type ${this.id} does not have a navigable URL`);
    }

    let url = this.urlPath.replace('{id}', id);

    // If the URL contains {parent}, replace it with the parentId
    if (url.includes('{parent}')) {
      if (!parentId) {
        // If we have a tabId and this type supports parent lookup, try to get it
        if (tabId) {
          const domoObject = new DomoObject(this.id, id, baseUrl);
          try {
            parentId = await domoObject.getParent(false, null, tabId);
          } catch (error) {
            throw new Error(
              `Parent ID is required for ${this.id} and could not be fetched: ${error.message}`,
              { cause: error }
            );
          }
        } else {
          throw new Error(`Parent ID is required for ${this.id}`);
        }
      }
      url = url.replace('{parent}', parentId);
    }

    url = DomoObjectType.resolveMetadataPlaceholders(url, metadata);

    return `${baseUrl}${url}`;
  }

  /**
   * Extract the ID from a URL for this object type
   * @param {string} url - The URL to extract from
   * @returns {string|null} The extracted ID or null if not found
   */
  extractObjectId(url) {
    if (!this.extractConfig) {
      return null;
    }

    const parts = url.split(/[/?=&]/);
    const { fromEnd = false, keyword, offset = 1 } = this.extractConfig;

    let id;
    if (fromEnd) {
      // Extract from end of URL
      id = parts[parts.length - offset] || null;
    } else {
      // Lowercase keyword to match lowercased URLs from content script detection
      const index = parts.indexOf(keyword.toLowerCase());
      if (index === -1) {
        return null;
      }
      id = parts[index + offset] || null;
    }

    // Validate extracted ID against the type's pattern (rejects e.g. "new", "graph")
    if (id && !this.idPattern.test(id)) {
      return null;
    }

    return id;
  }

  /**
   * Extract the parent ID from a URL for this object type
   * @param {string} url - The URL to extract from
   * @returns {string|null} The extracted parent ID or null if not found/configured
   */
  extractParentId(url) {
    if (!this.extractConfig || !this.extractConfig.parentExtract) {
      return null;
    }

    const parts = url.split(/[/?=&]/);
    const { fromEnd = false, keyword, offset = 1 } = this.extractConfig.parentExtract;

    if (fromEnd) {
      // Extract from end of URL
      return parts[parts.length - offset] || null;
    }

    // Lowercase keyword to match lowercased URLs from content script detection
    const index = parts.indexOf(keyword.toLowerCase());
    if (index === -1) {
      return null;
    }

    return parts[index + offset] || null;
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
    return this.urlPath !== null && this.urlPath !== undefined;
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
    return this.urlPath && this.urlPath.includes('{parent}');
  }
}

/**
 * Registry of all supported object types
 */
export const ObjectTypeRegistry = {
  ACCOUNT: new DomoObjectType('ACCOUNT', 'Account', {
    api: { endpoint: '/data/v1/accounts/{id}', pathToName: 'name' },
    icon: { component: 'Key' },
    idPattern: /^\d+$/,
    urlPath: '/datacenter/accounts?id={id}'
  }),
  ACCOUNT_TEMPLATE: new DomoObjectType('ACCOUNT_TEMPLATE', 'Account Template', {
    icon: { component: 'Key' },
    idPattern: /.*/
  }),
  ACHIEVEMENT: new DomoObjectType('ACHIEVEMENT', 'Achievement', {
    api: { endpoint: '/content/v1/achievements/{id}', pathToName: 'name' },
    idPattern: /.*/
  }),
  ACHIEVEMENT_ADMIN: new DomoObjectType('ACHIEVEMENT_ADMIN', 'Achievement Admin', {
    idPattern: /.*/
  }),
  ADC_COLUMN_POLICY: new DomoObjectType('ADC_COLUMN_POLICY', 'Column PDP Policy', {
    idPattern: /^\d+$/
  }),
  ADC_COLUMN_POLICY_GROUP: new DomoObjectType(
    'ADC_COLUMN_POLICY_GROUP',
    'Column PDP Policy Group',
    {
      idPattern: /^\d+$/
    }
  ),
  ADC_COLUMN_POLICY_MAPPING: new DomoObjectType(
    'ADC_COLUMN_POLICY_MAPPING',
    'Column PDP Policy Mapping',
    {
      idPattern: /.*/
    }
  ),
  ADC_FILTER: new DomoObjectType('ADC_FILTER', 'PDP Filter', {
    idPattern: /^\d+$/
  }),
  ADC_MASK: new DomoObjectType('ADC_MASK', 'PDP Mask', { idPattern: /^\d+$/ }),
  ADC_POLICY: new DomoObjectType('ADC_POLICY', 'PDP Policy', {
    idPattern: /^\d+$/
  }),
  AGENT: new DomoObjectType('AGENT', 'Agent', {
    api: {
      endpoint: '/ai/v1/agents/{id}?include=all,context,toolkits,settings',
      pathToName: 'name'
    },
    extractConfig: { keyword: 'agents' },
    icon: { component: 'Robot' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    relatedObjects: [
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
  AI_CHAT: new DomoObjectType('AI_CHAT', 'AI Chat', { idPattern: /.*/ }),
  AI_MODEL: new DomoObjectType('AI_MODEL', 'AI Model', {
    api: { endpoint: '/datascience/ml/v1/models/{id}', pathToName: 'name' },
    extractConfig: { keyword: 'model' },
    icon: { component: 'Brain' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    urlPath: '/ai-services/models/{id}'
  }),
  AI_PROJECT: new DomoObjectType('AI_PROJECT', 'AI Project', {
    api: { endpoint: '/datascience/ml/v1/projects/{id}', pathToName: 'name' },
    extractConfig: { keyword: 'projects' },
    icon: { component: 'Brain' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    urlPath: '/ai-services/projects/{id}'
  }),
  AI_TOOLKIT: new DomoObjectType('AI_TOOLKIT', 'AI Toolkit', {
    api: { endpoint: '/ai/v1/toolkits/{id}', pathToName: 'name' },
    extractConfig: { keyword: 'toolkits' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    urlPath: '/ai-library/toolkits/{id}'
  }),
  AI_TOOLKIT_DOMO_PROVIDED: new DomoObjectType('AI_TOOLKIT_DOMO_PROVIDED', 'AI Toolkit (Domo)', {
    api: {
      endpoint: '/ai/v1/toolkits/domo-provided',
      filterByIdField: 'id',
      pathToName: 'name'
    },
    extractConfig: { keyword: 'domo-provided' },
    idPattern: /^[a-z][a-z0-9_]*$/,
    urlPath: '/ai-library/toolkits/domo-provided/{id}'
  }),
  ALERT: new DomoObjectType('ALERT', 'Alert', {
    api: { endpoint: '/social/v4/alerts/{id}', pathToName: 'name' },
    extractConfig: { keyword: 'alerts' },
    icon: { component: 'Bell' },
    idPattern: /^\d+$/,
    urlPath: '/alerts/{id}'
  }),
  APP: new DomoObjectType('APP', 'Custom App (Brick)', {
    api: {
      endpoint: '/apps/v1/designs/{id}?parts=versions',
      pathToName: 'name'
    },
    extractConfig: { keyword: 'assetlibrary' },
    icon: { component: 'Apps' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    urlPath: '/assetlibrary/{id}/overview'
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
      pathToDetails: 'data.request',
      pathToName: 'data.request.title',
      pathToParentId: 'data.request.templateID'
    },
    copyConfigs: [{ label: 'Approval Template ID', source: 'parentId' }],
    extractConfig: { keyword: 'request-details' },
    icon: { component: 'RubberStamp' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    parents: ['TEMPLATE'],
    relatedObjects: [{ label: 'Template', source: 'parentId', typeId: 'TEMPLATE' }],
    urlPath: '/approval/request-details/{id}'
  }),
  AUTHORITY: new DomoObjectType('AUTHORITY', 'Grant', { idPattern: /.*/ }),
  BEAST_MODE_FORMULA: new DomoObjectType('BEAST_MODE_FORMULA', 'Beast Mode', {
    api: {
      endpoint: '/query/v1/functions/template/{id}?hidden=true',
      pathToName: 'name'
    },
    extractConfig: { keyword: 'id' },
    icon: { component: 'MathFunction' },
    idPattern: /^\d+$/,
    parents: ['DATA_SOURCE', 'CARD'],
    urlPath: '/datacenter/beastmode?id={id}'
  }),
  CARD: new DomoObjectType('CARD', 'Card', {
    api: {
      endpoint:
        '/content/v1/cards?urns={id}&includeFiltered=true&parts=metadata,datasources,domoapp,owners',
      pathToDetails: '[0]',
      pathToName: '[0].title'
    },
    extractConfig: { keyword: 'details' },
    icon: { component: 'ChartBar' },
    idPattern: /^\d+$/,
    parents: ['DATA_SOURCE', 'APP'],
    relatedObjects: [
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
    urlPath: '/kpis/details/{id}'
  }),
  CERTIFICATION: new DomoObjectType('CERTIFICATION', 'Certification', {
    icon: { component: 'RosetteDiscountCheck' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
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
      pathToDetails: 'data.template',
      pathToName: 'data.template.title'
    },
    extractConfig: {
      keyword: 'edit-form'
    },
    icon: { component: 'RosetteDiscountCheck' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    urlPath: '/admin/certifiedcontent/{metadata.context.certifiedType}/edit-form/{id}'
  }),
  CHANNEL: new DomoObjectType('CHANNEL', 'Buzz Channel', {
    api: { endpoint: '/buzz/v1/channels/{id}', pathToName: 'channel.title' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  }),
  CHART_COLOR_PALETTE: new DomoObjectType('CHART_COLOR_PALETTE', 'Chart Color Palette', {
    idPattern: /.*/
  }),
  CODEENGINE_PACKAGE: new DomoObjectType('CODEENGINE_PACKAGE', 'Code Engine Package', {
    api: {
      endpoint: '/codeengine/v2/packages/{id}?parts=functions',
      pathToName: 'name'
    },
    extractConfig: { keyword: 'codeengine' },
    icon: { component: 'Package' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    urlPath: '/codeengine/{id}'
  }),
  CODEENGINE_PACKAGE_VERSION: new DomoObjectType(
    'CODEENGINE_PACKAGE_VERSION',
    'Code Engine Package Version',
    {
      api: {
        displayName: '{parent.name} - {id}',
        endpoint: '/codeengine/v2/packages/{parent}/versions/{id}',
        pathToName: 'version'
      },
      copyConfigs: [
        { label: 'Package ID', primary: true, source: 'parentId' },
        { label: 'Version Number', source: 'id' }
      ],
      icon: { component: 'Package' },
      idPattern: /^[0-9]+\.[0-9]+\.[0-9]+$/,
      parents: ['CODEENGINE_PACKAGE'],
      relatedObjects: [
        { label: 'Package Version', source: 'self' },
        { label: 'Package', source: 'parentId', typeId: 'CODEENGINE_PACKAGE' },
        {
          field: 'workflowVersionNumber',
          label: 'Workflow Version',
          parentSource: 'workflowModelId',
          typeId: 'WORKFLOW_MODEL_VERSION'
        },
        {
          field: 'workflowModelId',
          label: 'Workflow',
          typeId: 'WORKFLOW_MODEL'
        }
      ]
    }
  ),
  COLLECTION: new DomoObjectType('COLLECTION', 'Collection', {
    icon: { component: 'Folder' },
    idPattern: /.*/
  }),
  COMMUNITY_SUPPORTED: new DomoObjectType('COMMUNITY_SUPPORTED', 'Community Supported Connector', {
    idPattern: /.*/
  }),
  CONFIG_APP: new DomoObjectType('CONFIG_APP', 'Config App', {
    idPattern: /.*/
  }),
  CONFIG_APP_CONFIGURATION: new DomoObjectType(
    'CONFIG_APP_CONFIGURATION',
    'Config App Configuration',
    {
      idPattern: /.*/
    }
  ),
  CONNECTOR: new DomoObjectType('CONNECTOR', 'Connector', {
    icon: { component: 'Plug' },
    idPattern: /.*/
  }),
  CONTAINER_VIEW: new DomoObjectType('CONTAINER_VIEW', 'Container View', {
    idPattern: /.*/
  }),
  CUSTOMER: new DomoObjectType('CUSTOMER', 'Customer', { idPattern: /.*/ }),
  CUSTOMER_LANDING_ENTITY: new DomoObjectType(
    'CUSTOMER_LANDING_ENTITY',
    'Customer Landing Entity',
    { idPattern: /.*/ }
  ),
  CUSTOMER_STATE: new DomoObjectType('CUSTOMER_STATE', 'Customer State', {
    api: { endpoint: '/content/v1/customer-states/{id}', pathToName: 'name' },
    idPattern: /.*/
  }),
  DATA_APP: new DomoObjectType('DATA_APP', 'Studio App', {
    api: { endpoint: '/content/v1/dataapps/{id}', pathToName: 'title' },
    extractConfig: { keyword: 'app-studio' },
    icon: { component: 'Rocket', rotation: -45 },
    idPattern: /^\d+$/,
    relatedObjects: [
      {
        field: 'views',
        isArray: true,
        itemTypeId: 'DATA_APP_VIEW',
        label: 'Pages'
      }
    ],
    urlPath: '/app-studio/{id}'
  }),
  DATA_APP_VIEW: new DomoObjectType('DATA_APP_VIEW', 'App Page', {
    api: {
      displayName: '{parent.name}: {name}',
      endpoint: '/content/v3/stacks/{id}',
      pathToName: 'title'
    },
    copyConfigs: [{ label: 'App ID', source: 'parentId' }],
    extractConfig: {
      keyword: 'pages',
      parentExtract: { keyword: 'app-studio', offset: 1 }
    },
    icon: { component: 'LayoutDashboard' },
    idPattern: /^\d+$/,
    parents: ['DATA_APP'],
    relatedObjects: [
      { label: 'Studio App', source: 'parent', typeId: 'DATA_APP' },
      {
        field: 'content',
        fieldSource: 'context',
        isArray: true,
        itemTypeField: 'type',
        label: 'Content'
      }
    ],
    urlPath: '/app-studio/{parent}/pages/{id}'
  }),
  DATA_DICTIONARY: new DomoObjectType('DATA_DICTIONARY', 'Data Dictionary', {
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  }),
  DATA_LINEAGE: new DomoObjectType('DATA_LINEAGE', 'Data Lineage', {
    icon: { component: 'BinaryTree' },
    idPattern: /.*/
  }),
  DATA_SCIENCE_NOTEBOOK: new DomoObjectType('DATA_SCIENCE_NOTEBOOK', 'Jupyter Workspace', {
    api: { endpoint: '/datascience/v1/workspaces/{id}', pathToName: 'name' },
    extractConfig: { keyword: 'jupyter-workspaces' },
    icon: { component: 'Notebook' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    urlPath: '/jupyter-workspaces/{id}'
  }),
  DATA_SOURCE: new DomoObjectType('DATA_SOURCE', 'DataSet', {
    api: {
      endpoint: '/data/v3/datasources/{id}?includeAllDetails=true',
      pathToName: 'name'
    },
    copyConfigs: [
      { label: 'Account ID', source: 'metadata.details.accountId' },
      {
        label: 'DataFlow ID',
        source: 'parentId',
        when: { field: 'metadata.details.type', matches: 'dataflow' }
      },
      { label: 'Stream ID', source: 'metadata.details.streamId' }
    ],
    extractConfig: { keyword: 'datasources' },
    icon: { component: 'Database' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    parents: ['DATAFLOW_TYPE', 'DATA_SOURCE', 'STREAM'],
    relatedObjects: [
      { label: 'Stream', source: 'parent', typeId: 'STREAM' },
      { field: 'accountId', label: 'Account', typeId: 'ACCOUNT' },
      { label: 'DataFlow', source: 'parent', typeId: 'DATAFLOW_TYPE' }
    ],
    urlPath: '/datasources/{id}/details/data/table'
  }),
  DATAFLOW_TYPE: new DomoObjectType('DATAFLOW_TYPE', 'DataFlow', {
    api: { endpoint: '/dataprocessing/v2/dataflows/{id}', pathToName: 'name' },
    extractConfig: { keyword: 'dataflows' },
    icon: { component: 'ArrowsSplit', rotation: 180 },
    idPattern: /^\d+$/,
    relatedObjects: [
      {
        field: 'inputs',
        isArray: true,
        itemTypeId: 'DATA_SOURCE',
        label: 'Inputs'
      },
      {
        field: 'outputs',
        isArray: true,
        itemTypeId: 'DATA_SOURCE',
        label: 'Outputs'
      }
    ],
    urlPath: '/datacenter/dataflows/{id}/details'
  }),
  DATASOURCE: new DomoObjectType('DATASOURCE', 'Datasource', {
    api: {
      endpoint: '/data/v3/datasources/{id}?includeAllDetails=true',
      pathToName: 'name'
    },
    icon: { component: 'Database' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    urlPath: '/datasources/{id}/details/data/table'
  }),
  DEFAULT_POLICY: new DomoObjectType('DEFAULT_POLICY', 'Default Policy', {
    idPattern: /.*/
  }),
  DEPLOYMENT: new DomoObjectType('DEPLOYMENT', 'Deployment', {
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  }),
  DIRECTORY: new DomoObjectType('DIRECTORY', 'Directory', { idPattern: /.*/ }),
  DRILL_VIEW: new DomoObjectType('DRILL_VIEW', 'Drill Path', {
    api: {
      endpoint: '/content/v1/cards?urns={id}:{parent}',
      pathToName: 'title'
    },
    extractConfig: {
      keyword: 'drillviewid',
      parentExtract: { keyword: 'cardid', offset: 1 }
    },
    icon: { component: 'ZoomIn' },
    idPattern: /^\d+$/,
    parents: ['CARD'],
    urlPath: '/analyzer?cardid=${parent}&drillviewid=${id}'
  }),
  ELEVATION: new DomoObjectType('ELEVATION', 'Elevation', { idPattern: /.*/ }),
  ENIGMA_FORM: new DomoObjectType('ENIGMA_FORM', 'Form', {
    api: { endpoint: '/forms/v2/{id}', pathToName: 'name' },
    icon: { component: 'Forms' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    parents: ['WORKFLOW_MODEL'],
    relatedObjects: [{ label: 'Workflow', source: 'parentId', typeId: 'WORKFLOW_MODEL' }]
  }),
  ENIGMA_FORM_INSTANCE: new DomoObjectType('ENIGMA_FORM_INSTANCE', 'Form Instance', {
    api: { endpoint: '/forms/v1/instances/{id}', pathToName: 'revision' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    parents: ['ENIGMA_FORM'],
    relatedObjects: [{ label: 'Form', source: 'parentId', typeId: 'ENIGMA_FORM' }]
  }),
  EXECUTOR_APPLICATION: new DomoObjectType(
    'EXECUTOR_APPLICATION',
    'Governance Toolkit Application',
    {
      api: { endpoint: '/executor/v1/applications/{id}', pathToName: 'name' },
      icon: { component: 'Server' },
      idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    }
  ),
  EXECUTOR_JOB: new DomoObjectType('EXECUTOR_JOB', 'Governance Toolkit Job', {
    api: {
      endpoint: '/executor/v1/applications/{parent}/jobs/{id}',
      pathToName: 'jobName'
    },
    icon: { component: 'PlayerPlay' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    parents: ['EXECUTOR_APPLICATION'],
    relatedObjects: [
      { label: 'Job', source: 'self' },
      {
        label: 'Application',
        source: 'parentId',
        typeId: 'EXECUTOR_APPLICATION'
      },
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
    ]
  }),
  FILE: new DomoObjectType('FILE', 'File', {
    api: { endpoint: '/data/v1/data-files/{id}/details', pathToName: 'name' },
    icon: { component: 'File' },
    idPattern: /^\d+$/
  }),
  FILE_REVISION: new DomoObjectType('FILE_REVISION', 'File Version', {
    api: {
      endpoint: '/data/v1/data-files/{parent}/revisions/{id}',
      pathToName: 'name'
    },
    idPattern: /^\d+$/,
    parents: ['FILE'],
    relatedObjects: [{ label: 'File', source: 'parentId', typeId: 'FILE' }]
  }),
  FILESET: new DomoObjectType('FILESET', 'FileSet', {
    api: { endpoint: '/files/v1/filesets/{id}', pathToName: 'name' },
    extractConfig: { keyword: 'filesets' },
    icon: { component: 'Folder' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    urlPath: '/datacenter/filesets/{id}/overview'
  }),
  FILESET_DIRECTORY: new DomoObjectType('FILESET_DIRECTORY', 'FileSet Directory', {
    icon: { component: 'FolderOpen' },
    idPattern: /.*/
  }),
  FILESET_FILE: new DomoObjectType('FILESET_FILE', 'FileSet File', {
    api: {
      endpoint: '/files/v1/filesets/{parent}/files/{id}',
      pathToName: 'name'
    },
    icon: { component: 'File' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    parents: ['FILESET'],
    relatedObjects: [
      { label: 'File', source: 'self' },
      { label: 'FileSet', source: 'parentId', typeId: 'FILESET' }
    ]
  }),
  GOAL: new DomoObjectType('GOAL', 'Goal', {
    api: { endpoint: '/social/v1/objectives/{id}', pathToName: 'name' },
    idPattern: /^\d+$/
  }),
  GOAL_DELEGATE: new DomoObjectType('GOAL_DELEGATE', 'Goal Delegate', {
    idPattern: /.*/
  }),
  GOAL_PERIOD: new DomoObjectType('GOAL_PERIOD', 'Goal Period', {
    api: { endpoint: '/social/v1/objectives/periods/{id}', pathToName: 'name' },
    idPattern: /^\d+$/
  }),
  GOAL_TAG: new DomoObjectType('GOAL_TAG', 'Goal Tag', {
    idPattern: /^\d+$/,
    parents: ['TAG_CATEGORY']
  }),
  GROUP: new DomoObjectType('GROUP', 'Group', {
    api: { endpoint: '/content/v2/groups/{id}', pathToName: 'name' },
    extractConfig: { keyword: 'groups' },
    icon: { component: 'Users' },
    idPattern: /^\d+$/,
    relatedObjects: [{ field: 'members', isArray: true, itemTypeId: 'USER', label: 'Members' }],
    urlPath: '/admin/groups/{id}?tab=people'
  }),
  GROUP_CHAT: new DomoObjectType('GROUP_CHAT', 'Buzz Group Chat', {
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  }),
  GUIDE: new DomoObjectType('GUIDE', 'Guide', { idPattern: /.*/ }),
  HOPPER_QUEUE: new DomoObjectType('HOPPER_QUEUE', 'Task Center Queue', {
    api: { endpoint: '/queues/v1/{id}', pathToName: 'name' },
    extractConfig: { keyword: 'queueId' },
    icon: { component: 'ListCheck' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    relatedObjects: [{ label: 'Queue', source: 'self' }],
    urlPath: '/queues/tasks?queueId={id}&status=OPEN'
  }),
  HOPPER_TASK: new DomoObjectType('HOPPER_TASK', 'Task Center Task', {
    api: {
      endpoint: '/queues/v1/{parent}/tasks/{id}',
      pathToName: 'displayEntity.name'
    },
    extractConfig: {
      keyword: 'id',
      parentExtract: { keyword: 'queueId', offset: 1 }
    },
    icon: { component: 'Subtask' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    parents: ['HOPPER_QUEUE'],
    relatedObjects: [
      { label: 'Task', source: 'self' },
      { label: 'Queue', source: 'parentId', typeId: 'HOPPER_QUEUE' }
    ],
    urlPath: '/queues/tasks?queueId={parent}&id={id}&openTaskDrawer=true'
  }),
  HUDDLE: new DomoObjectType('HUDDLE', 'Buzz Thread', {
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  }),
  IMAGE: new DomoObjectType('IMAGE', 'Image', { idPattern: /.*/ }),
  JOB: new DomoObjectType('JOB', 'Job', { idPattern: /^\d+$/ }),
  KEY_RESULT: new DomoObjectType('KEY_RESULT', 'Key Result', {
    api: {
      endpoint: '/social/v1/objectives/key-results/{id}',
      pathToName: 'name'
    },
    extractConfig: { keyword: 'key-results' },
    icon: { component: 'TargetArrow' },
    idPattern: /^\d+$/,
    parents: ['GOAL'],
    relatedObjects: [{ label: 'Goal', source: 'parentId', typeId: 'GOAL' }],
    urlPath: '/goals/key-results/{id}'
  }),
  LANDING_ENTITY: new DomoObjectType('LANDING_ENTITY', 'Landing Entity', {
    idPattern: /.*/
  }),
  LICENSE_PAGE: new DomoObjectType('LICENSE_PAGE', 'License Page', {
    idPattern: /.*/
  }),
  MAGNUM_COLLECTION: new DomoObjectType('MAGNUM_COLLECTION', 'AppDB Collection', {
    api: { endpoint: '/datastores/v1/collections/{id}', pathToName: 'name' },
    extractConfig: { keyword: 'appDb' },
    icon: { component: 'Database' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    parents: ['MAGNUM_DATASTORE'],
    relatedObjects: [
      { label: 'Collection', source: 'self' },
      { label: 'DataStore', source: 'parentId', typeId: 'MAGNUM_DATASTORE' }
    ],
    urlPath: '/appDb/{id}/permissions'
  }),
  MAGNUM_DATASTORE: new DomoObjectType('MAGNUM_DATASTORE', 'AppDB Datastore', {
    api: { endpoint: '/datastores/v1/{id}', pathToName: 'name' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  }),
  METRIC: new DomoObjectType('METRIC', 'Metric', { idPattern: /.*/ }),
  NAME: new DomoObjectType('NAME', 'Name', { idPattern: /.*/ }),
  NAV_PIN_ITEM: new DomoObjectType('NAV_PIN_ITEM', 'Nav Pin Item', {
    idPattern: /^\d+$/
  }),
  OAUTH2_CLIENT_CREDENTIALS: new DomoObjectType(
    'OAUTH2_CLIENT_CREDENTIALS',
    'Oauth 2.0 Client Credentials',
    {
      idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    }
  ),
  OBJECTIVE: new DomoObjectType('OBJECTIVE', 'Goal', {
    api: { endpoint: '/social/v1/objectives/{id}', pathToName: 'name' },
    extractConfig: { keyword: 'goals' },
    icon: { component: 'Target' },
    idPattern: /^\d+$/,
    urlPath: '/goals/{id}'
  }),
  OTP_KEY: new DomoObjectType('OTP_KEY', 'OTP Key'),
  PAGE: new DomoObjectType('PAGE', 'Page', {
    api: { endpoint: '/content/v3/stacks/{id}', pathToName: 'title' },
    extractConfig: { keyword: 'page' },
    icon: { component: 'LayoutDashboard' },
    idPattern: /^-?\d+$/,
    parents: ['PAGE'],
    relatedObjects: [
      {
        field: 'content',
        fieldSource: 'context',
        isArray: true,
        itemTypeField: 'type',
        label: 'Content'
      }
    ],
    urlPath: '/page/{id}'
  }),
  PAGE_ANALYZER: new DomoObjectType('PAGE_ANALYZER', 'Page Analyzer', {
    idPattern: /.*/
  }),
  PAGE_COLLECTION: new DomoObjectType('PAGE_COLLECTION', 'Page Collection', {
    idPattern: /^\d+$/,
    parents: ['PAGE']
  }),
  PAGE_TEMPLATE: new DomoObjectType('PAGE_TEMPLATE', 'Page Template', {
    idPattern: /.*/
  }),
  POLICY_ORDER: new DomoObjectType('POLICY_ORDER', 'Policy Order', {
    idPattern: /.*/
  }),
  PROJECT: new DomoObjectType('PROJECT', 'Project', {
    api: { endpoint: '/content/v1/projects/{id}', pathToName: 'projectName' },
    extractConfig: { keyword: 'project' },
    icon: { component: 'Checklist' },
    idPattern: /^\d+$/,
    urlPath: '/project/{id}'
  }),
  PROJECT_LIST: new DomoObjectType('PROJECT_LIST', 'Project List', {
    api: {
      endpoint: '/content/v1/projects/{parent}/lists/{id}',
      pathToName: 'name'
    },
    idPattern: /^\d+$/,
    parents: ['PROJECT']
  }),
  PROJECT_TASK: new DomoObjectType('PROJECT_TASK', 'Task', {
    api: { endpoint: '/content/v1/tasks/{id}', pathToName: 'taskName' },
    extractConfig: { keyword: 'taskId' },
    icon: { component: 'Subtask' },
    idPattern: /^\d+$/,
    parents: ['PROJECT', 'PROJECT_LIST'],
    urlPath: '/project?taskId={id}'
  }),
  PROJECT_TASK_ATTACHMENT: new DomoObjectType('PROJECT_TASK_ATTACHMENT', 'Task Attachment', {
    idPattern: /.*/,
    parents: ['PROJECT_TASK']
  }),
  PROJECT_TASK_OWNER: new DomoObjectType('PROJECT_TASK_OWNER', 'Task Owner', {
    idPattern: /^\d+$/,
    parents: ['PROJECT_TASK']
  }),
  PROXIER_EMAIL: new DomoObjectType('PROXIER_EMAIL', 'Proxier Email', {
    idPattern: /.*/
  }),
  PROXY_USER: new DomoObjectType('PROXY_USER', 'Proxy User', {
    idPattern: /.*/
  }),
  PUBLIC_URL: new DomoObjectType('PUBLIC_URL', 'Public Embed URL', {
    idPattern: /.*/
  }),
  PUBLICATION: new DomoObjectType('PUBLICATION', 'Publication', {
    api: { endpoint: '/publish/v2/publications/{id}', pathToName: 'name' },
    extractConfig: { keyword: 'id' },
    icon: { component: 'Share' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    urlPath: '/admin/domo-everywhere/publications?id={id}'
  }),
  PUBLICATION_GROUP: new DomoObjectType('PUBLICATION_GROUP', 'Publication Group', {
    idPattern: /^\d+$/
  }),
  REPORT: new DomoObjectType('REPORT', 'Report', { idPattern: /^\d+$/ }),
  REPORT_BUILDER: new DomoObjectType('REPORT_BUILDER', 'Report Builder', {
    api: { endpoint: '/content/v1/reportbuilder/{id}', pathToName: 'title' },
    icon: { component: 'FileAnalytics' },
    idPattern: /^\d+$/
  }),
  REPORT_BUILDER_PAGE: new DomoObjectType('REPORT_BUILDER_PAGE', 'Report Page', {
    idPattern: /^\d+$/
  }),
  REPORT_BUILDER_VIEW: new DomoObjectType('REPORT_BUILDER_VIEW', 'Report Builder View', {
    api: {
      endpoint: '/content/v1/reportbuilder/views/{id}',
      pathToName: 'subject'
    },
    icon: { component: 'FileAnalytics' },
    idPattern: /^\d+$/,
    parents: ['REPORT_BUILDER']
  }),
  REPORT_SCHEDULE: new DomoObjectType('REPORT_SCHEDULE', 'Scheduled Report', {
    api: { endpoint: '/content/v1/reportschedules/{id}', pathToName: 'title' },
    icon: { component: 'CalendarTime' },
    idPattern: /^\d+$/
  }),
  REPOSITORY: new DomoObjectType('REPOSITORY', 'Sandbox Repository', {
    api: { endpoint: '/versions/v1/repositories/{id}', pathToName: 'name' },
    extractConfig: { keyword: 'repositories' },
    icon: { component: 'GitBranch' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    urlPath: '/sandbox/repositories/{id}'
  }),
  REPOSITORY_AUTHORIZATION: new DomoObjectType(
    'REPOSITORY_AUTHORIZATION',
    'Repository Authorization',
    {
      idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    }
  ),
  ROLE: new DomoObjectType('ROLE', 'Role', {
    api: { endpoint: '/authorization/v1/roles/{id}', pathToName: 'name' },
    extractConfig: { keyword: 'roles' },
    icon: { component: 'Shield' },
    idPattern: /^\d+$/,
    urlPath: '/admin/roles/{id}'
  }),
  RYUU_APP: new DomoObjectType('RYUU_APP', 'Custom App (Pro-Code)', {
    api: { endpoint: '/apps/v1/designs/{id}', pathToName: 'name' },
    extractConfig: { keyword: 'assetlibrary' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    urlPath: '/assetlibrary/{id}/overview'
  }),
  SCHEDULE: new DomoObjectType('SCHEDULE', 'Schedule', {
    icon: { component: 'CalendarTime' }
  }),
  SEGMENT: new DomoObjectType('SEGMENT', 'Segment', { idPattern: /^\d+$/ }),
  SESSION: new DomoObjectType('SESSION', 'Session', {
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  }),
  SMS_NOTIFICATION_COMMAND: new DomoObjectType(
    'SMS_NOTIFICATION_COMMAND',
    'SMS Notification Command'
  ),
  SMS_NOTIFICATION_WEB: new DomoObjectType('SMS_NOTIFICATION_WEB', 'SMS Notification Web'),
  SSO_PAGE: new DomoObjectType('SSO_PAGE', 'Single Sign-On(SSO) Page', {
    idPattern: /.*/
  }),
  SSO_SETTINGS: new DomoObjectType('SSO_SETTINGS', 'SSO Settings', {
    idPattern: /^\d+$/
  }),
  STORY: new DomoObjectType('STORY', 'Story', { idPattern: /^\d+$/ }),
  STREAM: new DomoObjectType('STREAM', 'Stream', {
    api: {
      endpoint: '/data/v1/streams/{id}?fields=all',
      nameTemplate: '{dataProvider.name} Stream {id}',
      pathToName: 'dataProvider.name'
    },
    icon: { component: 'Transfer' },
    idPattern: /^\d+$/,
    parents: ['DATA_SOURCE']
  }),
  SUBSCRIPTION: new DomoObjectType('SUBSCRIPTION', 'Subscription', {
    icon: { component: 'Mail' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  }),
  SYSTEM: new DomoObjectType('SYSTEM', 'System', { idPattern: /.*/ }),
  TAG_CATEGORY: new DomoObjectType('TAG_CATEGORY', 'Goal Tag Category', {
    icon: { component: 'Tag' },
    idPattern: /^\d+$/
  }),
  TEAM: new DomoObjectType('TEAM', 'Team', {
    copyConfigs: true,
    idPattern: /^\d+$/
  }),
  TEMPLATE: new DomoObjectType('TEMPLATE', 'Approval Template', {
    api: {
      bodyTemplate: {
        operationName: 'getTemplateForEdit',
        query:
          'query getTemplateForEdit($id: ID!) {\n template(id: $id) {\n id\n title\n titleName\n titlePlaceholder\n acknowledgment\n instructions\n description\n providerName\n isPublic\n chainIsLocked\n type\n isPublished\n observers {\n id\n type\n displayName\n avatarKey\n title\n ... on Group {\n userCount\n __typename\n }\n __typename\n }\n categories {\n id\n name\n __typename\n }\n owner {\n id\n displayName\n avatarKey\n __typename\n }\n fields {\n key\n type\n name\n data\n placeholder\n required\n isPrivate\n ... on SelectField {\n option\n multiselect\n datasource\n column\n order\n __typename\n }\n __typename\n }\n approvers {\n type\n originalType: type\n key\n ... on ApproverPerson {\n id: approverId\n approverId\n userDetails {\n id\n displayName\n title\n avatarKey\n isDeleted\n __typename\n }\n __typename\n }\n ... on ApproverGroup {\n id: approverId\n approverId\n groupDetails {\n id\n displayName\n userCount\n isDeleted\n __typename\n }\n __typename\n }\n ... on ApproverPlaceholder {\n placeholderText\n __typename\n }\n __typename\n }\n workflowIntegration {\n modelId\n modelVersion\n startName\n modelName\n parameterMapping {\n fields {\n field\n parameter\n required\n type\n __typename\n }\n __typename\n }\n __typename\n }\n __typename\n }\n}',
        variables: { id: '{id}' }
      },
      endpoint: '/synapse/approval/graphql',
      method: 'POST',
      pathToDetails: 'data.template',
      pathToName: 'data.template.title'
    },
    extractConfig: { keyword: 'edit-request-form' },
    icon: { component: 'Template' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    urlPath: '/approval/edit-request-form/{id}'
  }),
  TOKEN: new DomoObjectType('TOKEN', 'API Client', {
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[X]{4}-[X]{4}-[X]{12}$/i
  }),
  USAGE_REPORT_ROWS: new DomoObjectType('USAGE_REPORT_ROWS', 'Rows Usage Report'),
  USER: new DomoObjectType('USER', 'User', {
    api: { endpoint: '/content/v2/users/{id}', pathToName: 'displayName' },
    extractConfig: { keyword: 'people' },
    icon: { component: 'User' },
    idPattern: /^\d+$/,
    urlPath: '/admin/people/{id}?tab=profile'
  }),
  USER_ACHIEVEMENT: new DomoObjectType('USER_ACHIEVEMENT', 'User Achievement', {
    idPattern: /^\d+$/
  }),
  USER_CUSTOM_KEY: new DomoObjectType('USER_CUSTOM_KEY', 'User Custom Attribute', {
    idPattern: /.*/
  }),
  USER_STATE: new DomoObjectType('USER_STATE', 'User State', {
    idPattern: /.*/
  }),
  USER_TEMPLATE: new DomoObjectType('USER_TEMPLATE', 'User Template', {
    copyConfigs: true,
    idPattern: /^\d+$/
  }),
  VARIABLE: new DomoObjectType('VARIABLE', 'Variable', {
    api: {
      endpoint: '/query/v1/functions/template/{id}?hidden=true',
      pathToName: 'name'
    },
    icon: { component: 'Variable' },
    idPattern: /^\d+$/
  }),
  VARIABLE_CONTROL: new DomoObjectType('VARIABLE_CONTROL', 'Variable Control', {
    idPattern: /^\d+$/,
    parents: ['VARIABLE']
  }),
  VECTOR_INDEX: new DomoObjectType('VECTOR_INDEX', 'Vector Index', {
    icon: { component: 'VectorSpline' },
    idPattern: /.*/
  }),
  VIDEO_ROOM: new DomoObjectType('VIDEO_ROOM', 'Video Call', {
    copyConfigs: true,
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  }),
  VIEW: new DomoObjectType('VIEW', 'View', {
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
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
      pathToName: 'friendlyName',
      pathToParentId: 'serviceAccountId'
    },
    extractConfig: { keyword: 'cloud-integrations' },
    icon: { component: 'BuildingWarehouse' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    parents: ['ACCOUNT'],
    relatedObjects: [{ label: 'Account', source: 'parentId', typeId: 'ACCOUNT' }],
    urlPath: '/cloud-integrations/{id}/settings'
  }),
  WORKBENCH_AGENT: new DomoObjectType('WORKBENCH_AGENT', 'On Premise Agent', {
    idPattern: /.*/
  }),
  WORKBENCH_GROUP: new DomoObjectType('WORKBENCH_GROUP', 'Workbench Group', {
    idPattern: /^\d+$/
  }),
  WORKBENCH_JOB: new DomoObjectType('WORKBENCH_JOB', 'On Premise Job', {
    idPattern: /^\d+$/
  }),
  WORKBENCH_SCHEDULE: new DomoObjectType('WORKBENCH_SCHEDULE', 'On Premise Job Schedule', {
    idPattern: /0/
  }),
  WORKFLOW_INSTANCE: new DomoObjectType('WORKFLOW_INSTANCE', 'Workflow Execution', {
    api: {
      endpoint: '/workflow/v2/executions/{id}',
      pathToName: 'modelName'
    },
    extractConfig: {
      keyword: 'instances',
      offset: 3,
      parentExtract: { keyword: 'instances', offset: 1 },
      urlParamExtracts: { version: { keyword: 'instances', offset: 2 } }
    },
    icon: { component: 'PlayerPlay' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    parents: ['WORKFLOW_MODEL'],
    relatedObjects: [
      { label: 'Execution', source: 'self' },
      {
        field: 'modelVersion',
        label: 'Version',
        parentSource: 'parentId',
        typeId: 'WORKFLOW_MODEL_VERSION'
      },
      { label: 'Workflow', source: 'parentId', typeId: 'WORKFLOW_MODEL' }
    ],
    urlPath: '/workflows/instances/{parent}/{version}/{id}'
  }),
  WORKFLOW_MODEL: new DomoObjectType('WORKFLOW_MODEL', 'Workflow', {
    api: { endpoint: '/workflow/v1/models/{id}', pathToName: 'name' },
    extractConfig: { keyword: 'workflows', offset: 2 },
    icon: { component: 'Route' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    relatedObjects: [
      {
        field: 'versions',
        isArray: true,
        itemIdField: 'version',
        itemTypeId: 'WORKFLOW_MODEL_VERSION',
        label: 'Versions',
        parentSource: 'objectId'
      }
    ],
    urlPath: '/workflows/models/{id}'
  }),
  WORKFLOW_MODEL_VERSION: new DomoObjectType('WORKFLOW_MODEL_VERSION', 'Workflow Version', {
    api: {
      displayName: '{parent.name} - {id}',
      endpoint: '/workflow/v2/models/{parent}/versions/{id}',
      pathToName: 'version'
    },
    extractConfig: {
      keyword: 'workflows',
      offset: 3,
      parentExtract: { keyword: 'workflows', offset: 2 }
    },
    icon: { component: 'Route' },
    idPattern: /^[0-9]+\.[0-9]+\.[0-9]+$/,
    parents: ['WORKFLOW_MODEL'],
    relatedObjects: [
      { label: 'Version', source: 'self' },
      { label: 'Workflow', source: 'parentId', typeId: 'WORKFLOW_MODEL' }
    ],
    urlPath: '/workflows/models/{parent}/{id}?_wfv=view'
  }),
  WORKFLOW_TRIGGER: new DomoObjectType('WORKFLOW_TRIGGER', 'Workflow Trigger', {
    api: { endpoint: '/workflow/v2/triggers/{id}', pathToName: 'name' },
    icon: { component: 'Clock' },
    idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    parents: ['WORKFLOW_MODEL'],
    relatedObjects: [
      { label: 'Trigger', source: 'self' },
      { label: 'Workflow', source: 'parentId', typeId: 'WORKFLOW_MODEL' }
    ],
    urlPath: '/workflows/triggers/{parent}'
  }),
  WORKSHEET: new DomoObjectType('WORKSHEET', 'Worksheet', {
    api: { endpoint: '/content/v1/dataapps/{id}', pathToName: 'title' },
    extractConfig: { keyword: 'app-studio' },
    icon: { component: 'Table' },
    idPattern: /^\d+$/,
    urlPath: '/app-studio/{id}'
  }),
  WORKSHEET_VIEW: new DomoObjectType('WORKSHEET_VIEW', 'Worksheet View', {
    api: {
      displayName: '{parent.name}: {name}',
      endpoint: '/content/v3/stacks/{id}',
      pathToName: 'title'
    },
    copyConfigs: [{ label: 'Worksheet ID', source: 'parentId' }],
    extractConfig: {
      keyword: 'pages',
      parentExtract: { keyword: 'app-studio', offset: 1 }
    },
    icon: { component: 'Table' },
    idPattern: /^\d+$/,
    parents: ['WORKSHEET'],
    relatedObjects: [{ label: 'Worksheet', source: 'parentId', typeId: 'WORKSHEET' }],
    urlPath: '/app-studio/{parent}/pages/{id}'
  }),
  WORKSPACE: new DomoObjectType('WORKSPACE', 'Workspace', {
    api: { endpoint: '/nav/v1/workspaces/{id}', pathToName: 'name' },
    extractConfig: { keyword: 'workspaces' },
    icon: { component: 'Briefcase' },
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
 * @param {Object} params.apiConfig - The API configuration {method, endpoint, pathToName, bodyTemplate}
 * @param {boolean} params.requiresParent - Whether parent ID is required for API
 * @param {string} [params.parentId] - Optional parent ID if already known
 * @param {boolean} [params.throwOnError=true] - Whether to throw errors
 * @returns {Promise<Object>} Metadata object {details, name}
 */
export async function fetchObjectDetailsInPage(params) {
  const {
    apiConfig,
    objectId,
    parentId: providedParentId,
    requiresParent,
    throwOnError = true,
    typeId
  } = params;

  const {
    bodyTemplate = null,
    endpoint,
    filterByIdField = null,
    method = 'GET',
    nameTemplate = null,
    pathToDetails = null,
    pathToName,
    pathToParentId = null
  } = apiConfig;
  let url;
  let parentId = providedParentId;

  try {
    // Build the endpoint URL
    if (requiresParent) {
      if (!parentId) {
        const error = new Error(
          `Cannot fetch details for ${typeId} ${objectId} because parent ID is required`
        );
        if (throwOnError) throw error;
        console.warn(error.message);
        return { details: null, name: null };
      }
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
      const error = new Error(
        `Failed to fetch details for ${typeId} ${objectId}: HTTP ${response.status}`
      );
      if (throwOnError) throw error;
      console.warn(error.message);
      return { details: null, name: null };
    }

    let data = await response.json();

    // If the endpoint returns a list, find the matching item by ID field
    if (filterByIdField && Array.isArray(data)) {
      data = data.find((item) => String(item[filterByIdField]) === String(objectId)) || null;
      if (!data) {
        const error = new Error(
          `${typeId} ${objectId} not found in list response`
        );
        if (throwOnError) throw error;
        return { details: null, name: null };
      }
    }

    const resolvePath = (path) =>
      (path.match(/[^.[\]]+/g) || []).reduce(
        (current, prop) => current?.[prop],
        data
      );
    const details = pathToDetails ? resolvePath(pathToDetails) : data;
    const name = nameTemplate
      ? nameTemplate.replace(/{([^}]+)}/g, (_, path) =>
          path === 'id' ? objectId : (resolvePath(path) ?? '')
        )
      : resolvePath(pathToName);
    const extractedParentId = pathToParentId
      ? resolvePath(pathToParentId)
      : undefined;

    return { details, name, parentId: extractedParentId };
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
 * Get an DomoObjectType by its type
 * @param {string} type - The type
 * @returns {DomoObjectType|null} The DomoObjectType instance or null if not found
 */
export function getObjectType(type) {
  return ObjectTypeRegistry[type] || null;
}
