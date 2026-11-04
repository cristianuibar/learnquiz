import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { useEffect, useRef, useState, type ComponentProps, type ReactNode, type RefObject } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Skel, SkelLine } from './skeleton'

export type SortDirection = 'ascending' | 'descending'

export type Column<T> = {
  key: string
  header: ReactNode
  /** Plain-text name for data-label (stack mode) and the caption; defaults to header when it is a string. */
  label?: string
  cell: (row: T) => ReactNode
  align?: 'start' | 'end'
  /** Hidden under 1280. */
  hideBelowLg?: boolean
  stack?: 'full' | 'wide' | 'hide'
  sortable?: boolean
  sortOrder?: { ascending: string; descending: string }
  /** Column-group label; consecutive columns sharing it sit under one colgroup header. */
  group?: string
  className?: string
}

const DEFAULT_ORDER = { ascending: 'least first', descending: 'most first' }
const labelOf = (c: { header: ReactNode; label?: string }) => c.label ?? (typeof c.header === 'string' ? c.header : '')

const TH = 'border-b border-border-strong bg-surface-card px-4 py-3 text-[13px]/[18px] font-semibold whitespace-nowrap text-ink-muted max-xl:px-3'
// Sticky on thead so a two-row (grouped) header moves as one block.
const HEAD = 'sticky top-(--dt-top) z-[1]'
const pos = (align?: 'start' | 'end') => (align === 'end' ? 'text-right' : 'text-left')

/** Sortable column header: th with aria-sort (only when sorted) and a 44px button. */
export function SortHeader({ label, direction, onSort, align, disabled, className, ...thProps }: {
  label: ReactNode
  direction?: SortDirection
  onSort: () => void
  align?: 'start' | 'end'
  disabled?: boolean
} & Omit<ComponentProps<'th'>, 'children' | 'onClick' | 'align'>) {
  const Icon = direction === 'ascending' ? ArrowUp : direction === 'descending' ? ArrowDown : ArrowUpDown
  return (
    <th scope="col" role="columnheader" aria-sort={direction} {...thProps} className={cn(TH, pos(align), className)}>
      <button
        type="button"
        onClick={onSort}
        disabled={disabled}
        className={cn('-my-3 inline-flex min-h-11 items-center gap-1 font-[inherit] hover:text-ink', direction && 'text-ink')}
      >
        {label}
        <Icon aria-hidden className="size-4 shrink-0" />
      </button>
    </th>
  )
}

/** Card wrapper that sets the sticky offset (mobile app bar, plus the read-only band when present). */
function Frame({ band, toolbar, footer, scrollRef, region, children }: {
  band?: boolean
  toolbar?: ReactNode
  footer?: ReactNode
  scrollRef?: RefObject<HTMLDivElement | null>
  region?: { scrolls: boolean; label: string }
  children: ReactNode
}) {
  return (
    <div className={cn('rounded-md border border-border bg-surface-card', band ? '[--dt-top:48px] max-lg:[--dt-top:104px]' : '[--dt-top:0px] max-lg:[--dt-top:56px]')}>
      {toolbar}
      <div
        ref={scrollRef}
        // Scrolling only when the table overflows: a scroll container would stop the header sticking to the page.
        {...(region?.scrolls ? { className: 'overflow-x-auto', tabIndex: 0, role: 'region', 'aria-label': region.label } : {})}
      >
        {children}
      </div>
      {footer}
    </div>
  )
}

const TABLE = 'w-full border-separate border-spacing-0 text-[14px]/[20px] tabular-nums'

export function DataTable<T>({ caption, columns, rows, rowKey, stack, sort, onSort, selection, actions, band, toolbar, footer, empty, loading }: {
  caption: string
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  stack?: boolean
  sort?: { key: string; direction: SortDirection }
  onSort?: (key: string) => void
  selection?: { selected: ReadonlySet<string>; onToggle: (key: string) => void; onToggleAll: () => void; rowLabel: (row: T) => string; selectable?: (row: T) => boolean; allLabel?: string }
  actions?: (row: T) => ReactNode
  band?: boolean
  toolbar?: ReactNode
  footer?: ReactNode
  empty?: ReactNode
  /** Placeholder rows in the real frame and header; sorting is disabled. */
  loading?: { rows: number; status: string }
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrolls, setScrolls] = useState(false)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => setScrolls(el.scrollWidth > el.clientWidth)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => ro.disconnect()
  }, [rows.length, columns.length])

  const sortCol = columns.find((c) => c.key === sort?.key)
  const sortedNote = !loading && sort && sortCol
    ? `, sorted by ${labelOf(sortCol).toLowerCase()}, ${(sortCol.sortOrder ?? DEFAULT_ORDER)[sort.direction]}`
    : ''
  const grouped = columns.some((c) => c.group)
  const pickable = selection?.selectable ? rows.filter(selection.selectable) : rows
  const allSelected = !!selection && pickable.length > 0 && pickable.every((r) => selection.selected.has(rowKey(r)))
  const rowSpan = grouped ? 2 : undefined

  const headCell = (c: Column<T>, span?: number) =>
    c.sortable ? (
      <SortHeader
        key={c.key}
        label={c.header}
        align={c.align}
        direction={sort?.key === c.key ? sort.direction : undefined}
        onSort={() => onSort?.(c.key)}
        disabled={!!loading}
        rowSpan={span}
        className={cn(c.hideBelowLg && 'dt-hide-lg max-xl:hidden', c.className)}
      />
    ) : (
      <th key={c.key} scope="col" role="columnheader" rowSpan={span} className={cn(TH, pos(c.align), c.hideBelowLg && 'dt-hide-lg max-xl:hidden', c.className)}>
        {c.header}
      </th>
    )

  // Group row: runs of equal group share one colgroup th; ungrouped columns span both header rows.
  const groupRow: ReactNode[] = []
  if (grouped) {
    for (let i = 0; i < columns.length; ) {
      const c = columns[i]
      if (!c.group) { groupRow.push(headCell(c, 2)); i++; continue }
      let j = i
      while (j < columns.length && columns[j].group === c.group) j++
      groupRow.push(
        <th key={`g-${c.key}`} scope="colgroup" role="columnheader" colSpan={j - i} className={cn(TH, 'border-b-0 pb-0 text-center')}>
          {c.group}
        </th>,
      )
      i = j
    }
  }

  const fixedHead = (key: string, node: ReactNode, cls?: string) => (
    <th key={key} scope="col" role="columnheader" rowSpan={rowSpan} className={cn(TH, cls)}>{node}</th>
  )
  const lead = selection && fixedHead('select', (
    <label className="-my-3 flex min-h-11 min-w-11 items-center justify-center">
      <input
        type="checkbox"
        aria-label={selection.allLabel ?? `Select all ${rows.length} on this page`}
        checked={allSelected}
        onChange={selection.onToggleAll}
        className="size-5 accent-brand"
      />
    </label>
  ), 'w-14 px-0')
  const trail = actions && fixedHead('actions', <span className="sr-only">Actions</span>, 'w-14')

  const td = 'h-14 border-b border-border px-4 py-2.5 group-last/row:border-b-0 max-xl:px-3'
  const stackTd = 'max-md:block max-md:h-auto max-md:border-0 max-md:p-0 max-md:text-left'
  const stackLabel = 'max-md:before:block max-md:before:content-[attr(data-label)] max-md:before:text-[13px]/[18px] max-md:before:font-medium max-md:before:text-ink-muted'

  return (
    <Frame band={band} toolbar={toolbar} footer={footer} scrollRef={scrollRef} region={{ scrolls, label: caption }}>
      <table role="table" aria-busy={loading ? 'true' : undefined} className={cn(TABLE, stack && 'max-md:block')}>
        <caption className="sr-only">{caption + sortedNote}</caption>
        <thead role="rowgroup" className={cn(HEAD, stack && 'max-md:sr-only')}>
          <tr role="row">
            {lead}
            {grouped ? groupRow : columns.map((c) => headCell(c))}
            {trail}
          </tr>
          {grouped && (
            <tr role="row">
              {columns.filter((c) => c.group).map((c) => headCell(c))}
            </tr>
          )}
        </thead>
        {loading ? (
          <tbody role="rowgroup" aria-hidden="true">
            {Array.from({ length: loading.rows }, (_, i) => (
              <tr key={i} role="row" className="group/row">
                {columns.map((c, j) => (
                  <td key={c.key} role="cell" className={cn(td, c.align === 'end' && 'text-right', c.hideBelowLg && 'dt-hide-lg max-xl:hidden', c.className)}>
                    {j === 0 ? (
                      <div className="flex flex-col gap-1.5">
                        <Skel className={cn('h-3.5', ['w-40', 'w-32', 'w-48', 'w-36'][i % 4])} />
                        <SkelLine className="max-xl:hidden w-1/3" />
                      </div>
                    ) : (
                      <Skel className={cn('h-3 w-10', c.align === 'end' && 'ml-auto')} />
                    )}
                  </td>
                ))}
                {actions && <td role="cell" className={td} />}
              </tr>
            ))}
          </tbody>
        ) : (
        <tbody role="rowgroup" className={cn(stack && 'max-md:block')}>
          {rows.length === 0 && empty}
          {rows.map((row) => {
            const key = rowKey(row)
            const pick = !selection || (selection.selectable?.(row) ?? true)
            const selected = pick && !!selection?.selected.has(key)
            const bg = selected ? 'bg-brand-tint' : cn('group-hover/row:bg-row-hover', stack && 'max-md:group-hover/row:bg-transparent')
            return (
              <tr
                key={key}
                role="row"
                aria-selected={selection && pick ? selected : undefined}
                className={cn('group/row', stack && 'max-md:grid max-md:grid-cols-3 max-md:gap-x-3 max-md:gap-y-2 max-md:border-b max-md:border-border max-md:px-4 max-md:py-3 max-md:last:border-b-0', stack && selected && 'max-md:bg-brand-tint')}
              >
                {selection && (
                  <td role="cell" className={cn(td, 'px-0', bg, stack && 'max-md:col-span-2 max-md:block max-md:h-auto max-md:border-0 max-md:p-0')}>
                    {pick && (
                      <label className="flex min-h-11 max-md:justify-start min-w-11 items-center justify-center">
                        <input
                          type="checkbox"
                          aria-label={`Select ${selection.rowLabel(row)}`}
                          checked={selected}
                          onChange={() => selection.onToggle(key)}
                          className="size-5 accent-brand"
                        />
                      </label>
                    )}
                  </td>
                )}
                {columns.map((c) => (
                  <td
                    key={c.key}
                    role="cell"
                    data-label={labelOf(c)}
                    className={cn(
                      td, bg, c.align === 'end' && 'text-right', c.hideBelowLg && 'dt-hide-lg max-xl:hidden', c.className,
                      stack && [stackTd, stackLabel, c.stack === 'full' && 'max-md:col-span-full', c.stack === 'wide' && 'max-md:col-span-2', c.stack === 'hide' && 'max-md:hidden'],
                    )}
                  >
                    {c.cell(row)}
                  </td>
                ))}
                {actions && (
                  <td role="cell" className={cn(td, 'text-right', bg, stack && 'max-md:col-start-3 max-md:row-start-1 max-md:block max-md:h-auto max-md:border-0 max-md:p-0')}>
                    {actions(row)}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
        )}
      </table>
      {loading && <p role="status" className="sr-only">{loading.status}</p>}
    </Frame>
  )
}

/** Loading state: same frame and header, placeholder rows hidden from AT, one polite status message. */
export function TableSkeleton({ caption, columns, rows = 3, status, band }: {
  caption: string
  columns: { key: string; header: ReactNode; align?: 'start' | 'end'; className?: string }[]
  rows?: number
  status: string
  band?: boolean
}) {
  return (
    <Frame band={band}>
      <table role="table" aria-busy="true" className={TABLE}>
        <caption className="sr-only">{caption}</caption>
        <thead role="rowgroup" className={HEAD}>
          <tr role="row">
            {columns.map((c) => (
              <th key={c.key} scope="col" role="columnheader" className={cn(TH, pos(c.align), c.className)}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup" aria-hidden="true">
          {Array.from({ length: rows }, (_, i) => (
            <tr key={i} role="row" className="group/row">
              {columns.map((c, j) => (
                <td key={c.key} role="cell" className={cn('h-14 border-b border-border px-4 py-2.5 group-last/row:border-b-0 max-xl:px-3', c.className)}>
                  {j === 0 ? <SkelLine className="w-3/4" /> : <Skel className={cn('h-3', c.align === 'end' ? 'ml-auto w-10' : 'w-1/2')} />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p role="status" className="sr-only">{status}</p>
    </Frame>
  )
}

/** Empty result row: message plus a Clear filters action that returns focus to the search field. */
export function NoResults({ colSpan, children, clearLabel = 'Clear filters', onClear, searchRef }: {
  colSpan: number
  children: ReactNode
  clearLabel?: string
  onClear: () => void
  searchRef: RefObject<HTMLInputElement | null>
}) {
  return (
    <tr role="row">
      <td role="cell" colSpan={colSpan} className="px-4 py-12 text-center">
        <div role="status" className="flex flex-col items-center gap-4">
          <p className="text-ink">{children}</p>
          <Button variant="secondary" onClick={() => { onClear(); searchRef.current?.focus() }}>{clearLabel}</Button>
        </div>
      </td>
    </tr>
  )
}

/** Dash for a value that does not exist yet; the label says why. */
export function NullCell({ label }: { label: string }) {
  return (
    <>
      <span aria-hidden className="text-ink-muted">—</span>
      <span className="sr-only">{label}</span>
    </>
  )
}
