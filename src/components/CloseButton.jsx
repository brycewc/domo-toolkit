import { CloseButton as HeroCloseButton } from '@heroui/react';
import { IconX } from '@tabler/icons-react';

export function CloseButton({ children, ...props }) {
  return (
    <HeroCloseButton {...props}>
      {children ?? <IconX stroke={1.5} />}
    </HeroCloseButton>
  );
}
