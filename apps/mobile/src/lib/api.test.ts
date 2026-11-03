import { api, ApiError, authCall, mediaSource, postForm } from './api'

const mockGetToken = jest.fn((): string | null => null)
const mockHandleUnauthorized = jest.fn((): Promise<void> => Promise.resolve())

jest.mock('./auth', () => ({
  getToken: () => mockGetToken(),
  handleUnauthorized: () => mockHandleUnauthorized(),
}))

type FetchArgs = [string, RequestInit | undefined]
const fetchMock = jest.fn<Promise<Response>, FetchArgs>()

function jsonResponse(status: number, payload: unknown, token: string | null = null): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'set-auth-token' ? token : null,
    },
    text: async () => (typeof payload === 'string' ? payload : JSON.stringify(payload)),
  } as unknown as Response
}

function lastInit(): RequestInit {
  return fetchMock.mock.calls[fetchMock.mock.calls.length - 1][1]!
}

function headerNames(init: RequestInit): string[] {
  return Object.keys((init.headers ?? {}) as Record<string, string>)
}

beforeEach(() => {
  fetchMock.mockReset()
  mockGetToken.mockReset()
  mockHandleUnauthorized.mockReset()
  mockGetToken.mockReturnValue(null)
  mockHandleUnauthorized.mockResolvedValue(undefined)
  globalThis.fetch = fetchMock as unknown as typeof fetch
})

test('api sends Bearer token, credentials omit, and never Origin', async () => {
  mockGetToken.mockReturnValue('session-token')
  fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }))
  await api('/today')
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('https://app.learnquiz.com/api/v1/today')
  expect(init?.credentials).toBe('omit')
  const headers = (init?.headers ?? {}) as Record<string, string>
  expect(headers.Authorization).toBe('Bearer session-token')
  expect(headerNames(init!).some((name) => name.toLowerCase() === 'origin')).toBe(false)
})

test('api omits Authorization when signed out', async () => {
  fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }))
  await api('/today')
  const headers = (lastInit().headers ?? {}) as Record<string, string>
  expect(headers.Authorization).toBeUndefined()
})

test('a rejected fetch gives status null', async () => {
  fetchMock.mockRejectedValue(new Error('offline'))
  const error = await api('/today').then(() => { throw new Error("expected rejection") }, (e) => e as ApiError)
  expect(error).toBeInstanceOf(ApiError)
  expect(error.status).toBeNull()
})

test('a timeout aborts the fetch with status null', async () => {
  fetchMock.mockImplementation(
    (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        )
      }),
  )
  const error = await api('/today', { timeoutMs: 20 }).then(() => { throw new Error("expected rejection") }, (e) => e as ApiError)
  expect(error).toBeInstanceOf(ApiError)
  expect(error.status).toBeNull()
  expect(error.message).toMatch(/timed out/)
})

test('timeout still aborts a stalled response body when a caller signal is supplied', async () => {
  const controller = new AbortController()
  fetchMock.mockImplementation(async (_url, init) => ({
    ...jsonResponse(200, {}),
    text: () => new Promise<string>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')))
    }),
  }))
  await expect(api('/today', { timeoutMs: 20, signal: controller.signal }))
    .rejects.toMatchObject({ status: null, message: expect.stringMatching(/timed out/) })
  expect(controller.signal.aborted).toBe(false)
})

test('caller abort listeners are removed when the request resolves', async () => {
  const controller = new AbortController()
  const remove = jest.spyOn(controller.signal, 'removeEventListener')
  fetchMock.mockResolvedValue(jsonResponse(200, {}))
  await api('/today', { signal: controller.signal })
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
})

test('a cleanup failure still reports the server 401 as ApiError', async () => {
  mockGetToken.mockReturnValue('expired')
  mockHandleUnauthorized.mockRejectedValue(new Error('Storage unavailable'))
  fetchMock.mockResolvedValue(jsonResponse(401, { error: 'Session expired' }))
  await expect(api('/today')).rejects.toMatchObject({ status: 401, message: 'Session expired' })
})

test('{error} maps to message, Better Auth {message} is the fallback', async () => {
  fetchMock.mockResolvedValue(jsonResponse(400, { error: 'Pick a job role' }))
  const first = await api('/x').then(() => { throw new Error("expected rejection") }, (e) => e as ApiError)
  expect(first).toBeInstanceOf(ApiError)
  expect(first.status).toBe(400)
  expect(first.message).toBe('Pick a job role')

  fetchMock.mockResolvedValue(jsonResponse(401, { message: 'Invalid credentials' }))
  const second = await authCall('/sign-in/email', { email: 'a', password: 'b' }).then(() => { throw new Error("expected rejection") }, (e) => e as ApiError)
  expect(second).toBeInstanceOf(ApiError)
  expect(second.status).toBe(401)
  expect(second.message).toBe('Invalid credentials')
})

test('concurrent 401s call handleUnauthorized exactly once', async () => {
  mockGetToken.mockReturnValue('stale-token')
  fetchMock.mockResolvedValue(jsonResponse(401, { error: 'Invalid session' }))
  const results = await Promise.all([
    api('/a').then(() => { throw new Error("expected rejection") }, (e) => e as ApiError),
    api('/b').then(() => { throw new Error("expected rejection") }, (e) => e as ApiError),
    api('/c').then(() => { throw new Error("expected rejection") }, (e) => e as ApiError),
  ])
  for (const result of results) {
    expect(result).toBeInstanceOf(ApiError)
    expect(result.status).toBe(401)
  }
  expect(mockHandleUnauthorized).toHaveBeenCalledTimes(1)
})

test('a stale 401 does not invalidate a newer token', async () => {
  mockGetToken.mockReturnValue('old-token')
  fetchMock.mockImplementation(async () => {
    mockGetToken.mockReturnValue('new-token')
    return jsonResponse(401, { error: 'Invalid session' })
  })
  const error = await api('/today').then(() => { throw new Error("expected rejection") }, (e) => e as ApiError)
  expect(error.status).toBe(401)
  expect(mockHandleUnauthorized).not.toHaveBeenCalled()
})

test('authCall returns data plus the set-auth-token header', async () => {
  mockGetToken.mockReturnValue('existing')
  fetchMock.mockResolvedValue(jsonResponse(200, { user: { id: '1' } }, 'fresh-token'))
  const result = await authCall<{ user: { id: string } }>('/sign-in/email', {
    email: 'a@b.c',
    password: 'pw',
  })
  expect(result).toEqual({ data: { user: { id: '1' } }, token: 'fresh-token' })
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('https://app.learnquiz.com/api/auth/sign-in/email')
  expect(init?.method).toBe('POST')
  const headers = (init?.headers ?? {}) as Record<string, string>
  expect(headers['Content-Type']).toBe('application/json')
  expect(headers.Authorization).toBe('Bearer existing')
  expect(JSON.parse(init?.body as string)).toEqual({ email: 'a@b.c', password: 'pw' })
})

test('authCall get-session uses GET with no body', async () => {
  fetchMock.mockResolvedValue(jsonResponse(200, { user: null }))
  await authCall('/get-session')
  const [, init] = fetchMock.mock.calls[0]
  expect(init?.method).toBe('GET')
  expect(init?.body).toBeUndefined()
  expect(headerNames(init!)).not.toContain('Content-Type')
})

test('a failed sign-in 401 reports credentials without invalidating the session', async () => {
  mockGetToken.mockReturnValue('existing-session')
  fetchMock.mockResolvedValue(jsonResponse(401, { message: 'Invalid email or password' }))
  const error = await authCall('/sign-in/email', { email: 'a', password: 'wrong' }).then(() => { throw new Error("expected rejection") }, (e) => e as ApiError)
  expect(error).toBeInstanceOf(ApiError)
  expect(error.status).toBe(401)
  expect(error.message).toBe('Invalid email or password')
  expect(mockHandleUnauthorized).not.toHaveBeenCalled()
})

test('an authenticated auth endpoint 401 invalidates the session', async () => {
  mockGetToken.mockReturnValue('stale-token')
  fetchMock.mockResolvedValue(jsonResponse(401, { error: 'Invalid session' }))
  const error = await authCall('/get-session', undefined, { authenticated: true }).then(() => { throw new Error("expected rejection") }, (e) => e as ApiError)
  expect(error.status).toBe(401)
  expect(mockHandleUnauthorized).toHaveBeenCalledTimes(1)
})

test('postForm sends multipart without Content-Type and routes 401', async () => {
  mockGetToken.mockReturnValue('session-token')
  fetchMock.mockResolvedValue(jsonResponse(200, { id: 'upload-1' }))
  const form = new FormData()
  form.append('file', 'bytes')
  const data = await postForm<{ id: string }>('/media', form, 5000)
  expect(data).toEqual({ id: 'upload-1' })
  const [, init] = fetchMock.mock.calls[0]
  expect(init?.method).toBe('POST')
  expect(init?.body).toBe(form)
  expect(headerNames(init!)).not.toContain('Content-Type')
  expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer session-token')

  fetchMock.mockResolvedValue(jsonResponse(401, { error: 'Invalid session' }))
  await expect(postForm('/media', form)).rejects.toMatchObject({ status: 401 })
  expect(mockHandleUnauthorized).toHaveBeenCalledTimes(1)
})

test('caller abort rejects with status null', async () => {
  fetchMock.mockImplementation(
    (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        )
      }),
  )
  const controller = new AbortController()
  const pending = api('/today', { signal: controller.signal, timeoutMs: 5000 })
  controller.abort()
  const error = await pending.then(() => { throw new Error("expected rejection") }, (e) => e as ApiError)
  expect(error).toBeInstanceOf(ApiError)
  expect(error.status).toBeNull()
  expect(error.message).toMatch(/abort/i)
})

test('mediaSource builds the URI and headers from the current token', () => {
  mockGetToken.mockReturnValue('session-token')
  expect(mediaSource('/media/logo.png')).toEqual({
    uri: 'https://app.learnquiz.com/media/logo.png',
    headers: { Authorization: 'Bearer session-token' },
  })
  mockGetToken.mockReturnValue(null)
  expect(mediaSource('/media/logo.png')).toEqual({
    uri: 'https://app.learnquiz.com/media/logo.png',
    headers: {},
  })
})

describe('API_URL', () => {
  const previous = process.env.EXPO_PUBLIC_API_URL
  afterEach(() => {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_API_URL
    else process.env.EXPO_PUBLIC_API_URL = previous
    jest.resetModules()
  })

  test('defaults to production and honors EXPO_PUBLIC_API_URL', () => {
    delete process.env.EXPO_PUBLIC_API_URL
    jest.resetModules()
    const fallback = require('./api') as typeof import('./api')
    expect(fallback.API_URL).toBe('https://app.learnquiz.com')
    process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:8787'
    jest.resetModules()
    const override = require('./api') as typeof import('./api')
    expect(override.API_URL).toBe('http://127.0.0.1:8787')
    jest.resetModules()
  })
})
