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

export function ToastProvider(props) {
  return (
    <Toast.Provider {...props}>
      {({ toast: toastItem }) => {
        const {
          actionProps,
          description,
          indicator,
          isLoading,
          title,
          variant
        } = toastItem.content ?? {};

        return (
          <Toast toast={toastItem} variant={variant}>
            {indicator === null ? null : (
              <ToastIndicator variant={variant}>
                {isLoading ? <Spinner color='current' size='sm' /> : indicator}
              </ToastIndicator>
            )}
            <ToastContent>
              {!!title && <ToastTitle>{title}</ToastTitle>}
              {!!description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </ToastContent>
            {actionProps?.children && (
              <ToastActionButton {...actionProps}>
                {actionProps.children}
              </ToastActionButton>
            )}
            <ToastCloseButton />
          </Toast>
        );
      }}
    </Toast.Provider>
  );
}
