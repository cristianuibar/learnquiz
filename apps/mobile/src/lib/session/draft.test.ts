import type { Draft, SessionView } from '@learnquiz/api'
import { deleteDraft, draftForView, draftOnViewChange, readDraft, writeDraft } from './draft'

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

const view: SessionView = {
  id: 'session-a', kind: 'session', topicId: 'topic-a', topicTitle: 'Topic',
  progress: { position: 1, total: 3 }, ended: false,
  item: {
    id: 'item-a', conceptId: 'concept-a', conceptName: 'Concept', format: 'mcq', stem: 'Question?',
    options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], blank: null, image: null, difficulty: 1,
  },
}
const selected: Draft = { answer: { optionId: 'a' }, confidence: 'sure' }
const reasked: SessionView = { ...view, progress: { position: 2, total: 3 } }
const differentItem: SessionView = { ...reasked, item: { ...view.item!, id: 'item-b' } }

test.each<[SessionView | null, SessionView, string | undefined, string]>([
  [null, view, undefined, 'restore'],
  [view, view, undefined, 'keep'],
  [view, reasked, undefined, 'empty'],
  [view, differentItem, undefined, 'restore'],
  [view, view, 'item-a', 'empty'],
  [view, reasked, 'item-a', 'empty'],
])('chooses the draft action for the next session slot: %j -> %j, checked %s', (previous, next, checkedItemId, action) => {
  expect(draftOnViewChange(previous, next, checkedItemId)).toBe(action)
})

test('a re-asked item clears the old selections, confidence and stored draft', async () => {
  // A queued change must also be discarded before the re-ask can restore it.
  const write = writeDraft('session-a', 'item-a', selected)
  await expect(draftForView('session-a', view, reasked)).resolves.toEqual({ answer: {}, confidence: null })
  await write
  await expect(readDraft('session-a', 'item-a')).resolves.toBeNull()
})

test.each([view, reasked, differentItem])('a 409 resync discards the checked draft, including a same-item response: %j', async (next) => {
  const otherDraft: Draft = { answer: { optionId: 'b' }, confidence: 'guess' }
  await writeDraft('session-a', 'item-a', selected)
  await writeDraft('session-a', 'item-b', otherDraft)

  await expect(draftForView('session-a', view, next, 'item-a')).resolves.toEqual(
    next.item?.id === 'item-a' ? { answer: {}, confidence: null } : otherDraft,
  )
  await expect(readDraft('session-a', 'item-a')).resolves.toBeNull()
  await expect(readDraft('session-a', 'item-b')).resolves.toEqual(otherDraft)
})

test('an unchanged foreground view keeps the current selections and failed-check state', async () => {
  await writeDraft('session-a', 'item-a', selected)
  // null tells the container to keep its draft, error and stable retry request.
  await expect(draftForView('session-a', view, view)).resolves.toBeNull()
  await expect(readDraft('session-a', 'item-a')).resolves.toEqual(selected)
})

test.each([null, differentItem])('restores an unfinished draft on mount or when entering another item: %j', async (previous) => {
  await writeDraft('session-a', 'item-a', selected)
  await expect(draftForView('session-a', previous, view)).resolves.toEqual(selected)
  await expect(readDraft('session-a', 'item-a')).resolves.toEqual(selected)
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

test.each(['optionIds', 'order'] as const)('reads wait for changes and queued %s values do not follow later caller mutations', async (field) => {
  const draft: Draft = { answer: { [field]: ['a'] }, confidence: 'unsure' }
  const write = writeDraft('session-a', 'item-a', draft)
  draft.answer[field]!.push('b')
  draft.confidence = 'sure'
  await expect(readDraft('session-a', 'item-a')).resolves.toEqual({
    answer: { [field]: ['a'] }, confidence: 'unsure',
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
