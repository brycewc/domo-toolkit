import { motion } from 'motion/react';

/**
 * AnimatedCheck - A checkmark icon that animates with a drawing effect
 *
 * Uses motion to animate the stroke being drawn from left to right,
 * mimicking HeroUI's built-in checkmark animation style.
 *
 * @param {Object} props - Component props (passed to SVG element)
 * @param {number} [props.stroke=1.5] - Stroke width (matches Tabler icons default)
 * @param {string} [props.className] - Additional CSS classes
 */
export function AnimatedCheck({ stroke = 1.5, className = '', ...props }) {
  return (
    <motion.svg
      xmlns='http://www.w3.org/2000/svg'
      width='24'
      height='24'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth={stroke}
      strokeLinecap='round'
      strokeLinejoin='round'
      className={className}
      {...props}
    >
      <motion.polyline
        points='5 12 10 17 20 7'
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{
          duration: 0.3,
          ease: 'easeOut'
        }}
      />
    </motion.svg>
  );
}
