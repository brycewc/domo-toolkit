import { useState, useEffect } from 'react';
import {
  Button,
  ComboBox,
  Fieldset,
  Form,
  Input,
  Label,
  ListBox,
  TextField,
  Skeleton,
  Card
} from '@heroui/react';
import { IconTrash } from '@tabler/icons-react';
import { StatusBar } from '@/components';

export function ActivityLogSettings() {
  const [configs, setConfigs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [visitedInstances, setVisitedInstances] = useState([]);
  const [statusBar, setStatusBar] = useState({
    title: '',
    description: '',
    status: 'accent',
    timeout: 3000,
    visible: false
  });

  // Load settings from Chrome storage on component mount
  useEffect(() => {
    setIsLoading(true);
    chrome.storage.sync.get(
      ['activityLogConfigs', 'visitedDomoInstances'],
      (result) => {
        // Migrate old single config to new array format
        if (
          !result.activityLogConfigs &&
          (result.activityLogCardId ||
            result.activityLogObjectTypeColumn ||
            result.activityLogObjectIdColumn)
        ) {
          // Create a default config from old settings
          const migratedConfig = [
            {
              id: Date.now(),
              instance: '',
              cardId: result.activityLogCardId || '',
              objectTypeColumn:
                result.activityLogObjectTypeColumn || 'Object_Type',
              objectIdColumn: result.activityLogObjectIdColumn || 'Object_ID'
            }
          ];
          setConfigs(migratedConfig);
        } else if (
          result.activityLogConfigs &&
          result.activityLogConfigs.length > 0
        ) {
          setConfigs(result.activityLogConfigs);
        } else {
          // Set default config - use dev defaults in dev mode
          const defaultConfig = import.meta.env.DEV
            ? {
                id: Date.now(),
                instance: 'domo',
                cardId: '2019620443',
                objectTypeColumn: 'Object Type ID',
                objectIdColumn: 'Object ID'
              }
            : {
                id: Date.now(),
                instance: '',
                cardId: '',
                objectTypeColumn: 'Object_Type',
                objectIdColumn: 'Object_ID'
              };
          setConfigs([defaultConfig]);
        }

        setVisitedInstances(result.visitedDomoInstances || []);
        setIsLoading(false);
      }
    );
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

  const onSubmit = (e) => {
    e.preventDefault();

    // Validate that all configs have required fields
    const invalidConfigs = configs.filter(
      (config) =>
        !config.instance ||
        !config.cardId ||
        !config.objectTypeColumn ||
        !config.objectIdColumn
    );

    if (invalidConfigs.length > 0) {
      showStatus(
        'Validation Error',
        'All fields are required for each configuration',
        'danger'
      );
      return;
    }

    // Save to Chrome storage
    chrome.storage.sync.set(
      {
        activityLogConfigs: configs
      },
      () => {
        showStatus('Settings saved successfully!', '', 'success');
      }
    );
  };

  const addRow = () => {
    const newConfig = import.meta.env.DEV
      ? {
          id: Date.now(),
          instance: 'domo',
          cardId: '2019620443',
          objectTypeColumn: 'Object Type ID',
          objectIdColumn: 'Object ID'
        }
      : {
          id: Date.now(),
          instance: '',
          cardId: '',
          objectTypeColumn: 'Object_Type',
          objectIdColumn: 'Object_ID'
        };
    setConfigs([...configs, newConfig]);
  };

  const removeRow = (id) => {
    if (configs.length > 1) {
      setConfigs(configs.filter((config) => config.id !== id));
    }
  };

  const updateConfig = (id, field, value) => {
    setConfigs(
      configs.map((config) =>
        config.id === id ? { ...config, [field]: value } : config
      )
    );
  };

  const handleCardIdChange = (id, value) => {
    // Only allow digits
    const numericValue = value.replace(/\D/g, '');
    updateConfig(id, 'cardId', numericValue);
  };

  return (
    <div className='flex w-full flex-col gap-4 pt-4'>
      <Form className='flex w-full flex-col gap-4' onSubmit={onSubmit}>
        {isLoading ? (
          <div className='skeleton--shimmer relative flex w-full flex-col gap-4 overflow-hidden'>
            <Skeleton animationType='none' className='h-20 rounded-xl' />
          </div>
        ) : (
          configs.map((config) => (
            <Card key={config.id}>
              <Card.Content className='flex h-20 flex-row items-start justify-start gap-2'>
                <ComboBox
                  allowsCustomValue
                  inputValue={config.instance}
                  onInputChange={(value) =>
                    updateConfig(config.id, 'instance', value)
                  }
                  className='flex-1'
                  isRequired
                >
                  <Label>Domo Instance</Label>
                  <ComboBox.InputGroup>
                    <Input placeholder='Select or enter instance' />
                    <ComboBox.Trigger />
                  </ComboBox.InputGroup>
                  <ComboBox.Popover>
                    <ListBox>
                      {visitedInstances.length === 0 ? (
                        <ListBox.Item
                          id='_no_instances'
                          textValue='No instances visited yet'
                        >
                          No instances visited yet
                        </ListBox.Item>
                      ) : (
                        visitedInstances.map((instance) => (
                          <ListBox.Item
                            key={instance}
                            id={instance}
                            textValue={instance}
                          >
                            {instance}
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))
                      )}
                    </ListBox>
                  </ComboBox.Popover>
                </ComboBox>

                <TextField
                  isRequired
                  value={config.cardId}
                  onChange={(value) => handleCardIdChange(config.id, value)}
                  className='w-40'
                >
                  <Label>Card ID</Label>
                  <Input
                    placeholder='Card ID'
                    type='text'
                    inputMode='numeric'
                  />
                </TextField>

                <TextField
                  isRequired
                  value={config.objectTypeColumn}
                  onChange={(value) =>
                    updateConfig(config.id, 'objectTypeColumn', value)
                  }
                  className='flex-1'
                >
                  <Label>Object Type Column</Label>
                  <Input placeholder='Object_Type' />
                </TextField>

                <TextField
                  isRequired
                  value={config.objectIdColumn}
                  onChange={(value) =>
                    updateConfig(config.id, 'objectIdColumn', value)
                  }
                  className='flex-1'
                >
                  <Label>Object ID Column</Label>
                  <Input placeholder='Object_ID' />
                </TextField>
                {configs.length > 1 && (
                  <div className='flex h-20 items-center'>
                    <Button
                      variant='danger'
                      size='sm'
                      onPress={() => removeRow(config.id)}
                      isIconOnly
                    >
                      <IconTrash className='size-4' />
                    </Button>
                  </div>
                )}
              </Card.Content>
            </Card>
          ))
        )}

        <div className='flex gap-2'>
          <Button type='submit'>Save Settings</Button>
          <Button type='button' variant='secondary' onPress={addRow}>
            Add Row
          </Button>
        </div>
      </Form>

      <div className='min-h-[5rem]'>
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
  );
}
