import { holdTarget, takeHeldTarget } from './held-target'

test('take with nothing held returns null', () => {
  expect(takeHeldTarget()).toBeNull()
})

test('hold then take returns the path exactly once', () => {
  holdTarget('/play/quick/abc')
  expect(takeHeldTarget()).toBe('/play/quick/abc')
  expect(takeHeldTarget()).toBeNull()
})

test('latest hold wins', () => {
  holdTarget('/first')
  holdTarget('/second')
  expect(takeHeldTarget()).toBe('/second')
  expect(takeHeldTarget()).toBeNull()
})
