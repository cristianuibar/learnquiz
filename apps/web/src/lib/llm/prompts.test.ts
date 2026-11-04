import { expect, it } from 'vitest'
import { itemsPrompt } from './prompts'

it('asks for mcq, multi, cloze, short and order items with rules for multi and order', () => {
  const { system, user } = itemsPrompt({
    topic: 'Warehouse picking',
    concept: { name: 'Scanning', summary: 'Scan every bin.' },
    misconceptions: [],
    targetDifficulty: 2,
    avoidStems: [],
  })

  expect(system).toContain('Allowed formats: mcq, multi, cloze, short, order.')
  expect(user).toContain('Formats: mcq, multi, cloze, short, order')
  expect(system).toContain('- multi: 4 or 5 options')
  expect(system).toContain('- order: 3 to 5 steps')
})
