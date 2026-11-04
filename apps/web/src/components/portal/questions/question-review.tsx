import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Page, PageHeader } from '@/components/admin/page'
import { Status } from '@/components/admin/status-chip'
import { usePortalLinks } from '@/components/portal/portal-context'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { ReviewLayout } from './review-outline'
import { ReviewToolbar, type FilterPatch, type ReviewSearch } from './review-toolbar'
import { isFlagged, isUnreviewed, QuestionRow, stemId, toggleId, type Action, type Review } from './question-row'

const VISIBLE = 4
const CLEAR_ID = 'review-clear-filters'
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export type { ReviewSearch }
type Unit = Review['units'][number]
type Concept = Unit['concepts'][number]
type Question = Concept['questions'][number]

const isOpen = (q: Question) => q.status !== 'retired' && q.status !== 'rejected'
const isNew = (q: Question) => q.reviewedAt === null && isOpen(q)

export function filterUnits(units: Review['units'], search: ReviewSearch): Review['units'] {
  const needle = search.q?.toLowerCase()
  const keep = (q: Question, critical: boolean) =>
    (!needle || q.payload.stem.toLowerCase().includes(needle))
    && (!search.unreviewed || isNew(q))
    && (!search.flagged || isFlagged(q))
    && (!search.critical || critical)
    && (!search.status || (search.status === 'live' ? isOpen(q) : q.status === search.status))
  return units.flatMap((u) => {
    const concepts = u.concepts.flatMap((c) => {
      const questions = c.questions.filter((q) => keep(q, c.critical))
      if (questions.length === 0) return []
      const counts = { total: questions.length, unreviewed: questions.filter(isNew).length, flagged: questions.filter(isFlagged).length, rejected: questions.filter((q) => q.status === 'rejected').length }
      return [{ ...c, questions, counts }]
    })
    return concepts.length > 0 ? [{ ...u, concepts }] : []
  })
}

function initialState(data: Review, item?: string) {
  const expanded = new Set<string>()
  const showAll = new Set<string>()
  let focus: string | null = null
  for (const u of data.units) {
    for (const c of u.concepts) {
      const first = c.questions.find((q) => isFlagged(q) || isUnreviewed(q))
      if (first) expanded.add(first.id)
      const at = item ? c.questions.findIndex((q) => q.id === item) : -1
      if (at >= 0) {
        expanded.add(item!)
        if (at >= VISIBLE) showAll.add(c.id)
        focus = stemId(item!)
      }
    }
  }
  return { expanded, showAll, focus }
}

function Body({ data, slug, search, onClear }: { data: Review; slug: string; search: ReviewSearch; onClear: () => void }) {
  const [init] = useState(() => initialState(data, search.item))
  const [expanded, setExpanded] = useState(init.expanded)
  const [showAll, setShowAll] = useState(init.showAll)
  const [focusId, setFocusId] = useState<string | null>(init.focus)
  const [message, setMessage] = useState('')
  // The acted-on id, the action and the outline order when it was pressed; the refreshed list re-sorts that question by rank.
  const [acted, setActed] = useState<{ id: string; action: Action; order: string[] } | null>(null)

  useEffect(() => {
    if (!focusId) return
    const el = document.getElementById(focusId)
    if (el) {
      el.focus()
      if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center' })
    }
    setFocusId(null)
  }, [focusId])

  const units = useMemo(() => filterUnits(data.units, search), [data.units, search.q, search.unreviewed, search.flagged, search.critical, search.status])
  const flat = useMemo(() => units.flatMap((u) => u.concepts.flatMap((c) => c.questions.map((q, i) => ({ q, conceptId: c.id, index: i })))), [units])

  // Once the refreshed data shows the question settled, Approve moves on to the next open one in the pre-action order, skipping retired and rejected flagged rows; Retire stays on it.
  useEffect(() => {
    if (!acted) return
    const { id: actedId, action } = acted
    const byId = new Map(flat.map((e) => [e.q.id, e]))
    const settled = byId.get(actedId)
    if (settled && (action === 'retire' ? settled.q.status !== 'retired' : isUnreviewed(settled.q) || isFlagged(settled.q))) return
    setActed(null)
    if (action === 'approve') setMessage(`Approved. ${data.unreviewed} unreviewed.`)
    const at = acted.order.indexOf(actedId)
    const order = acted.order.slice(at + 1).concat(acted.order.slice(0, Math.max(at, 0)))
    const next = action === 'approve' ? order.map((id) => byId.get(id)).find((e) => e !== undefined && isOpen(e.q) && (isUnreviewed(e.q) || isFlagged(e.q))) : undefined
    // With no open question left, stay on the acted-on row; if a filter removed it, the nearest remaining row, else Clear filters.
    const target = next ?? settled ?? order.map((id) => byId.get(id)).find((e) => e !== undefined)
    if (action === 'approve') {
      setExpanded((s) => {
        const n = new Set(s)
        n.delete(actedId)
        if (next) n.add(next.q.id)
        return n
      })
    }
    // The re-sort can move the row past the first four, so reveal the rest of its concept.
    if (target && target.index >= VISIBLE) setShowAll((s) => new Set(s).add(target.conceptId))
    const stem = target === next || (action === 'retire' && target === settled)
    setFocusId(!target ? CLEAR_ID : stem ? stemId(target.q.id) : toggleId(target.q.id))
  }, [acted, flat, data.unreviewed])

  const onAct = (id: string, action: Action) => {
    const order = flat.map((e) => e.q.id)
    return () => setActed({ id, action, order })
  }

  const toggle = (id: string) => setExpanded((s) => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })

  return (
    <>
      <p role="status" className="sr-only">{message}</p>
      <ReviewLayout units={units} mode={search.unreviewed ? 'unreviewed' : search.flagged ? 'flagged' : 'all'}>
        {units.length === 0 && data.units.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-border bg-surface-card p-6">
            <p className="text-body text-ink">No questions match these filters. Flagged questions have already been reviewed.</p>
            <Button id={CLEAR_ID} variant="secondary" onClick={onClear}>Clear filters</Button>
          </div>
        ) : null}
        {units.map((u) => {
          const total = u.concepts.reduce((sum, c) => sum + c.counts.total, 0)
          const hid = `unit-${u.id}`
          return (
            <section key={u.id} aria-labelledby={hid} className="flex flex-col gap-6">
              <div className="flex flex-col gap-1">
                <h2 id={hid} className="text-title-2 text-ink">{u.name}</h2>
                <p className="text-caption text-ink-muted">{`${plural(u.concepts.length, 'concept')} · ${plural(total, 'question')}`}</p>
              </div>
              {u.concepts.map((c) => <ConceptBlock key={c.id} concept={c} slug={slug} sources={data.sources} expanded={expanded} showAll={showAll.has(c.id)} onShowAll={() => setShowAll((s) => new Set(s).add(c.id))} onToggle={toggle} onAct={onAct} onAnnounce={setMessage} />)}
            </section>
          )
        })}
      </ReviewLayout>
    </>
  )
}

function ConceptBlock({ concept: c, slug, sources, expanded, showAll, onShowAll, onToggle, onAct, onAnnounce }: {
  concept: Concept
  slug: string
  sources: Review['sources']
  expanded: Set<string>
  showAll: boolean
  onShowAll: () => void
  onToggle: (id: string) => void
  onAct: (id: string, action: Action) => () => void
  onAnnounce: (m: string) => void
}) {
  const hid = `concept-${c.id}`
  const parts = [plural(c.counts.total, 'question')]
  if (c.counts.rejected) parts.push(`${c.counts.rejected} rejected`)
  if (c.counts.flagged) parts.push(`${c.counts.flagged} flagged`)
  const shown = showAll ? c.questions : c.questions.slice(0, VISIBLE)
  const hidden = c.questions.length - shown.length
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 id={hid} tabIndex={-1} className="text-label text-ink outline-none">{c.name}</h3>
        {c.critical ? <Status word="Critical" /> : null}
        <p className="text-caption text-ink-muted">{parts.join(' · ')}</p>
      </div>
      <div className="rounded-md border border-border bg-surface-card">
        <ul aria-labelledby={hid} className="divide-y divide-border">
          {shown.map((q) => (
            <QuestionRow key={q.id} question={q} critical={c.critical} slug={slug} sources={sources} expanded={expanded.has(q.id)} onToggle={() => onToggle(q.id)} onAct={onAct} onAnnounce={onAnnounce} />
          ))}
        </ul>
        {hidden > 0 && (
          <div className="border-t border-border px-2">
            <Button variant="link" aria-describedby={hid} onClick={onShowAll}>{`Show ${hidden} more`}</Button>
          </div>
        )}
      </div>
    </div>
  )
}

export function QuestionReview({ data, slug, search }: { data: Review; slug: string; search: ReviewSearch }) {
  const links = usePortalLinks()
  const navigate = useNavigate()
  const searchRef = useRef<HTMLInputElement>(null)
  const patchFilters = (patch: FilterPatch) => void navigate({ to: '/org/$slug/questions', params: { slug }, search: (prev) => ({ role: prev.role, q: prev.q, unreviewed: prev.unreviewed, flagged: prev.flagged, critical: prev.critical, status: prev.status as ReviewSearch['status'], ...patch, item: undefined }), replace: true })
  // Clear and a role change remount the toolbar at once, before the role's loader settles, so a search still in its
  // debounce is dropped; Clear focuses the new field after it mounts.
  const [resets, setResets] = useState(0)
  const focusSearch = useRef(false)
  const clear = () => {
    patchFilters({ q: undefined, unreviewed: undefined, flagged: undefined, critical: undefined, status: undefined })
    focusSearch.current = true
    setResets((n) => n + 1)
  }
  const pickRole = (role: string) => {
    setResets((n) => n + 1)
    void navigate({ to: '/org/$slug/questions', params: { slug }, search: { role } })
  }
  useEffect(() => {
    if (!focusSearch.current) return
    focusSearch.current = false
    searchRef.current?.focus()
  }, [resets])
  const all = data.units.flatMap((u) => u.concepts)
  const counts = {
    unreviewed: all.reduce((n, c) => n + c.questions.filter(isNew).length, 0),
    flagged: all.reduce((n, c) => n + c.questions.filter(isFlagged).length, 0),
    critical: all.reduce((n, c) => n + (c.critical ? c.questions.length : 0), 0),
  }
  const shown = filterUnits(data.units, search).reduce((n, u) => n + u.concepts.reduce((m, c) => m + c.counts.total, 0), 0)
  return (
    <Page capped>
      <PageHeader
        title="Questions"
        actions={data.roles.length > 0 ? (
          <div className="flex items-center gap-3">
            <Label htmlFor="qs-role">Role</Label>
            <Select id="qs-role" value={data.role?.id ?? ''} onChange={(e) => pickRole(e.target.value)}>
              {data.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </div>
        ) : undefined}
      />
      {data.roles.length === 0 && (
        <p className="rounded-md bg-surface-sunken px-4 py-3 text-body text-ink-muted">No roles yet. <Link {...links.roles} className="underline">Roles</Link></p>
      )}
      {data.role && <ReviewToolbar key={`${search.role ?? data.role.id}:${resets}`} search={search} counts={counts} shown={shown} inputRef={searchRef} onChange={patchFilters} onClear={clear} />}
      <Body key={data.role?.id ?? 'none'} data={data} slug={slug} search={search} onClear={clear} />
    </Page>
  )
}
