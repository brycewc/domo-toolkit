import { Alert, Button, CloseButton } from '@heroui/react';
import { useState, useEffect } from 'react';

export default function StatusBar({
	title,
	description,
	status = 'accent',
	timeout = 5000,
	onClose
}) {
	const [progress, setProgress] = useState(100);
	const [isVisible, setIsVisible] = useState(true);

	useEffect(() => {
		if (!timeout) return;
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

	// Map status to background color classes (needed for Tailwind purging)
	const bgColorMap = {
		accent: 'bg-accent',
		primary: 'bg-primary',
		success: 'bg-success',
		warning: 'bg-warning',
		danger: 'bg-danger'
	};

	const bgColor = bgColorMap[status] || 'bg-accent';

	return (
		<Alert status={status} className='relative overflow-hidden'>
			{timeout && (
				<div
					id='status-bar-timeout-indicator'
					className={`absolute top-[1px] left-[1rem] h-1 opacity-75 transition-all duration-50 rounded-full ${bgColor}`}
					style={{ width: `calc(${progress}% - 2rem)` }}
				/>
			)}
			<Alert.Indicator />
			<Alert.Content>
				<Alert.Title>{title}</Alert.Title>
				<Alert.Description>{description}</Alert.Description>
			</Alert.Content>
			<CloseButton onPress={handleClose} />
		</Alert>
	);
}
