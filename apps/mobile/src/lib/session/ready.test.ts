import { createReadyAnnouncement } from './ready'

function harness(requested = true) {
  let nextId = 0
  const frames = new Map<number, () => void>()
  const events: string[] = []
  const schedule = (callback: () => void) => { frames.set(++nextId, callback); return nextId }
  const renderItem = createReadyAnnouncement(requested, {
    frame: schedule,
    cancelFrame: (id) => { frames.delete(id) },
    announce: (message) => { events.push(message) },
  })
  const frame = () => {
    const pending = [...frames.values()]
    frames.clear()
    pending.forEach((callback) => callback())
  }
  return { renderItem, frame, schedule, events }
}

test.each(['stem', 'cloze'] as const)('%s ready waits for the first item and follows its focus frame once', (format) => {
  const h = harness()
  h.renderItem(false)
  // Arbitrarily slow GET: elapsed navigation frames are not readiness.
  for (let i = 0; i < 100; i++) h.frame()
  expect(h.events).toEqual([])
  if (format === 'stem') h.schedule(() => { h.events.push('stem focus') })
  h.renderItem(true)
  h.frame()
  expect(h.events).toEqual(format === 'stem' ? ['stem focus'] : [])
  h.frame()
  expect(h.events).toEqual(format === 'stem' ? ['stem focus', 'Your session is ready.'] : ['Your session is ready.'])
  h.renderItem(true)
  h.frame()
  h.frame()
  expect(h.events.filter((event) => event === 'Your session is ready.')).toHaveLength(1)
})

test('an ordinary session link does not announce ready', () => {
  const h = harness(false)
  h.renderItem(true)
  h.frame()
  h.frame()
  expect(h.events).toEqual([])
})

test.each([0, 1])('unmount after %s frames cancels speech without consuming the one-shot', (elapsed) => {
  const h = harness()
  const cancel = h.renderItem(true)
  for (let i = 0; i < elapsed; i++) h.frame()
  cancel()
  h.frame()
  h.frame()
  expect(h.events).toEqual([])
  // A cancelled effect can be installed again, including under Strict Mode.
  h.renderItem(true)
  h.frame()
  h.frame()
  expect(h.events).toEqual(['Your session is ready.'])
})
