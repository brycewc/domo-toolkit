import { Card, Spinner } from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';

import { DataflowInspector } from '@/components/DataflowInspector';
import { DomoContext } from '@/models/DomoContext';
import { getValidTabForInstance } from '@/utils/currentObject';
import { getSidepanelData } from '@/utils/sidepanel';

export function InspectDataflowView({ instance = null, onBackToDefault = null }) {
  const [dataflowId, setDataflowId] = useState(null);
  const [error, setError] = useState(null);
  const [versionId, setVersionId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await getSidepanelData(instance);
      if (cancelled) return;
      if (!data || data.type !== 'inspectDataflow') {
        setError('No dataflow found. Please try again.');
        return;
      }
      const context = DomoContext.fromJSON(data.currentContext);
      setDataflowId(context.domoObject?.id ?? null);
      // When the dataflow is opened at a historical version (?versionId=), detection stashes it
      // here so Inspect loads that version's tiles instead of the live definition.
      setVersionId(context.domoObject?.metadata?.context?.dataflowVersionId ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [instance]);

  // Stable identity so DataflowInspector's fetch effect doesn't refire (and
  // reload the whole dataflow) every time App re-renders on a URL change.
  const resolveTabId = useCallback(() => getValidTabForInstance(instance), [instance]);

  if (error || (dataflowId === null && error === null)) {
    return (
      <Card className='flex min-h-0 w-full flex-1 flex-col items-center justify-center p-2'>
        {error ? <p className='text-danger'>{error}</p> : <Spinner size='md' />}
      </Card>
    );
  }

  return (
    <DataflowInspector
      className='min-h-0 w-full flex-1'
      dataflowId={dataflowId}
      resolveTabId={resolveTabId}
      showJson={false}
      versionId={versionId}
      onClose={onBackToDefault}
    />
  );
}
