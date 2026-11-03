import { isAnswerReady } from '@learnquiz/api'
import { clearSteps, orderRows, positionOf, stepAnnouncement, stepLabel, toggleStep } from './order'

const options = [
  { id: 'a', text: 'Inspect the item' },
  { id: 'b', text: 'Clean it' },
  { id: 'c', text: 'Repair it' },
  { id: 'd', text: 'Test it' },
]

test('placing steps numbers them in tap order', () => {
  let order: string[] = []
  for (const id of ['c', 'a', 'd']) order = toggleStep(order, id)
  expect(order).toEqual(['c', 'a', 'd'])
  expect(positionOf(order, 'c')).toBe(1)
  expect(positionOf(order, 'a')).toBe(2)
  expect(positionOf(order, 'd')).toBe(3)
  expect(positionOf(order, 'b')).toBeNull()
})

test('removing a middle step moves later ones up and re-tapping places it last', () => {
  const placed = ['c', 'a', 'd']
  const removed = toggleStep(placed, 'a')
  expect(removed).toEqual(['c', 'd'])
  expect(positionOf(removed, 'd')).toBe(2)
  expect(positionOf(removed, 'a')).toBeNull()
  expect(toggleStep(removed, 'a')).toEqual(['c', 'd', 'a'])
})

test('toggling does not mutate the input and handles a missing order', () => {
  const placed = Object.freeze(['a', 'b'])
  expect(toggleStep(placed, 'c')).toEqual(['a', 'b', 'c'])
  expect(toggleStep(placed, 'a')).toEqual(['b'])
  expect(placed).toEqual(['a', 'b'])
  expect(toggleStep(undefined, 'a')).toEqual(['a'])
})

test('labels and announcements use the exact wording', () => {
  expect(stepLabel('Inspect the item', 2)).toBe('Inspect the item, position 2')
  expect(stepLabel('Inspect the item', null)).toBe('Inspect the item, not placed yet')
  expect(stepAnnouncement('Inspect the item', 2, 4)).toBe('Inspect the item, 2 of 4')
  expect(stepAnnouncement('Inspect the item', null, 4)).toBe('Inspect the item, not placed')
})

test('the answer is ready only once every step is placed, and not after Clear', () => {
  let order: string[] = []
  for (const id of ['b', 'a', 'c']) order = toggleStep(order, id)
  expect(isAnswerReady('order', { order }, 4)).toBe(false)
  order = toggleStep(order, 'd')
  expect(order).toEqual(['b', 'a', 'c', 'd'])
  expect(isAnswerReady('order', { order }, 4)).toBe(true)
  expect(isAnswerReady('order', { order: toggleStep(order, 'a') }, 4)).toBe(false)
  expect(isAnswerReady('order', { order: clearSteps() }, 4)).toBe(false)
})

test('rows carry label and position, and lock when marked or disabled', () => {
  const rows = orderRows(options, ['b', 'a'], null, false)
  expect(rows.map((row) => row.position)).toEqual([2, 1, null, null])
  expect(rows[0].label).toBe('Inspect the item, position 2')
  expect(rows[2].label).toBe('Repair it, not placed yet')
  expect(rows.every((row) => !row.disabled)).toBe(true)

  const locked = orderRows(options, ['b', 'a'], { a: 'rest' }, false)
  expect(locked.every((row) => row.disabled)).toBe(true)
  expect(locked.map((row) => row.position)).toEqual([2, 1, null, null])

  expect(orderRows(options, [], null, true).every((row) => row.disabled)).toBe(true)
})
