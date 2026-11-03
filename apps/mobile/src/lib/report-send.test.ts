import {
  canLeave,
  canSend,
  initialSendState,
  sendBusy,
  sendFailed,
  settleSend,
  startSend,
  type SendState,
} from './report-send'

const idle: SendState = initialSendState
const sending: SendState = { phase: 'sending' }
const sent: SendState = { phase: 'sent' }
const failed: SendState = { phase: 'failed' }

test('send is disabled without a reason and enabled with one', () => {
  expect(canSend(idle, null)).toBe(false)
  expect(canSend(failed, null)).toBe(false)
  expect(canSend(idle, 'incorrect')).toBe(true)
})

test('starting a send moves to sending and reports started', () => {
  expect(startSend(idle, 'other')).toEqual({ state: sending, started: true })
})

test('starting without a reason is refused', () => {
  expect(startSend(idle, null)).toEqual({ state: idle, started: false })
})

test('a second send while in flight is refused', () => {
  expect(canSend(sending, 'other')).toBe(false)
  expect(startSend(sending, 'other')).toEqual({ state: sending, started: false })
})

test('a second send after success is refused', () => {
  expect(canSend(sent, 'other')).toBe(false)
  expect(startSend(sent, 'other')).toEqual({ state: sent, started: false })
})

test('success notifies sent exactly once and keeps send busy', () => {
  const first = settleSend(sending, true)
  expect(first.notifySent).toBe(true)
  expect(first.state).toEqual(sent)
  expect(sendBusy(first.state)).toBe(true)
  expect(canSend(first.state, 'other')).toBe(false)
  const again = settleSend(first.state, true)
  expect(again.notifySent).toBe(false)
  expect(again.state).toEqual(sent)
})

test('failure does not notify sent', () => {
  const result = settleSend(sending, false)
  expect(result.notifySent).toBe(false)
  expect(result.state).toEqual(failed)
  expect(sendFailed(result.state)).toBe(true)
})

test('after failure send is enabled again and not busy so the learner can retry', () => {
  expect(sendBusy(failed)).toBe(false)
  expect(canSend(failed, 'other')).toBe(true)
  expect(startSend(failed, 'other')).toEqual({ state: sending, started: true })
})

test('settling when nothing is in flight does nothing', () => {
  expect(settleSend(idle, true)).toEqual({ state: idle, notifySent: false })
  expect(settleSend(failed, true)).toEqual({ state: failed, notifySent: false })
})

test('send is busy while sending but not when idle', () => {
  expect(sendBusy(sending)).toBe(true)
  expect(sendBusy(idle)).toBe(false)
})

test('back and cancel are blocked while sending only', () => {
  expect(canLeave(sending)).toBe(false)
  expect(canLeave(idle)).toBe(true)
  expect(canLeave(failed)).toBe(true)
  expect(canLeave(sent)).toBe(true)
})
