import { Button, Dropdown, Label, Spinner, Tooltip } from '@heroui/react';

import { useLaunchView } from '@/hooks/useLaunchView';
import { useLongPress } from '@/hooks/useLongPress';
import { scopeFromContext } from '@/utils/migrateScope';
import IconSwapHorizontal from '@icons/swap-horizontal.svg?react';

export function MigrateDownstreamContent({ currentContext, onStatusUpdate }) {
  const { isPending, launch } = useLaunchView();
  const { LongPressOverlay, pressProps } = useLongPress();
  const domoObject = currentContext?.domoObject;
  const typeId = domoObject?.typeId;
  const isBeastMode = typeId === 'BEAST_MODE_FORMULA';
  const scopeFrom = scopeFromContext(currentContext);

  let dropdownItems = [];
  if (typeId === 'DATA_APP_VIEW') {
    dropdownItems = [{ id: 'app', label: 'Migrate App Content' }];
  } else if (typeId === 'WORKSHEET_VIEW') {
    dropdownItems = [{ id: 'worksheet', label: 'Migrate Worksheet Content' }];
  }
  const longPressDisabled = !domoObject?.id || dropdownItems.length === 0;

  const handleAction = async (kind) => {
    const appId = domoObject?.parentId;
    if (!appId) {
      onStatusUpdate?.('Error', 'Could not determine parent app ID.', 'danger');
      return;
    }
    await launch({
      currentContext,
      onStatusUpdate,
      scopeFrom: { appId: String(appId), id: String(appId), kind },
      type: 'migrateDownstreamContent'
    });
  };

  let tooltipText;
  if (isBeastMode) {
    tooltipText = 'Repoint the cards, drills, and Beast Modes that use this Beast Mode to a different Beast Mode';
  } else if (scopeFrom) {
    tooltipText = `Migrate the cards on this ${scopeFrom.kind === 'page' ? 'page' : 'view'} from one dataset to another`;
  } else {
    tooltipText =
      'Migrate the cards, Beast Modes, dataset views, dataflows, alerts, pro-code apps, and Jupyter Workspaces that use this dataset to a new dataset';
  }

  return (
    <Dropdown isDisabled={longPressDisabled} trigger='longPress'>
      <Tooltip>
        <Button
          fullWidth
          className='relative min-w-36 flex-1 overflow-visible whitespace-normal'
          isPending={isPending}
          variant='tertiary'
          onPress={() =>
            launch({
              currentContext,
              onStatusUpdate,
              type: isBeastMode ? 'migrateBeastModeUsage' : 'migrateDownstreamContent'
            })
          }
          {...(longPressDisabled ? {} : pressProps)}
        >
          {({ isPending: pending }) =>
            pending ? (
              <Spinner color='currentColor' size='sm' />
            ) : (
              <>
                <IconSwapHorizontal />
                Migrate Content
                <LongPressOverlay />
              </>
            )
          }
        </Button>
        <Tooltip.Content className='max-w-60' offset={4}>
          <span>{tooltipText}</span>
          {!longPressDisabled && <span className='italic'>Hold for more options</span>}
        </Tooltip.Content>
      </Tooltip>
      <Dropdown.Popover className='w-fit min-w-48' placement='bottom'>
        <Dropdown.Menu onAction={handleAction}>
          {dropdownItems.map((item) => (
            <Dropdown.Item id={item.id} key={item.id} textValue={item.label}>
              <IconSwapHorizontal className='size-4 shrink-0' />
              <Label>{item.label}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
