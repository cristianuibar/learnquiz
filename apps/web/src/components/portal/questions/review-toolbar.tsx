import { CircleDashed, Flag, Shield } from 'lucide-react'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { FilterChip } from '@/components/admin/filter-chip'
import { SearchField } from '@/components/admin/search-field'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'

export type ReviewStatus = 'live' | 'retired' | 'rejected'
export type ReviewSearch = {
  role?: string
  item?: string
  q?: string
  unreviewed?: true
  flagged?: true
  critical?: true
  status?: ReviewStatus
}
export type FilterPatch = Partial<Pick<ReviewSearch, 'q' | 'unreviewed' | 'flagged' | 'critical' | 'status'>>

export function ReviewToolbar({ search, counts, shown, inputRef, onChange, onClear }: {
  search: ReviewSearch
  inputRef: RefObject<HTMLInputElement | null>
  counts: { unreviewed: number; flagged: number; critical: number }
  shown: number
  onChange: (patch: FilterPatch) => void
  onClear: () => void
}) {
  const urlQ = search.q ?? ''
  const [value, setValue] = useState(urlQ)
  // The last q this field sent; a different q in the URL came from elsewhere (back, forward) and replaces the text.
  const sent = useRef(urlQ)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (urlQ === sent.current) return
    sent.current = urlQ
    setValue(urlQ)
  }, [urlQ])
  useEffect(() => {
    const next = value.trim()
    if (next === sent.current) return
    const t = setTimeout(() => {
      sent.current = next
      onChangeRef.current({ q: next || undefined })
    }, 300)
    return () => clearTimeout(t)
  }, [value])

  const active = Boolean(search.q || search.unreviewed || search.flagged || search.critical || search.status)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <SearchField label="Search questions" className="flex-[1_1_280px]" ref={inputRef} name="q" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} />
        <div role="group" aria-label="Filters" className="flex flex-wrap gap-2">
          <FilterChip icon={CircleDashed} count={counts.unreviewed} pressed={!!search.unreviewed} onClick={() => onChange({ unreviewed: search.unreviewed ? undefined : true })}>Unreviewed</FilterChip>
          <FilterChip icon={Flag} count={counts.flagged} pressed={!!search.flagged} onClick={() => onChange({ flagged: search.flagged ? undefined : true })}>Flagged by learners</FilterChip>
          <FilterChip icon={Shield} count={counts.critical} pressed={!!search.critical} onClick={() => onChange({ critical: search.critical ? undefined : true })}>Critical</FilterChip>
        </div>
        <label className="sr-only" htmlFor="qs-status">Status</label>
        <Select id="qs-status" name="status" className="w-44" value={search.status ?? ''} onChange={(e) => onChange({ status: (e.target.value || undefined) as ReviewStatus | undefined })}>
          <option value="">All statuses</option>
          <option value="live">Live</option>
          <option value="retired">Retired</option>
          <option value="rejected">Rejected</option>
        </Select>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <p role="status" className="text-label text-ink tabular-nums">{shown === 1 ? '1 question' : `${shown} questions`}</p>
        {active && <Button variant="link" onClick={onClear}>Clear filters</Button>}
      </div>
    </div>
  )
}
