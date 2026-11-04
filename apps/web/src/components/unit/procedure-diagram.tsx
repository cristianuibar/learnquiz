import { useEffect, useId, useState, type ReactNode } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { FileText, Shield } from 'lucide-react'
import { describeProcedure, layoutProcedure, type PositionedNode } from '@learnquiz/api/procedure'
import { errorMessage, InlineError } from '@/components/inline-error'
import { Button } from '@/components/ui/button'
import { getUnitProcedure, type UnitProcedureResult } from '@/server/procedure'

const W = 326
const PAD = 8
const LINE = 16
const CHAR = 7
const SHIELD = 16

// Greedy word wrap into at most maxLines lines of maxChars; cut text ends in an ellipsis.
function wrap(text: string, maxChars: number, maxLines: number) {
  const lines: string[] = []
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const last = lines[lines.length - 1]
    if (last !== undefined && `${last} ${word}`.length <= maxChars) lines[lines.length - 1] = `${last} ${word}`
    else lines.push(word)
  }
  const cut = (line: string) => `${line.slice(0, maxChars - 1).trimEnd()}…`
  const kept = lines.slice(0, maxLines).map((line) => (line.length > maxChars ? cut(line) : line))
  if (lines.length > maxLines) kept[maxLines - 1] = cut(kept[maxLines - 1]!)
  return kept
}

function NodeShape({ node }: { node: PositionedNode }) {
  const { x, y, width: w, height: h, critical, kind } = node
  const decision = kind === 'decision'
  const shift = critical ? (decision ? 8 : 10) : 0
  const room = (decision ? w * 0.7 : w - 16) - shift * 2
  const lines = wrap(node.label, Math.max(3, Math.floor(room / CHAR)), Math.max(1, Math.floor((h - 12) / LINE)))
  const style = critical ? 'fill-surface-sunken stroke-ink' : 'fill-surface-card stroke-border-strong'
  return (
    <g>
      {decision ? (
        <path d={`M${x} ${y - h / 2} L${x + w / 2} ${y} L${x} ${y + h / 2} L${x - w / 2} ${y} Z`}
          className={style} strokeWidth={critical ? 2 : 1.5} strokeLinejoin="round" />
      ) : (
        <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={8} className={style} strokeWidth={critical ? 2 : 1.5} />
      )}
      {critical && (
        <Shield x={x - w / 2 + (decision ? w * 0.2 : 8)} y={y - SHIELD / 2} width={SHIELD} height={SHIELD}
          className="stroke-ink" fill="none" aria-hidden />
      )}
      <text x={x + shift} y={y - ((lines.length - 1) * LINE) / 2} textAnchor="middle" dominantBaseline="central"
        className="fill-ink text-[13px] font-medium">
        {lines.map((line, i) => (
          <tspan key={i} x={x + shift} dy={i ? LINE : 0}>{line}</tspan>
        ))}
      </text>
    </g>
  )
}

export function ProcedureDiagram({ unitId }: { unitId: string }) {
  const id = useId()
  const load = useServerFn(getUnitProcedure)
  const [result, setResult] = useState<UnitProcedureResult | undefined>()
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setError('')
    load({ data: { unitId } }).then(
      (value) => { if (active) setResult(value) },
      (err: unknown) => { if (active) setError(errorMessage(err, 'The procedure could not be loaded.')) },
    )
    return () => { active = false }
  }, [unitId, load, retry])

  const again = () => setRetry((n) => n + 1)
  const frame = (children: ReactNode) => (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-title-3">Procedure</h2>
      {children}
    </section>
  )

  if (error) return frame(<InlineError message={error} onRetry={again} />)
  if (!result) return null
  if (result.status === 'pending') {
    return frame(
      <div className="flex flex-wrap items-center gap-3">
        <p role="status" className="text-body text-ink-muted">The procedure is being prepared.</p>
        <Button variant="secondary" onClick={again}>Retry</Button>
      </div>,
    )
  }

  const { graph, source } = result
  const layout = layoutProcedure(graph, W)
  const at = new Map(layout.nodes.map((n) => [n.id, n]))
  const line = { fill: 'none', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
  return frame(
    <figure className="m-0 flex flex-col gap-2 rounded-md border border-border bg-surface-card py-4">
      <svg viewBox={`0 0 ${W} ${layout.height + PAD * 2}`} className="mx-auto block h-auto w-full max-w-[326px]"
        role="img" aria-label={describeProcedure(graph)}>
        <g transform={`translate(0 ${PAD})`}>
          {layout.edges.map((edge, i) => {
            const [a, b] = edge.points as [{ x: number; y: number }, { x: number; y: number }]
            const from = at.get(edge.from)!
            const to = at.get(edge.to)!
            const text = edge.label && from.kind === 'decision' ? (edge.label === 'yes' ? 'Yes' : 'No') : null
            if (edge.back) {
              const sx = from.x + from.width / 2
              const tx = to.x + to.width / 2
              const gx = W - 4
              return (
                <g key={i}>
                  <path d={`M${sx} ${from.y} H${gx} V${to.y} H${tx} M${tx + 5} ${to.y - 5} l-5 5 5 5`}
                    className="stroke-border-strong" {...line} />
                  {text && <text x={sx + 4} y={from.y - 4} className="fill-ink-muted text-[13px] font-medium">{text}</text>}
                </g>
              )
            }
            const mid = (a.y + b.y) / 2
            const left = b.x < a.x
            return (
              <g key={i}>
                <path d={`M${a.x} ${a.y} V${mid} H${b.x} V${b.y} M${b.x - 5} ${b.y - 5} l5 5 5-5`}
                  className="stroke-border-strong" {...line} />
                {text && (
                  <text x={a.x + (left ? -6 : 6)} y={a.y + 14} textAnchor={left ? 'end' : 'start'}
                    className="fill-ink-muted text-[13px] font-medium">{text}</text>
                )}
              </g>
            )
          })}
          {layout.nodes.map((node) => <NodeShape key={node.id} node={node} />)}
        </g>
      </svg>
      <figcaption className="flex items-center gap-1 px-4 text-caption text-ink-muted">
        <FileText aria-hidden className="size-4" />
        {source.title} · v{source.version}
      </figcaption>
    </figure>,
  )
}
