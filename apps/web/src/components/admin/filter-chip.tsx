import type { LucideIcon } from 'lucide-react'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Toggle chip for toolbar filters: label + count, pressed state shown by tint and border (not hue alone). */
export function FilterChip({ pressed, count, icon: Icon, onClick, children, className }: {
  pressed: boolean
  count?: number | string
  icon?: LucideIcon
  onClick: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        // before: stretches the 40px chip to a 44px hit area.
        "relative inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border-strong bg-surface-card px-3 text-[14px]/[20px] font-semibold text-ink before:absolute before:-inset-y-0.5 before:inset-x-0 before:content-[''] aria-pressed:border-brand aria-pressed:bg-brand-tint aria-pressed:[&>svg]:text-brand",
        className,
      )}
    >
      {Icon && <Icon aria-hidden className="size-4 shrink-0" />}
      {children}
      {count !== undefined && <> <span className="tabular-nums text-ink-muted">{count}</span></>}
    </button>
  )
}

/** Selection state for a chip row: 'single' behaves like a radio that can be cleared, 'multi' like checkboxes. */
export function useChipGroup<K extends string>(mode: 'single' | 'multi', initial: K[] = []) {
  const [selected, setSelected] = useState<ReadonlySet<K>>(() => new Set(initial))
  const toggle = useCallback((k: K) => setSelected((prev) => {
    const next = new Set(mode === 'single' ? [] : prev)
    if (!prev.has(k)) next.add(k)
    else if (mode === 'multi') next.delete(k)
    return next
  }), [mode])
  const clear = useCallback(() => setSelected(new Set()), [])
  return useMemo(
    () => ({ selected, isPressed: (k: K) => selected.has(k), toggle, clear }),
    [selected, toggle, clear],
  )
}
