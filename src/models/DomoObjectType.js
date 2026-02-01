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
   */
  constructor(
    id,
    name,
    urlPath,
    idPattern,
    extractConfig = null,
    api = null,
    parents = null,
    deprecated = false
  ) {
    this.id = id;
    this.name = name;
    this.urlPath = urlPath;
    this.idPattern = idPattern;
    this.extractConfig = extractConfig;
    this.api = api;
    this.parents = parents;
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
            parentId = await domoObject.getParentWithTabId(tabId);
          } catch (error) {
            throw new Error(
              `Parent ID is required for ${this.id} and could not be fetched: ${error.message}`
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
   * Check if this object type requires a parent ID for URL construction
   * @returns {boolean} Whether a parent ID is required for URL construction
   */
  requiresParentForUrl() {
    return this.urlPath && this.urlPath.includes('{parent}');
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
   * Check if this object type has a navigable URL
   * @returns {boolean} Whether the object type has a URL path
   */
  hasUrl() {
    return this.urlPath !== null && this.urlPath !== undefined;
  }

  /**
   * Check if this object type has an API configuration
   * @returns {boolean} Whether the object type has an API configuration
   */
  hasApiConfig() {
    return this.api !== null && this.api !== undefined;
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
   * Extract the ID from a URL for this object type
   * @param {string} url - The URL to extract from
   * @returns {string|null} The extracted ID or null if not found
   */
  extractObjectId(url) {
    if (!this.extractConfig) {
      return null;
    }

    const parts = url.split(/[/?=&]/);
    const { keyword, offset = 1, fromEnd = false } = this.extractConfig;

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
      keyword,
      offset = 1,
      fromEnd = false
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
  ACCOUNT: new DomoObjectType('ACCOUNT', 'Account', null, /^\d+$/, null, {
    method: 'GET',
    endpoint: '/data/v1/accounts/{id}',
    pathToName: 'name'
  }),
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
      method: 'GET',
      endpoint: '/content/v1/achievements/{id}',
      pathToName: 'name'
    }
  ),
  ACHIEVEMENT_ADMIN: new DomoObjectType(
    'ACHIEVEMENT_ADMIN',
    'Achievement admin',
    null,
    /.*/,
    null,
    null
  ),
  ACTIVITY_LOG: new DomoObjectType(
    'ACTIVITY_LOG',
    'Activity log',
    '/admin/logging',
    null,
    null,
    null
  ),
  ACTIVITY_LOG_CSV: new DomoObjectType(
    'ACTIVITY_LOG_CSV',
    'Activity log csv',
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
    'Adc mask',
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
  AI_CHAT: new DomoObjectType('AI_CHAT', 'Ai chat', null, /.*/, null, null),
  AI_MODEL: new DomoObjectType(
    'AI_MODEL',
    'AI Model',
    '/ai-services/models/{id}',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    { keyword: 'model' },
    {
      method: 'GET',
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
      method: 'GET',
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
      method: 'GET',
      endpoint: '/social/v4/alerts/{id}',
      pathToName: 'name'
    }
  ),
  ALERT_SUBSCRIBER: new DomoObjectType(
    'ALERT_SUBSCRIBER',
    'Alert subscriber',
    null,
    /^\d+$/,
    null,
    null
  ),
  ALERT_WORKFLOW_ACTION: new DomoObjectType(
    'ALERT_WORKFLOW_ACTION',
    'Alert workflow action',
    null,
    /.*/,
    null,
    null
  ),
  APPROVAL: new DomoObjectType(
    'APPROVAL',
    'Approval',
    '/approval/request-details/{id}',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    { keyword: 'request-details' },
    {
      method: 'POST',
      endpoint: 'synapse/approval/graphql',
      pathToName: 'data.request.title',
      bodyTemplate: {
        operationName: 'getApprovalForDetails',
        variables: { id: '{id}' },
        query:
          'query getApprovalForDetails($id: ID!) {\n  request: approval(id: $id) {\n    ...approvalFields\n    __name\n  }\n}\n\nfragment approvalFields on Approval {\n  newActivity\n  observers {\n    id\n    id\n    displayName\n    title\n    ... on Group {\n      currentUserIsMember\n      memberCount: userCount\n      __name\n    }\n    __name\n  }\n  lastViewed\n  newActivity\n  newMessage {\n    created\n    createdByType\n    createdBy {\n      id\n      displayName\n      __name\n    }\n    content {\n      text\n      __name\n    }\n    __name\n  }\n  lastAction\n  version\n  submittedTime\n  id\n  title\n  status\n  providerName\n  templateTitle\n  buzzChannelId\n  buzzGeneralThreadId\n  templateInstructions\n  templateDescription\n  acknowledgment\n  snooze\n  snoozed\n  id\n  categories {\n    id\n    name\n    __name\n  }\n  total {\n    value\n    currency\n    __name\n  }\n  modifiedTime\n  previousApprover: previousApproverEx {\n    id\n    id\n    displayName\n    ... on User {\n      title\n      avatarKey\n      isCurrentUser\n      __name\n    }\n    ... on Group {\n      currentUserIsMember\n      userCount\n      isDeleted\n      actor {\n        displayName\n        id\n        __name\n      }\n      __name\n    }\n    __name\n  }\n  pendingApprover: pendingApproverEx {\n    id\n    id\n    displayName\n    ... on User {\n      title\n      avatarKey\n      isCurrentUser\n      __name\n    }\n    ... on Group {\n      currentUserIsMember\n      userCount\n      isDeleted\n      __name\n    }\n    __name\n  }\n  submitter {\n    id\n    displayName\n    title\n    avatarKey\n    isCurrentUser\n    id\n    __name\n  }\n  approvalChainIdx\n  reminder {\n    sent\n    sentBy {\n      displayName\n      title\n      id\n      isCurrentUser\n      id\n      __name\n    }\n    __name\n  }\n  chain {\n    actor {\n      displayName\n      __name\n    }\n    approver {\n      id\n      id\n      displayName\n      ... on User {\n        title\n        avatarKey\n        isCurrentUser\n        __name\n      }\n      ... on Group {\n        currentUserIsMember\n        userCount\n        isDeleted\n        __name\n      }\n      __name\n    }\n    status\n    time\n    id\n    key\n    __name\n  }\n  fields {\n    data\n    name\n    id\n    key\n    ... on HeaderField {\n      fields {\n        data\n        name\n        id\n        key\n        ... on HeaderField {\n          fields {\n            data\n            name\n            id\n            key\n            __name\n          }\n          __name\n        }\n        __name\n      }\n      __name\n    }\n    ... on ItemListField {\n      fields {\n        data\n        name\n        id\n        key\n        ... on HeaderField {\n          fields {\n            data\n            name\n            id\n            key\n            ... on HeaderField {\n              fields {\n                data\n                name\n                id\n                key\n                __name\n              }\n              __name\n            }\n            __name\n          }\n          __name\n        }\n        __name\n      }\n      __name\n    }\n    ... on NumberField {\n      value\n      __name\n    }\n    ... on CurrencyField {\n      number: value\n      currency\n      __name\n    }\n    ... on DateField {\n      date: value\n      __name\n    }\n    ... on DataSetAttachmentField {\n      dataSet: value {\n        id\n        name\n        description\n        owner {\n          id\n          displayName\n          __name\n        }\n        provider\n        cardCount\n        __name\n      }\n      __name\n    }\n    __name\n  }\n  history {\n    actor {\n      id\n      id\n      displayName\n      ... on User {\n        avatarKey\n        isCurrentUser\n        __name\n      }\n      __name\n    }\n    status\n    time\n    __name\n  }\n  latestMessage {\n    created\n    __name\n  }\n  latestMentioned {\n    created\n    __name\n  }\n  workflowIntegration {\n    modelId\n    modelVersion\n    startName\n    instanceId\n    modelName\n    __name\n  }\n  __name\n}'
      }
    },
    ['TEMPLATE']
  ),
  APP: new DomoObjectType(
    'APP',
    'Custom App',
    '/assetlibrary/{id}/overview',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    { keyword: 'assetlibrary' },
    {
      method: 'GET',
      endpoint: '/apps/v1/designs/{id}?parts=versions',
      pathToName: 'name'
    }
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
    '/beastmode?id={id}',
    /^\d+$/,
    { keyword: 'id' },
    {
      method: 'GET',
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
      method: 'PUT',
      endpoint: '/content/v3/cards/kpi/definition',
      bodyTemplate: { urn: '{id}' },
      pathToName: 'definition.title'
    },
    ['DATA_SOURCE']
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
    'Buzz channel',
    null,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    null,
    null
  ),
  CHART_COLOR_PALETTE: new DomoObjectType(
    'CHART_COLOR_PALETTE',
    'Chart color palette',
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
      method: 'GET',
      endpoint: '/codeengine/v2/packages/{id}?parts=functions',
      pathToName: 'name'
    }
  ),
  CODEENGINE_PACKAGE_VERSION: new DomoObjectType(
    'CODEENGINE_PACKAGE_VERSION',
    'CodeEngine Package Version',
    null,
    /^[0-9]+\.[0-9]+\.[0-9]+$/,
    null,
    {
      method: 'GET',
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
    'Column name',
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
    'Config app',
    null,
    /.*/,
    null,
    null
  ),
  CONFIG_APP_CONFIGURATION: new DomoObjectType(
    'CONFIG_APP_CONFIGURATION',
    'Config app configuration',
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
    'Container view',
    null,
    /.*/,
    null,
    null
  ),
  CUSTOMER: new DomoObjectType('CUSTOMER', 'Customer', null, /.*/, null, null),
  CUSTOMER_LANDING_ENTITY: new DomoObjectType(
    'CUSTOMER_LANDING_ENTITY',
    'Customer landing entity',
    null,
    /.*/,
    null,
    null
  ),
  CUSTOMER_STATE: new DomoObjectType(
    'CUSTOMER_STATE',
    'Customer state',
    null,
    /.*/,
    null,
    {
      method: 'GET',
      endpoint: '/content/v1/customer-states/{id}',
      pathToName: 'name'
    }
  ),
  DATA_APP: new DomoObjectType(
    'DATA_APP',
    'App',
    '/app-studio/{id}',
    /^\d+$/,
    { keyword: 'app-studio' },
    {
      method: 'GET',
      endpoint: '/content/v1/dataapps/{id}',
      pathToName: 'title'
    }
  ),
  DATA_APP_VIEW: new DomoObjectType(
    'DATA_APP_VIEW',
    'App page',
    '/app-studio/{parent}/pages/{id}',
    /^\d+$/,
    {
      keyword: 'pages',
      parentExtract: { keyword: 'app-studio', offset: 1 }
    },
    {
      method: 'GET',
      endpoint: '/content/v3/stacks/{id}',
      pathToName: 'title'
    },
    ['DATA_APP']
  ),
  DATA_DICTIONARY: new DomoObjectType(
    'DATA_DICTIONARY',
    'Data dictionary',
    null,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    null,
    null
  ),
  DATA_LINEAGE: new DomoObjectType(
    'DATA_LINEAGE',
    'Data lineage',
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
      method: 'GET',
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
      method: 'GET',
      endpoint: '/data/v3/datasources/{id}?includeAllDetails=true',
      pathToName: 'name'
    },
    ['DATAFLOW_TYPE', 'DATA_SOURCE']
  ),
  DATAFLOW_TYPE: new DomoObjectType(
    'DATAFLOW_TYPE',
    'DataFlow',
    '/datacenter/dataflows/{id}/details',
    /^\d+$/,
    { keyword: 'dataflows' },
    {
      method: 'GET',
      endpoint: '/dataprocessing/v2/dataflows/{id}',
      pathToName: 'name'
    }
  ),
  DATAFLOW: new DomoObjectType('DATAFLOW', 'Dataflow', null, /^\d+$/, null, {
    method: 'GET',
    endpoint: '/dataprocessing/v2/dataflows/{id}',
    pathToName: 'name'
  }),
  DATASET_QUERY: new DomoObjectType(
    'DATASET_QUERY',
    'Dataset query',
    null,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    null,
    null
  ),
  DATASOURCE: new DomoObjectType(
    'DATASOURCE',
    'Datasource',
    null,
    /^\d+$/,
    null,
    null
  ),
  DEFAULT_POLICY: new DomoObjectType(
    'DEFAULT_POLICY',
    'Default policy',
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
      method: 'GET',
      endpoint: '/content/v1/cards?urns={id}:{parent}',
      pathToName: 'title'
    },
    ['CARD']
  ),
  DUPLICATED_DATA_SOURCE: new DomoObjectType(
    'DUPLICATED_DATA_SOURCE',
    'Duplicated data source',
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
    null
  ),
  ENIGMA_FORM_INSTANCE: new DomoObjectType(
    'ENIGMA_FORM_INSTANCE',
    'Enigma form instance',
    null,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    null,
    null
  ),
  EXECUTOR_APPLICATION: new DomoObjectType(
    'EXECUTOR_APPLICATION',
    'Executor Application',
    null,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    null,
    null
  ),
  EXECUTOR_JOB: new DomoObjectType(
    'EXECUTOR_JOB',
    'Executor Job',
    null,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    null,
    {
      method: 'GET',
      endpoint: '/executor/v1/applications/{parent}/jobs/{id}',
      pathToName: 'jobName'
    },
    ['EXECUTOR_APPLICATION']
  ),
  FILE: new DomoObjectType('FILE', 'File', null, /^\d+$/, null, {
    method: 'GET',
    endpoint: '/data/v1/data-files/{id}/details',
    pathToName: 'name'
  }),
  FILE_REVISION: new DomoObjectType(
    'FILE_REVISION',
    'File version',
    null,
    /^\d+$/,
    null,
    {
      method: 'GET',
      endpoint: '/data/v1/data-files/{parent}/revisions/{id}',
      pathToName: 'name'
    },
    ['FILE']
  ),
  FILESET: new DomoObjectType(
    'FILESET',
    'FileSet',
    '/datacenter/filesets/{id}',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    { keyword: 'filesets' },
    {
      method: 'GET',
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
      method: 'GET',
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
    true
  ),
  GOAL: new DomoObjectType('GOAL', 'Goal', null, /^\d+$/, null, {
    method: 'GET',
    endpoint: '/social/v1/objectives/{id}',
    pathToName: 'name'
  }),
  GOAL_DELEGATE: new DomoObjectType(
    'GOAL_DELEGATE',
    'Goal delegate',
    null,
    /.*/,
    null,
    null
  ),
  GOAL_PERIOD: new DomoObjectType(
    'GOAL_PERIOD',
    'Goal period',
    null,
    /^\d+$/,
    null,
    {
      method: 'GET',
      endpoint: '/social/v1/objectives/periods/{id}',
      pathToName: 'name'
    }
  ),
  GOAL_TAG: new DomoObjectType(
    'GOAL_TAG',
    'Goal tag',
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
      method: 'GET',
      endpoint: '/content/v2/groups/{id}',
      pathToName: 'name'
    }
  ),
  GROUP_CHAT: new DomoObjectType(
    'GROUP_CHAT',
    'Buzz group chat',
    null,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    null,
    null
  ),
  GUIDE: new DomoObjectType('GUIDE', 'Guide', null, /.*/, null, null),
  HOPPER_QUEUE: new DomoObjectType(
    'HOPPER_QUEUE',
    'Task Center Queue',
    '/admin/task-center/queues?queueId={id}',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    { keyword: 'queueId' },
    {
      method: 'GET',
      endpoint: '/queues/v1/{id}',
      pathToName: 'name'
    }
  ),
  HOPPER_TASK: new DomoObjectType(
    'HOPPER_TASK',
    'Task Center Task',
    '/admin/task-center/queues?id={id}',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    { keyword: 'id' },
    {
      method: 'GET',
      endpoint: '/queues/v1/{parent}/tasks/{id}',
      pathToName: 'displayEntity.name'
    },
    ['HOPPER_QUEUE']
  ),
  HUDDLE: new DomoObjectType(
    'HUDDLE',
    'Buzz thread',
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
      method: 'GET',
      endpoint: '/social/v1/objectives/key-results/{id}',
      pathToName: 'name'
    },
    ['GOAL']
  ),
  LANDING_ENTITY: new DomoObjectType(
    'LANDING_ENTITY',
    'Landing entity',
    null,
    /.*/,
    null,
    null
  ),
  LICENSE_PAGE: new DomoObjectType(
    'LICENSE_PAGE',
    'License page',
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
      method: 'GET',
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
      method: 'GET',
      endpoint: '/datastores/v1/{id}',
      pathToName: 'name'
    }
  ),
  METRIC: new DomoObjectType('METRIC', 'Metric', null, /.*/, null, null),
  NAME: new DomoObjectType('NAME', 'Name', null, /.*/, null, null),
  NAV_PIN_ITEM: new DomoObjectType(
    'NAV_PIN_ITEM',
    'Nav pin item',
    null,
    /^\d+$/,
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
      method: 'GET',
      endpoint: '/social/v1/objectives/{id}',
      pathToName: 'name'
    }
  ),
  OAUTH2_CLIENT_CREDENTIALS: new DomoObjectType(
    'OAUTH2_CLIENT_CREDENTIALS',
    'Oauth 2.0 Client Credentials',
    null,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    null,
    null
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
      method: 'GET',
      endpoint: '/content/v3/stacks/{id}',
      pathToName: 'title'
    },
    ['PAGE']
  ),
  PAGE_ANALYZER: new DomoObjectType(
    'PAGE_ANALYZER',
    'Page analyzer',
    null,
    /.*/,
    null,
    null
  ),
  PAGE_COLLECTION: new DomoObjectType(
    'PAGE_COLLECTION',
    'Page collection',
    null,
    /^\d+$/,
    null,
    null,
    ['PAGE']
  ),
  PAGE_TEMPLATE: new DomoObjectType(
    'PAGE_TEMPLATE',
    'Page template',
    null,
    /.*/,
    null,
    null
  ),
  POLICY_ORDER: new DomoObjectType(
    'POLICY_ORDER',
    'Policy order',
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
      method: 'GET',
      endpoint: '/content/v1/projects/{id}',
      pathToName: 'projectName'
    }
  ),
  PROJECT_LIST: new DomoObjectType(
    'PROJECT_LIST',
    'Project list',
    null,
    /^\d+$/,
    null,
    {
      method: 'GET',
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
      method: 'GET',
      endpoint: '/content/v1/tasks/{id}',
      pathToName: 'taskName'
    },
    ['PROJECT', 'PROJECT_LIST']
  ),
  PROJECT_TASK_ATTACHMENT: new DomoObjectType(
    'PROJECT_TASK_ATTACHMENT',
    'Project task attachment',
    null,
    /.*/,
    null,
    null,
    ['PROJECT_TASK']
  ),
  PROJECT_TASK_OWNER: new DomoObjectType(
    'PROJECT_TASK_OWNER',
    'Project task owner',
    null,
    /^\d+$/,
    null,
    null,
    ['PROJECT_TASK']
  ),
  PROXIER_EMAIL: new DomoObjectType(
    'PROXIER_EMAIL',
    'Proxier email',
    null,
    /.*/,
    null,
    null
  ),
  PROXY_USER: new DomoObjectType(
    'PROXY_USER',
    'Proxy user',
    null,
    /.*/,
    null,
    null
  ),
  PUBLIC_URL: new DomoObjectType(
    'PUBLIC_URL',
    'Public embed url',
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
      method: 'GET',
      endpoint: '/publish/v2/publications/{id}',
      pathToName: 'name'
    }
  ),
  PUBLICATION_GROUP: new DomoObjectType(
    'PUBLICATION_GROUP',
    'Publication group',
    null,
    /^\d+$/,
    null,
    null
  ),
  REPOSITORY: new DomoObjectType(
    'REPOSITORY',
    'Sandbox Repository',
    '/sandbox/repositories/{id}',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    { keyword: 'repositories' },
    {
      method: 'GET',
      endpoint: '/versions/v1/repositories/{id}',
      pathToName: 'name'
    }
  ),
  REPOSITORY_AUTHORIZATION: new DomoObjectType(
    'REPOSITORY_AUTHORIZATION',
    'Repository authorization',
    null,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    null,
    null
  ),
  REPORT: new DomoObjectType('REPORT', 'Report', null, /^\d+$/, null, null),
  REPORT_BUILDER: new DomoObjectType(
    'REPORT_BUILDER',
    'Report',
    null,
    /^\d+$/,
    null,
    {
      method: 'GET',
      endpoint: '/content/v1/reportbuilder/{id}',
      pathToName: 'title'
    }
  ),
  REPORT_BUILDER_PAGE: new DomoObjectType(
    'REPORT_BUILDER_PAGE',
    'Report page',
    null,
    /^\d+$/,
    null,
    null
  ),
  REPORT_BUILDER_VIEW: new DomoObjectType(
    'REPORT_BUILDER_VIEW',
    'Report view',
    null,
    /^\d+$/,
    null,
    {
      method: 'GET',
      endpoint: '/content/v1/reportbuilder/views/{id}',
      pathToName: 'subject'
    },
    ['REPORT_BUILDER']
  ),
  REPORT_SCHEDULE: new DomoObjectType(
    'REPORT_SCHEDULE',
    'Report schedule',
    null,
    /^\d+$/,
    null,
    {
      method: 'GET',
      endpoint: '/content/v1/reportschedules/{id}',
      pathToName: 'title'
    }
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
      method: 'GET',
      endpoint: '/authorization/v1/roles/{id}',
      pathToName: 'name'
    }
  ),
  RYUU_APP: new DomoObjectType(
    'RYUU_APP',
    'Custom App',
    '/assetlibrary/{id}/overview',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    { keyword: 'assetlibrary' },
    {
      method: 'GET',
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
    'Sms notification command',
    null,
    null,
    null,
    null
  ),
  SMS_NOTIFICATION_WEB: new DomoObjectType(
    'SMS_NOTIFICATION_WEB',
    'Sms notification web',
    null,
    null,
    null,
    null
  ),
  SSO_PAGE: new DomoObjectType(
    'SSO_PAGE',
    'Single Sign-On(SSO) page',
    null,
    /.*/,
    null,
    null
  ),
  SSO_SETTINGS: new DomoObjectType(
    'SSO_SETTINGS',
    'SSO settings',
    null,
    /^\d+$/,
    null,
    null
  ),
  STORY: new DomoObjectType('STORY', 'Story', null, /^\d+$/, null, null),
  STREAM: new DomoObjectType('STREAM', 'Stream', null, /^\d+$/, null, null),
  SUBSCRIPTION: new DomoObjectType(
    'SUBSCRIPTION',
    'Subscription',
    null,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    null,
    null
  ),
  SYSTEM: new DomoObjectType('SYSTEM', 'System', null, /.*/, null, null),
  TEMPLATE: new DomoObjectType(
    'TEMPLATE',
    'Approval Template',
    '/approval/edit-request-form/{id}',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    { keyword: 'edit-request-form' },
    {
      method: 'POST',
      endpoint: '/synapse/approval/graphql',
      pathToName: 'data.template.title',
      bodyTemplate: {
        operationName: 'getTemplateForEdit',
        variables: { id: '{id}' },
        query:
          'query getTemplateForEdit($id: ID!) {\n  template(id: $id) {\n    id\n    title\n    titleName\n    titlePlaceholder\n    acknowledgment\n    instructions\n    description\n    providerName\n    isPublic\n    chainIsLocked\n    type\n    isPublished\n    observers {\n      id\n      type\n      displayName\n      avatarKey\n      title\n      ... on Group {\n        userCount\n        __typename\n      }\n      __typename\n    }\n    categories {\n      id\n      name\n      __typename\n    }\n    owner {\n      id\n      displayName\n      avatarKey\n      __typename\n    }\n    fields {\n      key\n      type\n      name\n      data\n      placeholder\n      required\n      isPrivate\n      ... on SelectField {\n        option\n        multiselect\n        datasource\n        column\n        order\n        __typename\n      }\n      __typename\n    }\n    approvers {\n      type\n      originalType: type\n      key\n      ... on ApproverPerson {\n        id: approverId\n        approverId\n        userDetails {\n          id\n          displayName\n          title\n          avatarKey\n          isDeleted\n          __typename\n        }\n        __typename\n      }\n      ... on ApproverGroup {\n        id: approverId\n        approverId\n        groupDetails {\n          id\n          displayName\n          userCount\n          isDeleted\n          __typename\n        }\n        __typename\n      }\n      ... on ApproverPlaceholder {\n        placeholderText\n        __typename\n      }\n      __typename\n    }\n    workflowIntegration {\n      modelId\n      modelVersion\n      startName\n      modelName\n      parameterMapping {\n        fields {\n          field\n          parameter\n          required\n          type\n          __typename\n        }\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}'
      }
    }
  ),
  TAG_CATEGORY: new DomoObjectType(
    'TAG_CATEGORY',
    'Goal tag category',
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
    true
  ),
  TOKEN: new DomoObjectType(
    'TOKEN',
    'API Client',
    null,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[X]{4}-[X]{4}-[X]{12}$/i,
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
      method: 'GET',
      endpoint: '/content/v2/users/{id}',
      pathToName: 'displayName'
    }
  ),
  USAGE_REPORT_ROWS: new DomoObjectType(
    'USAGE_REPORT_ROWS',
    'Usage Report: Rows',
    null,
    null,
    null,
    null
  ),
  USER_ACHIEVEMENT: new DomoObjectType(
    'USER_ACHIEVEMENT',
    'User achievement',
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
    'User state',
    null,
    /.*/,
    null,
    null
  ),
  USER_TEMPLATE: new DomoObjectType(
    'USER_TEMPLATE',
    'User template',
    null,
    /^\d+$/,
    null,
    null,
    null,
    true
  ),
  VARIABLE: new DomoObjectType('VARIABLE', 'Variable', null, /^\d+$/, null, {
    method: 'GET',
    endpoint: '/query/v1/functions/template/{id}?hidden=true',
    pathToName: 'name'
  }),
  VARIABLE_CONTROL: new DomoObjectType(
    'VARIABLE_CONTROL',
    'Variable control',
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
    'Video call',
    null,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
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
    'View advanced editor',
    null,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    null,
    null
  ),
  VIRTUAL_USER: new DomoObjectType(
    'VIRTUAL_USER',
    'Virtual user',
    null,
    /^vu:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    null,
    null
  ),
  WAREHOUSE_ACCOUNT: new DomoObjectType(
    'WAREHOUSE_ACCOUNT',
    'Warehouse account',
    null,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    null,
    null,
    ['ACCOUNT']
  ),
  WORKBENCH_AGENT: new DomoObjectType(
    'WORKBENCH_AGENT',
    'On premise agent',
    null,
    /.*/,
    null,
    null
  ),
  Workbench_GROUP: new DomoObjectType(
    'Workbench_GROUP',
    'Workbench group',
    null,
    /^\d+$/,
    null,
    null
  ),
  WORKBENCH_JOB: new DomoObjectType(
    'WORKBENCH_JOB',
    'On premise job',
    null,
    /^\d+$/,
    null,
    null
  ),
  WORKBENCH_SCHEDULE: new DomoObjectType(
    'WORKBENCH_SCHEDULE',
    'On premise job schedule',
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
    { keyword: 'instances', offset: 3 },
    {
      method: 'GET',
      endpoint: '/workflows/v2/executions/{id}',
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
      method: 'GET',
      endpoint: '/workflows/v1/models/{id}',
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
      method: 'GET',
      endpoint: '/workflows/v2/models/{parent}/versions/{id}',
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
      method: 'GET',
      endpoint: '/content/v1/dataapps/{id}',
      pathToName: 'title'
    }
  ),
  WORKSHEET_VIEW: new DomoObjectType(
    'WORKSHEET_VIEW',
    'Worksheet view',
    '/app-studio/{parent}/pages/{id}',
    /^\d+$/,
    {
      keyword: 'pages',
      parentExtract: { keyword: 'app-studio', offset: 1 }
    },
    {
      method: 'GET',
      endpoint: '/content/v3/stacks/{id}',
      pathToName: 'title'
    },
    ['WORKSHEET']
  ),
  WORKSPACE: new DomoObjectType(
    'WORKSPACE',
    'Workspace',
    '/workspaces/{id}',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    { keyword: 'workspaces' },
    {
      method: 'GET',
      endpoint: '/nav/v1/workspaces/{id}',
      pathToName: 'name'
    }
  )
};

/**
 * Get an DomoObjectType by its type
 * @param {string} type - The type
 * @returns {DomoObjectType|null} The DomoObjectType instance or null if not found
 */
export function getObjectType(type) {
  return ObjectTypeRegistry[type] || null;
}

/**
 * Get all registered object types
 * @returns {DomoObjectType[]} Array of all DomoObjectType instances
 */
export function getAllObjectTypes() {
  return Object.values(ObjectTypeRegistry).filter((type) => !type.deprecated);
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
 * Get all object types that have an API configuration
 * @returns {DomoObjectType[]} Array of DomoObjectType instances with apiConfig defined
 */
export function getAllObjectTypesWithApiConfig() {
  return Object.values(ObjectTypeRegistry).filter(
    (type) => type.hasApiConfig() && !type.deprecated
  );
}
