import './App.css';
import { useEffect, useRef, useState } from 'react';
import ClearDomoCookies from '@/components/ClearDomoCookies';

export default function App() {
	const currentObjectDefaults = {
		id: null,
		type: null,
		typeName: null,
		url: null,
		detectedAt: null
	};
	const [currentObject, setCurrentObject] = useState(currentObjectDefaults);
	const hasLoadedFromStorage = useRef(false);

	useEffect(() => {
		// Request fresh object type detection from content script when popup opens
		chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			if (tabs[0]?.id) {
				chrome.tabs.sendMessage(
					tabs[0].id,
					{ action: 'getObjectType' },
					(response) => {
						// Response will be received, but storage change listener will handle the update
						if (chrome.runtime.lastError) {
							// Content script might not be loaded on this page (e.g., chrome:// pages)
							console.log(
								'Could not detect object type:',
								chrome.runtime.lastError.message
							);
						}
					}
				);
			}
		});

		// Load initial currentObject from storage
		chrome.storage.local.get(['currentObject'], (result) => {
			setCurrentObject(result.currentObject || currentObjectDefaults);
			hasLoadedFromStorage.current = true;
		});

		// Listen for storage changes from other components
		const handleStorageChange = (changes, areaName) => {
			if (areaName === 'local' && changes.currentObject) {
				setCurrentObject(changes.currentObject.newValue);
			}
		};

		chrome.storage.onChanged.addListener(handleStorageChange);

		// Cleanup listener on unmount
		return () => {
			chrome.storage.onChanged.removeListener(handleStorageChange);
		};
	}, []);

	useEffect(() => {
		// Only save after we've loaded the initial value from storage
		if (!hasLoadedFromStorage.current) {
			return;
		}

		// Save currentObject to storage when it changes
		chrome.storage.local.set({ currentObject });
		// chrome.runtime.sendMessage({ type: 'COUNT', currentObject });
	}, [currentObject]);

	// Apply Tailwind styles to body for sizing
	useEffect(() => {
		document.body.classList.add('m-0', 'p-0', 'w-[280px]', 'bg-transparent','rounded-lg');
		const root = document.getElementById('root');
		if (root) {
			root.classList.add('w-[320px]');
		}

		return () => {
			document.body.classList.remove('m-0', 'p-0', 'w-[280px]', 'bg-transparent','rounded-lg');
			if (root) {
				root.classList.remove('w-[320px]');
			}
		};
	}, []);

	const handleClose = () => {
		window.close();
	};

	return (
		<div className='w-[280px] bg-white p-4 rounded-lg shadow-xl overflow-hidden'>
			<div className='flex flex-col gap-3'>
				<div className='flex items-center justify-between mb-1'>
					<div className='flex items-center gap-2'>
						<img
							src={chrome.runtime.getURL('logo.png')}
							alt='Domo Logo'
							className='h-6 w-auto'
						/>
						<h1 className='text-lg font-medium text-gray-700'>MajorDomo Toolkit</h1>
					</div>
					<button
						onClick={handleClose}
						className='w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors'
						aria-label='Close'
					>
						<svg
							className='w-4 h-4'
							fill='none'
							stroke='currentColor'
							viewBox='0 0 24 24'
						>
							<path
								strokeLinecap='round'
								strokeLinejoin='round'
								strokeWidth={2}
								d='M6 18L18 6M6 6l12 12'
							/>
						</svg>
					</button>
				</div>
				<button className='w-full px-4 py-2.5 rounded-md bg-[#fb9014] hover:bg-[#e8810f] active:bg-[#d5720a] text-white font-medium text-sm transition-colors duration-150 whitespace-nowrap'>
					Activity Log Current{' '}
					{currentObject?.typeName && currentObject?.id
						? currentObject.typeName
						: 'Object'}
				</button>
				<ClearDomoCookies />
			</div>
		</div>
	);
}
