import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_LONG_PRESS_DURATION = 1000;

/**
 * Hook that manages long-press hold state and provides the animated overlay.
 * @param {Object} [options]
 * @param {string} [options.color='bg-accent-soft-hover'] - Tailwind background class for the radial fill
 * @param {number} [options.duration=1000] - How long the press must be held, in milliseconds
 * @param {Function} [options.onComplete] - Called once the press has been held for the full duration
 * @returns {{ isHolding: boolean, pressProps: Object, LongPressOverlay: Function }}
 */
export function useLongPress({
  color = 'bg-accent-soft-hover',
  duration = DEFAULT_LONG_PRESS_DURATION,
  onComplete = null
} = {}) {
  const [isHolding, setIsHolding] = useState(false);
  const holdTimeoutRef = useRef(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const clearHoldTimeout = useCallback(() => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => clearHoldTimeout, [clearHoldTimeout]);

  const onPressStart = useCallback(() => {
    clearHoldTimeout();
    setIsHolding(true);
    holdTimeoutRef.current = setTimeout(() => {
      holdTimeoutRef.current = null;
      setIsHolding(false);
      onCompleteRef.current?.();
    }, duration);
  }, [clearHoldTimeout, duration]);

  const onPressEnd = useCallback(() => {
    setIsHolding(false);
    clearHoldTimeout();
  }, [clearHoldTimeout]);

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
                duration: duration / 1000,
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
