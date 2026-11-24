import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { motion, type HTMLMotionProps } from 'motion/react'
import { cn } from '@/lib/utils'
import { spring } from '@/lib/springs'

type Props = Omit<HTMLMotionProps<'button'>, 'children'> & {
  label: string
  children: ReactNode
  active?: boolean
  size?: 'sm' | 'md'
} & Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'>

/** Small round button with a springy press. */
export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { label, children, className, active, size = 'md', disabled, ...rest },
  ref
) {
  return (
    <motion.button
      ref={ref}
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.92 }}
      transition={spring.snappy}
      className={cn(
        'no-drag inline-flex items-center justify-center rounded-[6px] text-faint transition-colors hover:bg-hover hover:text-text disabled:opacity-30 disabled:hover:bg-transparent',
        size === 'sm' ? 'h-6 w-6' : 'h-7 w-7',
        active && 'bg-active text-text',
        className
      )}
      {...rest}
    >
      {children}
    </motion.button>
  )
})
