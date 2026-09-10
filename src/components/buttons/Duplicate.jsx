import { Button, Description, Dropdown, Label, Tooltip } from '@heroui/react';

import { DUPLICATOR_DESCRIPTORS } from '@/components/views/duplicators/descriptors';
import { useLaunchView } from '@/hooks/useLaunchView';
import { useLongPress } from '@/hooks/useLongPress';

export function Duplicate({ currentContext, onStatusUpdate }) {
  const { isPending, launch } = useLaunchView();
  const { LongPressOverlay, pressProps } = useLongPress();

  const descriptor = DUPLICATOR_DESCRIPTORS[currentContext?.domoObject?.typeId];
  if (!descriptor) return null;

  const { options } = descriptor;
  const launchOption = (option) =>
    launch({
      currentContext,
      duplicator: option.key,
      onStatusUpdate,
      preCheck: option.preCheck ? () => option.preCheck(currentContext) : undefined,
      type: 'duplicate'
    });

  if (options.length === 1) {
    const [only] = options;
    const Icon = only.icon;
    return (
      <Tooltip>
        <Button
          fullWidth
          className='min-w-36 flex-1 whitespace-normal'
          isPending={isPending}
          variant='tertiary'
          onPress={() => launchOption(only)}
        >
          <Icon />
          {only.label}
        </Button>
        <Tooltip.Content className='max-w-60' offset={4}>
          {only.tooltip}
        </Tooltip.Content>
      </Tooltip>
    );
  }

  const ButtonIcon = descriptor.buttonIcon;
  const handleAction = (key) => {
    const option = options.find((o) => o.key === key);
    if (option) launchOption(option);
  };

  return (
    <Dropdown trigger='longPress'>
      <Tooltip>
        <Button
          fullWidth
          className='min-w-36 flex-1 whitespace-normal'
          isPending={isPending}
          variant='tertiary'
          onPress={() => launchOption(options[0])}
          {...pressProps}
        >
          <ButtonIcon />
          {descriptor.buttonLabel}
          <LongPressOverlay />
        </Button>
        <Tooltip.Content className='max-w-60' offset={4}>
          <span>{descriptor.buttonTooltip}</span>
          <span className='italic'>Hold for more options</span>
        </Tooltip.Content>
      </Tooltip>
      <Dropdown.Popover className='w-fit min-w-70' placement='bottom'>
        <Dropdown.Menu onAction={handleAction}>
          {options.map((option) => {
            const OptionIcon = option.icon;
            return (
              <Dropdown.Item id={option.key} key={option.key} textValue={option.label}>
                <div className='flex flex-col'>
                  <div className='flex items-center gap-2'>
                    <OptionIcon className='size-4 shrink-0' />
                    <Label>{option.label}</Label>
                  </div>
                  <Description className='ml-6 text-xs'>{option.tooltip}</Description>
                </div>
              </Dropdown.Item>
            );
          })}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
