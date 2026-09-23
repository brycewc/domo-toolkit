import { Button } from '@heroui/react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import { useLongPress } from '@/hooks/useLongPress';

const DEFAULT_HOLD_DURATION = 5000;

/**
 * A danger-soft button that fires only after being held for `duration`, filling
 * with solid danger as it goes. Releasing early cancels and resets the fill.
 * @param {Object} props
 * @param {React.ReactNode} props.children - The button label
 * @param {number} [props.duration=5000] - Hold time in milliseconds
 * @param {boolean} [props.isDisabled=false]
 * @param {boolean} [props.isPending=false] - Holds the fill solid while the confirmed action runs
 * @param {Function} props.onConfirm - Called once the hold completes
 * @param {string} [props.size]
 */
export function HoldToConfirmButton({
  children,
  duration = DEFAULT_HOLD_DURATION,
  isDisabled = false,
  isPending = false,
  onConfirm,
  size
}) {
  const prefersReducedMotion = useReducedMotion();
  const { isHolding, pressProps } = useLongPress({ duration, onComplete: onConfirm });

  // 71% of circle()'s reference length is half the diagonal, so the fill reaches the corners as it fires.
  const [hiddenClip, shownClip] = prefersReducedMotion
    ? ['inset(0 100% 0 0)', 'inset(0 0% 0 0)']
    : ['circle(0% at 50% 50%)', 'circle(71% at 50% 50%)'];

  return (
    <Button
      className='relative overflow-hidden'
      isDisabled={isDisabled}
      size={size}
      variant='danger-soft'
      {...(isDisabled || isPending ? {} : pressProps)}
    >
      {children}
      {/* The label is repeated on the fill so it stays readable where the solid
          danger passes over the soft label's danger-colored text. */}
      <AnimatePresence>
        {(isHolding || isPending) && (
          <motion.span
            animate={{ clipPath: shownClip }}
            aria-hidden='true'
            className='pointer-events-none absolute inset-0 flex items-center justify-center bg-danger text-danger-foreground'
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            initial={{ clipPath: hiddenClip }}
            style={{ gap: 'inherit', padding: 'inherit' }}
            transition={{ duration: duration / 1000, ease: 'linear' }}
          >
            {children}
          </motion.span>
        )}
      </AnimatePresence>
    </Button>
  );
}
