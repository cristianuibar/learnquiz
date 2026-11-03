import { expect, it } from 'vitest'
import { cn } from './utils'

it('keeps a token type size next to a text color and lets a later size win', () => {
  expect(cn('text-label text-on-brand', 'text-ink')).toBe('text-label text-ink')
  expect(cn('text-sm text-label', 'text-label-lg')).toBe('text-label-lg')
})
