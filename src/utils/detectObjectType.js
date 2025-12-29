/**
 * Detects the Domo object type and ID based on the current URL
 * Based on the logic from Copy Current Object ID bookmarklet
 * @returns {{objectType: string, objectTypeName: string, id: string} | null} Object with type and ID, or null if not recognized
 */
export function detectObjectType() {
	if (!location.hostname.includes('domo.com')) {
		return null;
	}

	let objectType;
	let objectTypeName;
	let id;
	const url = location.href;
	const parts = url.split(/[/?=&]/);

	switch (true) {
		case url.includes('alerts/'):
			objectType = 'ALERT';
			objectTypeName = 'Alert';
			id = parts[parts.indexOf('alerts') + 1];
			break;

		case url.includes('drillviewid='):
			objectType = 'DRILL_VIEW';
			objectTypeName = 'Drill Path';
			id = parts[parts.indexOf('drillviewid') + 1];
			break;

		case url.includes('kpis/details/'): {
			// Prefer Drill Path ID from breadcrumb when on a drill path
			try {
				const bcSpan = document.querySelector(
					'ul.breadcrumb li:last-child span[id]'
				);
				const bcId = bcSpan && (bcSpan.id || bcSpan.getAttribute('id'));
				if (bcId && bcId.indexOf(':') > -1) {
					// Format: dr:<drill_path_id>:<card_id>
					const partsColon = bcId.split(':');
					const dpIdRaw = partsColon[1];
					const dpId = dpIdRaw && (dpIdRaw.match(/\d+/) || [])[0];
					if (dpId) {
						objectType = 'DRILL_VIEW';
						objectTypeName = 'Drill Path';
						id = dpId;
						break;
					}
				}
			} catch (e) {
				// ignore and fall back
			}
			// Fallback: Card ID from URL
			objectType = 'CARD';
			objectTypeName = 'Card';
			id = parts[parts.indexOf('details') + 1];
			break;
		}

		// App Studio: Prefer Card ID from modal when open; otherwise use Page ID from URL
		case url.includes('page/'):
		case url.includes('pages/'): {
			const detailsEl = document.querySelector('cd-details-title');
			let kpiId;
			try {
				if (
					detailsEl &&
					window.angular &&
					typeof window.angular.element === 'function'
				) {
					const ngScope = window.angular.element(detailsEl).scope();
					kpiId = ngScope && ngScope.$ctrl && ngScope.$ctrl.kpiId;
				}
			} catch (e) {
				// Ignore and fallback to Page ID
			}

			if (kpiId) {
				objectType = 'CARD';
				objectTypeName = 'Card';
				id = kpiId;
			} else {
				objectType = url.includes('app-studio') ? 'DATA_APP_VIEW' : 'PAGE';
				objectTypeName = url.includes('app-studio') ? 'Studio App' : 'Page';
				id =
					objectType === 'DATA_APP_VIEW'
						? parts[parts.indexOf('pages') + 1]
						: parts[parts.indexOf('page') + 1];
			}
			break;
		}

		case url.includes('beastmode?'):
			objectType = 'BEAST_MODE_FORMULA';
			objectTypeName = 'Beast Mode';
			id = parts[parts.indexOf('id') + 1];
			break;

		case url.includes('datasources/'):
			objectType = 'DATA_SOURCE';
			objectTypeName = 'DataSet';
			id = parts[parts.indexOf('datasources') + 1];
			break;

		case url.includes('dataflows/'):
			objectType = 'DATAFLOW_TYPE';
			objectTypeName = 'DataFlow';
			id = parts[parts.indexOf('dataflows') + 1];
			break;

		case url.includes('people/'):
			objectType = 'USER';
			objectTypeName = 'User';
			id = parts[parts.indexOf('people') + 1];
			break;

		case url.includes('/up/'):
			objectType = 'USER';
			objectTypeName = 'User';
			id = parts[parts.indexOf('up') + 1];
			break;

		case url.includes('groups/'):
			objectType = 'GROUP';
			objectTypeName = 'Group';
			id = parts[parts.indexOf('groups') + 1];
			break;

		case url.includes('admin/roles/'):
			objectType = 'ROLE';
			objectTypeName = 'Role';
			id = parts[parts.indexOf('roles') + 1];
			break;

		case url.includes('instances/') && parts.length >= 8:
			objectType = 'WORKFLOW_INSTANCE';
			objectTypeName = 'Workflow Execution';
			id = parts[parts.length - 1];
			break;

		case url.includes('workflows/'):
			objectType = 'WORKFLOW_MODEL';
			objectTypeName = 'Workflow';
			id = parts[parts.indexOf('workflows') + 2];
			break;

		case url.includes('codeengine/'):
			objectType = 'CODEENGINE_PACKAGE';
			objectTypeName = 'Code Engine Package';
			id = parts[parts.indexOf('codeengine') + 1];
			break;

		case url.includes('appDb/'):
			objectType = 'MAGNUM_COLLECTION';
			objectTypeName = 'AppDB Collection';
			id = parts[parts.indexOf('appDb') + 1];
			break;

		case url.includes('assetlibrary/'):
			objectType = 'APP';
			objectTypeName = 'Pro-Code App';
			id = parts[parts.indexOf('assetlibrary') + 1];
			break;

		case url.includes('pro-code-editor/'):
			objectType = 'APP';
			objectTypeName = 'Pro-Code App';
			id = parts[parts.indexOf('pro-code-editor') + 1];
			break;

		case url.includes('filesets/'):
			objectType = 'FILESET';
			objectTypeName = 'FileSet';
			id = parts[parts.indexOf('filesets') + 1];
			break;

		case url.includes('ai-services/projects/'):
			objectType = 'AI_PROJECT';
			objectTypeName = 'AI Project';
			id = parts[parts.indexOf('projects') + 1];
			break;

		case url.includes('ai-services/models/'):
			objectType = 'AI_MODEL';
			objectTypeName = 'AI Model';
			id = parts[parts.lastIndexOf('model') + 1];
			break;

		case url.includes('taskId='):
			objectType = 'PROJECT_TASK';
			objectTypeName = 'Task';
			id = parts[parts.indexOf('taskId') + 1];
			break;

		case url.includes('project/'):
			objectType = 'PROJECT';
			objectTypeName = 'Project';
			id = parts[parts.indexOf('project') + 1];
			break;

		case url.includes('key-results/'):
			objectType = 'KEY_RESULT';
			objectTypeName = 'Key Result';
			id = parts[parts.indexOf('key-results') + 1];
			break;

		case url.includes('goals/profile/user/') && url.includes('/goal/'):
			objectType = 'OBJECTIVE';
			objectTypeName = 'Goal';
			id = parts[parts.indexOf('goal') + 1];
			break;

		case url.includes('goals/profile/user/'):
			objectType = 'USER';
			objectTypeName = 'User';
			id = parts[parts.indexOf('user') + 1];
			break;

		case url.includes('goals/tree/'):
			objectType = 'OBJECTIVE';
			objectTypeName = 'Goal';
			id = parts[parts.indexOf('tree') + 1];
			break;

		case url.includes('goals/profile/'):
			objectType = 'OBJECTIVE';
			objectTypeName = 'Goal';
			id = parts[parts.indexOf('goal') + 1];
			break;

		case url.includes('goals/'):
			objectType = 'OBJECTIVE';
			objectTypeName = 'Goal';
			id = parts[parts.indexOf('goals') + 1];
			break;

		case url.includes('queues') && url.includes('id='):
			objectType = 'HOPPER_TASK';
			objectTypeName = 'Task Center Task';
			id = parts[parts.indexOf('id') + 1];
			break;

		case url.includes('queueId='):
			objectType = 'HOPPER_QUEUE';
			objectTypeName = 'Task Center Queue';
			id = parts[parts.indexOf('queueId') + 1];
			break;

		case url.includes('approval/request-details/'):
			objectType = 'APPROVAL';
			objectTypeName = 'Approval';
			id = parts[parts.indexOf('request-details') + 1];
			break;

		case url.includes('approval/edit-request-form/'):
			objectType = 'TEMPLATE';
			objectTypeName = 'Approval Template';
			id = parts[parts.indexOf('edit-request-form') + 1];
			break;

		case url.includes('jupyter-workspaces/'):
			objectType = 'DATA_SCIENCE_NOTEBOOK';
			objectTypeName = 'Jupyter Workspace';
			id = parts[parts.indexOf('jupyter-workspaces') + 1];
			break;

		case url.includes('domo-everywhere/publications'):
			objectType = 'PUBLICATION';
			objectTypeName = 'Publication';
			id = parts[parts.indexOf('id') + 1];
			break;

		case url.includes('sandbox/repositories/'):
			objectType = 'REPOSITORY';
			objectTypeName = 'Sandbox Repository';
			id = parts[parts.indexOf('repositories') + 1];
			break;

		default:
			return null;
	}

	return {
		id,
		type: objectType,
		typeName: objectTypeName,
		url: url,
		detectedAt: Date.now()
	};
}
