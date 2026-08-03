import { Accordion, Button, Card, Chip, ScrollShadow, Separator, Switch } from '@heroui/react';
import { Fragment } from 'react';

import { usePerInstanceSettings } from '@/hooks/usePerInstanceSettings';
import { instanceLabel } from '@/utils/instance';
import IconChevronDown from '@icons/chevron-down.svg?react';
import IconTrash from '@icons/trash.svg?react';

// Registry of instance-level configs. Each entry describes one feature that stores a per-instance
// dataset ID (and, optionally, a toggle). To add a new feature, append an object here: the cards and
// the explanatory accordion below both render from this list, so nothing else needs to change. Omit
// `toggle` for a feature that is always used once its dataset ID is present (e.g. Scheduled Reports).
const INSTANCE_CONFIGS = [
  {
    accordion: {
      body: (
        <>
          <p>
            The Activity Log Dataset ID is saved automatically the first time you choose the DomoStats Activity Log dataset
            as your source for an instance.
          </p>
          <p className='mt-2'>
            With <strong>Use by default</strong> on, the Activity Log opens in DomoStats mode automatically for that instance
            instead of reading the raw activity stream.
          </p>
        </>
      ),
      title: 'DomoStats Activity Log'
    },
    datasetIdField: 'activityLogDatasetId',
    datasetIdLabel: 'Activity Log Dataset ID',
    key: 'activity-log',
    toggle: {
      field: 'preferActivityLogDataset',
      label: 'Use by default'
    }
  }
];

export function PerInstanceSettings() {
  const { clear, clearAll, isLoading, settings, update } = usePerInstanceSettings();

  if (isLoading) {
    return null;
  }

  const instances = Object.entries(settings).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className='flex h-full min-h-0 w-full flex-col items-center gap-2 pt-4'>
      <div className='flex w-full shrink-0 justify-end'>
        <Button isDisabled={instances.length === 0} variant='secondary' onPress={clearAll}>
          <IconTrash />
          Clear All
        </Button>
      </div>
      <ScrollShadow className='min-h-0 w-full max-w-lg flex-1'>
        <div className='flex flex-col gap-2'>
          {instances.length === 0 ? (
            <p className='text-sm text-muted'>No instance settings stored yet.</p>
          ) : (
            instances.map(([instance, instanceSettings]) => {
              const configs = INSTANCE_CONFIGS.filter((config) => instanceSettings[config.datasetIdField]);
              return (
                <Card key={instance}>
                  <Card.Header className='flex flex-row items-center justify-between gap-2'>
                    <Card.Title className='min-w-0'>
                      <Chip className='max-w-full' color='accent' variant='soft'>
                        <Chip.Label className='truncate' title={instanceLabel(instance)}>
                          {instanceLabel(instance)}
                        </Chip.Label>
                      </Chip>
                    </Card.Title>
                    <Button
                      isIconOnly
                      aria-label={`Delete ${instanceLabel(instance)}`}
                      className='shrink-0'
                      variant='tertiary'
                      onPress={() => clear(instance)}
                    >
                      <IconTrash className='text-danger' />
                    </Button>
                  </Card.Header>
                  {configs.length > 0 && (
                    <Card.Content className='flex flex-col gap-3'>
                      {configs.map((config, index) => (
                        <Fragment key={config.key}>
                          {index > 0 && <Separator />}
                          <div className='flex flex-row items-center justify-between gap-3'>
                            <div className='flex min-w-0 flex-col gap-1'>
                              <span className='text-xs text-muted'>{config.datasetIdLabel}</span>
                              <code className='truncate text-xs' title={instanceSettings[config.datasetIdField]}>
                                {instanceSettings[config.datasetIdField]}
                              </code>
                            </div>
                            {config.toggle && (
                              <Switch
                                className='shrink-0'
                                isSelected={!!instanceSettings[config.toggle.field]}
                                onChange={(v) => update(instance, config.toggle.field, v)}
                              >
                                <Switch.Content className='text-sm text-muted'>
                                  {config.toggle.label}
                                  <Switch.Control>
                                    <Switch.Thumb />
                                  </Switch.Control>
                                </Switch.Content>
                              </Switch>
                            )}
                          </div>
                        </Fragment>
                      ))}
                    </Card.Content>
                  )}
                </Card>
              );
            })
          )}
        </div>
      </ScrollShadow>

      <Accordion className='w-full max-w-lg shrink-0 cursor-pointer'>
        {INSTANCE_CONFIGS.map((config) => (
          <Accordion.Item id={config.key} key={config.key}>
            <Accordion.Heading>
              <Accordion.Trigger>
                {config.accordion.title}
                <Accordion.Indicator>
                  <IconChevronDown />
                </Accordion.Indicator>
              </Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <Accordion.Body>{config.accordion.body}</Accordion.Body>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
    </div>
  );
}
