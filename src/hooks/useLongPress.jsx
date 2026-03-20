import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useRef, useState } from 'react';

const LONG_PRESS_DURATION = 1000;
const LONG_PRESS_SECONDS = LONG_PRESS_DURATION / 1000;

/**
 * Hook that manages long-press hold state and provides the animated overlay.
 * @param {Object} [options]
 * @param {string} [options.color='bg-accent-soft-hover'] - Tailwind background class for the radial fill
 * @returns {{ isHolding: boolean, pressProps: Object, LongPressOverlay: Function }}
 */
export function useLongPress({ color = 'bg-accent-soft-hover' } = {}) {
  const [isHolding, setIsHolding] = useState(false);
  const holdTimeoutRef = useRef(null);

  const onPressStart = useCallback(() => {
    setIsHolding(true);
    holdTimeoutRef.current = setTimeout(() => {
      setIsHolding(false);
    }, LONG_PRESS_DURATION);
  }, []);

  const onPressEnd = useCallback(() => {
    setIsHolding(false);
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
  }, []);

  function LongPressOverlay() {
    return (
      <AnimatePresence>
        {isHolding && (
          <motion.div
            animate={{ opacity: 1 }}
            className='pointer-events-none absolute inset-0 overflow-hidden rounded-md'
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            initial={{ opacity: 0 }}
          >
            <motion.div
              animate={{ scale: 1 }}
              className={`absolute top-1/2 left-1/2 aspect-square w-[200%] -translate-x-1/2 -translate-y-1/2 rounded-full ${color}`}
              initial={{ scale: 0 }}
              transition={{
                duration: LONG_PRESS_SECONDS,
                ease: 'linear'
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  return {
    isHolding,
    LongPressOverlay,
    pressProps: { onPressEnd, onPressStart }
  };
}
