import { Button, Dropdown, Kbd, Label, Tooltip } from '@heroui/react';
import { IconClipboard } from '@tabler/icons-react';
import { useMemo, useState } from 'react';

import { useLongPress } from '@/hooks';
import { getObjectType } from '@/models';

import { AnimatedCheck } from '../AnimatedCheck';

export function Copy({ currentContext, isDisabled, onStatusUpdate }) {
  const [isCopied, setIsCopied] = useState(false);
  const { LongPressOverlay, pressProps } = useLongPress();

  const domoObject = currentContext?.domoObject;
  const typeModel = domoObject?.typeId
    ? getObjectType(domoObject.typeId)
    : null;
  const primaryConfig = typeModel?.copyConfigs?.find((c) => c.primary);

  // Build dropdown items from copyConfigs, filtering by visibility conditions
  const dropdownItems = useMemo(() => {
    if (!typeModel?.copyConfigs || !domoObject) return [];

    const resolve = (source) =>
      source.split('.').reduce((cur, key) => cur?.[key], domoObject);

    const isVisible = (config) => {
      if (!config.when) return !!resolve(config.source);
      if (typeof config.when === 'string') return !!resolve(config.when);
      const val = resolve(config.when.field);
      return (
        typeof val === 'string' &&
        val.toLowerCase() === config.when.matches.toLowerCase()
      );
    };

    return typeModel.copyConfigs
      .filter((c) => !c.primary && isVisible(c))
      .map((c) => ({
        id: c.source,
        label: `Copy ${c.label}`,
        value: resolve(c.source)
      }));
  }, [domoObject, primaryConfig, typeModel]);

  const longPressDisabled =
    isDisabled || !domoObject?.id || dropdownItems.length === 0;

  const handlePress = () => {
    const resolve = (source) =>
      source.split('.').reduce((cur, key) => cur?.[key], domoObject);

    const copyId = primaryConfig
      ? resolve(primaryConfig.source)
      : domoObject?.id;
    const copyLabel = primaryConfig?.label || `${domoObject?.typeName} ID`;
    try {
      navigator.clipboard.writeText(copyId);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
      onStatusUpdate?.(
        'Success',
        `Copied ${copyLabel} **${copyId}** to clipboard`,
        'success',
        2000
      );
    } catch (error) {
      onStatusUpdate?.(
        'Error',
        `Failed to copy ${copyLabel.toLowerCase()} to clipboard`,
        'error',
        3000
      );
    }
  };

  const handleAction = (key) => {
    const item = dropdownItems.find((i) => i.id === key);
    if (!item) return;
    navigator.clipboard.writeText(item.value);
    onStatusUpdate?.(
      'Success',
      `Copied ${item.label.replace('Copy ', '')} **${item.value}** to clipboard`,
      'success',
      2000
    );
  };

  return (
    <Dropdown isDisabled={longPressDisabled} trigger='longPress'>
      <Tooltip closeDelay={0} delay={400}>
        <Button
          fullWidth
          isIconOnly
          className='relative overflow-visible'
          isDisabled={isDisabled || !domoObject?.id}
          variant='tertiary'
          onPress={handlePress}
          {...(longPressDisabled ? {} : pressProps)}
        >
          {isCopied ? (
            <AnimatedCheck stroke={1.5} />
          ) : (
            <IconClipboard stroke={1.5} />
          )}
          <LongPressOverlay />
        </Button>
        <Tooltip.Content className='flex flex-col items-center'>
          <div className='flex items-center gap-2'>
            <span>Copy {primaryConfig?.label || 'ID'}</span>
            <Kbd className='text-xs'>
              <Kbd.Abbr
                keyValue={
                  (
                    navigator.userAgentData?.platform ?? navigator.platform
                  ).includes('Mac')
                    ? 'command'
                    : 'ctrl'
                }
              />
              <Kbd.Abbr keyValue='shift' />
              <Kbd.Content>1</Kbd.Content>
            </Kbd>
          </div>
          {!longPressDisabled && (
            <span className='italic'>Hold for more options</span>
          )}
        </Tooltip.Content>
      </Tooltip>
      <Dropdown.Popover className='w-fit min-w-48' placement='bottom left'>
        <Dropdown.Menu onAction={handleAction}>
          {dropdownItems.map((item) => (
            <Dropdown.Item id={item.id} key={item.id} textValue={item.label}>
              <IconClipboard className='size-5 shrink-0' stroke={1.5} />
              <Label>{item.label}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
