import { Button, Tooltip } from '@heroui/react';

import { useLaunchView } from '@/hooks/useLaunchView';
import IconCodeTags from '@icons/code-tags.svg?react';

export function GetEmbeds({ currentContext, isDisabled, onStatusUpdate }) {
  const { isPending, launch } = useLaunchView();
  const isAppView = currentContext?.domoObject?.typeId === 'DATA_APP_VIEW';

  return (
    <Tooltip>
      <Button
        fullWidth
        className='min-w-36 flex-1 whitespace-normal'
        isDisabled={isDisabled}
        isPending={isPending}
        variant='tertiary'
        onPress={() => launch({ currentContext, onStatusUpdate, type: 'getEmbeds' })}
      >
        <IconCodeTags /> {isAppView ? 'Get App Embeds' : 'Get Embeds'}
      </Button>
      <Tooltip.Content className='max-w-60' offset={4}>
        {isAppView ? 'List the embeds of this App Studio App' : 'List the embeds of this page'}
      </Tooltip.Content>
    </Tooltip>
  );
}
