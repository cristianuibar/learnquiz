import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Page, PageHeader } from '@/components/admin/page'
import { Status } from '@/components/admin/status-chip'
import { usePortalLinks } from '@/components/portal/portal-context'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { isFlagged, isUnreviewed, QuestionRow, stemId, toggleId, type Review } from './question-row'

const VISIBLE = 4
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

type Concept = Review['units'][number]['concepts'][number]

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

function Body({ data, slug, item }: { data: Review; slug: string; item?: string }) {
  const [init] = useState(() => initialState(data, item))
  const [expanded, setExpanded] = useState(init.expanded)
  const [showAll, setShowAll] = useState(init.showAll)
  const [focusId, setFocusId] = useState<string | null>(init.focus)
  const [message, setMessage] = useState('')
  const [approvedId, setApprovedId] = useState<string | null>(null)

  useEffect(() => {
    if (!focusId) return
    const el = document.getElementById(focusId)
    if (el) {
      el.focus()
      if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center' })
    }
    setFocusId(null)
  }, [focusId])

  const flat = useMemo(() => data.units.flatMap((u) => u.concepts.flatMap((c) => c.questions.map((q, i) => ({ q, conceptId: c.id, index: i })))), [data])

  // Once the refreshed data shows the approved question settled, move on to the next open one.
  useEffect(() => {
    if (!approvedId) return
    const at = flat.findIndex((e) => e.q.id === approvedId)
    if (at >= 0 && (isUnreviewed(flat[at]!.q) || isFlagged(flat[at]!.q))) return
    setApprovedId(null)
    setMessage(`Approved. ${data.unreviewed} unreviewed.`)
    const order = flat.slice(at + 1).concat(flat.slice(0, Math.max(at, 0) + 1))
    const next = order.find((e) => e.q.id !== approvedId && (isUnreviewed(e.q) || isFlagged(e.q)))
    setExpanded((s) => {
      const n = new Set(s)
      n.delete(approvedId)
      if (next) n.add(next.q.id)
      return n
    })
    if (next) {
      if (next.index >= VISIBLE) setShowAll((s) => new Set(s).add(next.conceptId))
      setFocusId(stemId(next.q.id))
    } else setFocusId(toggleId(approvedId))
  }, [approvedId, flat, data.unreviewed])

  const toggle = (id: string) => setExpanded((s) => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })

  return (
    <>
      <p role="status" className="sr-only">{message}</p>
      {data.units.map((u) => {
        const total = u.concepts.reduce((sum, c) => sum + c.counts.total, 0)
        const hid = `unit-${u.id}`
        return (
          <section key={u.id} aria-labelledby={hid} className="flex flex-col gap-6">
            <div className="flex flex-col gap-1">
              <h2 id={hid} className="text-title-2 text-ink">{u.name}</h2>
              <p className="text-caption text-ink-muted">{`${plural(u.concepts.length, 'concept')} · ${plural(total, 'question')}`}</p>
            </div>
            {u.concepts.map((c) => <ConceptBlock key={c.id} concept={c} slug={slug} expanded={expanded} showAll={showAll.has(c.id)} onShowAll={() => setShowAll((s) => new Set(s).add(c.id))} onToggle={toggle} onApproved={setApprovedId} onAnnounce={setMessage} />)}
          </section>
        )
      })}
    </>
  )
}

function ConceptBlock({ concept: c, slug, expanded, showAll, onShowAll, onToggle, onApproved, onAnnounce }: {
  concept: Concept
  slug: string
  expanded: Set<string>
  showAll: boolean
  onShowAll: () => void
  onToggle: (id: string) => void
  onApproved: (id: string) => void
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
        <h3 id={hid} className="text-label text-ink">{c.name}</h3>
        {c.critical ? <Status word="Critical" /> : null}
        <p className="text-caption text-ink-muted">{parts.join(' · ')}</p>
      </div>
      <div className="rounded-md border border-border bg-surface-card">
        <ul aria-labelledby={hid} className="divide-y divide-border">
          {shown.map((q) => (
            <QuestionRow key={q.id} question={q} critical={c.critical} slug={slug} expanded={expanded.has(q.id)} onToggle={() => onToggle(q.id)} onApproved={onApproved} onAnnounce={onAnnounce} />
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

export function QuestionReview({ data, slug, item }: { data: Review; slug: string; item?: string }) {
  const links = usePortalLinks()
  const navigate = useNavigate()
  return (
    <Page capped>
      <PageHeader
        title="Questions"
        actions={data.roles.length > 0 ? (
          <div className="flex items-center gap-3">
            <Label htmlFor="qs-role">Role</Label>
            <Select id="qs-role" value={data.role?.id ?? ''} onChange={(e) => void navigate({ to: '/org/$slug/questions', params: { slug }, search: { role: e.target.value } })}>
              {data.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </div>
        ) : undefined}
      />
      {data.roles.length === 0 && (
        <p className="rounded-md bg-surface-sunken px-4 py-3 text-body text-ink-muted">No roles yet. <Link {...links.roles} className="underline">Roles</Link></p>
      )}
      <Body key={data.role?.id ?? 'none'} data={data} slug={slug} item={item} />
    </Page>
  )
}
