import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/admin/field-error'
import { cn } from '@/lib/utils'

const DAY_MS = 86_400_000
const WEEKDAYS = [
  ['Su', 'Sunday'],
  ['Mo', 'Monday'],
  ['Tu', 'Tuesday'],
  ['We', 'Wednesday'],
  ['Th', 'Thursday'],
  ['Fr', 'Friday'],
  ['Sa', 'Saturday'],
] as const

const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`)
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const addDays = (d: string, n: number) => fromMs(toMs(d) + n * DAY_MS)
const monthStart = (d: string) => `${d.slice(0, 7)}-01`
const daysInMonth = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate()
const pad = (n: number) => String(n).padStart(2, '0')

/** Shift by whole months, clamping the day to the target month's length. */
function addMonths(d: string, n: number) {
  const y = Number(d.slice(0, 4))
  const m0 = Number(d.slice(5, 7)) - 1 + n
  const ty = y + Math.floor(m0 / 12)
  const tm = ((m0 % 12) + 12) % 12
  const day = Math.min(Number(d.slice(8, 10)), daysInMonth(ty, tm))
  return `${String(ty).padStart(4, '0')}-${pad(tm + 1)}-${pad(day)}`
}

const fmt = (d: string, o: Intl.DateTimeFormatOptions) =>
  new Date(toMs(d)).toLocaleDateString('en-US', { ...o, timeZone: 'UTC' })
const short = (d: string) => fmt(d, { month: 'short', day: 'numeric' })
const withYear = (d: string) => fmt(d, { month: 'short', day: 'numeric', year: 'numeric' })
const long = (d: string) => fmt(d, { month: 'long', day: 'numeric', year: 'numeric' })
const monthLabel = (d: string) => fmt(d, { month: 'long', year: 'numeric' })

function triggerLabel(from: string, to: string) {
  return from.slice(0, 4) === to.slice(0, 4)
    ? `${short(from)} – ${withYear(to)}`
    : `${withYear(from)} – ${withYear(to)}`
}

const spanDays = (a: string, b: string) => Math.round((toMs(b) - toMs(a)) / DAY_MS) + 1

export function DateRange({
  from,
  to,
  max,
  maxDays = 365,
  onApply,
}: {
  from: string
  to: string
  max: string
  maxDays?: number
  onApply: (range: { from: string; to: string }) => void
}) {
  const uid = useId()
  const dialogId = `${uid}-dialog`
  const errorId = `${uid}-span`
  const [open, setOpen] = useState(false)
  const [start, setStart] = useState<string | null>(from)
  const [end, setEnd] = useState<string | null>(to)
  const [focused, setFocused] = useState(from)
  const [rightMonth, setRightMonth] = useState(monthStart(to))
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const moveFocus = useRef(false)

  const close = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  const openPicker = () => {
    setStart(from)
    setEnd(to)
    // Focus the start day, or the end day when the start falls before the two shown months.
    const right = monthStart(to)
    setFocused(monthStart(from) < addMonths(right, -1) ? to : from)
    setRightMonth(right)
    moveFocus.current = true
    setOpen(true)
  }

  // Move DOM focus to the roving day after open and after keyboard moves.
  useEffect(() => {
    if (!open || !moveFocus.current) return
    moveFocus.current = false
    wrapRef.current?.querySelector<HTMLButtonElement>(`button[data-date="${focused}"]`)?.focus()
  })

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const leftMonth = addMonths(rightMonth, -1)
  const maxMonth = monthStart(max)

  const focusDate = (raw: string) => {
    const next = raw > max ? max : raw
    const m = monthStart(next)
    if (m < leftMonth) setRightMonth(addMonths(m, 1))
    else if (m > rightMonth) setRightMonth(m)
    setFocused(next)
    moveFocus.current = true
  }

  const page = (delta: number) => {
    const nextRight = addMonths(rightMonth, delta)
    setRightMonth(nextRight)
    const m = monthStart(focused)
    if (m < addMonths(nextRight, -1) || m > nextRight) {
      const moved = addMonths(focused, delta)
      setFocused(moved > max ? max : moved)
    }
  }

  const onDayKey = (e: KeyboardEvent<HTMLButtonElement>, d: string) => {
    const dow = new Date(toMs(d)).getUTCDay()
    let next: string | null = null
    switch (e.key) {
      case 'ArrowLeft': next = addDays(d, -1); break
      case 'ArrowRight': next = addDays(d, 1); break
      case 'ArrowUp': next = addDays(d, -7); break
      case 'ArrowDown': next = addDays(d, 7); break
      case 'Home': next = addDays(d, -dow); break
      case 'End': next = addDays(d, 6 - dow); break
      case 'PageUp': next = addMonths(d, -1); break
      case 'PageDown': next = addMonths(d, 1); break
    }
    if (!next) return
    e.preventDefault()
    focusDate(next)
  }

  const pick = (d: string) => {
    if (start && !end) {
      if (d >= start) setEnd(d)
      else setStart(d)
    } else {
      setStart(d)
      setEnd(null)
    }
    setFocused(d)
  }

  const complete = start !== null && end !== null
  const days = complete ? spanDays(start, end) : 0
  const tooLong = complete && days > maxDays
  const errorText = tooLong ? `Choose at most ${maxDays} days.` : undefined

  let summary = 'Choose a start date'
  if (start && !end) summary = `${short(start)} – choose an end date`
  else if (complete) summary = `${short(start)} – ${short(end)} · ${days} ${days === 1 ? 'day' : 'days'}`

  const renderMonth = (month: string, side: 'left' | 'right') => {
    const y = Number(month.slice(0, 4))
    const m0 = Number(month.slice(5, 7)) - 1
    const lead = new Date(Date.UTC(y, m0, 1)).getUTCDay()
    const count = daysInMonth(y, m0)
    const cells: (number | null)[] = [
      ...Array<null>(lead).fill(null),
      ...Array.from({ length: count }, (_, i) => i + 1),
    ]
    while (cells.length % 7) cells.push(null)
    const rows: (number | null)[][] = []
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))
    const labelId = `${uid}-${side}-label`
    const nextDisabled = rightMonth >= maxMonth

    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          {side === 'left' ? (
            <Button type="button" variant="ghost" size="icon" aria-label="Previous month" onClick={() => page(-1)} className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
              <ChevronLeft aria-hidden />
            </Button>
          ) : (
            <span className="size-12" />
          )}
          <p id={labelId} className="text-label text-ink">{monthLabel(month)}</p>
          {side === 'right' ? (
            <Button type="button" variant="ghost" size="icon" aria-label="Next month" disabled={nextDisabled} onClick={() => page(1)} className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
              <ChevronRight aria-hidden />
            </Button>
          ) : (
            <span className="size-12" />
          )}
        </div>
        <table role="grid" aria-labelledby={labelId} className="border-separate border-spacing-y-0.5 tabular-nums">
          <thead>
            <tr>
              {WEEKDAYS.map(([abbr, full]) => (
                <th key={abbr} scope="col" abbr={full} className="h-6 w-11 text-caption font-medium text-ink-muted">
                  {abbr}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((n, ci) => {
                  if (n === null) return <td key={ci} />
                  const d = `${month.slice(0, 7)}-${pad(n)}`
                  const unavailable = d > max
                  const isStart = d === start
                  const isEnd = d === end
                  const inRange = !!start && !!end && d > start && d < end
                  const parts = [long(d)]
                  if (unavailable) parts.push('unavailable')
                  else {
                    if (isStart) parts.push('start')
                    if (isEnd) parts.push('end')
                    if (inRange) parts.push('in range')
                  }
                  const edge = isStart || isEnd
                  return (
                    <td key={ci} role="gridcell" className="p-0">
                      <button
                        type="button"
                        data-date={d}
                        tabIndex={d === focused ? 0 : -1}
                        disabled={unavailable}
                        aria-label={parts.join(', ')}
                        aria-pressed={edge ? true : undefined}
                        onClick={() => pick(d)}
                        onKeyDown={(e) => onDayKey(e, d)}
                        className={cn(
                          'flex size-11 items-center justify-center text-label tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                          unavailable && 'cursor-not-allowed text-ink-muted',
                          !unavailable && !edge && !inRange && 'rounded-md text-ink hover:bg-surface-sunken',
                          inRange && 'rounded-none bg-brand-tint text-ink',
                          edge && 'rounded-md bg-brand font-semibold text-on-brand',
                        )}
                      >
                        {n}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div ref={wrapRef} className="relative inline-block">
      <Button
        ref={triggerRef}
        type="button"
        variant="secondary"
        className="tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        onClick={() => (open ? close() : openPicker())}
      >
        <CalendarDays aria-hidden />
        <span className="sr-only">Custom range: </span>
        {triggerLabel(from, to)}
      </Button>
      {open && (
        <div
          id={dialogId}
          role="dialog"
          aria-label="Choose dates"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              close()
            }
          }}
          className="absolute right-0 top-full z-20 mt-2 flex flex-col gap-3 rounded-md border border-border bg-surface-card p-4 shadow-raised"
        >
          <div className="flex gap-8">
            {renderMonth(leftMonth, 'left')}
            {renderMonth(rightMonth, 'right')}
          </div>
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            {errorText && <FieldError id={errorId}>{errorText}</FieldError>}
            <div className="flex items-center justify-between gap-3">
              <p role="status" className="text-label tabular-nums text-ink">
                {summary}
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
                <Button
                  type="button"
                  variant="primary"
                  disabled={!complete || tooLong}
                  onClick={() => {
                    if (!start || !end) return
                    onApply({ from: start, to: end })
                    close()
                  }}
                >
                  Apply
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
