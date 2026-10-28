import type { CurriculumSkeleton } from '@/lib/llm/schemas'

export type ValidatedConcept = {
  id: string
  name: string
  summary: string
  sourceQuote: string | null
  grounded: boolean
  misconceptions: string[]
}
export type ValidatedUnit = { id: string; name: string; summary: string; concepts: ValidatedConcept[] }
export type ValidatedSkeleton = {
  units: ValidatedUnit[]
  edges: { fromId: string; toId: string }[] // fromId is the prerequisite of toId
  notes: string[]
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const key = (s: string) => norm(s).toLowerCase()

export function validateSkeleton(skeleton: CurriculumSkeleton, sourceText?: string | null): ValidatedSkeleton {
  const notes: string[] = []
  const source = sourceText ? norm(sourceText) : null
  const byName = new Map<string, string>()
  const units: ValidatedUnit[] = skeleton.units.map((u) => ({
    id: crypto.randomUUID(),
    name: u.name,
    summary: u.summary,
    concepts: u.concepts.map((c) => {
      const id = crypto.randomUUID()
      if (!byName.has(key(c.name))) byName.set(key(c.name), id)
      // shortcut: exact whitespace-normalised match only, so a quote with changed quotes or case is dropped; loosen if too many are lost.
      const quote = c.source_quote && norm(c.source_quote)
      const kept = source && quote && source.includes(quote) ? quote : null
      if (quote && source && !kept) notes.push(`dropped quote not found in source: ${c.name}`)
      return { id, name: c.name, summary: c.summary, sourceQuote: kept, grounded: kept !== null, misconceptions: c.misconceptions }
    }),
  }))

  // Resolve prerequisite names, then keep an edge only if it does not close a cycle or repeat a longer path.
  const flat = skeleton.units.flatMap((u) => u.concepts)
  const concepts = units.flatMap((u) => u.concepts)
  const next = new Map<string, Set<string>>(concepts.map((c) => [c.id, new Set()]))
  const reaches = (from: string, to: string, skip?: [string, string]): boolean => {
    const seen = new Set<string>()
    const stack = [from]
    while (stack.length) {
      const n = stack.pop()!
      if (n === to) return true
      if (seen.has(n)) continue
      seen.add(n)
      for (const m of next.get(n) ?? []) if (!(skip && skip[0] === n && skip[1] === m)) stack.push(m)
    }
    return false
  }
  flat.forEach((c, i) => {
    const to = concepts[i].id
    for (const name of c.prerequisites) {
      const from = byName.get(key(name))
      if (!from) notes.push(`dropped unknown prerequisite "${name}" of ${c.name}`)
      else if (from === to) notes.push(`dropped self prerequisite of ${c.name}`)
      else if (reaches(to, from)) notes.push(`dropped cycle edge ${name} -> ${c.name}`)
      else next.get(from)!.add(to)
    }
  })
  const edges: ValidatedSkeleton['edges'] = []
  for (const [from, tos] of next) {
    for (const to of tos) if (!reaches(from, to, [from, to])) edges.push({ fromId: from, toId: to })
  }
  return { units, edges, notes }
}

// Used when the model fails twice: a plain chain of generic concepts the learner can still be quizzed on.
export function fallbackSkeleton(topic: string): CurriculumSkeleton {
  const stages: [string, string[]][] = [
    ['Foundations', ['Key terms', 'Core ideas', 'Basic examples', 'Common first mistakes']],
    ['Core skills', ['Main techniques', 'Worked problems', 'How the parts connect', 'Edge cases']],
    ['Applying it', ['Real-world use', 'Troubleshooting', 'Combining techniques', 'Review and consolidation']],
  ]
  let previous: string | null = null
  return {
    units: stages.map(([name, names]) => ({
      name,
      summary: `${name} of ${topic}`,
      concepts: names.map((n) => {
        const concept = {
          name: `${n}: ${topic}`,
          summary: `${n} for ${topic}.`,
          prerequisites: previous ? [previous] : [],
          source_quote: null,
          misconceptions: [],
        }
        previous = concept.name
        return concept
      }),
    })),
  }
}
