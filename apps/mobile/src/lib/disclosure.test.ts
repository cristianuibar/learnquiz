import { acknowledgeDisclosure } from './disclosure'

test('pending request keeps local state and held target unchanged', async () => {
  let resolveRequest!: (value: unknown) => void
  const pending = new Promise<unknown>((resolve) => {
    resolveRequest = resolve
  })
  const setDisclosed = jest.fn()
  const takeHeldTarget = jest.fn((): string | null => '/play/quick/abc')
  const result = acknowledgeDisclosure({
    acknowledge: () => pending,
    setDisclosed,
    takeHeldTarget,
  })
  await Promise.resolve()
  await Promise.resolve()
  expect(setDisclosed).not.toHaveBeenCalled()
  expect(takeHeldTarget).not.toHaveBeenCalled()
  resolveRequest(undefined)
  await expect(result).resolves.toBe('/play/quick/abc')
})

test('success runs acknowledge then setDisclosed then takeHeldTarget', async () => {
  const order: string[] = []
  const result = await acknowledgeDisclosure({
    acknowledge: async () => {
      order.push('acknowledge')
    },
    setDisclosed: () => {
      order.push('setDisclosed')
    },
    takeHeldTarget: () => {
      order.push('takeHeldTarget')
      return null
    },
  })
  expect(result).toBe('/(tabs)/today')
  expect(order).toEqual(['acknowledge', 'setDisclosed', 'takeHeldTarget'])
})

test('held target success returns the held path', async () => {
  const setDisclosed = jest.fn()
  await expect(
    acknowledgeDisclosure({
      acknowledge: async () => undefined,
      setDisclosed,
      takeHeldTarget: () => '/play/quick/abc',
    }),
  ).resolves.toBe('/play/quick/abc')
  expect(setDisclosed).toHaveBeenCalledTimes(1)
})

test('null held target falls back to Today', async () => {
  await expect(
    acknowledgeDisclosure({
      acknowledge: async () => undefined,
      setDisclosed: () => undefined,
      takeHeldTarget: () => null,
    }),
  ).resolves.toBe('/(tabs)/today')
})

test('rejection propagates unchanged with no local acceptance and no held consumption', async () => {
  const failure = new Error('network down')
  const setDisclosed = jest.fn()
  const takeHeldTarget = jest.fn((): string | null => '/play/quick/abc')
  await expect(
    acknowledgeDisclosure({
      acknowledge: () => Promise.reject(failure),
      setDisclosed,
      takeHeldTarget,
    }),
  ).rejects.toBe(failure)
  expect(setDisclosed).not.toHaveBeenCalled()
  expect(takeHeldTarget).not.toHaveBeenCalled()
})
