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
        prerequisites: [],
        source_quote: quote,
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
