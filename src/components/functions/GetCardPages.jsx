import { Button, Spinner } from '@heroui/react';
import { IconCopy } from '@tabler/icons-react';
import { useState } from 'react';

import { getCardsForObject, getPagesForCards } from '@/services';
import {
  isSidepanel,
  openSidepanel,
  storeSidepanelData,
  waitForCardPages,
  waitForCards
} from '@/utils';

export function GetCardPages({
  currentContext,
  isDisabled,
  onCollapseActions,
  onStatusUpdate
}) {
  const [isLoading, setIsLoading] = useState(false);

  const handleGetCardPages = async () => {
    setIsLoading(true);

    try {
      if (!currentContext?.domoObject) {
        onStatusUpdate?.(
          'No Object Detected',
          'Please navigate to a Domo object and try again',
          'danger'
        );
        setIsLoading(false);
        return;
      }

      if (!isSidepanel()) {
        await storeSidepanelData({
          currentContext,
          type: 'getCardPages'
        });
        openSidepanel();
        return;
      }

      const objectType = currentContext.domoObject.typeId;
      const objectId = String(currentContext.domoObject.id);
      const objectName =
        currentContext.domoObject.metadata?.parent?.name ||
        currentContext.domoObject.metadata?.name ||
        `Unknown ${objectType}`;

      let cardPages = [];
      let cardsByPage;

      if (objectType === 'DATA_SOURCE') {
        const cards = await getCardsForObject({
          objectId: currentContext.domoObject.id,
          objectType,
          tabId: currentContext?.tabId
        });

        if (!cards || cards.length === 0) {
          onStatusUpdate?.(
            'No Cards Found',
            `No cards found using ${objectName}`,
            'warning'
          );
          setIsLoading(false);
          return;
        }

        const result = await getPagesForCards(
          cards.map((card) => card.id),
          currentContext?.tabId
        );
        cardPages = result.pages.map((page) => ({
          appId: page.appId || null,
          appName: page.appName || null,
          pageId: page.id,
          pageTitle: page.name,
          pageType: page.type
        }));
        cardsByPage = result.cardsByPage;
      } else if (objectType === 'DATAFLOW_TYPE') {
        const outputs =
          currentContext.domoObject.metadata?.details?.outputs || [];

        if (outputs.length === 0) {
          onStatusUpdate?.(
            'No Output Datasets',
            'This dataflow has no output datasets.',
            'warning'
          );
          setIsLoading(false);
          return;
        }

        const allCards = [];
        const seen = new Set();
        for (const output of outputs) {
          const dsCards = await getCardsForObject({
            objectId: output.dataSourceId,
            objectType: 'DATA_SOURCE',
            tabId: currentContext?.tabId
          });
          for (const card of dsCards) {
            if (!seen.has(card.id)) {
              seen.add(card.id);
              allCards.push(card);
            }
          }
        }

        if (allCards.length === 0) {
          onStatusUpdate?.(
            'No Cards Found',
            `No cards found using output datasets of ${objectName}`,
            'warning'
          );
          setIsLoading(false);
          return;
        }

        const result = await getPagesForCards(
          allCards.map((card) => card.id),
          currentContext?.tabId
        );
        cardPages = result.pages.map((page) => ({
          appId: page.appId || null,
          appName: page.appName || null,
          pageId: page.id,
          pageTitle: page.name,
          pageType: page.type
        }));
        cardsByPage = result.cardsByPage;
      } else if (objectType === 'CARD') {
        const result = await waitForCardPages(currentContext);

        if (!result.success) {
          onStatusUpdate?.('Error', result.error, 'danger', 3000);
          setIsLoading(false);
          return;
        }

        cardPages = (result.cardPages || []).map((page) => ({
          appId: page.appId || null,
          appName: page.appName || null,
          pageId: page.id,
          pageTitle: page.name,
          pageType: page.type
        }));
        cardsByPage = result.cardsByPage;
      } else {
        // PAGE, DATA_APP_VIEW, WORKSHEET_VIEW
        const waitResult = await waitForCards(currentContext);

        if (!waitResult.success || !waitResult.cards?.length) {
          onStatusUpdate?.(
            'No Cards Found',
            `No cards found on ${objectName}`,
            'warning'
          );
          setIsLoading(false);
          return;
        }

        const result = await getPagesForCards(
          waitResult.cards.map((card) => card.id),
          currentContext?.tabId
        );

        const otherPages = result.pages.filter(
          (page) => String(page.id) !== objectId
        );

        cardPages = otherPages.map((page) => ({
          appId: page.appId || null,
          appName: page.appName || null,
          pageId: page.id,
          pageTitle: page.name,
          pageType: page.type
        }));
        cardsByPage = result.cardsByPage;
      }

      if (!cardPages.length) {
        const message =
          objectType === 'CARD'
            ? 'This card is not used on any pages.'
            : objectType === 'DATA_SOURCE' || objectType === 'DATAFLOW_TYPE'
              ? `Cards using ${objectName} are not used on any pages`
              : `Cards on ${objectName} are not used on any other pages`;
        onStatusUpdate?.('No Pages Found', message, 'warning');
        setIsLoading(false);
        return;
      }

      // Cache card pages on background context
      chrome.runtime
        .sendMessage({
          metadataUpdates: {
            cardPages: cardPages.map((p) => ({
              appId: p.appId,
              appName: p.appName,
              id: p.pageId,
              name: p.pageTitle,
              type: p.pageType
            }))
          },
          tabId: currentContext.tabId,
          type: 'UPDATE_CONTEXT_METADATA'
        })
        .catch(() => {});

      if (onCollapseActions) {
        await storeSidepanelData({
          message: 'Loading pages...',
          timestamp: Date.now(),
          type: 'loading'
        });

        onCollapseActions();
        await new Promise((resolve) => setTimeout(resolve, 175));
      }

      await storeSidepanelData({
        cardPages,
        cardsByPage,
        currentContext,
        statusShown: true,
        type: 'getCardPages'
      });
    } catch (error) {
      console.error('[GetCardPages] Error:', error);
      onStatusUpdate?.(
        'Error',
        error.message || 'Failed to get card pages',
        'danger'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      fullWidth
      className='min-w-36 flex-1 whitespace-normal'
      isDisabled={isDisabled}
      isPending={isLoading}
      variant='tertiary'
      onPress={handleGetCardPages}
    >
      {({ isPending }) => {
        if (isPending) {
          return <Spinner color='currentColor' size='sm' />;
        }

        return (
          <>
            <IconCopy stroke={1.5} />
            Get Card Pages
          </>
        );
      }}
    </Button>
  );
}
