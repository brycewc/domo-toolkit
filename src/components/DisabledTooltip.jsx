import { Tooltip } from '@heroui/react';
import { cloneElement } from 'react';

// Wraps a single HeroUI control (typically a Button) that should look and behave
// as disabled, while STILL showing a tooltip and the not-allowed cursor on hover.
//
// The catch: HeroUI can't give you an accessibly-disabled button that is also
// hoverable through props alone. Its Button stylesheet applies `status-disabled`
// (which includes `pointer-events: none`) for BOTH the native `:disabled` state
// and `[aria-disabled="true"]`. So `isDisabled` (native `disabled`) or a plain
// `aria-disabled` both suppress hover, which kills the tooltip and lets the
// cursor fall through to whatever is behind the element.
//
// So we keep `aria-disabled` (it stays announced as disabled to assistive tech)
// but re-enable pointer events with an `!important` utility, overriding only the
// one declaration that breaks hover. The dim and not-allowed cursor still come
// from HeroUI's own `status-disabled` (via `--disabled-opacity` /
// `--cursor-disabled`), so the look matches every other disabled control in the
// app, and the press is neutralized with a no-op handler.
//
// Props are injected onto the existing child via cloneElement rather than
// wrapping it in a new element, so a button inside a ButtonGroup keeps its
// grouped styling (rounded ends, dividers), which targets sibling buttons in the
// DOM. HeroUI's Tooltip root renders no DOM of its own, so the child stays a
// direct DOM sibling.
//
// Usage:
//   <DisabledTooltip content='Set a default Domo instance in settings'>
//     <Button fullWidth isIconOnly variant='tertiary'>
//       <IconArrowSquareOut />
//     </Button>
//   </DisabledTooltip>
export function DisabledTooltip({ children, className, content, contentClassName, delay = 200, offset = 4, placement }) {
  const trigger = cloneElement(children, {
    'aria-disabled': true,
    'className': ['pointer-events-auto!', children.props.className, className].filter(Boolean).join(' '),
    'onPress': () => {}
  });

  return (
    <Tooltip delay={delay}>
      {trigger}
      <Tooltip.Content className={contentClassName ?? DEFAULT_CONTENT_CLASSNAME} offset={offset} placement={placement}>
        {content}
      </Tooltip.Content>
    </Tooltip>
  );
}

// The centered, balanced layout for tooltip content now comes from the global
// `.tooltip` default (see global.css). This only caps the width narrower than
// that default's inherited max-w-xs, matching the action-button tooltips.
const DEFAULT_CONTENT_CLASSNAME = 'max-w-60';
