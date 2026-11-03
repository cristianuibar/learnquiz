import { offlineBody, offlineTitle, startFailed } from '@learnquiz/api/system-copy'
import { beginStartPlay, describeStartFailure, startPlay, type StartPlayEffects } from './start-play'

const mockGetToken = jest.fn((): string | null => null)
const mockHandleUnauthorized = jest.fn((): Promise<void> => Promise.resolve())

jest.mock('./auth', () => ({
  getToken: () => mockGetToken(),
  handleUnauthorized: () => mockHandleUnauthorized(),
}))

type FetchArgs = [string, RequestInit | undefined]
const fetchMock = jest.fn<Promise<Response>, FetchArgs>()

function jsonResponse(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(payload),
  } as unknown as Response
}

function lastCall(): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
  return { url, init: init! }
}

function sentHeaders(): Record<string, string> {
  return (lastCall().init.headers ?? {}) as Record<string, string>
}

function makeEffects(): jest.Mocked<StartPlayEffects> {
  return {
    onSlow: jest.fn(),
    onFailure: jest.fn(),
    onReady: jest.fn(),
    replace: jest.fn(),
    dismissAll: jest.fn(),
  }
}

function abortableFetch(): void {
  fetchMock.mockImplementation(
    (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        )
      }),
  )
}

async function startError(params: Parameters<typeof startPlay>[0]): Promise<unknown> {
  return startPlay(params).then(
    () => { throw new Error('expected rejection') },
    (error: unknown) => error,
  )
}

beforeEach(() => {
  fetchMock.mockReset()
  mockGetToken.mockReset()
  mockHandleUnauthorized.mockReset()
  mockGetToken.mockReturnValue(null)
  mockHandleUnauthorized.mockResolvedValue(undefined)
  globalThis.fetch = fetchMock as unknown as typeof fetch
  jest.useRealTimers()
})

test('session posts to /sessions with the bearer token and returns the id', async () => {
  mockGetToken.mockReturnValue('test-token')
  fetchMock.mockResolvedValue(jsonResponse(200, { sessionId: 's1' }))
  await expect(startPlay({ topicId: 't1', start: 'session' })).resolves.toBe('s1')
  const { url, init } = lastCall()
  expect(url).toBe('https://app.learnquiz.com/api/v1/topics/t1/sessions')
  expect(init.method).toBe('POST')
  expect(sentHeaders().Authorization).toBe('Bearer test-token')
})

test('unitId is sent in the body when set, otherwise the body is empty', async () => {
  fetchMock.mockResolvedValue(jsonResponse(200, { sessionId: 's1' }))
  await startPlay({ topicId: 't1', start: 'session', unitId: 'u1' })
  expect(JSON.parse(lastCall().init.body as string)).toEqual({ unitId: 'u1' })
  await startPlay({ topicId: 't1', start: 'session' })
  expect(JSON.parse(lastCall().init.body as string)).toEqual({})
})

test('placement posts to /placement', async () => {
  fetchMock.mockResolvedValue(jsonResponse(200, { sessionId: 'p1' }))
  await expect(startPlay({ topicId: 't1', start: 'placement' })).resolves.toBe('p1')
  expect(lastCall().url).toBe('https://app.learnquiz.com/api/v1/topics/t1/placement')
})

test('topicId is encoded in the path', async () => {
  fetchMock.mockResolvedValue(jsonResponse(200, { sessionId: 's1' }))
  await startPlay({ topicId: 'a/b c', start: 'session' })
  expect(lastCall().url).toBe('https://app.learnquiz.com/api/v1/topics/a%2Fb%20c/sessions')
})

test('a rejected fetch maps to the offline failure with retry', async () => {
  fetchMock.mockRejectedValue(new Error('offline'))
  expect(describeStartFailure(await startError({ topicId: 't1', start: 'session' }))).toEqual({
    title: offlineTitle,
    message: offlineBody,
    retry: true,
  })
})

test('a 409 maps to the server sentence with no retry', async () => {
  fetchMock.mockResolvedValue(jsonResponse(409, { error: 'Nothing to practice yet' }))
  expect(describeStartFailure(await startError({ topicId: 't1', start: 'session' }))).toEqual({
    message: 'Nothing to practice yet',
    retry: false,
  })
})

test('a 500 maps to the generic copy with retry', async () => {
  fetchMock.mockResolvedValue(jsonResponse(500, { error: 'boom' }))
  expect(describeStartFailure(await startError({ topicId: 't1', start: 'session' }))).toEqual({
    message: startFailed,
    retry: true,
  })
})

test('a caller abort resolves undefined', async () => {
  abortableFetch()
  const controller = new AbortController()
  const pending = startPlay({ topicId: 't1', start: 'session' }, controller.signal)
  controller.abort()
  await expect(pending).resolves.toBeUndefined()
})

test('an already aborted call never starts a request', async () => {
  const controller = new AbortController()
  controller.abort()
  await expect(startPlay({ topicId: 't1', start: 'session' }, controller.signal)).resolves.toBeUndefined()
  expect(fetchMock).not.toHaveBeenCalled()
})

test('an abort racing a late response still resolves undefined', async () => {
  const controller = new AbortController()
  fetchMock.mockImplementation(async () => {
    controller.abort()
    return jsonResponse(200, { sessionId: 's1' })
  })
  await expect(startPlay({ topicId: 't1', start: 'session' }, controller.signal)).resolves.toBeUndefined()
})

test('ready calls onReady then replace with the encoded session id, never push', async () => {
  fetchMock.mockResolvedValue(jsonResponse(200, { sessionId: 's 1' }))
  const effects = makeEffects()
  const handle = beginStartPlay({ topicId: 't1', start: 'session' }, effects)
  await handle.done
  expect(effects.onReady).toHaveBeenCalledTimes(1)
  expect(effects.replace).toHaveBeenCalledTimes(1)
  expect(effects.replace).toHaveBeenCalledWith('/play/s%201')
  const [readyAt] = effects.onReady.mock.invocationCallOrder
  const [replaceAt] = effects.replace.mock.invocationCallOrder
  expect(readyAt).toBeLessThan(replaceAt)
})

test('a server failure reaches onFailure with no navigation', async () => {
  fetchMock.mockResolvedValue(jsonResponse(500, { error: 'boom' }))
  const effects = makeEffects()
  const handle = beginStartPlay({ topicId: 't1', start: 'session' }, effects)
  await handle.done
  expect(effects.onFailure).toHaveBeenCalledWith({ message: startFailed, retry: true })
  expect(effects.replace).not.toHaveBeenCalled()
  expect(effects.dismissAll).not.toHaveBeenCalled()
})

test.each([409, 500])('Cancel still returns to Today after a %s failure', async (status) => {
  fetchMock.mockResolvedValue(jsonResponse(status, { error: 'Could not start' }))
  const effects = makeEffects()
  const handle = beginStartPlay({ topicId: 't1', start: 'session' }, effects)
  await handle.done
  handle.cancel()
  handle.cancel()
  expect(effects.dismissAll).toHaveBeenCalledTimes(1)
  expect(effects.replace).toHaveBeenCalledTimes(1)
  expect(effects.replace).toHaveBeenCalledWith('/(tabs)/today')
})

test('cancel dismisses then returns to Today, suppressing a late success', async () => {
  let resolveFetch!: (response: Response) => void
  fetchMock.mockImplementation(() => new Promise<Response>((resolve) => { resolveFetch = resolve }))
  const effects = makeEffects()
  const order: string[] = []
  effects.dismissAll.mockImplementation(() => { order.push('dismissAll') })
  effects.replace.mockImplementation(() => { order.push('replace') })
  const handle = beginStartPlay({ topicId: 't1', start: 'session' }, effects)
  handle.cancel()
  handle.cancel()
  expect(order).toEqual(['dismissAll', 'replace'])
  expect(effects.replace).toHaveBeenCalledWith('/(tabs)/today')
  resolveFetch(jsonResponse(200, { sessionId: 'late' }))
  await handle.done
  expect(effects.replace).toHaveBeenCalledTimes(1)
  expect(effects.onReady).not.toHaveBeenCalled()
  expect(effects.onFailure).not.toHaveBeenCalled()
})

test('cancel suppresses a late failure', async () => {
  let rejectFetch!: (error: unknown) => void
  fetchMock.mockImplementation(
    () => new Promise<Response>((_resolve, reject) => { rejectFetch = reject }),
  )
  const effects = makeEffects()
  const handle = beginStartPlay({ topicId: 't1', start: 'session' }, effects)
  handle.cancel()
  rejectFetch(new Error('offline'))
  await handle.done
  expect(effects.onFailure).not.toHaveBeenCalled()
  expect(effects.onReady).not.toHaveBeenCalled()
  expect(effects.replace).toHaveBeenCalledTimes(1)
})

test('dispose aborts without navigating and suppresses late callbacks', async () => {
  let resolveFetch!: (response: Response) => void
  fetchMock.mockImplementation(() => new Promise<Response>((resolve) => { resolveFetch = resolve }))
  const effects = makeEffects()
  const handle = beginStartPlay({ topicId: 't1', start: 'session' }, effects)
  handle.dispose()
  resolveFetch(jsonResponse(200, { sessionId: 'late' }))
  await handle.done
  expect(effects.dismissAll).not.toHaveBeenCalled()
  expect(effects.replace).not.toHaveBeenCalled()
  expect(effects.onReady).not.toHaveBeenCalled()
  expect(effects.onFailure).not.toHaveBeenCalled()
})

test('cancel after ready is a no-op', async () => {
  fetchMock.mockResolvedValue(jsonResponse(200, { sessionId: 's1' }))
  const effects = makeEffects()
  const handle = beginStartPlay({ topicId: 't1', start: 'session' }, effects)
  await handle.done
  handle.cancel()
  expect(effects.dismissAll).not.toHaveBeenCalled()
  expect(effects.replace).toHaveBeenCalledTimes(1)
  expect(effects.replace).toHaveBeenCalledWith('/play/s1')
})

test('placement still waits at 45s and times out at 90s', async () => {
  jest.useFakeTimers()
  try {
    abortableFetch()
    const pending = startPlay({ topicId: 't1', start: 'placement' })
    const assertion = expect(pending).rejects.toThrow(/timed out/)
    await jest.advanceTimersByTimeAsync(45_000)
    expect((lastCall().init.signal as AbortSignal).aborted).toBe(false)
    await jest.advanceTimersByTimeAsync(45_000)
    await assertion
  } finally {
    jest.useRealTimers()
  }
})

test('session signals slow after 15s', async () => {
  jest.useFakeTimers()
  try {
    abortableFetch()
    const effects = makeEffects()
    const handle = beginStartPlay({ topicId: 't1', start: 'session' }, effects)
    await jest.advanceTimersByTimeAsync(15_000)
    expect(effects.onSlow).toHaveBeenCalledTimes(1)
    handle.dispose()
    await handle.done
  } finally {
    jest.useRealTimers()
  }
})

test('placement signals slow after 45s, not 15s', async () => {
  jest.useFakeTimers()
  try {
    abortableFetch()
    const effects = makeEffects()
    const handle = beginStartPlay({ topicId: 't1', start: 'placement' }, effects)
    await jest.advanceTimersByTimeAsync(15_000)
    expect(effects.onSlow).not.toHaveBeenCalled()
    await jest.advanceTimersByTimeAsync(30_000)
    expect(effects.onSlow).toHaveBeenCalledTimes(1)
    handle.dispose()
    await handle.done
  } finally {
    jest.useRealTimers()
  }
})

test('a retry starts a new request', async () => {
  fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: 'boom' }))
  fetchMock.mockResolvedValueOnce(jsonResponse(200, { sessionId: 's2' }))
  const first = makeEffects()
  await beginStartPlay({ topicId: 't1', start: 'session' }, first).done
  expect(first.onFailure).toHaveBeenCalledWith({ message: startFailed, retry: true })
  const second = makeEffects()
  await beginStartPlay({ topicId: 't1', start: 'session' }, second).done
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(second.replace).toHaveBeenCalledWith('/play/s2')
})
