import {
  Spinner,
  Toast,
  ToastActionButton,
  ToastCloseButton,
  ToastContent,
  ToastDescription,
  ToastIndicator,
  ToastTitle
} from '@heroui/react';

import IconCheckCircle from '@icons/check-circle.svg?react';
import IconExclamationPointCircle from '@icons/exclamation-point-circle.svg?react';
import IconExclamationTriangle from '@icons/exclamation-triangle.svg?react';
import IconInfoCircle from '@icons/info-circle.svg?react';
import IconX from '@icons/x.svg?react';

export function ToastProvider(props) {
  return (
    <Toast.Provider {...props}>
      {({ toast: toastItem }) => {
        const { actionProps, description, indicator, isLoading, title, variant } = toastItem.content ?? {};

        const indicatorNode =
          indicator === null ? null : (
            <ToastIndicator variant={variant}>
              {isLoading ? <Spinner color='current' size='sm' /> : (indicator ?? defaultIndicatorFor(variant))}
            </ToastIndicator>
          );

        return (
          <Toast toast={toastItem} variant={variant}>
            {/* The indicator rides inside the title, and the description and
                action button sit under it in the same column, so both start at
                the icon's edge rather than indenting to the title's. This is
                the Alert layout (see any `<Alert>` in the views), and it also
                buys the text the full width of a ~320px popup/sidepanel toast.
                A toast with no title keeps the icon as its own column. */}
            {!title && indicatorNode}
            <ToastContent>
              {!!title && (
                <ToastTitle className='flex items-center gap-1'>
                  {indicatorNode}
                  {/* A title parsed from markdown is a list of nodes, so it has
                      to be one flex item or each run becomes its own column. */}
                  <span className='min-w-0'>{title}</span>
                </ToastTitle>
              )}
              {!!description && (
                <ToastDescription className='line-clamp-4 max-h-25 overflow-hidden'>{description}</ToastDescription>
              )}
              {actionProps?.children && <ToastActionButton {...actionProps}>{actionProps.children}</ToastActionButton>}
            </ToastContent>
            <ToastCloseButton>
              <IconX />
            </ToastCloseButton>
          </Toast>
        );
      }}
    </Toast.Provider>
  );
}

// Mirrors HeroUI's built-in getDefaultIcon() variant mapping, but with Domo
// icons so every toast indicator matches the extension's icon set. Tagging each
// icon with data-slot='toast-default-icon' lets HeroUI's own .toast__indicator
// CSS size them (box-content size-4) exactly like its native defaults, the same
// hook AlertStatusIcon uses. Color also comes from the slot (the icons use
// fill='currentColor'); the accent/info case adds text-accent on top.
function defaultIndicatorFor(variant) {
  switch (variant) {
    case 'danger':
      return <IconExclamationPointCircle data-slot='toast-default-icon' />;
    case 'success':
      return <IconCheckCircle data-slot='toast-default-icon' />;
    case 'warning':
      return <IconExclamationTriangle data-slot='toast-default-icon' />;
    default:
      return <IconInfoCircle className='text-accent' data-slot='toast-default-icon' />;
  }
}
