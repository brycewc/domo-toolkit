import { Button, Tooltip } from '@heroui/react';
import {
  IconChevronLeft,
  IconChevronRight,
  IconMinus,
  IconPlus
} from '@tabler/icons-react';

function LevelPill({
  direction,
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
      <button
        className='flex h-8 items-center gap-1 rounded-full bg-blue-600 px-3 text-xs font-semibold text-white shadow-sm'
        onClick={onRootClick}
      >
        Root
      </button>
    );
  }

  const absDepth = Math.abs(level.depth);
  const label = `L${absDepth}`;

  return (
    <Tooltip content={`${level.nodeCount} nodes at depth ${absDepth}`}>
      <button
        className='group flex h-8 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:border-blue-400 hover:bg-blue-50'
        onClick={() =>
          level.allExpanded
            ? onCollapse(direction, level.depth)
            : onExpand(direction, level.depth)
        }
        onMouseEnter={() => onHover(level.depth)}
        onMouseLeave={onHoverEnd}
      >
        {level.allExpanded ? (
          <IconMinus className='size-3 text-slate-400 group-hover:text-blue-500' stroke={2} />
        ) : (
          <IconPlus className='size-3 text-slate-400 group-hover:text-blue-500' stroke={2} />
        )}
        <span>{label}</span>
        <span className='text-slate-400'>{level.nodeCount}</span>
      </button>
    </Tooltip>
  );
}

function FrontierPill({ count, direction, onExpand }) {
  if (count === 0) return null;

  const isUpstream = direction === 'upstream';
  const Icon = isUpstream ? IconChevronLeft : IconChevronRight;

  return (
    <Tooltip
      content={`${count} expandable ${isUpstream ? 'upstream' : 'downstream'} nodes`}
    >
      <Button
        className='h-8 min-w-0 gap-1 rounded-full border-dashed px-2.5 text-xs'
        size='sm'
        variant='bordered'
        onPress={onExpand}
      >
        <Icon className='size-3' stroke={2} />
        <span>+{count}</span>
      </Button>
    </Tooltip>
  );
}

function Connector() {
  return <div className='h-px w-3 bg-slate-300' />;
}

export function LevelBar({
  downstreamLevels,
  frontierCounts,
  onClearHighlight,
  onCollapseLevel,
  onExpandLevel,
  onHighlightLevel,
  onRootClick,
  upstreamLevels
}) {
  const reversedUpstream = [...(upstreamLevels || [])].reverse();

  return (
    <div className='flex items-center gap-1 rounded-xl bg-white/90 px-3 py-2 shadow-md backdrop-blur-sm'>
      <FrontierPill
        count={frontierCounts?.upstream || 0}
        direction='upstream'
        onExpand={() => {
          const deepest = reversedUpstream[0];
          if (deepest) onExpandLevel('upstream', deepest.depth);
        }}
      />

      {reversedUpstream.map((level, i) => (
        <div key={level.depth} className='flex items-center gap-1'>
          {(i > 0 || frontierCounts?.upstream > 0) && <Connector />}
          <LevelPill
            direction='upstream'
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
        <div key={level.depth} className='flex items-center gap-1'>
          {i > 0 && <Connector />}
          <LevelPill
            direction='downstream'
            level={level}
            onCollapse={onCollapseLevel}
            onExpand={onExpandLevel}
            onHover={onHighlightLevel}
            onHoverEnd={onClearHighlight}
          />
        </div>
      ))}

      {(downstreamLevels?.length > 0 && frontierCounts?.downstream > 0) && (
        <Connector />
      )}

      <FrontierPill
        count={frontierCounts?.downstream || 0}
        direction='downstream'
        onExpand={() => {
          const deepest = downstreamLevels?.[downstreamLevels.length - 1];
          if (deepest) onExpandLevel('downstream', deepest.depth);
        }}
      />
    </div>
  );
}
