import { createSettingsSave } from './settings-save'

function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

test('saves serially and sends the latest change made while pending', async () => {
  const first = deferred()
  const save = jest.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined)
  const queue = createSettingsSave({ initial: 0, save, onChange: jest.fn(), onError: jest.fn() })
  queue.change(1)
  queue.change(2)
  queue.change(3)
  expect(save.mock.calls).toEqual([[1]])
  first.resolve()
  await jest.runAllTimersAsync()
  expect(save.mock.calls).toEqual([[1], [3]])
})

test('a failed pending save discards queued changes, reverts to confirmed and reports once', async () => {
  const second = deferred()
  const save = jest.fn().mockResolvedValueOnce(undefined).mockReturnValueOnce(second.promise)
  const onChange = jest.fn(), onError = jest.fn()
  const queue = createSettingsSave({ initial: 0, save, onChange, onError })
  queue.change(1)
  await jest.runAllTimersAsync()
  queue.change(2)
  queue.change(3)
  second.reject(new Error('offline'))
  await jest.runAllTimersAsync()
  expect(onChange).toHaveBeenLastCalledWith(1)
  expect(queue.value()).toBe(1)
  expect(onError).toHaveBeenCalledTimes(1)
  expect(save.mock.calls).toEqual([[1], [2]])
  save.mockResolvedValue(undefined)
  queue.change(queue.value() + 10)
  await jest.runAllTimersAsync()
  expect(save).toHaveBeenLastCalledWith(11)
})

test.each(['resolve', 'reject'] as const)('token replacement ignores late %s and never sends the queued change', async (result) => {
  const pending = deferred()
  let token = 'a'
  const onChange = jest.fn(), onError = jest.fn(), save = jest.fn(() => pending.promise)
  const queue = createSettingsSave({ initial: 0, save, onChange, onError, isCurrent: () => token === 'a' })
  queue.change(1)
  queue.change(2)
  token = 'b'
  onChange.mockClear()
  if (result === 'resolve') pending.resolve()
  else pending.reject(new Error('old session'))
  await jest.runAllTimersAsync()
  expect(onChange).not.toHaveBeenCalled()
  expect(onError).not.toHaveBeenCalled()
  expect(save).toHaveBeenCalledTimes(1)
  queue.change(3)
  expect(save).toHaveBeenCalledTimes(1)
})
