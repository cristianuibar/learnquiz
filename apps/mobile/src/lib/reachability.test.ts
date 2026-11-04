import { API_URL } from './api'
import { REACHABILITY_INTERVAL_MS, REACHABILITY_TIMEOUT_MS, watchReachability } from './reachability'

jest.mock('./auth', () => ({ getToken: jest.fn(), handleUnauthorized: jest.fn() }))

const fetchMock = jest.fn<Promise<Response>, [string, RequestInit?]>()
beforeEach(() => {
  jest.useFakeTimers()
  fetchMock.mockReset()
  globalThis.fetch = fetchMock as typeof fetch
})
afterEach(() => { jest.useRealTimers() })

test('uncached HEAD probes require two consecutive failures and recover on the first HTTP response', async () => {
  const changes = jest.fn()
  fetchMock.mockRejectedValue(new TypeError('Offline'))
  const stop = watchReachability(changes)
  await jest.advanceTimersByTimeAsync(0)
  expect(changes).not.toHaveBeenCalled()
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(`${API_URL}/manifest.webmanifest?reachability=`), {
    method: 'HEAD', credentials: 'omit', cache: 'no-store', signal: expect.any(AbortSignal),
  })
  await jest.advanceTimersByTimeAsync(REACHABILITY_INTERVAL_MS)
  expect(changes).toHaveBeenLastCalledWith(false)
  fetchMock.mockResolvedValue({ status: 503 } as Response)
  await jest.advanceTimersByTimeAsync(REACHABILITY_INTERVAL_MS)
  expect(changes).toHaveBeenLastCalledWith(true)
  stop()
  await jest.advanceTimersByTimeAsync(REACHABILITY_INTERVAL_MS * 2)
  expect(fetchMock).toHaveBeenCalledTimes(3)
})

test('a stalled probe times out promptly, without overlapping requests', async () => {
  const changes = jest.fn()
  fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')))
  }))
  const stop = watchReachability(changes)
  await jest.advanceTimersByTimeAsync(REACHABILITY_TIMEOUT_MS - 1)
  expect(changes).not.toHaveBeenCalled()
  expect(fetchMock).toHaveBeenCalledTimes(1)
  await jest.advanceTimersByTimeAsync(1)
  expect(changes).not.toHaveBeenCalled()
  await jest.advanceTimersByTimeAsync(REACHABILITY_INTERVAL_MS)
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(changes).not.toHaveBeenCalled()
  await jest.advanceTimersByTimeAsync(REACHABILITY_TIMEOUT_MS)
  expect(changes).toHaveBeenCalledWith(false)
  stop()
})

test('a successful probe resets the consecutive failure count', async () => {
  const changes = jest.fn()
  fetchMock.mockRejectedValueOnce(new TypeError('Offline'))
    .mockResolvedValueOnce({ status: 200 } as Response)
    .mockRejectedValue(new TypeError('Offline'))
  const stop = watchReachability(changes)
  await jest.advanceTimersByTimeAsync(REACHABILITY_INTERVAL_MS * 2)
  expect(changes.mock.calls).toEqual([[true]])
  await jest.advanceTimersByTimeAsync(REACHABILITY_INTERVAL_MS)
  expect(changes).toHaveBeenLastCalledWith(false)
  stop()
})

test('stopping aborts an in-flight probe without publishing a false offline event', async () => {
  const changes = jest.fn()
  fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')))
  }))
  const stop = watchReachability(changes)
  stop()
  await jest.advanceTimersByTimeAsync(REACHABILITY_TIMEOUT_MS + REACHABILITY_INTERVAL_MS)
  expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true)
  expect(changes).not.toHaveBeenCalled()
  expect(fetchMock).toHaveBeenCalledTimes(1)
})
