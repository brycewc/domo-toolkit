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
    parents = null
  ) {
    this.id = id;
    this.name = name;
    this.urlPath = urlPath;
    this.idPattern = idPattern;
    this.extractConfig = extractConfig;
    this.api = api;
    this.parents = parents;
  }

  /**
   * Build the full URL for this object
   * @param {string} baseUrl - The base URL (e.g., https://instance.domo.com)
   * @param {string} id - The object ID
   * @param {string} [parentId] - Optional parent ID for types that require it
   * @returns {string|Promise<string>} The full URL (may be async if parent lookup is needed)
   */
  buildObjectUrl(baseUrl, id, parentId) {
    if (!this.hasUrl()) {
      throw new Error(`Object type ${this.id} does not have a navigable URL`);
    }

    let url = this.urlPath.replace('{id}', id);

    // If the URL contains {parent}, replace it with the parentId
    if (url.includes('{parent}')) {
      if (!parentId) {
        throw new Error(`Parent ID is required for ${this.id}`);
      }
      url = url.replace('{parent}', parentId);
    }

    return `${baseUrl}${url}`;
  }

  /**
   * Check if this object type requires a parent ID
   * @returns {boolean} Whether a parent ID is required
   */
  requiresParent() {
    return this.urlPath && this.urlPath.includes('{parent}');
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
}

/**
 * Registry of all supported object types
 */
export const ObjectTypeRegistry = {
  ACCOUNT: new DomoObjectType('ACCOUNT', 'Account', null, /^\d+$/, null, {
    method: 'GET',
    endpoint: '/data/v1/accounts/{id}',
    pathToName: 'name'
  }),
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
    }
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
  DATA_APP: new DomoObjectType(
    'DATA_APP',
    'Studio App',
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
    'App Studio Page',
    '/app-studio/{parent}/pages/{id}',
    /^\d+$/,
    { keyword: 'pages' },
    {
      method: 'GET',
      endpoint: '/content/v3/stacks/{id}',
      pathToName: 'title'
    },
    ['DATA_APP']
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
    }
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
  DRILL_VIEW: new DomoObjectType(
    'DRILL_VIEW',
    'Drill Path',
    '/analyzer?cardid=${parent}&drillviewid=${id}',
    /^\d+$/,
    { keyword: 'drillviewid' },
    {
      method: 'GET',
      endpoint: '/content/v1/cards?urns={id}:{parent}',
      pathToName: 'title'
    },
    ['CARD']
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
    }
  ),
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
    }
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
    }
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
    }
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
    }
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
  WORKFLOW_INSTANCE: new DomoObjectType(
    'WORKFLOW_INSTANCE',
    'Workflow Execution',
    '/workflows/instances/{id}',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    { keyword: null, fromEnd: true, offset: 1 },
    {
      method: 'GET',
      endpoint: '/workflows/v2/executions/{id}',
      pathToName: 'modelName'
    }
  ),
  WORKFLOW_MODEL: new DomoObjectType(
    'WORKFLOW_MODEL',
    'Workflow',
    '/workflows/{id}',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    { keyword: 'workflows', offset: 2 },
    {
      method: 'GET',
      endpoint: '/workflows/v1/models/{id}',
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
  return Object.values(ObjectTypeRegistry);
}
