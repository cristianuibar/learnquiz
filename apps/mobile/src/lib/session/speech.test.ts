import type { ItemView } from '@learnquiz/api'
import { createReadAloud, speechSegments, type SpeechQuestion } from './speech'

const item: ItemView = {
  id: 'first', conceptId: 'receiving', conceptName: 'Receiving', format: 'mcq',
  stem: 'What do you do first?',
  options: [{ id: 'a', text: 'Record the damage' }, { id: 'b', text: 'Move the pallet' }],
  image: null, blank: null, difficulty: 1,
}

describe('speechSegments', () => {
  test.each([
    ['mcq', ['What do you do first?', 'Record the damage', 'Move the pallet']],
    ['multi', ['What do you do first?', 'Choose all that apply', 'Record the damage', 'Move the pallet']],
    ['order', ['What do you do first?', 'Put the steps in order', 'Record the damage', 'Move the pallet']],
    ['cloze', ['Wait blank minutes, then record blank.']],
    ['short', ['Describe the damage.']],
  ] as const)('reads %s in displayed order', (format, expected) => {
    const question = format === 'cloze'
      ? { ...item, format, stem: 'Wait ____ minutes, then record ____.', options: [], blank: { numeric: true } }
      : format === 'short'
        ? { ...item, format, stem: 'Describe the damage.', options: [] }
        : { ...item, format }
    expect(speechSegments(question)).toEqual(expected)
  })

  test('reads image alt between the stem and the options without speaking its URL', () => {
    expect(speechSegments({ ...item, image: { src: 'https://example.com/pallet.png', alt: 'A pallet with torn wrap.', width: 100, height: 100 } }))
      .toEqual(['What do you do first?', 'A pallet with torn wrap.', 'Record the damage', 'Move the pallet'])
  })

  test('omits empty segments', () => {
    expect(speechSegments({ ...item, stem: ' ', options: [], image: { src: '', alt: '', width: 1, height: 1 } })).toEqual([])
  })
})

function harness() {
  const speak = jest.fn()
  const stop = jest.fn(() => Promise.resolve())
  const enabled = jest.fn()
  const controller = createReadAloud({ speak, stop }, enabled)
  let question: SpeechQuestion = { item, key: 'first:1', available: true, foreground: true, blocked: false }
  const update = (next: Partial<SpeechQuestion>) => {
    question = { ...question, ...next }
    controller.update(question)
  }
  update({})
  return { ...controller, update, speak, stop, enabled }
}

// Drain the platform stop promises and the continuation that queues utterances.
async function settle() {
  for (let i = 0; i < 8; i++) await Promise.resolve()
}

test('starts off, then queues each segment in US English when enabled', async () => {
  const h = harness()
  await settle()
  expect(h.speak).not.toHaveBeenCalled()
  h.toggle()
  await settle()
  expect(h.enabled).toHaveBeenLastCalledWith(true)
  expect(h.speak.mock.calls.map(([text, options]) => [text, options.language])).toEqual([
    ['What do you do first?', 'en-US'], ['Record the damage', 'en-US'], ['Move the pallet', 'en-US'],
  ])
  h.update({ item: { ...item } })
  await settle()
  expect(h.speak).toHaveBeenCalledTimes(3)
})

test('stops the old item before reading the next item and keeps the session toggle on', async () => {
  const h = harness()
  h.toggle()
  await settle()
  let finishStop!: () => void
  h.stop.mockImplementationOnce(() => new Promise<void>((resolve) => { finishStop = resolve }))
  h.speak.mockClear()
  h.update({ item: { ...item, id: 'second', stem: 'Next question' }, key: 'second:2' })
  expect(h.stop).toHaveBeenCalledTimes(1)
  await settle()
  expect(h.speak).not.toHaveBeenCalled()
  finishStop()
  await settle()
  expect(h.speak.mock.calls[0][0]).toBe('Next question')
  expect(h.enabled.mock.calls).toEqual([[true]])
})

test('reads a repeated item at a new session position', async () => {
  const h = harness()
  h.toggle()
  await settle()
  h.update({ key: 'first:4' })
  await settle()
  expect(h.stop).toHaveBeenCalledTimes(1)
  expect(h.speak).toHaveBeenCalledTimes(6)
})

test('stops on toggle off and does not read subsequent items', async () => {
  const h = harness()
  h.toggle()
  await settle()
  h.toggle()
  expect(h.stop).toHaveBeenCalledTimes(1)
  expect(h.enabled).toHaveBeenLastCalledWith(false)
  h.update({ item: { ...item, id: 'second' }, key: 'second:2' })
  await settle()
  expect(h.speak).toHaveBeenCalledTimes(3)
})

test.each(['Check', 'background'] as const)('stops on %s without replaying the same item when it clears', async (reason) => {
  const h = harness()
  h.toggle()
  await settle()
  h.update(reason === 'Check' ? { blocked: true } : { foreground: false })
  expect(h.stop).toHaveBeenCalledTimes(1)
  h.update({ blocked: false, foreground: true })
  await settle()
  expect(h.speak).toHaveBeenCalledTimes(3)
  h.update({ item: { ...item, id: 'second' }, key: 'second:2' })
  await settle()
  expect(h.speak).toHaveBeenCalledTimes(6)
})

test('waits for Continue to finish when the new item arrives during the request', async () => {
  const h = harness()
  h.toggle()
  await settle()
  h.update({ blocked: true })
  h.update({ item: { ...item, id: 'second' }, key: 'second:2' })
  h.update({ item: { ...item, id: 'second' } })
  await settle()
  expect(h.speak).toHaveBeenCalledTimes(3)
  h.update({ blocked: false })
  await settle()
  expect(h.speak).toHaveBeenCalledTimes(6)
})

test('stops on unmount and a fresh session starts off', async () => {
  const h = harness()
  h.toggle()
  await settle()
  h.dispose()
  expect(h.stop).toHaveBeenCalledTimes(1)
  h.update({ key: 'first:2' })
  h.toggle()
  await settle()
  expect(h.speak).toHaveBeenCalledTimes(3)
  const fresh = harness()
  await settle()
  expect(fresh.speak).not.toHaveBeenCalled()
})

test.each(['item change', 'toggle off', 'unmount'] as const)('cancels a queued replacement on %s while native stop is pending', async (reason) => {
  const h = harness()
  h.toggle()
  await settle()
  let finishStop!: () => void
  h.stop.mockImplementationOnce(() => new Promise<void>((resolve) => { finishStop = resolve }))
  h.update({ key: 'second:2', item: { ...item, id: 'second', stem: 'Stale question' } })
  h.speak.mockClear()
  if (reason === 'item change') h.update({ key: 'third:3', item: { ...item, id: 'third', stem: 'Latest question' } })
  if (reason === 'toggle off') h.toggle()
  if (reason === 'unmount') h.dispose()
  finishStop()
  await settle()
  expect(h.speak.mock.calls.map(([text]) => text)).toEqual(reason === 'item change'
    ? ['Latest question', 'Record the damage', 'Move the pallet'] : [])
})

test('disables unavailable speech or TalkBack and stops active playback', async () => {
  const h = harness()
  h.update({ available: false })
  h.toggle()
  await settle()
  expect(h.speak).not.toHaveBeenCalled()
  h.update({ available: true })
  h.toggle()
  await settle()
  h.update({ available: false })
  expect(h.stop).toHaveBeenCalledTimes(1)
  expect(h.enabled).toHaveBeenLastCalledWith(false)
  h.update({ available: true })
  await settle()
  expect(h.speak).toHaveBeenCalledTimes(3)
})

test('a native speech failure turns playback off and clears remaining utterances', async () => {
  const h = harness()
  h.toggle()
  await settle()
  h.speak.mock.calls[0][1].onError()
  expect(h.stop).toHaveBeenCalledTimes(1)
  expect(h.enabled).toHaveBeenLastCalledWith(false)
})
