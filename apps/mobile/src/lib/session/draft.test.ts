import type { Draft } from '@learnquiz/api'
import { deleteDraft, readDraft, writeDraft } from './draft'

jest.mock('expo-sqlite/kv-store', () => {
  const store = new Map<string, string>()
  return {
    AsyncStorage: {
      getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
      setItemAsync: jest.fn(async (key: string, value: string) => { store.set(key, value) }),
      removeItemAsync: jest.fn(async (key: string) => { store.delete(key) }),
      __store: store,
    },
  }
})

const { AsyncStorage } = jest.requireMock('expo-sqlite/kv-store') as {
  AsyncStorage: {
    __store: Map<string, string>
    setItemAsync: jest.Mock<Promise<void>, [string, string]>
  }
}

beforeEach(() => {
  AsyncStorage.__store.clear()
  jest.clearAllMocks()
})

test.each<Draft>([
  { answer: { optionId: 'option-a' }, confidence: 'sure' },
  { answer: { optionIds: ['a', 'b'] }, confidence: 'unsure' },
  { answer: { order: ['b', 'a'] }, confidence: 'guess' },
  { answer: { text: 'An answer' }, confidence: null },
])('round-trips the answer and confidence: %j', async (draft) => {
  await writeDraft('session-a', 'item-a', draft)
  await expect(readDraft('session-a', 'item-a')).resolves.toEqual(draft)
  expect(JSON.parse(AsyncStorage.__store.get('lq:draft:session-a:item-a')!)).toEqual(draft)
})

test('returns null for a missing draft', async () => {
  await expect(readDraft('session-a', 'missing')).resolves.toBeNull()
})

test('deletes only the requested session and item draft', async () => {
  const draft: Draft = { answer: { optionId: 'a' }, confidence: 'sure' }
  await Promise.all([
    writeDraft('session-a', 'item-a', draft),
    writeDraft('session-a', 'item-b', draft),
    writeDraft('session-b', 'item-a', draft),
  ])
  await deleteDraft('session-a', 'item-a')
  await expect(readDraft('session-a', 'item-a')).resolves.toBeNull()
  await expect(readDraft('session-a', 'item-b')).resolves.toEqual(draft)
  await expect(readDraft('session-b', 'item-a')).resolves.toEqual(draft)
})

test('a delete after a slow change cannot leave the checked answer on disk', async () => {
  let finishWrite!: () => void
  let started!: () => void
  const writing = new Promise<void>((resolve) => { started = resolve })
  AsyncStorage.setItemAsync.mockImplementationOnce(async (key, value) => {
    started()
    await new Promise<void>((resolve) => { finishWrite = resolve })
    AsyncStorage.__store.set(key, value)
  })
  const write = writeDraft('session-a', 'item-a', { answer: { optionId: 'a' }, confidence: 'sure' })
  await writing
  const deletion = deleteDraft('session-a', 'item-a')
  finishWrite()
  await Promise.all([write, deletion])
  await expect(readDraft('session-a', 'item-a')).resolves.toBeNull()
})

test('reads wait for changes and queued values do not follow later caller mutations', async () => {
  const draft: Draft = { answer: { optionIds: ['a'] }, confidence: 'unsure' }
  const write = writeDraft('session-a', 'item-a', draft)
  draft.answer.optionIds!.push('b')
  draft.confidence = 'sure'
  await expect(readDraft('session-a', 'item-a')).resolves.toEqual({
    answer: { optionIds: ['a'] }, confidence: 'unsure',
  })
  await write
})

test('a failed storage write does not block a subsequent delete', async () => {
  const draft: Draft = { answer: { text: 'Draft' }, confidence: 'guess' }
  await writeDraft('session-a', 'item-a', draft)
  AsyncStorage.setItemAsync.mockRejectedValueOnce(new Error('Storage unavailable'))
  const failed = writeDraft('session-a', 'item-a', draft)
  const deletion = deleteDraft('session-a', 'item-a')
  await expect(failed).rejects.toThrow('Storage unavailable')
  await deletion
  await expect(readDraft('session-a', 'item-a')).resolves.toBeNull()
})
