import { useState, useEffect, useRef } from 'react';

export default function HelloWorld(props) {
	const [count, setCount] = useState(0);
	const hasLoadedFromStorage = useRef(false);

	useEffect(() => {
		// Load initial count from storage
		chrome.storage.sync.get(['count'], (result) => {
			setCount(result.count || 0);
			hasLoadedFromStorage.current = true;
		});

		// Listen for storage changes from other components
		const handleStorageChange = (changes, areaName) => {
			if (areaName === 'sync' && changes.count) {
				setCount(changes.count.newValue);
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

		// Save count to storage when it changes
		chrome.storage.sync.set({ count });
		chrome.runtime.sendMessage({ type: 'COUNT', count });
	}, [count]);
	return (
		<>
			<h1>{props.msg}</h1>

			<div className='card'>
				<button type='button' onClick={() => setCount(count + 1)}>
					count is {count}
				</button>
				<p>
					Edit
					<code>src/components/HelloWorld.jsx</code> to test HMR
				</p>
			</div>

			<p>
				Check out
				<a
					href='https://github.com/crxjs/create-crxjs'
					target='_blank'
					rel='noreferrer'
				>
					create-crxjs
				</a>
				, the official starter
			</p>

			<p className='read-the-docs'>
				Click on the Vite, React and CRXJS logos to learn more
			</p>
		</>
	);
}
