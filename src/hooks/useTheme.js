import { useState, useEffect } from 'react';

/**
 * Custom hook to manage theme preferences
 * Supports system theme detection and user preference override
 * Automatically applies theme to document.documentElement
 */
export function useTheme() {
	const [theme, setTheme] = useState('light');
	const [systemTheme, setSystemTheme] = useState(
		window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
	);

	useEffect(() => {
		// Load theme preference from storage
		chrome.storage.sync.get(['themePreference'], (result) => {
			const preference = result.themePreference || 'system';
			if (preference === 'system') {
				setTheme(systemTheme);
			} else {
				setTheme(preference);
			}
		});

		// Listen for theme preference changes
		const handleStorageChange = (changes, areaName) => {
			if (areaName === 'sync' && changes.themePreference) {
				const newPreference = changes.themePreference.newValue;
				if (newPreference === 'system') {
					setTheme(systemTheme);
				} else {
					setTheme(newPreference);
				}
			}
		};

		chrome.storage.onChanged.addListener(handleStorageChange);

		return () => {
			chrome.storage.onChanged.removeListener(handleStorageChange);
		};
	}, [systemTheme]);

	useEffect(() => {
		// Listen for system theme changes
		const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		const handleThemeChange = async (e) => {
			const newSystemTheme = e.matches ? 'dark' : 'light';
			setSystemTheme(newSystemTheme);

			// Only update theme if preference is 'system'
			const result = await chrome.storage.sync.get(['themePreference']);
			const preference = result.themePreference || 'system';
			if (preference === 'system') {
				setTheme(newSystemTheme);
			}
		};

		mediaQuery.addEventListener('change', handleThemeChange);

		return () => {
			mediaQuery.removeEventListener('change', handleThemeChange);
		};
	}, []);

	useEffect(() => {
		// Apply theme to html element
		document.documentElement.className = theme;
		document.documentElement.setAttribute('data-theme', theme);
	}, [theme]);

	return theme;
}
