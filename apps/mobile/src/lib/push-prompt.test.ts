import {
  FINISHED_KEY,
  PUSH_TOKEN_KEY,
  SKIPS_KEY,
  readPromptCounts,
  recordFinished,
  recordSkip,
  shouldPromptOptIn,
  type PromptStore,
  type PushPermission,
} from './push-prompt'

jest.mock('./kv', () => ({ getJSON: jest.fn(), setJSON: jest.fn() }))

function memoryStore(initial: Record<string, unknown> = {}): PromptStore & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>(Object.entries(initial))
  return {
    data,
    async getJSON<T>(key: string) {
      // yield so concurrent callers interleave
      await Promise.resolve()
      return (data.has(key) ? data.get(key) : null) as T | null
    },
    async setJSON(key: string, value: unknown) {
      await Promise.resolve()
      data.set(key, value)
    },
  }
}

type Perm = { permission: PushPermission; canAskAgain: boolean }
const perms: Array<[string, Perm]> = [
  ['undetermined', { permission: 'undetermined', canAskAgain: true }],
  ['granted', { permission: 'granted', canAskAgain: true }],
  ['denied+canAskAgain', { permission: 'denied', canAskAgain: true }],
  ['denied+!canAskAgain', { permission: 'denied', canAskAgain: false }],
]

const table: Array<[number, number, string, Perm, boolean, boolean]> = []
for (const finished of [0, 1, 3, 4]) {
  for (const skips of [0, 1, 2]) {
    for (const [name, perm] of perms) {
      for (const registered of [false, true]) {
        const askable = name === 'undetermined' || name === 'denied+canAskAgain'
        const timing = (skips === 0 && finished >= 1) || (skips === 1 && finished >= 4)
        table.push([finished, skips, name, perm, registered, askable && timing && !registered])
      }
    }
  }
}

describe('shouldPromptOptIn', () => {
  test.each(table)('finished=%p skips=%p %s registered=%p -> %p', (finished, skips, _name, perm, registered, expected) => {
    expect(shouldPromptOptIn({ finishedSessions: finished, skips, registered, ...perm })).toBe(expected)
  })
})

describe('shouldPromptOptIn, hand-written cases', () => {
  const base = { finishedSessions: 1, skips: 0, permission: 'undetermined' as const, canAskAgain: true, registered: false }
  test.each([
    ['first finished session, undecided', base, true],
    ['no finished session yet', { ...base, finishedSessions: 0 }, false],
    ['skipped once, third session', { ...base, skips: 1, finishedSessions: 3 }, false],
    ['skipped once, fourth session', { ...base, skips: 1, finishedSessions: 4 }, true],
    ['skipped twice', { ...base, skips: 2, finishedSessions: 9 }, false],
    ['denied but Android can ask again', { ...base, permission: 'denied' as const }, true],
    ['permanently denied', { ...base, permission: 'denied' as const, canAskAgain: false }, false],
    ['already granted', { ...base, permission: 'granted' as const }, false],
    ['already registered', { ...base, registered: true }, false],
  ])('%s', (_name, state, expected) => {
    expect(shouldPromptOptIn(state)).toBe(expected)
  })
})

describe('storage', () => {
  test('recordFinished counts the same id once', async () => {
    const store = memoryStore()
    expect(await recordFinished('a', store)).toBe(1)
    expect(await recordFinished('a', store)).toBe(1)
    expect((await readPromptCounts(store)).finishedSessions).toBe(1)
  })

  test('two different ids concurrently count 2', async () => {
    const store = memoryStore()
    const results = await Promise.all([recordFinished('a', store), recordFinished('b', store)])
    expect(results).toEqual([1, 2])
    expect((await readPromptCounts(store)).finishedSessions).toBe(2)
  })

  test('keeps only the last 50 ids but keeps counting', async () => {
    const store = memoryStore()
    for (let i = 0; i < 55; i++) await recordFinished(`s${i}`, store)
    const stored = store.data.get(FINISHED_KEY) as { count: number; ids: string[] }
    expect(stored.count).toBe(55)
    expect(stored.ids).toHaveLength(50)
    expect(stored.ids[49]).toBe('s54')
  })

  test('recordSkip increments', async () => {
    const store = memoryStore()
    expect(await recordSkip(store)).toBe(1)
    expect(await recordSkip(store)).toBe(2)
    expect((await readPromptCounts(store)).skips).toBe(2)
  })

  test('concurrent skips are not lost', async () => {
    const store = memoryStore()
    await Promise.all([recordSkip(store), recordSkip(store)])
    expect(store.data.get(SKIPS_KEY)).toBe(2)
  })

  test('readPromptCounts reports registered when a token is stored', async () => {
    expect((await readPromptCounts(memoryStore())).registered).toBe(false)
    expect((await readPromptCounts(memoryStore({ [PUSH_TOKEN_KEY]: 'ExponentPushToken[x]' }))).registered).toBe(true)
  })

  test('corrupt stored values are treated as empty', async () => {
    const store = memoryStore({ [FINISHED_KEY]: { count: 'many', ids: 5 }, [SKIPS_KEY]: 'lots' })
    expect(await readPromptCounts(store)).toEqual({ finishedSessions: 0, skips: 0, registered: false })
    expect(await recordFinished('a', store)).toBe(1)
    expect(await recordSkip(store)).toBe(1)
  })
})
