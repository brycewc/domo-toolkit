import { Button } from '@heroui/react';
import { useState, useEffect } from 'react';

/**
 * Get all activity log object types for a given object type
 * Some object types map to multiple activity log types
 */
function getActivityLogTypes(objectType) {
	switch (objectType) {
		case 'BEAST_MODE_FORMULA':
			return ['BEAST_MODE_FORMULA', 'VARIABLE'];
		case 'DATA_SOURCE':
			return [
				'DATA_SOURCE',
				'DATASET',
				'VIEW',
				'VIEW_ADVANCED_EDITOR',
				'DUPLICATED_DATA_SOURCE'
			];
		case 'APP':
			return ['APP', 'RYUU_APP'];
		case 'CODEENGINE_PACKAGE':
			return ['CODEENGINE_PACKAGE', 'FUNCTION'];
		case 'GOAL':
			return ['GOAL', 'OBJECTIVE'];
		default:
			return [objectType];
	}
}

export default function ActivityLogCurrentObject({
	currentObject,
	onStatusUpdate
}) {
	const [activityLogConfig, setActivityLogConfig] = useState(null);
	const [isLoading, setIsLoading] = useState(false);

	// Load activity log configuration for the current instance
	useEffect(() => {
		const loadConfig = async () => {
			try {
				const [tab] = await chrome.tabs.query({
					active: true,
					currentWindow: true
				});

				if (!tab || !tab.url || !tab.url.includes('domo.com')) {
					setActivityLogConfig(null);
					return;
				}

				// Get the instance from the current tab
				const url = new URL(tab.url);
				const instance = url.hostname.replace('.domo.com', '');

				// Load the activity log configs
				chrome.storage.sync.get(['activityLogConfigs'], (result) => {
					const configs = result.activityLogConfigs || [];
					const config = configs.find((c) => c.instance === instance);
					setActivityLogConfig(config || null);
				});
			} catch (err) {
				console.error('Error loading activity log config:', err);
				setActivityLogConfig(null);
			}
		};

		loadConfig();
	}, [currentObject]);

	const handleClick = async () => {
		if (!currentObject || !currentObject.id || !currentObject.objectType) {
			onStatusUpdate?.(
				'No Object Detected',
				'Navigate to a Domo object page to use this feature',
				'warning'
			);
			return;
		}

		if (!activityLogConfig) {
			onStatusUpdate?.(
				'Configuration Required',
				'Please configure the activity log settings for this instance in Settings',
				'warning'
			);
			return;
		}

		setIsLoading(true);

		try {
			// Get active tab
			const [tab] = await chrome.tabs.query({
				active: true,
				currentWindow: true
			});

			if (!tab || !tab.url || !tab.url.includes('domo.com')) {
				onStatusUpdate?.(
					'Not on Domo Page',
					'Please open a Domo page first',
					'warning'
				);
				setIsLoading(false);
				return;
			}

			const baseUrl = new URL(tab.url).origin;

			// Get all activity log types for this object type
			const objectTypes = getActivityLogTypes(currentObject.typeId);

			// Build pfilters array
			const pfilters = [
				{
					column: activityLogConfig.objectTypeColumn,
					operand: 'IN',
					values: objectTypes
				},
				{
					column: activityLogConfig.objectIdColumn,
					operand: 'IN',
					values: [currentObject.id]
				}
			];

			// Build the activity log URL
			const activityLogUrl = `${baseUrl}/kpis/details/${
				activityLogConfig.cardId
			}?pfilters=${encodeURIComponent(JSON.stringify(pfilters))}`;

			// Copy ID to clipboard
			// await navigator.clipboard.writeText(currentObject?.id);

			// Navigate to the activity log
			await chrome.tabs.update(tab.id, { url: activityLogUrl });

			onStatusUpdate?.(
				'Opening Activity Log',
				`Navigating to activity log for ${currentObject.typeName} ${currentObject.id}`,
				'success'
			);
		} catch (err) {
			console.error('Error opening activity log:', err);
			onStatusUpdate?.(
				'Error',
				`Failed to open activity log: ${err.message}`,
				'danger'
			);
		} finally {
			setIsLoading(false);
		}
	};

	const getButtonText = () => {
		if (!currentObject?.id) {
			return 'Activity Log Current: N/A';
		}
		if (!activityLogConfig) {
			return 'Activity Log Current: Not Configured';
		}
		return `Activity Log Current: ${
			currentObject.typeName || currentObject.typeId
		}`;
	};

	const isDisabled = !currentObject?.id || !activityLogConfig || isLoading;

	return (
		<Button
			onPress={handleClick}
			isDisabled={isDisabled}
			className='w-full'
			isPending={isLoading}
		>
			{getButtonText()}
		</Button>
	);
}
