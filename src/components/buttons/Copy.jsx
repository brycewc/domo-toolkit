import { Button, Dropdown, Kbd, Label, Tooltip } from '@heroui/react';
import { useMemo, useState } from 'react';

import { useLongPress } from '@/hooks/useLongPress';
import { getObjectType, matchesCondition, resolvePrimaryCopy } from '@/models/DomoObjectType';
import { copyToClipboard } from '@/utils/copyToClipboard';
import IconClipboardCopy from '@icons/clipboard-copy.svg?react';

import { AnimatedCheck } from '../AnimatedCheck';

export function Copy({ currentContext, isDisabled, onStatusUpdate }) {
  const [isCopied, setIsCopied] = useState(false);
  const { LongPressOverlay, pressProps } = useLongPress();

  const domoObject = currentContext?.domoObject;
  const typeModel = domoObject?.typeId ? getObjectType(domoObject.typeId) : null;
  const primaryConfig = typeModel?.copyConfigs?.find((c) => c.primary);

  // Build dropdown items from copyConfigs, filtering by visibility conditions
  const dropdownItems = useMemo(() => {
    if (!typeModel?.copyConfigs || !domoObject) return [];

    const resolve = (source) =>
      typeof source === 'function' ? source(domoObject) : source.split('.').reduce((cur, key) => cur?.[key], domoObject);

    const isVisible = (config) =>
      config.when ? matchesCondition(config.when, domoObject) : !!resolve(config.source);

    return typeModel.copyConfigs
      .filter((c) => !c.primary && isVisible(c))
      .map((c) => ({
        id: typeof c.source === 'function' ? c.label : c.source,
        label: `Copy ${c.label}`,
        value: resolve(c.source)
      }));
  }, [domoObject, primaryConfig, typeModel]);

  const longPressDisabled = isDisabled || !domoObject?.id || dropdownItems.length === 0;

  const handlePress = async () => {
    const copy = resolvePrimaryCopy(domoObject);
    if (!copy) return;
    try {
      await copyToClipboard(copy.value, currentContext.tabId);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
      onStatusUpdate?.('Success', `Copied ${copy.label} **${copy.value}** to clipboard`, 'success', 2000);
    } catch (error) {
      onStatusUpdate?.('Error', `Failed to copy ${copy.label.toLowerCase()} to clipboard`, 'error', 3000);
    }
  };

  const handleAction = async (key) => {
    const item = dropdownItems.find((i) => i.id === key);
    if (!item) return;
    const label = item.label.replace('Copy ', '');
    try {
      await copyToClipboard(item.value, currentContext.tabId);
      onStatusUpdate?.('Success', `Copied ${label} **${item.value}** to clipboard`, 'success', 2000);
    } catch (error) {
      onStatusUpdate?.('Error', `Failed to copy ${label.toLowerCase()} to clipboard`, 'error', 3000);
    }
  };

  return (
    <Dropdown isDisabled={longPressDisabled} trigger='longPress'>
      <Tooltip delay={200}>
        <Button
          fullWidth
          isIconOnly
          className='relative overflow-visible'
          isDisabled={isDisabled || !domoObject?.id}
          variant='tertiary'
          onPress={handlePress}
          {...(longPressDisabled ? {} : pressProps)}
        >
          {isCopied ? <AnimatedCheck /> : <IconClipboardCopy />}
          <LongPressOverlay />
        </Button>
        <Tooltip.Content className='max-w-60' offset={4}>
          <div className='flex items-center gap-2'>
            <span>Copy {primaryConfig?.label || 'ID'}</span>
            <Kbd className='text-xs'>
              <Kbd.Abbr
                keyValue={(navigator.userAgentData?.platform ?? navigator.platform).includes('Mac') ? 'command' : 'ctrl'}
              />
              <Kbd.Abbr keyValue='shift' />
              <Kbd.Content>1</Kbd.Content>
            </Kbd>
          </div>
          {!longPressDisabled && <span className='italic'>Hold for more options</span>}
        </Tooltip.Content>
      </Tooltip>
      <Dropdown.Popover className='w-fit min-w-60' placement='bottom left'>
        <Dropdown.Menu onAction={handleAction}>
          {dropdownItems.map((item) => (
            <Dropdown.Item id={item.id} key={item.id} textValue={item.label}>
              <IconClipboardCopy className='size-4 shrink-0' />
              <Label>{item.label}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
