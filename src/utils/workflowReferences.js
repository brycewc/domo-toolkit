import { getBinding, getTileParams } from './workflowTileIO';

const IMAGE_TO_TEXT_FUNCTIONS = new Set(['ASK_FOR_IMAGE_TO_TEXT', 'askForImageToText']);

/**
 * Every other Domo object a workflow version definition points at, read off the
 * saved JSON. The discriminators are the ones the platform serializes:
 * `_designNode` for the tile kind, `taskType` for a service task's activity,
 * `configType` for a user task's.
 *
 * A reference is reported only when the tile names the object outright. A param
 * bound to a workflow variable is chosen at run time, so it lands in
 * `unresolved` rather than being dropped or guessed at.
 * @param {Object} definition - A workflow version definition
 * @returns {{references: Array<{elementTitle: string, id: string, typeId: string, version: string|null}>,
 *   unresolved: Array<{elementTitle: string, kind: string}>}}
 */
export function collectDefinitionReferences(definition) {
  const references = [];
  const unresolved = [];
  for (const element of definition?.designElements || []) {
    if (element?.data) collectElementReferences({ element, references, unresolved });
  }
  return { references, unresolved };
}

function collectAgentToolReferences({ element, references }) {
  for (const tool of element.data.agent?.tools || []) {
    if (tool?.type === 'WORKFLOW') {
      pushReference({ element, id: tool.modelId, references, typeId: 'WORKFLOW_MODEL', version: tool.modelVersion });
    } else {
      // A tool with no type is a function, per the definition's own default.
      pushReference({
        element,
        id: tool?.packageId,
        references,
        typeId: 'CODEENGINE_PACKAGE',
        version: tool?.packageVersion
      });
    }
  }
}

function collectElementReferences({ element, references, unresolved }) {
  const data = element.data;
  switch (data._designNode) {
    case 'AI_AGENT':
      collectAgentToolReferences({ element, references });
      break;
    case 'DATASET_QUERY_TASK':
      pushBinding({ element, kind: 'DataSet', param: data.dataset, references, typeId: 'DATA_SOURCE', unresolved });
      break;
    case 'rootNode':
      pushReference({ element, id: data.formId, references, typeId: 'ENIGMA_FORM' });
      break;
    case 'serviceTaskNode':
      collectServiceTaskReferences({ element, references, unresolved });
      break;
    case 'SUB_FLOW':
      pushReference({ element, id: data.modelId, references, typeId: 'WORKFLOW_MODEL', version: data.modelVersion });
      break;
    case 'userTaskNode':
      collectUserTaskReferences({ element, references, unresolved });
      break;
    default:
      break;
  }
}

function collectServiceTaskReferences({ element, references, unresolved }) {
  const data = element.data;
  const metadata = data.metadata || {};
  switch (data.taskType) {
    case 'artificialIntelligence':
      if (IMAGE_TO_TEXT_FUNCTIONS.has(metadata.functionName)) {
        pushInputBinding({ element, kind: 'Document', paramName: 'fileId', references, typeId: 'FILE', unresolved });
      }
      break;
    case 'codeEngineFunction':
    case 'nebulaFunction':
      pushReference({
        element,
        id: metadata.packageId,
        references,
        typeId: 'CODEENGINE_PACKAGE',
        version: metadata.version
      });
      break;
    case 'exportLayout':
      pushInputBinding({ element, kind: 'Page', paramName: 'page', references, typeId: 'PAGE', unresolved });
      break;
    case 'jupyter':
      pushInputBinding({
        element,
        kind: 'Jupyter Workspace',
        paramName: 'workspaceId',
        references,
        typeId: 'DATA_SCIENCE_NOTEBOOK',
        unresolved
      });
      break;
    case 'startWorkflow':
      pushReference({ element, id: metadata.modelId, references, typeId: 'WORKFLOW_MODEL', version: metadata.version });
      break;
    default:
      break;
  }
}

function collectUserTaskReferences({ element, references, unresolved }) {
  const data = element.data;
  if (data.configType !== 'APPROVAL' && data.configType !== 'FORM') return;
  pushReference({ element, id: data.formId, references, typeId: 'ENIGMA_FORM' });
  // A form task names its queue outright; an approval task wraps it in a param.
  const queue = data.selectedQueue;
  if (queue && typeof queue === 'object') {
    pushBinding({ element, kind: 'Task Center Queue', param: queue, references, typeId: 'HOPPER_QUEUE', unresolved });
  } else {
    pushReference({ element, id: queue, references, typeId: 'HOPPER_QUEUE' });
  }
  for (const option of data.fieldOptions || []) {
    pushReference({ element, id: option?.datasetMapping?.datasetId, references, typeId: 'DATA_SOURCE' });
  }
}

function pushBinding({ element, kind, param, references, typeId, unresolved }) {
  if (!param) return;
  const binding = getBinding(param);
  if (binding.value == null) {
    if (binding.variableId != null) unresolved.push({ elementTitle: titleOf(element), kind });
    return;
  }
  pushReference({ element, id: binding.value, references, typeId });
}

function pushInputBinding({ element, kind, paramName, references, typeId, unresolved }) {
  const param = getTileParams(element, 'input').find((entry) => entry.paramName === paramName);
  pushBinding({ element, kind, param, references, typeId, unresolved });
}

function pushReference({ element, id, references, typeId, version = null }) {
  if (id == null) return;
  references.push({
    elementTitle: titleOf(element),
    id: String(id),
    typeId,
    version: version == null ? null : String(version)
  });
}

function titleOf(element) {
  return element.data?.title || element.id;
}
