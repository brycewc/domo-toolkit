import { Button, Tooltip } from '@heroui/react';

import { useLaunchView } from '@/hooks/useLaunchView';
import { getColorRules } from '@/services/datasets';
import IconColor from '@icons/color.svg?react';

export function CopyColorRules({ currentContext, onStatusUpdate }) {
  const { isPending, launch } = useLaunchView();

  return (
    <Tooltip closeDelay={100} delay={600}>
      <Button
        fullWidth
        className='min-w-36 flex-1 whitespace-normal'
        isPending={isPending}
        variant='tertiary'
        onPress={() =>
          launch({
            currentContext,
            onStatusUpdate,
            preCheck: async () => {
              const rules = await getColorRules(
                currentContext.domoObject.id,
                currentContext.tabId
              );
              return rules.length === 0
                ? {
                    empty: true,
                    message: 'This dataset has no color rules to copy.',
                    title: 'No color rules'
                  }
                : null;
            },
            type: 'copyColorRules'
          })
        }
      >
        <IconColor />
        Copy Color Rules
      </Button>
      <Tooltip.Content
        className='flex max-w-60 flex-col items-center justify-center px-1 py-0.5 text-center text-wrap break-normal'
        offset={4}
      >
        Copy this dataset's color rules to another dataset
      </Tooltip.Content>
    </Tooltip>
  );
}
