import { DomoObject } from '@/models';

/**
 * ObjectType class represents a Domo object id with its configuration
 */
export class DomoObjectType {
  /**
   * @param {string} id - The internal type identifier
   * @param {string} name - The human-readable type name
   * @param {string} urlPath - The URL path pattern (can include {id} placeholder)
   * @param {RegExp} idPattern - Regular expression to validate IDs for this type
   * @param {Object} [extractConfig] - Configuration for extracting ID from URL
   * @param {Object} [api] - API configuration for fetching object details
   * @param {Array<string>} [parents] - Array of parent object type IDs this object can have
   * @param {Array<Object>} [relatedObjects] - Array of related object configs [{field, typeId, label, source?}]
   * @param {boolean} [deprecated] - Whether this object type is deprecated
   */
  constructor(
    id,
    name,
    urlPath,
    idPattern,
    extractConfig = null,
    api = null,
    parents = null,
    relatedObjects = null,
    deprecated = false
  ) {
    this.id = id;
    this.name = name;
    this.urlPath = urlPath;
    this.idPattern = idPattern;
    this.extractConfig = extractConfig;
    this.api = api;
    this.parents = parents;
    this.relatedObjects = relatedObjects;
    this.deprecated = deprecated;
  }

  /**
   * Build the full URL for this object
   * @param {string} baseUrl - The base URL (e.g., https://instance.domo.com)
   * @param {string} id - The object ID
   * @param {string} [parentId] - Optional parent ID for types that require it
   * @param {number} [tabId] - Optional Chrome tab ID for executing in-page lookups
   * @returns {string|Promise<string>} The full URL (may be async if parent lookup is needed)
   */
  async buildObjectUrl(baseUrl, id, parentId, tabId) {
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

    if (fromEnd) {
      // Extract from end of URL
      return parts[parts.length - offset] || null;
    }

    const index = parts.indexOf(keyword);
    if (index === -1) {
      return null;
    }

    return parts[index + offset] || null;
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
    const {
      fromEnd = false,
      keyword,
      offset = 1
    } = this.extractConfig.parentExtract;

    if (fromEnd) {
      // Extract from end of URL
      return parts[parts.length - offset] || null;
    }

    const index = parts.indexOf(keyword);
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

    for (const [name, config] of Object.entries(
      this.extractConfig.urlParamExtracts
    )) {
      const { fromEnd = false, keyword, offset = 1 } = config;
      if (fromEnd) {
        params[name] = parts[parts.length - offset] || null;
      } else {
        const index = parts.indexOf(keyword);
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
        (this.api.bodyTemplate &&
          JSON.stringify(this.api.bodyTemplate).includes('{parent}')))
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
  ACCESS_TOKEN: new DomoObjectType(
    'ACCESS_TOKEN',
    'Access token',
    null,
    /.*/,
    null,
    null
  ),
  ACCOUNT: new DomoObjectType(
    'ACCOUNT',
    'Account',
    '/datacenter/accounts?id={id}',
    /^\d+$/,
    null,
    {
      endpoint: '/data/v1/accounts/{id}',
      pathToName: 'name'
    }
  ),
  ACCOUNT_TEMPLATE: new DomoObjectType(
    'ACCOUNT_TEMPLATE',
    'Account Template',
    null,
    /.*/,
    null,
    null
  ),
  ACHIEVEMENT: new DomoObjectType(
    'ACHIEVEMENT',
    'Achievement',
    null,
    /.*/,
    null,
    {
      endpoint: '/content/v1/achievements/{id}',
      pathToName: 'name'
    }
  ),
  ACHIEVEMENT_ADMIN: new DomoObjectType(
    'ACHIEVEMENT_ADMIN',
    'Achievement Admin',
    null,
    /.*/,
    null,
    null
  ),
  ACTIVITY_LOG: new DomoObjectType(
    'ACTIVITY_LOG',
    'Activity Log',
    '/admin/logging',
    null,
    null,
    null
  ),
  ACTIVITY_LOG_CSV: new DomoObjectType(
    'ACTIVITY_LOG_CSV',
    'Activity Log CSV',
    null,
    null,
    null,
    null
  ),
  ADC_COLUMN_POLICY: new DomoObjectType(
    'ADC_COLUMN_POLICY',
    'Column PDP Policy',
    null,
    /^\d+$/,
    null,
    null
  ),
  ADC_COLUMN_POLICY_GROUP: new DomoObjectType(
    'ADC_COLUMN_POLICY_GROUP',
    'Column PDP Policy Group',
    null,
    /^\d+$/,
    null,
    null
  ),
  ADC_COLUMN_POLICY_MAPPING: new DomoObjectType(
    'ADC_COLUMN_POLICY_MAPPING',
    'Column PDP Policy Mapping',
    null,
    /.*/,
    null,
    null
  ),
  ADC_FILTER: new DomoObjectType(
    'ADC_FILTER',
    'PDP Filter',
    null,
    /^\d+$/,
    null,
    null
  ),
  ADC_MASK: new DomoObjectType(
    'ADC_MASK',
    'PDP Mask',
    null,
    /^\d+$/,
    null,
    null
  ),
  ADC_POLICY: new DomoObjectType(
    'ADC_POLICY',
    'PDP Policy',
    null,
    /^\d+$/,
    null,
    null
  ),
  AGENT: new DomoObjectType('AGENT', 'Agent', null, /.*/, null, null),
  AI_CHAT: new DomoObjectType('AI_CHAT', 'AI Chat', null, /.*/, null, null),
  AI_MODEL: new DomoObjectType(
    'AI_MODEL',
    'AI Model',
    '/ai-services/models/{id}',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    { keyword: 'model' },
    {
      endpoint: '/datascience/ml/v1/models/{id}',
      pathToName: 'name'
    }
  ),
  AI_PROJECT: new DomoObjectType(
    'AI_PROJECT',
    'AI Project',
    '/ai-services/projects/{id}',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    { keyword: 'projects' },
    {
      endpoint: '/datascience/ml/v1/projects/{id}',
      pathToName: 'name'
    }
  ),
  ALERT: new DomoObjectType(
    'ALERT',
    'Alert',
    '/alerts/{id}',
    /^\d+$/,
    { keyword: 'alerts' },
    {
      endpoint: '/social/v4/alerts/{id}',
      pathToName: 'name'
    }
  ),
  ALERT_SUBSCRIBER: new DomoObjectType(
    'ALERT_SUBSCRIBER',
    'Alert Subscriber',
    null,
    /^\d+$/,
    null,
    null
  ),
  ALERT_WORKFLOW_ACTION: new DomoObjectType(
    'ALERT_WORKFLOW_ACTION',
    'Alert Workflow Action',
    null,
    /.*/,
    null,
    null
  ),
  APP: new DomoObjectType(
    'APP',
    'Custom App (Brick)',
    '/assetlibrary/{id}/overview',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    { keyword: 'assetlibrary' },
    {
      endpoint: '/apps/v1/designs/{id}?parts=versions',
      pathToName: 'name'
    }
  ),
  APPROVAL: new DomoObjectType(
    'APPROVAL',
    'Approval',
    '/approval/request-details/{id}',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    { keyword: 'request-details' },
    {
      bodyTemplate: {
        operationName: 'getApprovalForDetails',
        query:
          'query getApprovalForDetails($id: ID!) {\n  request: approval(id: $id) {\n    ...approvalFields\n    __typename\n  }\n}\n\nfragment approvalFields on Approval {\n  newActivity\n  observers {\n    id\n    type\n    displayName\n    title\n    ... on Group {\n      currentUserIsMember\n      memberCount: userCount\n      __typename\n    }\n    __typename\n  }\n  lastViewed\n  newActivity\n  newMessage {\n    created\n    createdByType\n    createdBy {\n      id\n      displayName\n      __typename\n    }\n    content {\n      text\n      __typename\n    }\n    __typename\n  }\n  lastAction\n  version\n  submittedTime\n  id\n  title\n  status\n  providerName\n  templateTitle\n  buzzChannelId\n  buzzGeneralThreadId\n  templateID\n  templateInstructions\n  templateDescription\n  acknowledgment\n  snooze\n  snoozed\n  type\n  categories {\n    id\n    name\n    __typename\n  }\n  total {\n    value\n    currency\n    __typename\n  }\n  modifiedTime\n  previousApprover: previousApproverEx {\n    id\n    type\n    displayName\n    ... on User {\n      title\n      avatarKey\n      isCurrentUser\n      __typename\n    }\n    ... on Group {\n      currentUserIsMember\n      userCount\n      isDeleted\n      actor {\n        displayName\n        id\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n  pendingApprover: pendingApproverEx {\n    id\n    type\n    displayName\n    ... on User {\n      title\n      avatarKey\n      isCurrentUser\n      __typename\n    }\n    ... on Group {\n      currentUserIsMember\n      userCount\n      isDeleted\n      __typename\n    }\n    __typename\n  }\n  submitter {\n    id\n    displayName\n    title\n    avatarKey\n    isCurrentUser\n    type\n    __typename\n  }\n  approvalChainIdx\n  reminder {\n    sent\n    sentBy {\n      displayName\n      title\n      id\n      isCurrentUser\n      type\n      __typename\n    }\n    __typename\n  }\n  chain {\n    actor {\n      displayName\n      __typename\n    }\n    approver {\n      id\n      type\n      displayName\n      ... on User {\n        title\n        avatarKey\n        isCurrentUser\n        __typename\n      }\n      ... on Group {\n        currentUserIsMember\n        userCount\n        isDeleted\n        __typename\n      }\n      __typename\n    }\n    status\n    time\n    type\n    key\n    __typename\n  }\n  fields {\n    data\n    name\n    type\n    key\n    ... on HeaderField {\n      fields {\n        data\n        name\n        type\n        key\n        ... on HeaderField {\n          fields {\n            data\n            name\n            type\n            key\n            __typename\n          }\n          __typename\n        }\n        __typename\n      }\n      __typename\n    }\n    ... on ItemListField {\n      fields {\n        data\n        name\n        type\n        key\n        ... on HeaderField {\n          fields {\n            data\n            name\n            type\n            key\n            ... on HeaderField {\n              fields {\n                data\n                name\n                type\n                key\n                __typename\n              }\n              __typename\n            }\n            __typename\n          }\n          __typename\n        }\n        __typename\n      }\n      __typename\n    }\n    ... on NumberField {\n      value\n      __typename\n    }\n    ... on CurrencyField {\n      number: value\n      currency\n      __typename\n    }\n    ... on DateField {\n      date: value\n      __typename\n    }\n    ... on DataSetAttachmentField {\n      dataSet: value {\n        id\n        name\n        description\n        owner {\n          id\n          displayName\n          __typename\n        }\n        provider\n        cardCount\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n  history {\n    actor {\n      type\n      id\n      displayName\n      ... on User {\n        avatarKey\n        isCurrentUser\n        __typename\n      }\n      __typename\n    }\n    status\n    time\n    __typename\n  }\n  latestMessage {\n    created\n    __typename\n  }\n  latestMentioned {\n    created\n    __typename\n  }\n  workflowIntegration {\n    modelId\n    modelVersion\n    startName\n    instanceId\n    modelName\n    __typename\n  }\n  __typename\n}',
        variables: { id: '{id}' }
      },
      endpoint: '/synapse/approval/graphql',
      method: 'POST',
      pathToDetails: 'data.request',
      pathToName: 'data.request.title',
      pathToParentId: 'data.request.templateID'
    },
    ['TEMPLATE'],
    [{ label: 'Template', source: 'parentId', typeId: 'TEMPLATE' }]
  ),
  AUTHORITY: new DomoObjectType(
    'AUTHORITY',
    'Authority',
    null,
    /.*/,
    null,
    null
  ),
  AVATAR: new DomoObjectType('AVATAR', 'Avatar', null, /.*/, null, null),
  BEAST_MODE_FORMULA: new DomoObjectType(
    'BEAST_MODE_FORMULA',
    'Beast Mode',
    '/datacenter/beastmode?id={id}',
    /^\d+$/,
    { keyword: 'id' },
    {
      endpoint: '/query/v1/functions/template/{id}?hidden=true',
      pathToName: 'name'
    },
    ['DATA_SOURCE', 'CARD']
  ),
  CARD: new DomoObjectType(
    'CARD',
    'Card',
    '/kpis/details/{id}',
    /^\d+$/,
    {
      keyword: 'details'
    },
    {
      endpoint:
        '/content/v1/cards?urns={id}&includeFiltered=true&parts=metadata,datasources,domoapp',
      pathToDetails: '[0]',
      pathToName: '[0].title'
    },
    ['DATA_SOURCE', 'APP'],
    [{ field: 'datasources', isArray: true, itemTypeId: 'DATA_SOURCE', label: 'DataSets' }]
  ),
  CERTIFICATION: new DomoObjectType(
    'CERTIFICATION',
    'Certification',
    null,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    null,
    null
  ),
  CERTIFICATION_PROCESS: new DomoObjectType(
    'CERTIFICATION_PROCESS',
    'Certification Process',
    null,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    null,
    null
  ),
  CHANNEL: new DomoObjectType(
    'CHANNEL',
    'Buzz Channel',
    null,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    null,
    null
  ),
  CHART_COLOR_PALETTE: new DomoObjectType(
    'CHART_COLOR_PALETTE',
    'Chart Color Palette',
    null,
    /.*/,
    null,
    null
  ),
  CODEENGINE_PACKAGE: new DomoObjectType(
    'CODEENGINE_PACKAGE',
    'Code Engine Package',
    '/codeengine/{id}',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    { keyword: 'codeengine' },
    {
      endpoint: '/codeengine/v2/packages/{id}?parts=functions',
      pathToName: 'name'
    }
  ),
  CODEENGINE_PACKAGE_VERSION: new DomoObjectType(
    'CODEENGINE_PACKAGE_VERSION',
    'Code Engine Package Version',
    null,
    /^[0-9]+\.[0-9]+\.[0-9]+$/,
    null,
    {
      endpoint: '/codeengine/v2/packages/{parent}/versions/{id}'
    },
    ['CODEENGINE_PACKAGE']
  ),
  COLLECTION: new DomoObjectType(
    'COLLECTION',
    'Collection',
    null,
    /.*/,
    null,
    null
  ),
  COLUMN_NAME: new DomoObjectType(
    'COLUMN_NAME',
    'Column Name',
    null,
    /.*/,
    null,
    null
  ),
  COMMUNITY_SUPPORTED: new DomoObjectType(
    'COMMUNITY_SUPPORTED',
    'Community Supported Connector',
    null,
    /.*/,
    null,
    null
  ),
  CONFIG_APP: new DomoObjectType(
    'CONFIG_APP',
    'Config App',
    null,
    /.*/,
    null,
    null
  ),
  CONFIG_APP_CONFIGURATION: new DomoObjectType(
    'CONFIG_APP_CONFIGURATION',
    'Config App Configuration',
    null,
    /.*/,
    null,
    null
  ),
  CONNECTOR: new DomoObjectType(
    'CONNECTOR',
    'Connector',
    null,
    /.*/,
    null,
    null
  ),
  CONTAINER_VIEW: new DomoObjectType(
    'CONTAINER_VIEW',
    'Container View',
    null,
    /.*/,
    null,
    null
  ),
  CUSTOMER: new DomoObjectType('CUSTOMER', 'Customer', null, /.*/, null, null),
  CUSTOMER_LANDING_ENTITY: new DomoObjectType(
    'CUSTOMER_LANDING_ENTITY',
    'Customer Landing Entity',
    null,
    /.*/,
    null,
    null
  ),
  CUSTOMER_STATE: new DomoObjectType(
    'CUSTOMER_STATE',
    'Customer State',
    null,
    /.*/,
    null,
    {
      endpoint: '/content/v1/customer-states/{id}',
      pathToName: 'name'
    }
  ),
  DATA_APP: new DomoObjectType(
    'DATA_APP',
    'Studio App',
    '/app-studio/{id}',
    /^\d+$/,
    { keyword: 'app-studio' },
    {
      endpoint: '/content/v1/dataapps/{id}',
      pathToName: 'title'
    }
  ),
  DATA_APP_VIEW: new DomoObjectType(
    'DATA_APP_VIEW',
    'App Studio Page',
    '/app-studio/{parent}/pages/{id}',
    /^\d+$/,
    {
      keyword: 'pages',
      parentExtract: { keyword: 'app-studio', offset: 1 }
    },
    {
      endpoint: '/content/v3/stacks/{id}',
      pathToName: 'title'
    },
    ['DATA_APP'],
    [
      { label: 'Studio App', source: 'parentId', typeId: 'DATA_APP' },
      { field: 'content', isArray: true, itemTypeField: 'type', label: 'Content' }
    ]
  ),
  DATA_DICTIONARY: new DomoObjectType(
    'DATA_DICTIONARY',
    'Data Dictionary',
    null,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    null,
    null
  ),
  DATA_LINEAGE: new DomoObjectType(
    'DATA_LINEAGE',
    'Data Lineage',
    null,
    /.*/,
    null,
    null
  ),
  DATA_SCIENCE_NOTEBOOK: new DomoObjectType(
    'DATA_SCIENCE_NOTEBOOK',
    'Jupyter Workspace',
    '/jupyter-workspaces/{id}',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    { keyword: 'jupyter-workspaces' },
    {
      endpoint: '/datascience/v1/workspaces/{id}',
      pathToName: 'name'
    }
  ),
  DATA_SOURCE: new DomoObjectType(
    'DATA_SOURCE',
    'DataSet',
    '/datasources/{id}/details/data/table',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    { keyword: 'datasources' },
    {
      endpoint: '/data/v3/datasources/{id}?includeAllDetails=true',
      pathToName: 'name'
    },
    ['DATAFLOW_TYPE', 'DATA_SOURCE'],
    [
      { field: 'streamId', label: 'Stream', typeId: 'STREAM' },
      { field: 'accountId', label: 'Account', typeId: 'ACCOUNT' },
      { label: 'DataFlow', source: 'parentId', typeId: 'DATAFLOW_TYPE' }
    ]
  ),
  DATAFLOW: new DomoObjectType(
    'DATAFLOW',
    'DataFlow',
    '/datacenter/dataflows/{id}/details',
    /^\d+$/,
    null,
    {
      endpoint: '/dataprocessing/v2/dataflows/{id}',
      pathToName: 'name'
    }
  ),
  DATAFLOW_TYPE: new DomoObjectType(
    'DATAFLOW_TYPE',
    'DataFlow',
    '/datacenter/dataflows/{id}/details',
    /^\d+$/,
    { keyword: 'dataflows' },
    {
      endpoint: '/dataprocessing/v2/dataflows/{id}',
      pathToName: 'name'
    },
    null,
    [
      { field: 'inputs', isArray: true, itemTypeId: 'DATA_SOURCE', label: 'Inputs' },
      { field: 'outputs', isArray: true, itemTypeId: 'DATA_SOURCE', label: 'Outputs' }
    ]
  ),
  DATASET_QUERY: new DomoObjectType(
    'DATASET_QUERY',
    'Dataset Query',
    null,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    null,
    null
  ),
  DATASOURCE: new DomoObjectType(
    'DATASOURCE',
    'Datasource',
    '/datasources/{id}/details/data/table',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    null,
    {
      endpoint: '/data/v3/datasources/{id}?includeAllDetails=true',
      pathToName: 'name'
    }
  ),
  DEFAULT_POLICY: new DomoObjectType(
    'DEFAULT_POLICY',
    'Default Policy',
    null,
    /.*/,
    null,
    null
  ),
  DEPLOYMENT: new DomoObjectType(
    'DEPLOYMENT',
    'Deployment',
    null,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    null,
    null
  ),
  DIRECTORY: new DomoObjectType(
    'DIRECTORY',
    'Directory',
    null,
    /.*/,
    null,
    null
  ),
  DRILL_VIEW: new DomoObjectType(
    'DRILL_VIEW',
    'Drill Path',
    '/analyzer?cardid=${parent}&drillviewid=${id}',
    /^\d+$/,
    { keyword: 'drillviewid', parentExtract: { keyword: 'cardid', offset: 1 } },
    {
      endpoint: '/content/v1/cards?urns={id}:{parent}',
      pathToName: 'title'
    },
    ['CARD']
  ),
  DUPLICATED_DATA_SOURCE: new DomoObjectType(
    'DUPLICATED_DATA_SOURCE',
    'Duplicated DataSet',
    null,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    null,
    null
  ),
  ELEVATION: new DomoObjectType(
    'ELEVATION',
    'Elevation',
    null,
    /.*/,
    null,
    null
  ),
  EMAIL_ADDRESS: new DomoObjectType(
    'EMAIL_ADDRESS',
    'Email Address',
    null,
    /.*/,
    null,
    null
  ),
  ENABLED: new DomoObjectType('ENABLED', 'Enabled', null, /.*/, null, null),
  ENIGMA_FORM: new DomoObjectType(
    'ENIGMA_FORM',
    'Form',
    null,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    null,
    {
      endpoint: '/forms/v2/{id}',
      pathToName: 'name'
    },
    ['WORKFLOW_MODEL']
  ),
  ENIGMA_FORM_INSTANCE: new DomoObjectType(
    'ENIGMA_FORM_INSTANCE',
    'Form Instance',
    null,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    null,
    {
      endpoint: '/forms/v1/advanced-forms/{parent}/revisions/{id}',
      pathToName: 'revision'
    },
    ['ENIGMA_FORM']
  ),
  EXECUTOR_APPLICATION: new DomoObjectType(
    'EXECUTOR_APPLICATION',
    'Toolkit Application',
    null,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    null,
    {
      endpoint: '/executor/v1/applications/{id}',
      pathToName: 'name'
    }
  ),
  EXECUTOR_JOB: new DomoObjectType(
    'EXECUTOR_JOB',
    'Toolkit Job',
    null,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    null,
    {
      endpoint: '/executor/v1/applications/{parent}/jobs/{id}',
      pathToName: 'jobName'
    },
    ['EXECUTOR_APPLICATION'],
    [
      { label: 'Application', source: 'parentId', typeId: 'EXECUTOR_APPLICATION' },
      { field: 'executionPayload.configDatasetId', label: 'Config', typeId: 'DATA_SOURCE' },
      { field: 'executionPayload.metricsDatasetId', label: 'Log', typeId: 'DATA_SOURCE' }
    ]
  ),
  FILE: new DomoObjectType('FILE', 'File', null, /^\d+$/, null, {
    endpoint: '/data/v1/data-files/{id}/details',
    pathToName: 'name'
  }),
  FILE_REVISION: new DomoObjectType(
    'FILE_REVISION',
    'File Version',
    null,
    /^\d+$/,
    null,
    {
      endpoint: '/data/v1/data-files/{parent}/revisions/{id}',
      pathToName: 'name'
    },
    ['FILE']
  ),
  FILESET: new DomoObjectType(
    'FILESET',
    'FileSet',
    '/datacenter/filesets/{id}/overview',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    { keyword: 'filesets' },
    {
      endpoint: '/files/v1/filesets/{id}',
      pathToName: 'name'
    }
  ),
  FILESET_DIRECTORY: new DomoObjectType(
    'FILESET_DIRECTORY',
    'FileSet Directory',
    null,
    /.*/,
    null,
    null
  ),
  FILESET_FILE: new DomoObjectType(
    'FILESET_FILE',
    'FileSet File',
    null,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    null,
    {
      endpoint: '/files/v1/filesets/{parent}/files/{id}',
      pathToName: 'name'
    },
    ['FILESET']
  ),
  FUNCTION: new DomoObjectType(
    'FUNCTION',
    'Function',
    null,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    null,
    null,
    null,
    null,
    true
  ),
  GOAL: new DomoObjectType('GOAL', 'Goal', null, /^\d+$/, null, {
    endpoint: '/social/v1/objectives/{id}',
    pathToName: 'name'
  }),
  GOAL_DELEGATE: new DomoObjectType(
    'GOAL_DELEGATE',
    'Goal Delegate',
    null,
    /.*/,
    null,
    null
  ),
  GOAL_PERIOD: new DomoObjectType(
    'GOAL_PERIOD',
    'Goal Period',
    null,
    /^\d+$/,
    null,
    {
      endpoint: '/social/v1/objectives/periods/{id}',
      pathToName: 'name'
    }
  ),
  GOAL_TAG: new DomoObjectType(
    'GOAL_TAG',
    'Goal Tag',
    null,
    /^\d+$/,
    null,
    null,
    ['TAG_CATEGORY']
  ),
  GROUP: new DomoObjectType(
    'GROUP',
    'Group',
    '/admin/groups/{id}?tab=people',
    /^\d+$/,
    { keyword: 'groups' },
    {
      endpoint: '/content/v2/groups/{id}',
      pathToName: 'name'
    }
  ),
  GROUP_CHAT: new DomoObjectType(
    'GROUP_CHAT',
    'Buzz Group Chat',
    null,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    null,
    null
  ),
  GUIDE: new DomoObjectType('GUIDE', 'Guide', null, /.*/, null, null),
  HOPPER_QUEUE: new DomoObjectType(
    'HOPPER_QUEUE',
    'Task Center Queue',
    '/queues/tasks?queueId={id}&status=OPEN',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    { keyword: 'queueId' },
    {
      endpoint: '/queues/v1/{id}',
      pathToName: 'name'
    }
  ),
  HOPPER_TASK: new DomoObjectType(
    'HOPPER_TASK',
    'Task Center Task',
    '/queues/tasks?queueId={parent}&id={id}&openTaskDrawer=true',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    { keyword: 'id' },
    {
      endpoint: '/queues/v1/{parent}/tasks/{id}',
      pathToName: 'displayEntity.name'
    },
    ['HOPPER_QUEUE']
  ),
  HUDDLE: new DomoObjectType(
    'HUDDLE',
    'Buzz Thread',
    null,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    null,
    null
  ),
  IMAGE: new DomoObjectType('IMAGE', 'Image', null, /.*/, null, null),
  JOB: new DomoObjectType('JOB', 'Job', null, /^\d+$/, null, null),
  KEY_RESULT: new DomoObjectType(
    'KEY_RESULT',
    'Key Result',
    '/goals/key-results/{id}',
    /^\d+$/,
    { keyword: 'key-results' },
    {
      endpoint: '/social/v1/objectives/key-results/{id}',
      pathToName: 'name'
    },
    ['GOAL']
  ),
  LANDING_ENTITY: new DomoObjectType(
    'LANDING_ENTITY',
    'Landing Entity',
    null,
    /.*/,
    null,
    null
  ),
  LICENSE_PAGE: new DomoObjectType(
    'LICENSE_PAGE',
    'License Page',
    null,
    /.*/,
    null,
    null
  ),
  MAGNUM_COLLECTION: new DomoObjectType(
    'MAGNUM_COLLECTION',
    'AppDB Collection',
    '/appDb/{id}/permissions',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    { keyword: 'appDb' },
    {
      endpoint: '/datastores/v1/collections/{id}',
      pathToName: 'name'
    },
    ['MAGNUM_DATASTORE']
  ),
  MAGNUM_DATASTORE: new DomoObjectType(
    'MAGNUM_DATASTORE',
    'AppDB Datastore',
    null,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    null,
    {
      endpoint: '/datastores/v1/{id}',
      pathToName: 'name'
    }
  ),
  METRIC: new DomoObjectType('METRIC', 'Metric', null, /.*/, null, null),
  NAME: new DomoObjectType('NAME', 'Name', null, /.*/, null, null),
  NAV_PIN_ITEM: new DomoObjectType(
    'NAV_PIN_ITEM',
    'Nav Pin Item',
    null,
    /^\d+$/,
    null,
    null
  ),
  OAUTH2_CLIENT_CREDENTIALS: new DomoObjectType(
    'OAUTH2_CLIENT_CREDENTIALS',
    'Oauth 2.0 Client Credentials',
    null,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    null,
    null
  ),
  OBJECTIVE: new DomoObjectType(
    'OBJECTIVE',
    'Goal',
    '/goals/{id}',
    /^\d+$/,
    {
      keyword: 'goals'
    },
    {
      endpoint: '/social/v1/objectives/{id}',
      pathToName: 'name'
    }
  ),
  OTP_KEY: new DomoObjectType('OTP_KEY', 'OTP Key', null, null, null, null),
  PAGE: new DomoObjectType(
    'PAGE',
    'Page',
    '/page/{id}',
    /^-?\d+$/,
    {
      keyword: 'page'
    },
    {
      endpoint: '/content/v3/stacks/{id}',
      pathToName: 'title'
    },
    ['PAGE'],
    [{ field: 'content', isArray: true, itemTypeField: 'type', label: 'Content' }]
  ),
  PAGE_ANALYZER: new DomoObjectType(
    'PAGE_ANALYZER',
    'Page Analyzer',
    null,
    /.*/,
    null,
    null
  ),
  PAGE_COLLECTION: new DomoObjectType(
    'PAGE_COLLECTION',
    'Page Collection',
    null,
    /^\d+$/,
    null,
    null,
    ['PAGE']
  ),
  PAGE_TEMPLATE: new DomoObjectType(
    'PAGE_TEMPLATE',
    'Page Template',
    null,
    /.*/,
    null,
    null
  ),
  POLICY_ORDER: new DomoObjectType(
    'POLICY_ORDER',
    'Policy Order',
    null,
    /.*/,
    null,
    null
  ),
  PROJECT: new DomoObjectType(
    'PROJECT',
    'Project',
    '/project/{id}',
    /^\d+$/,
    {
      keyword: 'project'
    },
    {
      endpoint: '/content/v1/projects/{id}',
      pathToName: 'projectName'
    }
  ),
  PROJECT_LIST: new DomoObjectType(
    'PROJECT_LIST',
    'Project List',
    null,
    /^\d+$/,
    null,
    {
      endpoint: '/content/v1/projects/{parent}/lists/{id}',
      pathToName: 'name'
    },
    ['PROJECT']
  ),
  PROJECT_TASK: new DomoObjectType(
    'PROJECT_TASK',
    'Task',
    '/project?taskId={id}',
    /^\d+$/,
    { keyword: 'taskId' },
    {
      endpoint: '/content/v1/tasks/{id}',
      pathToName: 'taskName'
    },
    ['PROJECT', 'PROJECT_LIST']
  ),
  PROJECT_TASK_ATTACHMENT: new DomoObjectType(
    'PROJECT_TASK_ATTACHMENT',
    'Task Attachment',
    null,
    /.*/,
    null,
    null,
    ['PROJECT_TASK']
  ),
  PROJECT_TASK_OWNER: new DomoObjectType(
    'PROJECT_TASK_OWNER',
    'Task Owner',
    null,
    /^\d+$/,
    null,
    null,
    ['PROJECT_TASK']
  ),
  PROXIER_EMAIL: new DomoObjectType(
    'PROXIER_EMAIL',
    'Proxier Email',
    null,
    /.*/,
    null,
    null
  ),
  PROXY_USER: new DomoObjectType(
    'PROXY_USER',
    'Proxy User',
    null,
    /.*/,
    null,
    null
  ),
  PUBLIC_URL: new DomoObjectType(
    'PUBLIC_URL',
    'Public Embed URL',
    null,
    /.*/,
    null,
    null
  ),
  PUBLICATION: new DomoObjectType(
    'PUBLICATION',
    'Publication',
    '/domo-everywhere/publications?id={id}',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    { keyword: 'id' },
    {
      endpoint: '/publish/v2/publications/{id}',
      pathToName: 'name'
    }
  ),
  PUBLICATION_GROUP: new DomoObjectType(
    'PUBLICATION_GROUP',
    'Publication Group',
    null,
    /^\d+$/,
    null,
    null
  ),
  REPORT: new DomoObjectType('REPORT', 'Report', null, /^\d+$/, null, null),
  REPORT_BUILDER: new DomoObjectType(
    'REPORT_BUILDER',
    'Report Builder',
    null,
    /^\d+$/,
    null,
    {
      endpoint: '/content/v1/reportbuilder/{id}',
      pathToName: 'title'
    }
  ),
  REPORT_BUILDER_PAGE: new DomoObjectType(
    'REPORT_BUILDER_PAGE',
    'Report Page',
    null,
    /^\d+$/,
    null,
    null
  ),
  REPORT_BUILDER_VIEW: new DomoObjectType(
    'REPORT_BUILDER_VIEW',
    'Report Builder View',
    null,
    /^\d+$/,
    null,
    {
      endpoint: '/content/v1/reportbuilder/views/{id}',
      pathToName: 'subject'
    },
    ['REPORT_BUILDER']
  ),
  REPORT_SCHEDULE: new DomoObjectType(
    'REPORT_SCHEDULE',
    'Scheduled Report',
    null,
    /^\d+$/,
    null,
    {
      endpoint: '/content/v1/reportschedules/{id}',
      pathToName: 'title'
    }
  ),
  REPOSITORY: new DomoObjectType(
    'REPOSITORY',
    'Sandbox Repository',
    '/sandbox/repositories/{id}',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    { keyword: 'repositories' },
    {
      endpoint: '/versions/v1/repositories/{id}',
      pathToName: 'name'
    }
  ),
  REPOSITORY_AUTHORIZATION: new DomoObjectType(
    'REPOSITORY_AUTHORIZATION',
    'Repository Authorization',
    null,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    null,
    null
  ),
  ROLE: new DomoObjectType(
    'ROLE',
    'Role',
    '/admin/roles/{id}',
    /^\d+$/,
    {
      keyword: 'roles'
    },
    {
      endpoint: '/authorization/v1/roles/{id}',
      pathToName: 'name'
    }
  ),
  RYUU_APP: new DomoObjectType(
    'RYUU_APP',
    'Custom App (Pro-Code)',
    '/assetlibrary/{id}/overview',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    { keyword: 'assetlibrary' },
    {
      endpoint: '/apps/v1/designs/{id}',
      pathToName: 'name'
    }
  ),
  SCHEDULE: new DomoObjectType('SCHEDULE', 'Schedule', null, null, null, null),
  SEGMENT: new DomoObjectType('SEGMENT', 'Segment', null, /^\d+$/, null, null),
  SESSION: new DomoObjectType(
    'SESSION',
    'Session',
    null,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    null,
    null
  ),
  SMS_NOTIFICATION_COMMAND: new DomoObjectType(
    'SMS_NOTIFICATION_COMMAND',
    'SMS Notification Command',
    null,
    null,
    null,
    null
  ),
  SMS_NOTIFICATION_WEB: new DomoObjectType(
    'SMS_NOTIFICATION_WEB',
    'SMS Notification Web',
    null,
    null,
    null,
    null
  ),
  SSO_PAGE: new DomoObjectType(
    'SSO_PAGE',
    'Single Sign-On(SSO) Page',
    null,
    /.*/,
    null,
    null
  ),
  SSO_SETTINGS: new DomoObjectType(
    'SSO_SETTINGS',
    'SSO Settings',
    null,
    /^\d+$/,
    null,
    null
  ),
  STORY: new DomoObjectType('STORY', 'Story', null, /^\d+$/, null, null),
  STREAM: new DomoObjectType(
    'STREAM',
    'Stream',
    null,
    /^\d+$/,
    null,
    {
      endpoint: '/data/v1/streams/{id}?fields=all',
      nameTemplate: '{dataProvider.name} Stream {id}',
      pathToName: 'dataProvider.name'
    },
    ['DATA_SOURCE']
  ),
  SUBSCRIPTION: new DomoObjectType(
    'SUBSCRIPTION',
    'Subscription',
    null,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    null,
    null
  ),
  SYSTEM: new DomoObjectType('SYSTEM', 'System', null, /.*/, null, null),
  TAG_CATEGORY: new DomoObjectType(
    'TAG_CATEGORY',
    'Goal Tag Category',
    null,
    /^\d+$/,
    null,
    null
  ),
  TEAM: new DomoObjectType(
    'TEAM',
    'Team',
    null,
    /^\d+$/,
    null,
    null,
    null,
    null,
    true
  ),
  TEMPLATE: new DomoObjectType(
    'TEMPLATE',
    'Approval Template',
    '/approval/edit-request-form/{id}',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    { keyword: 'edit-request-form' },
    {
      bodyTemplate: {
        operationName: 'getTemplateForEdit',
        query:
          'query getTemplateForEdit($id: ID!) {\n  template(id: $id) {\n    id\n    title\n    titleName\n    titlePlaceholder\n    acknowledgment\n    instructions\n    description\n    providerName\n    isPublic\n    chainIsLocked\n    type\n    isPublished\n    observers {\n      id\n      type\n      displayName\n      avatarKey\n      title\n      ... on Group {\n        userCount\n        __typename\n      }\n      __typename\n    }\n    categories {\n      id\n      name\n      __typename\n    }\n    owner {\n      id\n      displayName\n      avatarKey\n      __typename\n    }\n    fields {\n      key\n      type\n      name\n      data\n      placeholder\n      required\n      isPrivate\n      ... on SelectField {\n        option\n        multiselect\n        datasource\n        column\n        order\n        __typename\n      }\n      __typename\n    }\n    approvers {\n      type\n      originalType: type\n      key\n      ... on ApproverPerson {\n        id: approverId\n        approverId\n        userDetails {\n          id\n          displayName\n          title\n          avatarKey\n          isDeleted\n          __typename\n        }\n        __typename\n      }\n      ... on ApproverGroup {\n        id: approverId\n        approverId\n        groupDetails {\n          id\n          displayName\n          userCount\n          isDeleted\n          __typename\n        }\n        __typename\n      }\n      ... on ApproverPlaceholder {\n        placeholderText\n        __typename\n      }\n      __typename\n    }\n    workflowIntegration {\n      modelId\n      modelVersion\n      startName\n      modelName\n      parameterMapping {\n        fields {\n          field\n          parameter\n          required\n          type\n          __typename\n        }\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}',
        variables: { id: '{id}' }
      },
      endpoint: '/synapse/approval/graphql',
      method: 'POST',
      pathToDetails: 'data.template',
      pathToName: 'data.template.title'
    }
  ),
  TOKEN: new DomoObjectType(
    'TOKEN',
    'API Client',
    null,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[X]{4}-[X]{4}-[X]{12}$/i,
    null,
    null
  ),
  USAGE_REPORT_ROWS: new DomoObjectType(
    'USAGE_REPORT_ROWS',
    'Rows Usage Report',
    null,
    null,
    null,
    null
  ),
  USER: new DomoObjectType(
    'USER',
    'User',
    '/admin/people/{id}?tab=profile',
    /^\d+$/,
    { keyword: 'people' },
    {
      endpoint: '/content/v2/users/{id}',
      pathToName: 'displayName'
    }
  ),
  USER_ACHIEVEMENT: new DomoObjectType(
    'USER_ACHIEVEMENT',
    'User Achievement',
    null,
    /^\d+$/,
    null,
    null
  ),
  USER_CUSTOM_KEY: new DomoObjectType(
    'USER_CUSTOM_KEY',
    'User Custom Attribute',
    null,
    /.*/,
    null,
    null
  ),
  USER_STATE: new DomoObjectType(
    'USER_STATE',
    'User State',
    null,
    /.*/,
    null,
    null
  ),
  USER_TEMPLATE: new DomoObjectType(
    'USER_TEMPLATE',
    'User Template',
    null,
    /^\d+$/,
    null,
    null,
    null,
    null,
    true
  ),
  VARIABLE: new DomoObjectType('VARIABLE', 'Variable', null, /^\d+$/, null, {
    endpoint: '/query/v1/functions/template/{id}?hidden=true',
    pathToName: 'name'
  }),
  VARIABLE_CONTROL: new DomoObjectType(
    'VARIABLE_CONTROL',
    'Variable Control',
    null,
    /^\d+$/,
    null,
    null,
    ['VARIABLE']
  ),
  VECTOR_INDEX: new DomoObjectType(
    'VECTOR_INDEX',
    'Vector Index',
    null,
    /.*/,
    null,
    null
  ),
  VIDEO_ROOM: new DomoObjectType(
    'VIDEO_ROOM',
    'Video Call',
    null,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    null,
    null,
    null,
    null,
    true
  ),
  VIEW: new DomoObjectType(
    'VIEW',
    'View',
    null,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    null,
    null
  ),
  VIEW_ADVANCED_EDITOR: new DomoObjectType(
    'VIEW_ADVANCED_EDITOR',
    'View Advanced Editor',
    null,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    null,
    null
  ),
  VIRTUAL_USER: new DomoObjectType(
    'VIRTUAL_USER',
    'Virtual User',
    null,
    /^vu:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    null,
    null
  ),
  WAREHOUSE_ACCOUNT: new DomoObjectType(
    'WAREHOUSE_ACCOUNT',
    'Cloud Integration',
    '/cloud-integrations/{id}/settings',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    { keyword: 'cloud-integrations' },
    {
      endpoint: '/query/v1/byos/accounts/{id}',
      pathToName: 'friendlyName',
      pathToParentId: 'serviceAccountId'
    },
    ['ACCOUNT'],
    [{ label: 'Account', source: 'parentId', typeId: 'ACCOUNT' }]
  ),
  WORKBENCH_AGENT: new DomoObjectType(
    'WORKBENCH_AGENT',
    'On Premise Agent',
    null,
    /.*/,
    null,
    null
  ),
  WORKBENCH_GROUP: new DomoObjectType(
    'WORKBENCH_GROUP',
    'Workbench Group',
    null,
    /^\d+$/,
    null,
    null
  ),
  WORKBENCH_JOB: new DomoObjectType(
    'WORKBENCH_JOB',
    'On Premise Job',
    null,
    /^\d+$/,
    null,
    null
  ),
  WORKBENCH_SCHEDULE: new DomoObjectType(
    'WORKBENCH_SCHEDULE',
    'On Premise Job Schedule',
    null,
    /0/,
    null,
    null
  ),
  WORKFLOW_INSTANCE: new DomoObjectType(
    'WORKFLOW_INSTANCE',
    'Workflow Execution',
    '/workflows/instances/{parent}/{version}/{id}',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    {
      keyword: 'instances',
      offset: 3,
      parentExtract: { keyword: 'instances', offset: 1 },
      urlParamExtracts: { version: { keyword: 'instances', offset: 2 } }
    },
    {
      endpoint: '/workflow/v2/executions/{id}',
      pathToName: 'modelName'
    },
    ['WORKFLOW_MODEL']
  ),
  WORKFLOW_MODEL: new DomoObjectType(
    'WORKFLOW_MODEL',
    'Workflow',
    '/workflows/models/{id}',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    { keyword: 'workflows', offset: 2 },
    {
      endpoint: '/workflow/v1/models/{id}',
      pathToName: 'name'
    }
  ),
  WORKFLOW_MODEL_VERSION: new DomoObjectType(
    'WORKFLOW_MODEL_VERSION',
    'Workflow Model Version',
    '/workflows/models/{parent}/{id}?_wfv=view',
    /^[0-9]+\.[0-9]+\.[0-9]+$/,
    {
      keyword: 'workflows',
      offset: 3,
      parentExtract: { keyword: 'workflows', offset: 2 }
    },
    {
      endpoint: '/workflow/v2/models/{parent}/versions/{id}',
      pathToName: 'version'
    },
    ['WORKFLOW_MODEL']
  ),
  WORKFLOW_TIMER_START: new DomoObjectType(
    'WORKFLOW_TIMER_START',
    'Workflow Timer Start',
    null,
    /.*/,
    null,
    null,
    ['WORKFLOW_INSTANCE']
  ),
  WORKSHEET: new DomoObjectType(
    'WORKSHEET',
    'Worksheet',
    '/app-studio/{id}',
    /^\d+$/,
    { keyword: 'app-studio' },
    {
      endpoint: '/content/v1/dataapps/{id}',
      pathToName: 'title'
    }
  ),
  WORKSHEET_VIEW: new DomoObjectType(
    'WORKSHEET_VIEW',
    'Worksheet View',
    '/app-studio/{parent}/pages/{id}',
    /^\d+$/,
    {
      keyword: 'pages',
      parentExtract: { keyword: 'app-studio', offset: 1 }
    },
    {
      endpoint: '/content/v3/stacks/{id}',
      pathToName: 'title'
    },
    ['WORKSHEET'],
    [{ label: 'Worksheet', source: 'parentId', typeId: 'WORKSHEET' }]
  ),
  WORKSPACE: new DomoObjectType(
    'WORKSPACE',
    'Workspace',
    '/workspaces/{id}',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    { keyword: 'workspaces' },
    {
      endpoint: '/nav/v1/workspaces/{id}',
      pathToName: 'name'
    }
  )
};

/**
 * Get all object types that have either a navigable URL or an API configuration.
 * Suitable for the clipboard navigation dropdown where non-URL types
 * can be viewed in the sidepanel instead.
 * @returns {DomoObjectType[]} Array of DomoObjectType instances
 */
export function getAllNavigableObjectTypes() {
  return Object.values(ObjectTypeRegistry).filter(
    (type) =>
      (type.hasUrl() || type.hasApiConfig()) &&
      !type.deprecated &&
      type.idPattern !== null
  );
}

/**
 * Get all registered object types
 * @returns {DomoObjectType[]} Array of all DomoObjectType instances
 */
export function getAllObjectTypes() {
  return Object.values(ObjectTypeRegistry).filter((type) => !type.deprecated);
}

/**
 * Get all object types that have an API configuration
 * @returns {DomoObjectType[]} Array of DomoObjectType instances with apiConfig defined
 */
export function getAllObjectTypesWithApiConfig() {
  return Object.values(ObjectTypeRegistry).filter(
    (type) => type.hasApiConfig() && !type.deprecated
  );
}

/**
 * Get all object types that have a navigable URL
 * @returns {DomoObjectType[]} Array of DomoObjectType instances with urlPath defined
 */
export function getAllObjectTypesWithUrl() {
  return Object.values(ObjectTypeRegistry).filter(
    (type) => type.hasUrl() && !type.deprecated
  );
}

/**
 * Get an DomoObjectType by its type
 * @param {string} type - The type
 * @returns {DomoObjectType|null} The DomoObjectType instance or null if not found
 */
export function getObjectType(type) {
  return ObjectTypeRegistry[type] || null;
}
