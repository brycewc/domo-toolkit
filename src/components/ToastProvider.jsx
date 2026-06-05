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

        return (
          <Toast toast={toastItem} variant={variant}>
            {indicator === null ? null : (
              <ToastIndicator variant={variant}>
                {isLoading ? <Spinner color='current' size='sm' /> : (indicator ?? defaultIndicatorFor(variant))}
              </ToastIndicator>
            )}
            <ToastContent>
              {!!title && <ToastTitle>{title}</ToastTitle>}
              {!!description && (
                <ToastDescription className='line-clamp-4 max-h-25 overflow-hidden'>{description}</ToastDescription>
              )}
            </ToastContent>
            {actionProps?.children && <ToastActionButton {...actionProps}>{actionProps.children}</ToastActionButton>}
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
