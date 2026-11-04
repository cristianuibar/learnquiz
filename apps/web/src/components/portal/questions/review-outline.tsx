import { type MouseEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import type { Review } from './question-row'

type Mode = 'all' | 'unreviewed' | 'flagged'

const linkClass =
  'flex min-h-11 items-center justify-between gap-2 rounded-md py-1.5 pr-3 pl-6 text-[14px]/[20px] font-medium text-ink no-underline hover:bg-surface-sunken aria-[current]:bg-brand-tint aria-[current]:font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

const countText = (n: number, mode: Mode) => (mode === 'all' ? String(n) : `${n} ${mode}`)

export function ReviewLayout({ units, mode, children }: { units: Review['units']; mode: Mode; children: ReactNode }) {
  const ids = units.flatMap((u) => u.concepts.map((c) => c.id))
  const [active, setActive] = useState<string>()
  const current = active !== undefined && ids.includes(active) ? active : ids[0]
  const clicked = useRef<{ id: string; top: number }>(undefined)

  // The current concept is the last one whose heading has passed the reading line (40% down the
  // viewport). At the end of the page the last headings can never reach that line, so the last
  // heading in view is current. A clicked concept stays current while its heading stays where the
  // click scrolled it, so any scroll of the reader's own (wheel, keys, touch, scrollbar) releases
  // it. It is measured on load and whenever the filtered list changes, since either can move
  // headings past the line without a scroll.
  useEffect(() => {
    const list = units.flatMap((u) => u.concepts.map((c) => c.id))
    const top = (id: string) => document.getElementById(`concept-${id}`)?.getBoundingClientRect().top
    const update = () => {
      const pin = clicked.current
      if (pin && Math.abs((top(pin.id) ?? Infinity) - pin.top) < 1) return
      clicked.current = undefined
      const h = window.innerHeight
      const end = window.scrollY > 0 && h + window.scrollY >= document.documentElement.scrollHeight - 1
      const line = end ? h : h * 0.4
      const next = [...list].reverse().find((id) => (top(id) ?? Infinity) < line)
      setActive(next)
    }
    const events = [['scroll', update], ['resize', update]] as const
    for (const [type, fn] of events) window.addEventListener(type, fn, { passive: true })
    update()
    return () => {
      for (const [type, fn] of events) window.removeEventListener(type, fn)
    }
  }, [units])

  const go = (id: string) => (e: MouseEvent) => {
    e.preventDefault()
    const el = document.getElementById(`concept-${id}`)
    if (!el) return
    if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'start' })
    el.focus()
    clicked.current = { id, top: el.getBoundingClientRect().top }
    setActive(id)
  }

  return (
    <div className="grid items-start gap-8 xl:grid-cols-[240px_minmax(0,1fr)]">
      {units.length === 0 ? (
        <div aria-hidden className="max-xl:hidden" />
      ) : (
        <nav aria-label="Question outline" className="sticky top-4 flex flex-col gap-0.5 max-xl:hidden">
          {units.map((u) => (
            <div key={u.id} className="flex flex-col gap-0.5">
              <p
                id={`outline-u-${u.id}`}
                className="flex min-h-11 items-center justify-between gap-2 px-3 text-[14px]/[20px] font-semibold text-ink"
              >
                {u.name}
                <span className="shrink-0 text-caption whitespace-nowrap text-ink-muted tabular-nums">
                  {countText(u.concepts.reduce((n, c) => n + c.questions.length, 0), mode)}
                </span>
              </p>
              <ul aria-labelledby={`outline-u-${u.id}`} className="flex flex-col gap-0.5">
                {u.concepts.map((c) => (
                  <li key={c.id}>
                    <a
                      href={`#concept-${c.id}`}
                      aria-current={c.id === current ? 'location' : undefined}
                      onClick={go(c.id)}
                      className={linkClass}
                    >
                      <span>{c.name}</span>
                      <span className="shrink-0 text-caption whitespace-nowrap text-ink-muted tabular-nums">
                        {countText(c.questions.length, mode)}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      )}
      <div className="flex min-w-0 flex-col gap-10">{children}</div>
    </div>
  )
}
