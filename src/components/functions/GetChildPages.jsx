import { Button, Spinner } from '@heroui/react';
import { IconCopy } from '@tabler/icons-react';

import { useLaunchView } from '@/hooks';
import { waitForChildPages } from '@/utils';

export function GetChildPages({
  currentContext,
  isDisabled,
  onCollapseActions,
  onStatusUpdate
}) {
  const { isPending, launch } = useLaunchView();

  const typeId = currentContext?.domoObject?.typeId;
  const label =
    typeId === 'DATA_APP_VIEW'
      ? 'Get App Pages'
      : typeId === 'WORKSHEET_VIEW'
        ? 'Get Worksheet Pages'
        : 'Get Child Pages';

  return (
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
            <IconCopy stroke={1.5} />
            {label}
          </>
        )
      }
    </Button>
  );
}
