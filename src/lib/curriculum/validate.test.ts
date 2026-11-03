import { expect, it } from 'vitest'
import { validateSkeleton } from './validate'

it.each([
  {
    name: 'curly source quotes and mixed case',
    source: 'Before: “Newton’s ‘Laws’” are useful. After.',
    quote: '"newton\'s \'laws\'" ARE USEFUL.',
    expected: '“Newton’s ‘Laws’” are useful.',
  },
  {
    name: 'straight source quotes and mixed case',
    source: 'Before: "newton\'s \'laws\'" are useful. After.',
    quote: '“NEWTON’S ‘LAWS’” ARE USEFUL.',
    expected: '"newton\'s \'laws\'" are useful.',
  },
  {
    name: 'raw source whitespace',
    source: 'Before: Keep\n\tthis  spacing. After.',
    quote: ' \tKeep  this\nspacing.\n',
    expected: 'Keep\n\tthis  spacing.',
  },
  {
    name: 'literal regex metacharacters',
    source: 'Before: C++ (x*y) [v1.0]? $5^{2} | a\\b / end. After.',
    quote: 'C++ (x*y) [v1.0]? $5^{2} | a\\b / end.',
    expected: 'C++ (x*y) [v1.0]? $5^{2} | a\\b / end.',
  },
  {
    name: 'changed words are rejected',
    source: 'Gravity is an attractive force.',
    quote: 'Gravity is a repulsive force.',
    expected: null,
  },
  {
    name: 'regex metacharacters cannot match different punctuation',
    source: 'Version v1x0.',
    quote: 'Version v1.0.',
    expected: null,
  },
])('grounds quotes conservatively: $name', ({ source, quote, expected }) => {
  const result = validateSkeleton({
    units: [{
      name: 'Unit',
      summary: 'Unit summary',
      concepts: [{
        name: 'Concept',
        summary: 'Concept summary',
        visual: false,
        prerequisites: [],
        source_quote: quote,
        critical: false,
        misconceptions: [],
      }],
    }],
  }, source)

  expect(result.units[0].concepts[0]).toMatchObject({
    sourceQuote: expected,
    grounded: expected !== null,
  })
  expect(result.notes).toEqual(expected === null ? ['dropped quote not found in source: Concept'] : [])
})

it('does not ground a quote that appears in more than one document', () => {
  const concept = (name: string, quote: string) => ({
    name, summary: 'Summary', visual: false, prerequisites: [], source_quote: quote, critical: false, misconceptions: [],
  })
  const result = validateSkeleton({
    units: [{ name: 'Unit', summary: 'Unit summary', concepts: [concept('Shared', 'Lock the cabinet.'), concept('Policy only', 'Report every loss.')] }],
  }, [
    { id: 'sop', bodyText: 'SOP step 3, per policy: Lock the cabinet.' },
    { id: 'policy', bodyText: 'Lock the cabinet. Report every loss.' },
  ])

  expect(result.units[0].concepts.map((c) => ({ sourceId: c.sourceId, sourceQuote: c.sourceQuote, grounded: c.grounded }))).toEqual([
    { sourceId: null, sourceQuote: null, grounded: false },
    { sourceId: 'policy', sourceQuote: 'Report every loss.', grounded: true },
  ])
  expect(result.notes).toEqual(['dropped quote found in more than one source: Shared'])
})
