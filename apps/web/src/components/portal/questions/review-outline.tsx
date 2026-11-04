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
  const clicked = useRef<string>(undefined)

  // The current concept is the last one whose heading has passed the reading line (40% down the
  // viewport). At the end of the page the last headings can never reach that line, so the last
  // heading in view is current. A clicked concept stays current while its heading is in view,
  // until the reader scrolls on their own. It is measured on load and whenever the filtered list
  // changes, since either can move headings past the line without a scroll.
  useEffect(() => {
    const list = units.flatMap((u) => u.concepts.map((c) => c.id))
    const top = (id: string) => document.getElementById(`concept-${id}`)?.getBoundingClientRect().top
    const update = () => {
      const h = window.innerHeight
      const pin = clicked.current === undefined ? undefined : top(clicked.current)
      if (pin !== undefined && pin >= 0 && pin < h) return
      clicked.current = undefined
      const end = window.scrollY > 0 && h + window.scrollY >= document.documentElement.scrollHeight - 1
      const line = end ? h : h * 0.4
      const next = [...list].reverse().find((id) => (top(id) ?? Infinity) < line)
      setActive(next)
    }
    const release = () => {
      clicked.current = undefined
    }
    const events = [['scroll', update], ['resize', update], ['wheel', release], ['touchmove', release], ['keydown', release]] as const
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
    clicked.current = id
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
                <span className="text-caption text-ink-muted tabular-nums">
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
                      <span className="text-caption text-ink-muted tabular-nums">
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
