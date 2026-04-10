import { executeInPage } from '@/utils';

/**
 * Get all pending approvals where the user is an approver.
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string, version: number}>>}
 */
export async function getOwnedApprovals(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const url = '/api/synapse/approval/graphql';
      const response = await fetch(url, {
        body: JSON.stringify({
          operationName: 'getFilteredRequests',
          query:
            'query getFilteredRequests($query: QueryRequest!, $after: ID, $reverseSort: Boolean) {\n  workflowSearch(query: $query, type: "AC", after: $after, reverseSort: $reverseSort) {\n    edges {\n      cursor\n      node {\n        approval {\n          id\n          title\n          status\n          version\n          __typename\n        }\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}\n',
          variables: {
            after: null,
            query: {
              active: true,
              approverId: userId,
              lastModifiedBefore: null,
              submitterId: null,
              templateId: null,
              title: null
            },
            reverseSort: false
          }
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      const edges = data?.data?.workflowSearch?.edges || [];
      return edges
        .filter((e) => e.node?.approval?.status === 'PENDING')
        .map((e) => ({
          id: e.node.approval.id,
          name: e.node.approval.title || e.node.approval.id,
          version: e.node.approval.version
        }));
    },
    [userId],
    tabId
  );
}

/**
 * Get all approval templates owned by a user.
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getOwnedApprovalTemplates(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const url = '/api/synapse/approval/graphql';
      const response = await fetch(url, {
        body: JSON.stringify({
          operationName: 'getFilteredTemplates',
          query:
            'query getFilteredTemplates($first: Int, $after: ID, $orderBy: OrderBy, $reverseSort: Boolean, $query: TemplateQueryRequest!) {\n  templateConnection(first: $first, after: $after, orderBy: $orderBy, reverseSort: $reverseSort, query: $query) {\n    edges {\n      cursor\n      node {\n        id\n        title\n      }\n    }\n    pageInfo {\n      hasNextPage\n      endCursor\n    }\n  }\n}',
          variables: {
            after: null,
            first: 100,
            orderBy: 'TEMPLATE',
            query: {
              category: [],
              ownerId: userId,
              publishedOnly: false,
              searchTerm: '',
              type: 'AC'
            },
            reverseSort: false
          }
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      const edges = data?.data?.templateConnection?.edges || [];
      return edges.map((e) => ({
        id: e.node.id,
        name: e.node.title || e.node.id
      }));
    },
    [userId],
    tabId
  );
}

/**
 * Transfer pending approvals to a new approver.
 * @param {Array<{id: string, version: number}>} approvals - Approvals to transfer
 * @param {number} fromUserId - The current approver's user ID
 * @param {number} toUserId - The new approver's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferApprovals(
  approvals,
  fromUserId,
  toUserId,
  tabId = null
) {
  return executeInPage(
    async (approvals, fromUserId, toUserId) => {
      const url = '/api/synapse/approval/graphql';
      const errors = [];
      let succeeded = 0;

      // Process in batches since the API supports bulk replace
      const actedOnApprovals = approvals.map((a) => ({
        id: a.id,
        version: a.version
      }));

      try {
        const response = await fetch(url, {
          body: JSON.stringify({
            operationName: 'replaceApprovers',
            query:
              'mutation replaceApprovers($actedOnApprovals: [ActedOnApprovalInput!]!, $newApproverId: ID!, $newApproverType: ApproverType) {\n  bulkReplaceApprover(actedOnApprovals: $actedOnApprovals, newApproverId: $newApproverId, newApproverType: $newApproverType) {\n    id\n    __typename\n  }\n}\n',
            variables: {
              actedOnApprovals,
              newApproverId: toUserId,
              newApproverType: 'PERSON'
            }
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        succeeded = approvals.length;
      } catch (_bulkError) {
        // If bulk fails, try individually
        for (const approval of approvals) {
          try {
            const r = await fetch(url, {
              body: JSON.stringify({
                operationName: 'replaceApprovers',
                query:
                  'mutation replaceApprovers($actedOnApprovals: [ActedOnApprovalInput!]!, $newApproverId: ID!, $newApproverType: ApproverType) {\n  bulkReplaceApprover(actedOnApprovals: $actedOnApprovals, newApproverId: $newApproverId, newApproverType: $newApproverType) {\n    id\n    __typename\n  }\n}\n',
                variables: {
                  actedOnApprovals: [
                    { id: approval.id, version: approval.version }
                  ],
                  newApproverId: toUserId,
                  newApproverType: 'PERSON'
                }
              }),
              headers: { 'Content-Type': 'application/json' },
              method: 'POST'
            });
            if (!r.ok) {
              errors.push({ error: `HTTP ${r.status}`, id: approval.id });
            } else {
              succeeded++;
            }
          } catch (err) {
            errors.push({ error: err.message, id: approval.id });
          }
        }
      }

      return { errors, failed: errors.length, succeeded };
    },
    [approvals, fromUserId, toUserId],
    tabId
  );
}

/**
 * Transfer approval template ownership to a new user.
 * This fetches each template, updates the owner/approvers/observers, and saves.
 * @param {string[]} templateIds - Array of template IDs to transfer
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferApprovalTemplates(
  templateIds,
  fromUserId,
  toUserId,
  tabId = null
) {
  return executeInPage(
    async (templateIds, fromUserId, toUserId) => {
      const url = '/api/synapse/approval/graphql';
      const errors = [];
      let succeeded = 0;

      const getTemplateQuery =
        'query getTemplateForEdit($id: ID!) {\n  template(id: $id) {\n    id\n    title\n    titleName\n    titlePlaceholder\n    acknowledgment\n    instructions\n    description\n    providerName\n    isPublic\n    chainIsLocked\n    type\n    isPublished\n    observers {\n      id\n      type\n      displayName\n      ... on Group {\n        userCount\n        isDeleted\n        __typename\n      }\n      ... on User {\n        isDeleted\n        __typename\n      }\n      __typename\n    }\n    categories {\n      id\n      name\n      __typename\n    }\n    owner {\n      id\n      displayName\n      __typename\n    }\n    fields {\n      key\n      type\n      name\n      data\n      placeholder\n      required\n      isPrivate\n      ... on SelectField {\n        option\n        multiselect\n        datasource\n        column\n        order\n        __typename\n      }\n      __typename\n    }\n    approvers {\n      type\n      key\n      ... on ApproverPerson {\n        approverId\n        userDetails {\n          id\n          displayName\n          isDeleted\n          __typename\n        }\n        __typename\n      }\n      ... on ApproverGroup {\n        approverId\n        groupDetails {\n          id\n          displayName\n          isDeleted\n          __typename\n        }\n        __typename\n      }\n      ... on ApproverPlaceholder {\n        placeholderText\n        __typename\n      }\n      __typename\n    }\n    workflowIntegration {\n      modelId\n      modelVersion\n      startName\n      modelName\n      parameterMapping {\n        fields {\n          field\n          parameter\n          required\n          type\n          __typename\n        }\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}';

      const saveTemplateQuery =
        'mutation saveTemplate($template: TemplateInput!) {\n  template: saveTemplate(template: $template) {\n    id\n    __typename\n  }\n}';

      for (const templateId of templateIds) {
        try {
          // Fetch template
          const getResponse = await fetch(url, {
            body: JSON.stringify({
              operationName: 'getTemplateForEdit',
              query: getTemplateQuery,
              variables: { id: templateId }
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST'
          });
          if (!getResponse.ok) throw new Error(`HTTP ${getResponse.status}`);
          const getData = await getResponse.json();
          const raw = getData?.data?.template;
          if (!raw) throw new Error('Template not found');

          // Filter active approvers and replace user
          let approvers = (raw.approvers || [])
            .filter(
              (a) =>
                !(a.type === 'PERSON' && a.userDetails?.isDeleted) &&
                !(a.type === 'GROUP' && a.groupDetails?.isDeleted)
            )
            .map((a) =>
              a.type === 'PERSON' && a.approverId == fromUserId
                ? { approverId: toUserId, key: a.key, type: 'PERSON' }
                : {
                    type: a.type,
                    ...(a.approverId && { approverId: a.approverId }),
                    ...(a.placeholderText && {
                      placeholderText: a.placeholderText
                    }),
                    key: a.key
                  }
            );

          // Deduplicate approvers
          approvers = approvers.filter(
            (v, i, self) =>
              !v.approverId ||
              i === self.findIndex((a) => a.approverId === v.approverId)
          );
          if (approvers.length === 0) {
            approvers.push({
              approverId: toUserId,
              key: '0',
              type: 'PERSON'
            });
          }

          // Update observers
          let observers = (raw.observers || [])
            .filter((o) => !o.isDeleted)
            .map((o) => ({
              id: o.id == fromUserId ? toUserId : o.id,
              type: o.type,
              ...(o.type === 'Group' &&
                o.userCount !== undefined && { userCount: o.userCount })
            }));
          observers = observers.filter(
            (v, i, self) => i === self.findIndex((o) => o.id === v.id)
          );

          // Build clean template
          const cleanTemplate = {
            acknowledgment: raw.acknowledgment,
            approvers,
            categories: (raw.categories || []).map((c) => ({
              id: c.id,
              name: c.name
            })),
            chainIsLocked: raw.chainIsLocked,
            description: raw.description,
            fields: (raw.fields || []).map((f) => ({
              ...(f.column !== undefined && { column: f.column }),
              ...(f.data !== undefined && { data: f.data }),
              ...(f.datasource !== undefined && { datasource: f.datasource }),
              isPrivate: f.isPrivate,
              key: f.key,
              ...(f.multiselect !== undefined && {
                multiselect: f.multiselect
              }),
              name: f.name,
              ...(f.option !== undefined && { option: f.option }),
              ...(f.order !== undefined && { order: f.order }),
              placeholder: f.placeholder,
              required: f.required,
              type: f.type
            })),
            id: raw.id,
            instructions: raw.instructions,
            isPublic: raw.isPublic,
            isPublished: raw.isPublished,
            observers,
            ownerId: toUserId,
            providerName: raw.providerName,
            title: raw.title,
            titleName: raw.titleName,
            titlePlaceholder: raw.titlePlaceholder,
            type: raw.type
          };

          if (raw.workflowIntegration) {
            cleanTemplate.workflowIntegration = {
              modelId: raw.workflowIntegration.modelId,
              modelName: raw.workflowIntegration.modelName,
              modelVersion: raw.workflowIntegration.modelVersion,
              startName: raw.workflowIntegration.startName
            };
            if (raw.workflowIntegration.parameterMapping) {
              cleanTemplate.workflowIntegration.parameterMapping = {
                fields: (
                  raw.workflowIntegration.parameterMapping.fields || []
                ).map((f) => ({
                  field: f.field,
                  parameter: f.parameter,
                  required: f.required,
                  type: f.type
                }))
              };
            }
          }

          // Save template
          const saveResponse = await fetch(url, {
            body: JSON.stringify({
              operationName: 'saveTemplate',
              query: saveTemplateQuery,
              variables: { template: cleanTemplate }
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST'
          });
          if (!saveResponse.ok) throw new Error(`HTTP ${saveResponse.status}`);
          succeeded++;
        } catch (error) {
          errors.push({ error: error.message, id: templateId });
        }
      }

      return { errors, failed: errors.length, succeeded };
    },
    [templateIds, fromUserId, toUserId],
    tabId
  );
}
