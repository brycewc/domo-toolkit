import { CloseButton as HeroCloseButton } from '@heroui/react';

import IconX from '@icons/x.svg?react';
export function CloseButton({ children, ...props }) {
  return (
    <HeroCloseButton {...props}>
      {children ?? <IconX />}
    </HeroCloseButton>
  );
}
