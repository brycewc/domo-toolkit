import { Button, Separator, Spinner, Toolbar } from '@heroui/react';
import {
  IconArrowBarToLeft,
  IconArrowBarToRight,
  IconArrowLeft,
  IconArrowRight,
  IconMinus
} from '@tabler/icons-react';
import { Position, NodeToolbar as XYNodeToolbar } from '@xyflow/react';
import { memo } from 'react';

export const LineageNodeToolbar = memo(function LineageNodeToolbar({
  data,
  expandLoading,
  nodeId,
  onCollapseNode,
  onExpandNode
}) {
  const { direction, downstreamCount, expanded, upstreamCount } = data;
  const isLoading = expandLoading?.has(nodeId);

  const showUpstream =
    upstreamCount > 0 && (direction === 'root' || direction === 'upstream');

  const showDownstream =
    downstreamCount > 0 && (direction === 'root' || direction === 'downstream');

  if (!showUpstream && !showDownstream) return null;

  return (
    <XYNodeToolbar isVisible nodeId={nodeId} position={Position.Top}>
      <Toolbar className='rounded-lg bg-surface px-1.5 py-1 shadow-md'>
        {showUpstream && (
          <>
            {expanded?.up ? (
              <CollapseButton
                direction='upstream'
                onClick={() => onCollapseNode(nodeId, 'upstream')}
              />
            ) : (
              <ExpandButton
                count={upstreamCount}
                direction='upstream'
                isLoading={isLoading}
                onClick={() => onExpandNode(nodeId, 'upstream')}
              />
            )}
          </>
        )}

        {showUpstream && showDownstream && (
          <Separator className='mx-0.5 h-4' orientation='vertical' />
        )}

        {showDownstream && (
          <>
            {expanded?.down ? (
              <CollapseButton
                direction='downstream'
                onClick={() => onCollapseNode(nodeId, 'downstream')}
              />
            ) : (
              <ExpandButton
                count={downstreamCount}
                direction='downstream'
                isLoading={isLoading}
                onClick={() => onExpandNode(nodeId, 'downstream')}
              />
            )}
          </>
        )}
      </Toolbar>
    </XYNodeToolbar>
  );
});

const CollapseButton = memo(function CollapseButton({ direction, onClick }) {
  const isUpstream = direction === 'upstream';
  const Icon = isUpstream ? IconArrowBarToRight : IconArrowBarToLeft;

  return (
    <Button
      className='h-7 min-w-0 gap-1 px-2 text-xs'
      size='sm'
      variant='flat'
      onPress={onClick}
    >
      <Icon className='size-3' />
      <IconMinus className='size-3' />
    </Button>
  );
});

const ExpandButton = memo(function ExpandButton({
  count,
  direction,
  isLoading,
  onClick
}) {
  const isUpstream = direction === 'upstream';
  const Icon = isUpstream ? IconArrowLeft : IconArrowRight;

  return (
    <Button
      className='h-7 min-w-0 gap-1 px-2 text-xs'
      isDisabled={isLoading}
      size='sm'
      variant='flat'
      onPress={onClick}
    >
      {isLoading ? (
        <Spinner className='size-3' size='sm' />
      ) : (
        <Icon className='size-3' stroke={2} />
      )}
      <span>{count}</span>
    </Button>
  );
});
