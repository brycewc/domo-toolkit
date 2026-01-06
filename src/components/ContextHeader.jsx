import { Card, Chip } from '@heroui/react';

export function ContextHeader({ isDomoPage, currentInstance, currentObject }) {
	return (
		<Card className='bg-gradient-to-r from-accent/10 to-primary/10 border-accent/20'>
			<Card.Header>
				<Card.Title>Current Context</Card.Title>
				<Card.Description>
					Used for dynamic features (wherever you see __)
				</Card.Description>
			</Card.Header>
			<Card.Content className='text-sm'>
				{isDomoPage ? (
					<div className='flex flex-col gap-2'>
						{currentInstance && (
							<div className='flex items-center gap-2'>
								<span className='font-semibold text-accent'>Instance:</span>
								<Chip color='accent' variant='soft'>
									{currentInstance}.domo.com
								</Chip>
							</div>
						)}
						{currentObject?.objectType && currentObject?.id && (
							<div className='flex items-center gap-2'>
								<span className='font-semibold'>Current Object:</span>
								<span className='font-mono bg-primary/20 px-2 py-0.5 rounded text-foreground'>
									{currentObject.typeName} ({currentObject.id})
								</span>
							</div>
						)}
						{!currentInstance && !currentObject?.objectType && (
							<div className='text-muted-foreground italic'>
								Loading context...
							</div>
						)}
					</div>
				) : (
					<div className='flex flex-col gap-2'>
						<div className='font-semibold text-warning'>Not on a Domo page</div>
						<div className='text-muted-foreground text-xs'>
							Navigate to a Domo instance to enable most extension features
						</div>
					</div>
				)}
			</Card.Content>
		</Card>
	);
}
