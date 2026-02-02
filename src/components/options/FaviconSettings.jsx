import { useState, useEffect } from 'react';
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
  Popover,
  Skeleton,
  ButtonGroup
} from '@heroui/react';
import {
  IconTrash,
  IconGripVertical,
  IconColorSwatchOff,
  IconColorSwatch
} from '@tabler/icons-react';
import { ColorPicker } from 'react-color-pikr';
import { clearFaviconCache } from '@/utils';
import { StatusBar } from './../StatusBar';

export function FaviconSettings() {
  const [rules, setRules] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [activeColorPicker, setActiveColorPicker] = useState(null);
  const [tempColor, setTempColor] = useState('#000000');
  const [statusBar, setStatusBar] = useState({
    title: '',
    description: '',
    status: 'accent',
    timeout: 3000,
    visible: false
  });
  const [popoverOffset, setPopoverOffset] = useState(8);

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
      } else {
        // Set default rules if none exist (matches background.js default)
        setRules([
          {
            id: Date.now(),
            pattern: '.*',
            effect: 'instance-logo',
            color: '#000000'
          }
        ]);
      }
      setIsLoading(false);
    });
  }, []);

  const showStatus = (
    title,
    description,
    status = 'accent',
    timeout = 3000
  ) => {
    setStatusBar({ title, description, status, timeout, visible: true });
  };

  const hideStatus = () => {
    setStatusBar((prev) => ({ ...prev, visible: false }));
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
        showStatus('Settings saved successfully!', '', 'success');
      }
    );
  };

  const addRow = () => {
    setRules([
      ...rules,
      {
        id: Date.now(),
        pattern: '.*',
        effect: 'domo-logo-colored',
        color: '#000FFF'
      }
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
                <Card.Content className='flex flex-row items-center justify-start gap-2'>
                  <div className='flex items-center justify-center'>
                    <IconGripVertical className='mt-[1.5rem] size-4' />
                  </div>
                  <div className='text-fg-muted mt-[1.5rem] text-sm font-semibold'>
                    {index + 1}
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
                        <Select.Indicator />
                      </Select.Trigger>
                      <Select.Popover>
                        <ListBox>
                          <ListBox.Item id='instance-logo'>
                            instance-logo
                          </ListBox.Item>
                          <ListBox.Item id='domo-logo-colored'>
                            domo-logo-colored
                          </ListBox.Item>
                          <ListBox.Item id='top'>top</ListBox.Item>
                          <ListBox.Item id='right'>right</ListBox.Item>
                          <ListBox.Item id='bottom'>bottom</ListBox.Item>
                          <ListBox.Item id='left'>left</ListBox.Item>
                        </ListBox>
                      </Select.Popover>
                    </Select>
                  </div>

                  <div className='flex w-25 flex-col gap-1'>
                    <Label>Color</Label>
                    <Popover
                      onOpenChange={(isOpen) => {
                        if (isOpen) {
                          setActiveColorPicker(rule.id);
                          setTempColor(
                            rule.effect !== 'instance-logo'
                              ? rule.color
                              : '#000000'
                          );
                        } else {
                          setActiveColorPicker(null);
                        }
                      }}
                    >
                      <ButtonGroup>
                        <Button
                          fullWidth
                          onPress={() => setPopoverOffset(49)}
                          className={
                            rule.effect === 'instance-logo'
                              ? 'bg-default opacity-100'
                              : 'opacity-100'
                          }
                          style={
                            rule.effect !== 'instance-logo'
                              ? {
                                  backgroundColor:
                                    activeColorPicker === rule.id
                                      ? tempColor
                                      : rule.color
                                }
                              : undefined
                          }
                          isDisabled={rule.effect === 'instance-logo'}
                        ></Button>
                        <Button
                          variant='tertiary'
                          isIconOnly
                          isDisabled={rule.effect === 'instance-logo'}
                          fullWidth
                          className={
                            rule.effect === 'instance-logo'
                              ? 'bg-default opacity-100'
                              : 'opacity-100'
                          }
                          onPress={() => setPopoverOffset(8)}
                        >
                          {rule.effect === 'instance-logo' ? (
                            <IconColorSwatchOff size={4} />
                          ) : (
                            <IconColorSwatch size={4} />
                          )}
                        </Button>
                      </ButtonGroup>
                      <Popover.Content placement='right' offset={popoverOffset}>
                        <ColorPicker
                          value={tempColor}
                          onChange={(newColor) => {
                            setPopoverOffset(8);
                            setTempColor(newColor);
                            updateRule(rule.id, 'color', newColor);
                          }}
                          showAlpha={true}
                        />
                      </Popover.Content>
                    </Popover>
                  </div>

                  {rules.length > 1 && (
                    <div className='mt-[1.5rem] flex items-center'>
                      <Button
                        variant='danger'
                        onPress={() => removeRow(rule.id)}
                        isIconOnly
                      >
                        <IconTrash size={4} />
                      </Button>
                    </div>
                  )}
                </Card.Content>
              </Card>
            ))
          )}

          <div className='flex flex-row gap-2'>
            <Button type='submit'>Save Settings</Button>
            <Button type='button' variant='secondary' onPress={addRow}>
              Add Row
            </Button>
          </div>
        </Form>

        <div>
          {statusBar.visible && (
            <StatusBar
              title={statusBar.title}
              description={statusBar.description}
              status={statusBar.status}
              timeout={statusBar.timeout}
              onClose={hideStatus}
            />
          )}
        </div>
      </div>

      <Accordion className='cursor-pointer'>
        <Accordion.Item key='rule-ordering'>
          <Accordion.Heading>
            <Accordion.Trigger>
              Rule Priority & Ordering
              <Accordion.Indicator />
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
              <Accordion.Indicator />
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
              <Accordion.Indicator />
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
