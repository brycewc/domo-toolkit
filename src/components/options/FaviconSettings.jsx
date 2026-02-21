import { useState, useEffect, useRef } from 'react';
import {
  Accordion,
  Button,
  Card,
  Input,
  Label,
  Select,
  ListBox,
  TextField,
  Form,
  Skeleton,
  ColorArea,
  ColorInputGroup,
  ColorField,
  ColorSlider,
  ColorSwatch,
  ColorPicker,
  ColorSwatchPicker,
  parseColor
} from '@heroui/react';
import {
  IconTrash,
  IconGripVertical,
  IconPlus,
  IconDeviceFloppy,
  IconChevronDown,
  IconCheck,
  IconArrowsShuffle
} from '@tabler/icons-react';
import { toast } from '@heroui/react';
import { clearFaviconCache } from '@/utils';

export function FaviconSettings() {
  const [rules, setRules] = useState([]);
  const [originalRules, setOriginalRules] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const colorPresets = [
    '#F43F5EFF',
    '#D946EFFF',
    '#8B5CF6FF',
    '#3B82F6FF',
    '#06B6D4FF',
    '#10B981FF',
    '#84CC16FF'
  ];
  const nextPresetIndex = useRef(0);
  const shuffleColor = (ruleId) => {
    const randomHue = Math.floor(Math.random() * 360);
    const randomSaturation = 50 + Math.floor(Math.random() * 50); // 50-100%
    const randomLightness = 40 + Math.floor(Math.random() * 30); // 40-70%
    const randomAlpha = 0.5 + Math.random() * 0.5; // 0.5-1.0
    const newColor = parseColor(
      `hsla(${randomHue}, ${randomSaturation}%, ${randomLightness}%, ${randomAlpha})`
    );
    updateRule(ruleId, 'color', newColor.toString('hexa'));
  };

  // Load settings from Chrome storage on component mount
  useEffect(() => {
    setIsLoading(true);
    chrome.storage.sync.get(['faviconRules'], (result) => {
      if (result.faviconRules && result.faviconRules.length > 0) {
        // Migrate old format if necessary
        const migratedRules = result.faviconRules.map((rule) => {
          if (rule.useInstanceLogo) {
            // Convert old format: useInstanceLogo: true -> effect: 'instance-logo'
            const { useInstanceLogo, ...rest } = rule;
            return { ...rest, effect: 'instance-logo' };
          }
          // Remove useInstanceLogo property if it exists
          const { useInstanceLogo, ...rest } = rule;
          return rest;
        });
        setRules(migratedRules);
        setOriginalRules(migratedRules);
      } else {
        // Set default rules if none exist (matches background.js default)
        const defaultRules = [
          {
            id: Date.now(),
            pattern: '.*',
            effect: 'instance-logo',
            color: '#00000000'
          }
        ];
        setRules(defaultRules);
        setOriginalRules(defaultRules);
      }
      setIsLoading(false);
    });
  }, []);

  // Check if rules have changed from original
  const hasChanges = JSON.stringify(rules) !== JSON.stringify(originalRules);

  const showStatus = (title, description, status = 'accent', timeout = 3000) => {
    const method =
      status === 'success' ? toast.success
        : status === 'warning' ? toast.warning
          : status === 'danger' ? toast.danger
            : toast;
    method(title, { description, timeout: timeout || 0 });
  };

  const onSave = async (e) => {
    e.preventDefault();

    // Clear favicon cache before saving new rules
    await clearFaviconCache();

    // Save to Chrome storage
    chrome.storage.sync.set(
      {
        faviconRules: rules
      },
      () => {
        setOriginalRules(rules);
        showStatus('Settings saved successfully!', '', 'success');
      }
    );
  };

  const addRow = () => {
    const color = colorPresets[nextPresetIndex.current % colorPresets.length];
    nextPresetIndex.current++;
    setRules([
      {
        id: Date.now(),
        pattern: '.*',
        effect: 'domo-logo-colored',
        color
      },
      ...rules
    ]);
  };

  const removeRow = (id) => {
    setRules(rules.filter((rule) => rule.id !== id));
  };

  const updateRule = (id, field, value) => {
    setRules(
      rules.map((rule) => (rule.id === id ? { ...rule, [field]: value } : rule))
    );
  };

  const handleDragStart = (index) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();

    if (draggedIndex === null || draggedIndex === dropIndex) {
      return;
    }

    const newRules = [...rules];
    const [draggedRule] = newRules.splice(draggedIndex, 1);
    newRules.splice(dropIndex, 0, draggedRule);

    setRules(newRules);
    setDraggedIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  return (
    <div className='flex h-full min-h-[calc(100vh-20)] w-full flex-col justify-between pt-4'>
      <div className='flex w-full flex-col gap-2'>
        <Form className='flex w-full flex-col gap-2' onSubmit={onSave}>
          <div className='flex flex-row gap-2'>
            <Button type='submit' isDisabled={!hasChanges}>
              <IconDeviceFloppy />
              Save Settings
            </Button>
            <Button type='button' variant='secondary' onPress={addRow}>
              <IconPlus />
              Add Rule
            </Button>
          </div>

          {isLoading ? (
            <div className='skeleton--shimmer relative flex w-full flex-col gap-2 overflow-hidden'>
              <Skeleton animationType='none' className='h-24 rounded-xl' />
              <Skeleton animationType='none' className='h-24 rounded-xl' />
              <Skeleton animationType='none' className='h-24 rounded-xl' />
            </div>
          ) : (
            rules.map((rule, index) => (
              <Card
                key={rule.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                className={`cursor-move transition-opacity ${
                  draggedIndex === index ? 'opacity-50' : ''
                }`}
              >
                <Card.Content className='flex flex-row items-end justify-start gap-2'>
                  <div className='flex flex-col items-center justify-end gap-2'>
                    <span className='text-fg-muted text-sm font-semibold'>
                      {index + 1}
                    </span>
                    <IconGripVertical
                      stroke={1.5}
                      className='size-8 text-muted'
                    />
                  </div>

                  <div className='min-w-0 flex-1'>
                    <TextField
                      className='w-full'
                      name='pattern'
                      onChange={(value) =>
                        updateRule(rule.id, 'pattern', value)
                      }
                      value={rule.pattern}
                      isRequired
                      variant='secondary'
                    >
                      <Label>Subdomain Pattern</Label>
                      <Input />
                    </TextField>
                  </div>

                  <div className='flex w-50 flex-col gap-1'>
                    <Label>Effect</Label>
                    <Select
                      value={rule.effect}
                      onChange={(value) => updateRule(rule.id, 'effect', value)}
                      className='w-full'
                      isRequired
                      variant='secondary'
                    >
                      <Label className='sr-only'>Effect</Label>
                      <Select.Trigger>
                        <Select.Value />
                        <Select.Indicator>
                          <IconChevronDown stroke={1} />
                        </Select.Indicator>
                      </Select.Trigger>
                      <Select.Popover>
                        <ListBox>
                          <ListBox.Item id='instance-logo'>
                            instance-logo
                            <ListBox.ItemIndicator>
                              {({ isSelected }) =>
                                isSelected ? <IconCheck stroke={1.5} /> : null
                              }
                            </ListBox.ItemIndicator>
                          </ListBox.Item>
                          <ListBox.Item id='domo-logo-colored'>
                            domo-logo-colored
                            <ListBox.ItemIndicator>
                              {({ isSelected }) =>
                                isSelected ? <IconCheck stroke={1.5} /> : null
                              }
                            </ListBox.ItemIndicator>
                          </ListBox.Item>
                          <ListBox.Item id='top'>
                            top
                            <ListBox.ItemIndicator>
                              {({ isSelected }) =>
                                isSelected ? <IconCheck stroke={1.5} /> : null
                              }
                            </ListBox.ItemIndicator>
                          </ListBox.Item>
                          <ListBox.Item id='right'>
                            right
                            <ListBox.ItemIndicator>
                              {({ isSelected }) =>
                                isSelected ? <IconCheck stroke={1.5} /> : null
                              }
                            </ListBox.ItemIndicator>
                          </ListBox.Item>
                          <ListBox.Item id='bottom'>
                            bottom
                            <ListBox.ItemIndicator>
                              {({ isSelected }) =>
                                isSelected ? <IconCheck stroke={1.5} /> : null
                              }
                            </ListBox.ItemIndicator>
                          </ListBox.Item>
                          <ListBox.Item id='left'>
                            left
                            <ListBox.ItemIndicator>
                              {({ isSelected }) =>
                                isSelected ? <IconCheck stroke={1.5} /> : null
                              }
                            </ListBox.ItemIndicator>
                          </ListBox.Item>
                        </ListBox>
                      </Select.Popover>
                    </Select>
                  </div>

                  <div className='flex w-25 flex-col gap-1'>
                    <ColorPicker
                      value={
                        rule.effect === 'instance-logo'
                          ? '#00000000'
                          : parseColor(rule.color)
                      }
                      onChange={(newColor) =>
                        updateRule(rule.id, 'color', newColor.toString('hexa'))
                      }
                      className='flex flex-col items-start justify-start gap-1'
                    >
                      <Label
                        htmlFor='color-picker-trigger'
                        aria-label='Color picker label'
                      >
                        Color
                      </Label>
                      <ColorPicker.Trigger
                        aria-label='Color picker trigger'
                        id='color-picker-trigger'
                        isDisabled={rule.effect === 'instance-logo'}
                      >
                        <ColorSwatch
                          size='lg'
                          shape='square'
                          className='w-25 rounded-3xl'
                        />
                      </ColorPicker.Trigger>
                      <ColorPicker.Popover
                        className='w-65 gap-2'
                        placement='right'
                      >
                        <ColorSwatchPicker
                          aria-label='Color swatch picker'
                          className='justify-center gap-0.5'
                          variant='square'
                        >
                          {colorPresets.map((preset) => (
                            <ColorSwatchPicker.Item key={preset} color={preset}>
                              <ColorSwatchPicker.Swatch />
                              <ColorSwatchPicker.Indicator>
                                {({ isSelected }) =>
                                  isSelected ? <IconCheck /> : null
                                }
                              </ColorSwatchPicker.Indicator>
                            </ColorSwatchPicker.Item>
                          ))}
                        </ColorSwatchPicker>
                        <ColorArea
                          aria-label='Color area'
                          className='max-w-full'
                          colorSpace='hsl'
                          xChannel='saturation'
                          yChannel='lightness'
                        >
                          <ColorArea.Thumb />
                        </ColorArea>
                        <div className='flex flex-col justify-center gap-1'>
                          <ColorSlider
                            aria-label='Hue slider'
                            channel='hue'
                            className='flex-1'
                            colorSpace='hsl'
                          >
                            <Label>Hue</Label>
                            <ColorSlider.Track>
                              <ColorSlider.Thumb />
                            </ColorSlider.Track>
                          </ColorSlider>
                          <ColorSlider
                            aria-label='Alpha slider'
                            channel='alpha'
                            className='flex-1'
                            colorSpace='hsl'
                          >
                            <Label>Opacity</Label>
                            <ColorSlider.Output className='text-muted' />
                            <ColorSlider.Track>
                              <ColorSlider.Thumb />
                            </ColorSlider.Track>
                          </ColorSlider>
                        </div>
                        <div className='flex w-full flex-row items-center justify-start gap-1'>
                          <ColorField
                            colorSpace='hsl'
                            aria-label='Color field'
                            className=''
                          >
                            <ColorInputGroup
                              variant='secondary'
                              aria-label='Color input group'
                            >
                              <ColorInputGroup.Prefix>
                                <ColorSwatch size='xs' shape='square' />
                              </ColorInputGroup.Prefix>
                              <ColorInputGroup.Input
                                aria-label='Color input'
                                onPaste={(e) => {
                                  let text = e.clipboardData
                                    .getData('text')
                                    .trim();
                                  if (/^[0-9a-f]{6,8}$/i.test(text)) {
                                    text = '#' + text;
                                  }
                                  try {
                                    const parsed = parseColor(text);
                                    updateRule(
                                      rule.id,
                                      'color',
                                      parsed.toString('hexa')
                                    );
                                  } catch {
                                    // Not a valid color string, let default paste proceed
                                  }
                                }}
                              />
                            </ColorInputGroup>
                          </ColorField>
                          <Button
                            isIconOnly
                            aria-label='Shuffle color'
                            variant='tertiary'
                            onPress={() => shuffleColor(rule.id)}
                            className='shrink-0'
                          >
                            <IconArrowsShuffle stroke={1.5} />
                          </Button>
                        </div>
                      </ColorPicker.Popover>
                    </ColorPicker>
                  </div>

                  {rules.length > 1 && (
                    <div className='flex items-center'>
                      <Button
                        variant='tertiary'
                        onPress={() => removeRow(rule.id)}
                        isIconOnly
                      >
                        <IconTrash stroke={1.5} className='text-danger' />
                      </Button>
                    </div>
                  )}
                </Card.Content>
              </Card>
            ))
          )}
        </Form>

      </div>

      <Accordion className='cursor-pointer'>
        <Accordion.Item key='rule-ordering'>
          <Accordion.Heading>
            <Accordion.Trigger>
              Rule Priority & Ordering
              <Accordion.Indicator>
                <IconChevronDown />
              </Accordion.Indicator>
            </Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <Accordion.Body>
              <p>
                <strong>Rule Priority:</strong> Rules are applied in order from
                top to bottom. The first matching rule for a domain will be
                used, and all lower rules will be ignored.
              </p>
              <p className='mt-2'>
                <strong>Reordering:</strong> Drag and drop rules using the grip
                icon (⋮⋮) to reorder them. Higher priority rules should be
                placed at the top.
              </p>
            </Accordion.Body>
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item key='effects-info'>
          <Accordion.Heading>
            <Accordion.Trigger>
              Effects
              <Accordion.Indicator>
                <IconChevronDown />
              </Accordion.Indicator>
            </Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <Accordion.Body>
              Effects are the way the favicon gets modified:
              <ul className='list-inside list-disc space-y-1 pl-4'>
                <li>
                  <strong>instance-logo:</strong> uses the Domo instance logo
                  instead of a color (no color picker for this one)
                </li>
                <li>
                  <strong>domo-logo-colored:</strong> Domo logo with colored
                  background (color picker selects background color)
                </li>
                <li>
                  <strong>top:</strong> puts a colored stripe over the top
                  quarter
                </li>
                <li>
                  <strong>right:</strong> puts a colored stripe over the right
                  quarter
                </li>
                <li>
                  <strong>bottom:</strong> puts a colored stripe over the bottom
                  quarter
                </li>
                <li>
                  <strong>left:</strong> puts a colored stripe over the left
                  quarter
                </li>
              </ul>
            </Accordion.Body>
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item key='regex-info'>
          <Accordion.Heading>
            <Accordion.Trigger>
              Regex Pattern
              <Accordion.Indicator>
                <IconChevronDown />
              </Accordion.Indicator>
            </Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <Accordion.Body>
              <p>
                Use regular expressions to match Domo instance subdomains. The
                pattern will be tested against the subdomain/instance only
                (i.e., before .domo.com).
              </p>
              <p>
                Examples:
                <ul className='list-inside list-disc space-y-1 pl-4'>
                  <li>
                    <strong>.*</strong> - matches all Domo instances
                  </li>
                  <li>
                    <strong>^company$</strong> - matches only company.domo.com
                  </li>
                  <li>
                    <strong>.*-dev</strong> - matches any Domo instance ending
                    with -dev (e.g., company-dev.domo.com)
                  </li>
                  <li>
                    <strong>(qa|test)</strong> - matches qa.domo.com or
                    test.domo.com
                  </li>
                </ul>
              </p>
            </Accordion.Body>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </div>
  );
}
