import { motion } from 'motion/react';

/**
 * AnimatedCheck - A checkmark icon that animates with a drawing effect
 *
 * Uses motion to animate the stroke being drawn from left to right,
 * mimicking HeroUI's built-in checkmark animation style.
 *
 * @param {Object} props - Component props (passed to SVG element)
 * @param {number} [props.stroke=1.5] - Stroke width
 * @param {string} [props.className] - Additional CSS classes
 */
export function AnimatedCheck({
  className = 'text-success',
  stroke = 1.5,
  ...props
}) {
  return (
    <motion.svg
      className={className}
      fill='none'
      height='24'
      stroke='currentColor'
      strokeLinecap='round'
      strokeLinejoin='round'
      strokeWidth={stroke}
      viewBox='0 0 24 24'
      width='24'
      xmlns='http://www.w3.org/2000/svg'
      {...props}
    >
      <motion.polyline
        animate={{ pathLength: 1 }}
        exit={{ pathLength: 0 }}
        initial={{ pathLength: 0 }}
        points='5 12 10 17 20 7'
        transition={{
          duration: 0.3,
          ease: 'easeOut'
        }}
      />
    </motion.svg>
  );
}
