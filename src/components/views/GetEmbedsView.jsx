import { Button, Card, Spinner } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';

import { Alert } from '@/components/Alert';
import { CloseButton } from '@/components/CloseButton';
import { useLaunchView } from '@/hooks/useLaunchView';
import { useViewReady } from '@/hooks/useViewReady';
import { DataListItem } from '@/models/DataListItem';
import { DomoContext } from '@/models/DomoContext';
import { DomoObject } from '@/models/DomoObject';
import { getAppEmbeds, getPageEmbeds, toEmbedRow } from '@/services/embeds';
import { getValidTabForInstance } from '@/utils/currentObject';
import { getSidepanelData } from '@/utils/sidepanel';
import IconCodeTags from '@icons/code-tags.svg?react';
import IconInfoCircle from '@icons/info-circle.svg?react';
import IconPagesBars from '@icons/pages-bars.svg?react';
import IconSync from '@icons/sync.svg?react';

import { AlertStatusIcon } from '../AlertStatusIcon';
import { DataList } from './DataList';

export function GetEmbedsView({
  currentContext = null,
  instance: viewInstance = null,
  isActive = true,
  onBackToDefault = null,
  onStatusUpdate = null
}) {
  const [isLoading, setIsLoading] = useState(true);
  const holdContent = useViewReady(!isLoading);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);
  const [error, setError] = useState(null);
  const [items, setItems] = useState([]);
  const [viewData, setViewData] = useState(null);
  const { isPending: isLaunchingCardPages, launch } = useLaunchView();

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    loadEmbeds();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadEmbeds = async (forceRefresh = false) => {
    if (!forceRefresh && !isRetrying) {
      setIsLoading(true);
      setShowSpinner(false);
    }

    const spinnerTimer = !forceRefresh ? setTimeout(() => setShowSpinner(true), 200) : null;

    try {
      const data = await getSidepanelData(viewInstance);
      if (!data || data.type !== 'getEmbeds') {
        setError('No embed data found. Please try again.');
        setIsLoading(false);
        return;
      }

      const context = DomoContext.fromJSON(data.currentContext);
      const domoObject = context.domoObject;
      const isAppView = domoObject.typeId === 'DATA_APP_VIEW';
      const appId = isAppView ? domoObject.parentId || domoObject.metadata?.parent?.id : null;
      if (isAppView && !appId) {
        setError('Could not determine the App Studio App for this page.');
        return;
      }
      const appName = domoObject.metadata?.parent?.name ?? null;

      setViewData({
        context,
        isAppView,
        objectId: isAppView ? appId : domoObject.id,
        objectName: isAppView
          ? appName || `App ${appId}`
          : domoObject.metadata?.name || `${domoObject.typeName} ${domoObject.id}`,
        objectType: isAppView ? 'DATA_APP' : domoObject.typeId
      });

      const tabId = await getValidTabForInstance(context.instance);
      const embeds = isAppView
        ? await getAppEmbeds({ appId, appName, tabId })
        : await getPageEmbeds({ pageId: domoObject.id, tabId });

      if (embeds.length === 0) {
        if (!mountedRef.current) return;
        onStatusUpdate?.(
          'No Embeds Found',
          'This page has no embeds. Its cards may still be embedded; use **Get Other Card Pages** to check.',
          'warning'
        );
        onBackToDefault?.();
        setIsLoading(false);
        return;
      }

      setError(null);
      setItems(
        embeds.map((embed) => {
          const row = toEmbedRow(embed);
          return new DataListItem({ ...row, domoObject: new DomoObject(row.typeId, row.id, context.origin) });
        })
      );
    } catch (err) {
      console.error('Error loading embeds:', err);
      setError(err.message || 'Failed to load embeds');
    } finally {
      if (spinnerTimer) clearTimeout(spinnerTimer);
      if (!forceRefresh) {
        setIsLoading(false);
        setShowSpinner(false);
      }
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadEmbeds(true);
      onStatusUpdate?.('Refreshed', 'Embed data updated successfully', 'success', 2000);
    } catch (err) {
      onStatusUpdate?.('Refresh Failed', err.message || 'Failed to refresh data', 'danger', 3000);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRetry = async () => {
    setIsRetrying(true);
    await loadEmbeds();
    setIsRetrying(false);
  };

  const openCardPages = () => {
    const context = viewData.context;
    launch(
      viewData.isAppView
        ? { currentContext: context, onStatusUpdate, parentId: viewData.objectId, scope: 'parent', type: 'getCardPages' }
        : { currentContext: context, onStatusUpdate, type: 'getCardPages' }
    );
  };

  if (isLoading || holdContent) {
    if (isLoading && !showSpinner) return null;
    return (
      <Card className='flex w-full items-center justify-center p-0'>
        <Card.Content className='flex flex-col items-center justify-center gap-2 p-2'>
          <Spinner size='lg' />
          <p className='text-muted'>Loading embeds...</p>
        </Card.Content>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert className='w-full' status='warning'>
        <AlertStatusIcon />
        <Alert.Content>
          <Alert.Title>Error</Alert.Title>
          <div className='flex flex-col items-start justify-center gap-2'>
            <Alert.Description>{error}</Alert.Description>
            <Button fullWidth isPending={isRetrying} size='sm' onPress={handleRetry}>
              {isRetrying ? <Spinner color='currentColor' size='sm' /> : <IconSync />}
              Retry
            </Button>
          </div>
        </Alert.Content>
        <CloseButton className='rounded-full' variant='ghost' onPress={() => onBackToDefault?.()} />
      </Alert>
    );
  }

  const cardPagesLabel = viewData?.isAppView ? 'Get App Card Pages' : 'Get Other Card Pages';
  const banner = (
    <Alert className='w-full' status='accent' variant='transparent'>
      <Alert.Content>
        <Alert.Title className='flex items-center gap-1'>
          <Alert.Indicator>
            <IconInfoCircle data-slot='alert-default-icon' />
          </Alert.Indicator>
          {viewData?.isAppView ? "Only This App's Own Embeds" : "Only This Page's Own Embeds"}
        </Alert.Title>
        <Alert.Description>
          Cards {viewData?.isAppView ? 'in this app' : 'on this page'} can also be embedded on their own. Use{' '}
          {cardPagesLabel} to see those embeds.
        </Alert.Description>
        <Button
          fullWidth
          className='mt-2'
          isPending={isLaunchingCardPages}
          size='sm'
          variant='secondary'
          onPress={openCardPages}
        >
          {isLaunchingCardPages ? <Spinner color='currentColor' size='sm' /> : <IconPagesBars />}
          {cardPagesLabel}
        </Button>
      </Alert.Content>
    </Alert>
  );

  return (
    <DataList
      banner={banner}
      currentContext={currentContext}
      feature='Embeds for'
      featureIcon={<IconCodeTags />}
      headerActions={['openAll', 'reload', 'refresh']}
      isActive={isActive}
      isRefreshing={isRefreshing}
      itemLabel='embed'
      items={items}
      objectId={viewData?.objectId}
      objectType={viewData?.objectType}
      showActions={true}
      showCounts={true}
      subject={viewData?.objectName}
      subtext={`${items.length} embed${items.length === 1 ? '' : 's'}`}
      viewType='getEmbeds'
      onClose={onBackToDefault}
      onRefresh={handleRefresh}
      onStatusUpdate={onStatusUpdate}
    />
  );
}
