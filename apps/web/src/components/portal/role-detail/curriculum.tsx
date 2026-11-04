import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Banner } from '@/components/admin/banner'
import { Meter } from '@/components/admin/meter'
import { SkelLine } from '@/components/admin/skeleton'
import { usePortal, usePortalLinks } from '@/components/portal/portal-context'
import { Button } from '@/components/ui/button'
import { plural } from '@/lib/utils'
import type { RoleDetail } from '@/server/role-detail'
import { UnitCard } from './unit-card'

/** Curriculum section: head (title, build controls, progress or stats), finish banner, units. */
export function Curriculum({ detail, readOnly, controls, error, announce }: {
  detail: RoleDetail
  readOnly: boolean
  controls: ReactNode
  error: ReactNode
  announce: (message: string) => void
}) {
  const { slug } = usePortal()
  const links = usePortalLinks()
  const { role, units, documents } = detail
  const concepts = units.flatMap((u) => u.concepts)
  const total = concepts.length
  const ready = concepts.filter((c) => c.genStatus === 'ready').length
  const running = role.topicStatus === 'generating' || concepts.some((c) => c.genStatus === 'pending' || c.genStatus === 'generating')
  const [openById, setOpenById] = useState<Record<string, boolean>>({})
  const [finished, setFinished] = useState(false)
  const bucket = useRef<number | null>(null)
  const wasRunning = useRef(false)
  const announceRef = useRef(announce)
  announceRef.current = announce

  useEffect(() => {
    if (running) {
      wasRunning.current = true
      const next = Math.floor(ready / 5)
      if (bucket.current !== next) {
        bucket.current = next
        announceRef.current(`${ready} of ${total} concepts ready`)
      }
    } else if (wasRunning.current) {
      wasRunning.current = false
      bucket.current = null
      if (total > 0) {
        announceRef.current(`${total} of ${total} concepts ready. Curriculum ready.`)
        setFinished(true)
      }
    }
  }, [ready, total, running])

  const readyText = `${ready} of ${total} concepts ready`
  const stats = `${plural(total, 'concept', 'concepts')} · ${plural(role.liveQuestions, 'live question', 'live questions')} · ${plural(role.criticalQuestions, 'critical question', 'critical questions')}`

  return (
    <section aria-labelledby="curriculum-heading" className="flex flex-col gap-4">
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-4">
        <h2 id="curriculum-heading" className="text-title-2">Curriculum</h2>
        {controls}
        {total > 0 && running && (
          <div className="flex items-center gap-3">
            <span aria-hidden className="text-label">{readyText}</span>
            <Meter label="Concepts ready" value={ready} max={total} valueText={readyText} className="w-[200px]" />
          </div>
        )}
        {total > 0 && !running && <p className="text-body text-ink-muted">{stats}</p>}
      </div>
      {error}
      {finished && (
        <Banner
          kind="info"
          action={<Button asChild variant="primary"><Link {...links.questions({ role: role.id })}>Review questions</Link></Button>}
        >
          <strong>Curriculum ready</strong> · {plural(total, 'concept', 'concepts')}
        </Banner>
      )}
      {units.length > 0 ? (
        <ol aria-label={`Units of ${role.name}`} className="flex flex-col gap-3">
          {units.map((unit, i) => (
            <UnitCard
              key={unit.id}
              unit={unit}
              index={i}
              open={openById[unit.id] ?? i < 2}
              onToggle={() => setOpenById((s) => ({ ...s, [unit.id]: !(s[unit.id] ?? i < 2) }))}
              slug={slug}
              readOnly={readOnly}
              running={running}
            />
          ))}
        </ol>
      ) : role.topicStatus === 'generating' ? (
        <ol className="flex flex-col gap-3">
          <li className="rounded-md border border-border bg-surface-card">
            <div className="flex min-h-16 items-center gap-3 py-2.5 pr-4 pl-6">
              <span aria-hidden className="w-4 flex-none text-label text-ink-muted">1</span>
              <span className="text-caption text-ink-muted">Finding concepts…</span>
            </div>
            <div aria-hidden className="flex flex-col gap-3 pr-6 pb-5 pl-[52px]">
              <SkelLine className="w-[46%]" />
              <SkelLine className="w-[38%]" />
              <SkelLine className="w-[42%]" />
            </div>
          </li>
          <li aria-hidden className="flex min-h-16 items-center gap-3 rounded-md border border-border bg-surface-card px-6">
            <SkelLine className="w-4" />
            <SkelLine className="h-4 w-[140px]" />
            <SkelLine className="w-[120px]" />
          </li>
        </ol>
      ) : documents.length === 0 ? (
        <p className="rounded-md bg-surface-sunken px-6 py-4 text-body text-ink-muted">Add a document to build the curriculum.</p>
      ) : null}
    </section>
  )
}
