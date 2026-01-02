import { Alert, Button, CloseButton } from '@heroui/react';
import { useState, useEffect } from 'react';

export default function StatusBar({
	title,
	description,
	status,
	timeout = 5000,
	onClose
}) {
	const [progress, setProgress] = useState(100);
	const [isVisible, setIsVisible] = useState(true);

	useEffect(() => {
		if (!timeout) return;
		console.log(status);
		const interval = 50; // Update every 50ms
		const decrement = (100 / timeout) * interval;

		const timer = setInterval(() => {
			setProgress((prev) => {
				const newProgress = prev - decrement;
				if (newProgress <= 0) {
					clearInterval(timer);
					setIsVisible(false);
					return 0;
				}
				return newProgress;
			});
		}, interval);

		return () => clearInterval(timer);
	}, [timeout, onClose]);

	// Separate effect to handle onClose callback
	useEffect(() => {
		if (!isVisible) {
			onClose?.();
		}
	}, [isVisible, onClose]);

	const handleClose = () => {
		setIsVisible(false);
	};

	if (!isVisible) return null;

	return (
		<Alert status={status} className='relative overflow-hidden'>
			<div
				id='status-bar-timeout-indicator'
				className={`absolute top-[0.5px] left-[1rem] h-1 bg-${status} opacity-50 transition-all duration-50 rounded-full`}
				style={{ width: `calc(${progress}% - 2rem)` }}
			/>
			<Alert.Indicator />
			<Alert.Content>
				<Alert.Title>{title}</Alert.Title>
				<Alert.Description>{description}</Alert.Description>
			</Alert.Content>
			<CloseButton onClick={handleClose} />
		</Alert>
	);
}
