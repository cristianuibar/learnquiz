import { Ellipsis, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'

export type RowMenuItem = { label: string; icon?: LucideIcon; onSelect: () => void; separatorBefore?: boolean }

/** Per-row actions menu (menu button pattern): roving focus, Escape/Tab close, flips upward near the viewport bottom. */
export function RowMenu({ label, items, menuLabel }: { label: string; items: RowMenuItem[]; menuLabel?: string }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [up, setUp] = useState(false)
  const [start, setStart] = useState<'first' | 'last'>('first')
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const entries = () => Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])

  const show = (at: 'first' | 'last') => {
    const r = trigger.current!.getBoundingClientRect()
    setUp(window.innerHeight - r.bottom < 240)
    setStart(at)
    setOpen(true)
  }
  const close = (refocus: boolean) => {
    setOpen(false)
    if (refocus) trigger.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const list = entries()
    list[start === 'last' ? list.length - 1 : 0]?.focus()
    const away = (e: PointerEvent) => {
      const t = e.target as Node
      if (!menu.current?.contains(t) && !trigger.current?.contains(t)) close(false)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open, start])

  const onTriggerKey = (e: KeyboardEvent) => {
    // Enter/Space already reach onClick natively.
    if (open || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return
    e.preventDefault()
    show(e.key === 'ArrowUp' ? 'last' : 'first')
  }
  const onMenuKey = (e: KeyboardEvent) => {
    const list = entries()
    const i = list.indexOf(document.activeElement as HTMLElement)
    const moves: Partial<Record<string, number>> = { ArrowDown: (i + 1) % list.length, ArrowUp: (i - 1 + list.length) % list.length, Home: 0, End: list.length - 1 }
    const go = moves[e.key]
    if (go !== undefined) { e.preventDefault(); list[go]?.focus() }
    else if (e.key === 'Escape') { e.preventDefault(); close(true) }
    else if (e.key === 'Tab') close(false)
  }

  return (
    <div className={cn('relative inline-block', up && 'opens-up')}>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`More actions for ${label}`}
        className="inline-flex size-11 items-center justify-center rounded-md text-ink hover:bg-surface-sunken"
        onClick={() => (open ? close(false) : show('first'))}
        onKeyDown={onTriggerKey}
      >
        <Ellipsis aria-hidden className="size-5" />
      </button>
      {open && (
        <div
          ref={menu}
          id={id}
          role="menu"
          aria-label={menuLabel ?? 'Actions'}
          onKeyDown={onMenuKey}
          className={cn(
            'absolute right-0 z-[15] flex min-w-[200px] flex-col rounded-md border border-border bg-surface-card p-1.5 shadow-raised',
            up ? 'bottom-[calc(100%+4px)] top-auto' : 'top-[calc(100%+4px)]',
          )}
        >
          {items.map(({ label: text, icon: Icon, onSelect, separatorBefore }) => (
            <div key={text} className="contents">
              {separatorBefore && <div role="separator" className="my-1.5 border-t border-border" />}
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                className="flex min-h-11 items-center gap-3 rounded-[6px] px-3 text-left text-[14px]/[20px] font-medium text-ink hover:bg-surface-sunken"
                onClick={() => { close(true); onSelect() }}
              >
                {Icon && <Icon aria-hidden className="size-5 shrink-0 text-ink-muted" />}
                {text}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
