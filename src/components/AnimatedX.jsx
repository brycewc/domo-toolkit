import { motion } from 'motion/react';

export function AnimatedX({
  className = 'text-danger',
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
      <motion.path
        animate={{ pathLength: 1 }}
        d='M18 6l-12 12'
        exit={{ pathLength: 0 }}
        initial={{ pathLength: 0 }}
        transition={{
          duration: 0.3,
          ease: 'easeOut'
        }}
      />
      <motion.path
        animate={{ pathLength: 1 }}
        d='M6 6l12 12'
        exit={{ pathLength: 0 }}
        initial={{ pathLength: 0 }}
        transition={{
          delay: 0.1,
          duration: 0.3,
          ease: 'easeOut'
        }}
      />
    </motion.svg>
  );
}
