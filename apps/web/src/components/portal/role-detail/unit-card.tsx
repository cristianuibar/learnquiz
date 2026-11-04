import { useId } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { plural } from '@/lib/utils'
import type { RoleDetail } from '@/server/role-detail'
import { ConceptRow, questionCell, rowGrid } from './concept-row'

type Unit = RoleDetail['units'][number]

const ring = 'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

function unitMeta(unit: Unit, running: boolean) {
  const n = unit.concepts.length
  const count = (status: string) => unit.concepts.filter((c) => c.genStatus === status).length
  const critical = unit.concepts.filter((c) => c.critical).length
  const ready = count('ready')
  let meta = `${plural(n, 'concept', 'concepts')} · ${critical} critical`
  if (running && ready < n) meta += ` · ${ready} of ${n} ready`
  if (!running) {
    if (count('generating') > 0) meta += ` · ${count('generating')} generating`
    if (count('failed') > 0) meta += ` · ${count('failed')} failed`
  }
  return meta
}

export function UnitCard({ unit, index, open, onToggle, slug, readOnly, running }: {
  unit: Unit
  index: number
  open: boolean
  onToggle: () => void
  slug: string
  readOnly: boolean
  running: boolean
}) {
  const uid = useId()
  const buttonId = `${uid}-unit`
  const listId = `${uid}-list`
  const critHeaderId = `${uid}-crit`
  const Chevron = open ? ChevronUp : ChevronDown
  return (
    <li className="rounded-md border border-border bg-surface-card">
      <h3>
        <button
          type="button"
          id={buttonId}
          aria-expanded={open}
          aria-controls={listId}
          onClick={onToggle}
          className={`flex min-h-16 w-full items-center gap-3 rounded-md py-2.5 pr-4 pl-6 text-left ${ring}`}
        >
          <span className="w-4 flex-none text-label text-ink-muted">{index + 1}</span>
          <span className="text-body-lg font-semibold">{unit.name}</span>
          <span className="text-caption text-ink-muted">{unitMeta(unit, running)}</span>
          <span className="ml-auto inline-flex size-11 flex-none items-center justify-center text-ink-muted">
            <Chevron aria-hidden className="size-5" />
          </span>
        </button>
      </h3>
      <div id={listId} hidden={!open} className="@container">
        <div className={`${rowGrid} border-t border-border py-2`}>
          <span className="@max-[560px]:hidden" />
          <div className="flex items-center gap-4 text-caption text-ink-muted">
            <span className={questionCell}>Questions</span>
            {readOnly ? (
              <span className="w-[92px]" />
            ) : (
              <>
                <span id={critHeaderId} className="w-[52px] text-center">Critical</span>
                <span className="w-11" />
              </>
            )}
          </div>
        </div>
        <ol aria-labelledby={buttonId}>
          {unit.concepts.map((c) => (
            <ConceptRow key={c.id} concept={c} slug={slug} readOnly={readOnly} critHeaderId={critHeaderId} />
          ))}
        </ol>
      </div>
    </li>
  )
}
