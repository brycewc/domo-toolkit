import { Alert, Card, Chip, Spinner, Tooltip } from '@heroui/react';
import IconBolt from '@/assets/icons/bolt-black.svg';

export function ContextFooter({
	isDomoPage,
	currentInstance,
	currentObject,
	isLoading
}) {
	return (
		<Tooltip isDisabled={!isDomoPage} delay={500}>
			<Tooltip.Trigger>
				<Alert
					status={isDomoPage ? 'accent' : 'warning'}
					className={
						isDomoPage
							? 'bg-linear-to-r from-bg-foreground/10 to-accent/10'
							: 'bg-linear-to-r from-bg-foreground/10 to-warning/10'
					}
				>
					<Alert.Indicator />
					<Alert.Content className='w-full'>
						<Alert.Title>
							{isDomoPage ? (
								<>
									Current Context:{' '}
									<span className='underline'>{currentInstance}.domo.com</span>
								</>
							) : (
								'Not a Domo Instance'
							)}
						</Alert.Title>
						<Alert.Description>
							{isDomoPage ? (
								<div className='w-full'>
									{isLoading ||
									!currentInstance ||
									!currentObject?.objectType ||
									!currentObject?.id ? (
										<Spinner size='sm' color='accent' />
									) : (
										<Chip color='accent' variant='soft'>
											{currentObject.typeName} (ID: {currentObject.id})
										</Chip>
									)}
								</div>
							) : (
								'Navigate to an instance to enable most extension features'
							)}
						</Alert.Description>
					</Alert.Content>
				</Alert>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<Tooltip.Arrow />
				<p className='flex flex-row justify-center items-center'>
					Used for dynamic features (wherever you see
					<img src={IconBolt} alt='Bolt icon' className='inline w-4 h-4 ml-1' />
					)
				</p>
			</Tooltip.Content>
		</Tooltip>
	);
}
