import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Disclosure,
  DisclosureGroup,
  Link,
  Spinner
} from '@heroui/react';
import {
  IconArrowsSplit,
  IconChartBar,
  IconDatabase,
  IconExternalLink
} from '@tabler/icons-react';
import { tracePipeline } from '@/services';

export function LineageView({ currentContext, onStatusUpdate }) {
  const [lineage, setLineage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const shouldFetch =
      currentContext?.domoObject &&
      (currentContext.domoObject.typeId === 'DATA_SOURCE' ||
        currentContext.domoObject.typeId === 'DATAFLOW');

    if (!shouldFetch) {
      setLineage(null);
      return;
    }

    async function fetchLineage() {
      setLoading(true);
      setError(null);

      try {
        const entityType = currentContext.domoObject.typeId;
        const entityId = currentContext.domoObject.id;
        const tabId = currentContext.tabId;

        const result = await tracePipeline(entityType, entityId, 1, tabId);

        const upstream = result.nodes.filter((n) => n.depth < 0);
        const current = result.nodes.find((n) => n.depth === 0);
        const downstream = result.nodes.filter((n) => n.depth > 0);

        setLineage({ upstream, current, downstream, nodes: result.nodes });
      } catch (err) {
        console.error('[LineageView] Failed to fetch lineage:', err);
        setError(err.message || 'Failed to fetch lineage');
        onStatusUpdate?.(
          'Error',
          'Failed to fetch lineage',
          'error',
          3000
        );
      } finally {
        setLoading(false);
      }
    }

    fetchLineage();
  }, [currentContext, onStatusUpdate]);

  const handleOpenFullTracer = () => {
    if (!currentContext?.domoObject) return;

    chrome.runtime.sendMessage({
      type: 'OPEN_TRACER_OVERLAY',
      entityType: currentContext.domoObject.typeId,
      entityId: currentContext.domoObject.id,
      tabId: currentContext.tabId
    });

    onStatusUpdate?.(
      'Opening Tracer',
      'Loading full lineage visualization...',
      'primary',
      2000
    );
  };

  if (
    !currentContext?.domoObject ||
    (currentContext.domoObject.typeId !== 'DATA_SOURCE' &&
      currentContext.domoObject.typeId !== 'DATAFLOW')
  ) {
    return null;
  }

  const getEntityIcon = (entityType) => {
    switch (entityType) {
      case 'DATA_SOURCE':
        return <IconDatabase className='h-4 w-4' stroke={1.5} />;
      case 'DATAFLOW':
        return <IconArrowsSplit className='h-4 w-4' stroke={1.5} />;
      case 'CARD':
        return <IconChartBar className='h-4 w-4' stroke={1.5} />;
      default:
        return null;
    }
  };

  return (
    <Card className='w-full overflow-hidden p-2'>
      <Card.Header className='flex items-center justify-between'>
        <span className='text-sm font-semibold'>Data Lineage</span>
        {lineage && !loading && (
          <Button
            size='sm'
            variant='primary'
            onPress={handleOpenFullTracer}
            className='gap-1'
          >
            <IconExternalLink className='h-4 w-4' stroke={1.5} />
            Trace Full Lineage
          </Button>
        )}
      </Card.Header>

      <Card.Content>
        {loading && (
          <div className='flex items-center justify-center py-4'>
            <Spinner size='sm' />
            <span className='ml-2 text-xs text-gray-500'>
              Tracing lineage...
            </span>
          </div>
        )}

        {error && (
          <div className='rounded bg-red-50 p-2 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400'>
            {error}
          </div>
        )}

        {lineage && !loading && !error && (
          <DisclosureGroup
            className='flex flex-col gap-1'
            allowsMultipleExpanded
          >
            {lineage.upstream.length > 0 && (
              <Disclosure>
                <Disclosure.Heading className='text-xs font-medium'>
                  Upstream ({lineage.upstream.length})
                </Disclosure.Heading>
                <Disclosure.Content>
                  <div className='flex flex-col gap-0.5 pl-4'>
                    {lineage.upstream.map((node) => (
                      <div
                        key={node.id}
                        className='flex items-center gap-2 text-xs'
                      >
                        {getEntityIcon(node.entityType)}
                        <Link
                          href={`https://${currentContext.instance}.domo.com/datasources/${node.entityId}/details`}
                          target='_blank'
                          className='truncate text-xs'
                        >
                          {node.name || node.entityId}
                        </Link>
                      </div>
                    ))}
                  </div>
                </Disclosure.Content>
              </Disclosure>
            )}

            {lineage.current && (
              <div className='rounded bg-blue-50 p-2 dark:bg-blue-900/20'>
                <div className='flex items-center gap-2 text-xs font-medium text-blue-900 dark:text-blue-100'>
                  {getEntityIcon(lineage.current.entityType)}
                  <span className='truncate'>
                    Current: {lineage.current.name || lineage.current.entityId}
                  </span>
                </div>
              </div>
            )}

            {lineage.downstream.length > 0 && (
              <Disclosure>
                <Disclosure.Heading className='text-xs font-medium'>
                  Downstream ({lineage.downstream.length})
                </Disclosure.Heading>
                <Disclosure.Content>
                  <div className='flex flex-col gap-0.5 pl-4'>
                    {lineage.downstream.map((node) => (
                      <div
                        key={node.id}
                        className='flex items-center gap-2 text-xs'
                      >
                        {getEntityIcon(node.entityType)}
                        <Link
                          href={`https://${currentContext.instance}.domo.com/datasources/${node.entityId}/details`}
                          target='_blank'
                          className='truncate text-xs'
                        >
                          {node.name || node.entityId}
                        </Link>
                      </div>
                    ))}
                  </div>
                </Disclosure.Content>
              </Disclosure>
            )}
          </DisclosureGroup>
        )}

        {lineage && lineage.upstream.length === 0 && lineage.downstream.length === 0 && (
          <div className='py-4 text-center text-xs text-gray-500'>
            No upstream or downstream lineage found.
          </div>
        )}
      </Card.Content>
    </Card>
  );
}
