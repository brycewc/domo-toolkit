import { Button, ButtonGroup, Card, Chip, Tooltip } from '@heroui/react';

import { getObjectType } from '@/models/DomoObjectType';
import { parseMarkdownBold, stripMarkdownBold } from '@/utils/markdown';
import IconX from '@icons/x.svg?react';

import { DisabledTooltip } from '../DisabledTooltip';
import { ObjectTypeIcon } from '../ObjectTypeIcon';

/**
 * ViewHeader
 * The shared `Card.Header` for every side panel view. Renders ONLY the header
 * (the consumer keeps its own `Card`, the trailing `<Separator>`, any banner,
 * and `Card.Content`).
 *
 * The title is two optional parts: a fixed `feature` lead-in (e.g. "Beast Modes
 * for", "Delete") and a bold `subject` (the object name), with `subjectTypeId`'s
 * icon inline between them. Feature-only views omit `subject`; a subject-only
 * view (ObjectDetails) omits `feature`. A large `featureIcon` sits to the left,
 * vertically centered so it spans the title and subtext rows.
 *
 * @param {Object} props
 * @param {React.ReactNode} [props.featureIcon] - Large left icon identifying the view, spanning both header rows.
 * @param {string} [props.feature] - The feature + connecting text (e.g. "Beast Modes for"). The whole title when there is no subject.
 * @param {string} [props.subject] - The subject object's display name, rendered bold inside the (single-line, clamped) title.
 * @param {string} [props.subjectTypeId] - typeId for an `ObjectTypeIcon` rendered inline immediately before `subject`.
 * @param {boolean} [props.beta] - Renders the standard "Beta" chip stacked beneath the feature icon.
 * @param {string} [props.subtext] - Secondary line; supports inline `**bold**` markdown.
 * @param {string} [props.subtextTypeId] - typeId for an `ObjectTypeIcon` at the start of the subtext row (for views whose subject stays in the subtext).
 * @param {Array} [props.actions] - Header action specs: `{ key, icon, tooltip, onPress, isActive?, isDisabled?, disabledReason?, ariaLabel? }`.
 * @param {Function} [props.onClose] - Shows the close button when provided.
 * @param {string} [props.closeLabel='Close view'] - Close button tooltip text.
 * @param {React.ReactNode} [props.bottomRow] - Third header row (e.g. a selection toolbar).
 */
export function ViewHeader({
  actions,
  beta = false,
  bottomRow,
  closeLabel = 'Close view',
  feature,
  featureIcon,
  onClose,
  subject,
  subjectTypeId,
  subtext,
  subtextTypeId
}) {
  const hasTitleRow = feature || subject;
  const hasSubtextRow = subtext || subtextTypeId || actions?.length > 0;
  // The tooltip names the subject's type so the icon's meaning is spelled out in
  // text (e.g. "Cards for dataset Sales" rather than "Cards for Sales").
  const subjectTypeName = subject && subjectTypeId ? getObjectType(subjectTypeId)?.name?.toLowerCase() : null;
  const tooltipTitle = [feature, subjectTypeName, subject].filter(Boolean).join(' ');

  return (
    <Card.Header className='gap-1'>
      <div className='flex min-w-0 items-start gap-2'>
        {(featureIcon || beta) && (
          <div className='flex shrink-0 flex-col items-center gap-1 text-foreground'>
            {featureIcon && <span className='[&_svg]:size-7'>{featureIcon}</span>}
            {beta && (
              // Nudge the chip down so it sits on the subtitle/actions row in the
              // adjacent column; the two columns flow independently, so this is a
              // static offset rather than a shared baseline.
              <Chip className='mt-0.5 shrink-0' color='accent' size='sm' variant='soft'>
                Beta
              </Chip>
            )}
          </div>
        )}
        <div className='flex min-w-0 flex-1 flex-col gap-1'>
          {hasTitleRow && (
            <div className='flex min-w-0 items-center gap-1.5 pr-8'>
              <Tooltip>
                <Tooltip.Trigger className='min-w-0'>
                  <Card.Title className='line-clamp-1'>
                    {feature && <span className='font-normal'>{feature} </span>}
                    {subjectTypeId && (
                      <ObjectTypeIcon className='mr-1 inline-block align-text-bottom' size={16} typeId={subjectTypeId} />
                    )}
                    {subject && <span className='font-semibold'>{subject}</span>}
                  </Card.Title>
                </Tooltip.Trigger>
                <Tooltip.Content className='max-w-60'>{tooltipTitle}</Tooltip.Content>
              </Tooltip>
            </div>
          )}
          {hasSubtextRow && (
            <div className='flex min-w-0 items-center justify-between gap-2'>
              <div className='flex min-w-0 flex-1 items-center gap-1.5'>
                {subtextTypeId && <ObjectTypeIcon className='shrink-0' size={16} typeId={subtextTypeId} />}
                {subtext && (
                  // Always tooltipped so a subtext truncated by the action buttons stays readable;
                  // a longer-than-default delay keeps it from popping on incidental hovers.
                  <Tooltip delay={700}>
                    <Tooltip.Trigger className='min-w-0 flex-1'>
                      <div className='truncate text-xs text-muted'>{parseMarkdownBold(subtext)}</div>
                    </Tooltip.Trigger>
                    <Tooltip.Content className='max-w-60'>{stripMarkdownBold(subtext)}</Tooltip.Content>
                  </Tooltip>
                )}
              </div>
              {actions?.length > 0 && (
                <ButtonGroup hideSeparator className='flex shrink-0' size='sm' variant='ghost'>
                  {actions.map(renderAction)}
                </ButtonGroup>
              )}
            </div>
          )}
        </div>
      </div>
      {onClose && (
        <Tooltip>
          <Button
            isIconOnly
            aria-label={closeLabel}
            className='absolute top-1 right-2'
            size='sm'
            variant='ghost'
            onPress={onClose}
          >
            <IconX />
          </Button>
          <Tooltip.Content className='max-w-60'>{closeLabel}</Tooltip.Content>
        </Tooltip>
      )}
      {bottomRow && <div className='flex min-w-0 items-center'>{bottomRow}</div>}
    </Card.Header>
  );
}

// Render one header action spec. A truthy `disabledReason` routes through
// DisabledTooltip (disabled-looking but still hoverable, so the reason shows);
// otherwise a normal Tooltip + ghost icon button.
function renderAction(action) {
  if (action.disabledReason) {
    return (
      <DisabledTooltip content={action.disabledReason} key={action.key} placement='bottom'>
        <Button isIconOnly aria-label={action.ariaLabel ?? action.tooltip} size='sm' variant='ghost'>
          {action.icon}
        </Button>
      </DisabledTooltip>
    );
  }
  return (
    <Tooltip key={action.key}>
      <Button
        isIconOnly
        aria-label={action.ariaLabel ?? action.tooltip}
        className={action.isActive ? 'text-accent' : undefined}
        isDisabled={action.isDisabled}
        size='sm'
        variant='ghost'
        onPress={action.onPress}
      >
        {action.icon}
      </Button>
      <Tooltip.Content className='max-w-60' placement='bottom'>
        {action.tooltip}
      </Tooltip.Content>
    </Tooltip>
  );
}
