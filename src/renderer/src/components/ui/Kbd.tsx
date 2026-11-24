import { cn } from '@/lib/utils'

export function Kbd({ children, className }: { children: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      {children.split(' ').map((k, i) => (
        <kbd
          key={i}
          className="min-w-[18px] rounded-[4px] border border-hairline px-1 py-px text-center font-mono text-[10px] leading-[14px] text-dim"
        >
          {k}
        </kbd>
      ))}
    </span>
  )
}
