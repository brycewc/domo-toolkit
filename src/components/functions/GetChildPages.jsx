import { Button, Spinner, Tooltip } from '@heroui/react';

import { useLaunchView } from '@/hooks/useLaunchView';
import { waitForChildPages } from '@/utils/pageHelpers';
import IconTree from '@icons/tree.svg?react';

export function GetChildPages({ currentContext, isDisabled, onCollapseActions, onStatusUpdate }) {
  const { isPending, launch } = useLaunchView();

  const typeId = currentContext?.domoObject?.typeId;
  const label =
    typeId === 'DATA_APP_VIEW' ? 'Get App Pages' : typeId === 'WORKSHEET_VIEW' ? 'Get Worksheet Pages' : 'Get Child Pages';

  return (
    <Tooltip closeDelay={50} delay={800}>
      <Button
        fullWidth
        className='min-w-36 flex-1 whitespace-normal'
        isDisabled={isDisabled}
        isPending={isPending}
        variant='tertiary'
        onPress={() =>
          launch({
            currentContext,
            onCollapseActions,
            onStatusUpdate,
            preCheck: async () => {
              const result = await waitForChildPages(currentContext);
              if (!result.success) return null;
              if (result.childPages?.length === 0) {
                const message =
                  typeId === 'DATA_APP_VIEW'
                    ? 'This app studio app has no pages.'
                    : typeId === 'WORKSHEET_VIEW'
                      ? 'This worksheet has no pages.'
                      : 'This page has no child pages.';
                return { empty: true, message, title: 'No Pages' };
              }
              return null;
            },
            type: 'getChildPages'
          })
        }
      >
        {({ isPending: pending }) =>
          pending ? (
            <Spinner color='currentColor' size='sm' />
          ) : (
            <>
              <IconTree />
              {label}
            </>
          )
        }
      </Button>
      <Tooltip.Content
        className='flex max-w-60 flex-col items-center justify-center px-1 py-0.5 text-center text-balance break-normal'
        offset={4}
      >
        List all pages nested under this object
      </Tooltip.Content>
    </Tooltip>
  );
}
