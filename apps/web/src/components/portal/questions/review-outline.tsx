import { type MouseEvent, type ReactNode, useEffect, useState } from 'react'
import type { Review } from './question-row'

type Mode = 'all' | 'unreviewed' | 'flagged'

const linkClass =
  'flex min-h-11 items-center justify-between gap-2 rounded-md py-1.5 pr-3 pl-6 text-[14px]/[20px] font-medium text-ink no-underline hover:bg-surface-sunken aria-[current]:bg-brand-tint aria-[current]:font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

const countText = (n: number, mode: Mode) => (mode === 'all' ? String(n) : `${n} ${mode}`)

export function ReviewLayout({ units, mode, children }: { units: Review['units']; mode: Mode; children: ReactNode }) {
  const ids = units.flatMap((u) => u.concepts.map((c) => c.id))
  const key = ids.join('|')
  const [active, setActive] = useState<string>()
  const current = active !== undefined && ids.includes(active) ? active : ids[0]

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const seen = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = e.target.id.slice('concept-'.length)
          if (e.isIntersecting) seen.add(id)
          else seen.delete(id)
        }
        const first = key.split('|').find((id) => seen.has(id))
        if (first) setActive(first)
      },
      { rootMargin: '0px 0px -60% 0px' },
    )
    for (const id of key ? key.split('|') : []) {
      const el = document.getElementById(`concept-${id}`)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [key])

  const go = (id: string) => (e: MouseEvent) => {
    e.preventDefault()
    const el = document.getElementById(`concept-${id}`)
    if (!el) return
    if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'start' })
    el.focus()
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
