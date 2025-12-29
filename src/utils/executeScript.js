// Execute script with configuration
export async function executeScript(scriptTemplate, config) {
	try {
		// Replace placeholders in script with actual values
		let finalScript = scriptTemplate;
		for (const [key, value] of Object.entries(config)) {
			const placeholder = `{${key}}`;
			finalScript = finalScript.replace(new RegExp(placeholder, 'g'), value);
		}

		// Send script to background script for execution
		const response = await chrome.runtime.sendMessage({
			action: 'executeScript',
			script: finalScript
		});

		if (response && response.success) {
			// Close modal after successful execution
			closeModal();
		} else {
			console.error('Script execution failed:', response?.error);
			alert('Error executing script: ' + (response?.error || 'Unknown error'));
		}
	} catch (error) {
		console.error('Error executing script:', error);
		alert('Error executing script: ' + error.message);
	}
}
