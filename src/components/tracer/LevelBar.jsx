import { Button, Toolbar, Tooltip } from '@heroui/react';
import {
  IconChevronLeft,
  IconChevronRight,
  IconMinus,
  IconPlus
} from '@tabler/icons-react';
import { memo, useCallback, useMemo } from 'react';

const LevelPill = memo(function LevelPill({
  direction,
  index,
  isRoot,
  level,
  onCollapse,
  onExpand,
  onHover,
  onHoverEnd,
  onRootClick
}) {
  if (isRoot) {
    return (
      <Button className='bg-success' size='sm' onPress={onRootClick}>
        Root
      </Button>
    );
  }

  const label = `L${index}`;

  return (
    <Tooltip closeDelay={0} delay={400}>
      <Button
        size='sm'
        variant='tertiary'
        onMouseEnter={() => onHover(level.depth)}
        onMouseLeave={onHoverEnd}
        onPress={() =>
          level.allExpanded
            ? onCollapse(direction, level.depth)
            : onExpand(direction, level.depth)
        }
      >
        {level.allExpanded ? <IconMinus stroke={2} /> : <IconPlus stroke={2} />}
        {label}
        <span className='text-muted'>{level.nodeCount}</span>
      </Button>
      <Tooltip.Content>{`${level.nodeCount} nodes at level ${index}`}</Tooltip.Content>
    </Tooltip>
  );
});

const FrontierPill = memo(function FrontierPill({
  count,
  direction,
  onExpand
}) {
  if (count === 0) return null;

  const isUpstream = direction === 'upstream';
  const Icon = isUpstream ? IconChevronLeft : IconChevronRight;

  return (
    <Tooltip closeDelay={0} delay={400}>
      <Button size='sm' variant='tertiary' onPress={onExpand}>
        <Icon />+{count}
      </Button>
      <Tooltip.Content>{`${count} expandable ${isUpstream ? 'upstream' : 'downstream'} nodes`}</Tooltip.Content>
    </Tooltip>
  );
});

const Connector = memo(function Connector() {
  return <div className='border-divider mx-1 h-4 shrink-0 self-center border-l' />;
});

export const LevelBar = memo(function LevelBar({
  downstreamLevels,
  frontierCounts,
  onClearHighlight,
  onCollapseLevel,
  onExpandFrontier,
  onExpandLevel,
  onHighlightLevel,
  onRootClick,
  upstreamLevels
}) {
  const reversedUpstream = useMemo(
    () => [...(upstreamLevels || [])].reverse(),
    [upstreamLevels]
  );

  const handleUpstreamExpand = useCallback(() => {
    const deepest = upstreamLevels?.[upstreamLevels.length - 1];
    if (deepest) {
      onExpandLevel('upstream', deepest.depth);
    } else {
      onExpandFrontier?.('upstream');
    }
  }, [upstreamLevels, onExpandLevel, onExpandFrontier]);

  const handleDownstreamExpand = useCallback(() => {
    const deepest = downstreamLevels?.[downstreamLevels.length - 1];
    if (deepest) {
      onExpandLevel('downstream', deepest.depth);
    } else {
      onExpandFrontier?.('downstream');
    }
  }, [downstreamLevels, onExpandLevel, onExpandFrontier]);

  return (
    <Toolbar className='rounded-xl bg-background/90 px-3 py-2 shadow-md backdrop-blur-sm'>
      <FrontierPill
        count={frontierCounts?.upstream || 0}
        direction='upstream'
        onExpand={handleUpstreamExpand}
      />

      {reversedUpstream.map((level, i) => (
        <div className='flex items-center gap-1' key={level.depth}>
          {(i > 0 || frontierCounts?.upstream > 0) && <Connector />}
          <LevelPill
            direction='upstream'
            index={reversedUpstream.length - i}
            level={level}
            onCollapse={onCollapseLevel}
            onExpand={onExpandLevel}
            onHover={onHighlightLevel}
            onHoverEnd={onClearHighlight}
          />
        </div>
      ))}

      {(reversedUpstream.length > 0 || frontierCounts?.upstream > 0) && (
        <Connector />
      )}

      <LevelPill isRoot onRootClick={onRootClick} />

      {(downstreamLevels?.length > 0 || frontierCounts?.downstream > 0) && (
        <Connector />
      )}

      {(downstreamLevels || []).map((level, i) => (
        <div className='flex items-center gap-1' key={level.depth}>
          {i > 0 && <Connector />}
          <LevelPill
            direction='downstream'
            index={i + 1}
            level={level}
            onCollapse={onCollapseLevel}
            onExpand={onExpandLevel}
            onHover={onHighlightLevel}
            onHoverEnd={onClearHighlight}
          />
        </div>
      ))}

      {downstreamLevels?.length > 0 && frontierCounts?.downstream > 0 && (
        <Connector />
      )}
      <FrontierPill
        count={frontierCounts?.downstream || 0}
        direction='downstream'
        onExpand={handleDownstreamExpand}
      />
    </Toolbar>
  );
});
