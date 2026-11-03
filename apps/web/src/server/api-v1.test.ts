import { beforeEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { handleV1 } from './api-v1'

const fns = vi.hoisted(() => ({
  getToday: vi.fn(),
  getInvite: vi.fn(),
  answerItem: vi.fn(),
  prepareNextSession: vi.fn(),
  getTopicPath: vi.fn(),
  getProfile: vi.fn(),
  reportItem: vi.fn(),
  flagResult: vi.fn(),
  subscribeExpo: vi.fn(),
  unsubscribe: vi.fn(),
}))

vi.mock('@/server/curriculum', () => ({ getConceptItems: vi.fn(), getTopicPath: fns.getTopicPath }))
vi.mock('@/server/diagrams', () => ({ generateConceptDiagram: vi.fn() }))
vi.mock('@/server/flags', () => ({ flagResult: fns.flagResult }))
vi.mock('@/server/org', () => ({ getInvite: fns.getInvite }))
vi.mock('@/server/org-settings', () => ({ getCompanyBranding: vi.fn() }))
vi.mock('@/server/play', () => ({
  answerItem: fns.answerItem,
  endSession: vi.fn(),
  getSession: vi.fn(),
  nextItem: vi.fn(),
  prepareNextSession: fns.prepareNextSession,
  reportItem: fns.reportItem,
  startMiniSession: vi.fn(),
  startPlacement: vi.fn(),
  startSession: vi.fn(),
}))
vi.mock('@/server/profile', () => ({ getProfile: fns.getProfile }))
vi.mock('@/server/push', () => ({
  getPushSettings: vi.fn(),
  savePushPreferences: vi.fn(),
  subscribeExpo: fns.subscribeExpo,
  unsubscribe: fns.unsubscribe,
}))
vi.mock('@/server/session-fn', () => ({ acceptDisclosure: vi.fn(), getSessionFn: vi.fn() }))
vi.mock('@/server/today', () => ({ getToday: fns.getToday }))

const auth = { authorization: 'Bearer tok-1' }
const call = (path: string, init: RequestInit = {}) => handleV1(new Request(`http://localhost/api/v1${path}`, init))
const answer = () =>
  call('/sessions/s-1/answer', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: 'other', itemId: 'i1' }) })

beforeEach(() => {
  vi.resetAllMocks()
})

it('rejects a non-public route without a bearer token', async () => {
  const res = await call('/today')
  expect(res.status).toBe(401)
  expect(await res.json()).toEqual({ error: 'Unauthorized' })
  expect(fns.getToday).not.toHaveBeenCalled()
})

it('serves the public invite route without a bearer token', async () => {
  fns.getInvite.mockResolvedValue({ id: 'inv-1' })
  const res = await call('/invites/inv-1')
  expect(res.status).toBe(200)
  expect(fns.getInvite).toHaveBeenCalledWith({ data: { id: 'inv-1' } })
})

it('lets path params override the body and returns the result as JSON', async () => {
  fns.answerItem.mockResolvedValue({ correct: true })
  const res = await answer()
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ correct: true })
  expect(fns.answerItem).toHaveBeenCalledWith({ data: { sessionId: 's-1', itemId: 'i1' } })
})

it('passes query string params together with path params on GET', async () => {
  fns.getTopicPath.mockResolvedValue({})
  await call('/topics/t-1/path?x=1', { headers: auth })
  expect(fns.getTopicPath).toHaveBeenCalledWith({ data: { topicId: 't-1', x: '1' } })
})

it('requires a bearer token before preparing the next session', async () => {
  const res = await call('/sessions/s-1/prepare-next', { method: 'POST' })
  expect(res.status).toBe(401)
  expect(await res.json()).toEqual({ error: 'Unauthorized' })
  expect(fns.prepareNextSession).not.toHaveBeenCalled()
})

it('prepares the owner session with the path ID and returns JSON', async () => {
  fns.prepareNextSession.mockResolvedValue({ ok: true })
  const res = await call('/sessions/s-1/prepare-next', {
    method: 'POST', headers: auth, body: JSON.stringify({ sessionId: 'other' }),
  })
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ ok: true })
  expect(fns.prepareNextSession).toHaveBeenCalledTimes(1)
  expect(fns.prepareNextSession).toHaveBeenCalledWith({ data: { sessionId: 's-1' } })
})

it('preserves the ownership rejection from prepareNextSession', async () => {
  fns.prepareNextSession.mockRejectedValue(Object.assign(new Error('Session not found'), { status: 404 }))
  const res = await call('/sessions/another-learner-session/prepare-next', { method: 'POST', headers: auth })
  expect(res.status).toBe(404)
  expect(await res.json()).toEqual({ error: 'Session not found' })
  expect(fns.prepareNextSession).toHaveBeenCalledWith({ data: { sessionId: 'another-learner-session' } })
})

it('maps a thrown error with a status to that status', async () => {
  fns.answerItem.mockRejectedValue(Object.assign(new Error('Session not found'), { status: 404 }))
  const res = await answer()
  expect(res.status).toBe(404)
  expect(await res.json()).toEqual({ error: 'Session not found' })
})

const schema = z.object({ sessionId: z.string() })
it.each([
  ['a zod error', () => schema.parse({})],
  ["Start's rethrown validator error", () => { throw new Error(JSON.stringify(schema.safeParse({}).error!.issues, undefined, 2)) }],
])('maps %s to 400', async (_, fail) => {
  fns.answerItem.mockImplementation(async () => fail())
  expect((await answer()).status).toBe(400)
})

it('maps an unexpected error to 500 without leaking details', async () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  fns.answerItem.mockRejectedValue(new Error('boom'))
  const res = await answer()
  expect(res.status).toBe(500)
  expect(await res.json()).toEqual({ error: 'Internal error' })
  spy.mockRestore()
})

it('always reads the caller own profile, ignoring learnerId', async () => {
  fns.getProfile.mockResolvedValue({ ok: 1 })
  const res = await call('/me/profile?learnerId=someone-else', { headers: auth })
  expect(res.status).toBe(200)
  expect(fns.getProfile).toHaveBeenCalledTimes(1)
  expect(fns.getProfile).toHaveBeenCalledWith({ data: {} })
})

it('routes item reports and result flags with a bearer only', async () => {
  fns.reportItem.mockResolvedValue({ ok: true })
  fns.flagResult.mockResolvedValue({ ok: true })
  const post = (path: string, body: object, headers: object = auth) =>
    call(path, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  expect((await post('/items/i-1/report', { reason: 'unclear' })).status).toBe(200)
  expect(fns.reportItem).toHaveBeenCalledWith({ data: { itemId: 'i-1', reason: 'unclear' } })
  expect((await post('/me/result-flags', { conceptId: 'c-1', note: 'Unfair' })).status).toBe(200)
  expect(fns.flagResult).toHaveBeenCalledWith({ data: { conceptId: 'c-1', note: 'Unfair' } })
  expect((await post('/items/i-1/report', {}, {})).status).toBe(401)
  expect((await post('/me/result-flags', { conceptId: 'c-1' }, {})).status).toBe(401)
  expect(fns.reportItem).toHaveBeenCalledTimes(1)
  expect(fns.flagResult).toHaveBeenCalledTimes(1)
})

it('registers an Expo push token only with a bearer', async () => {
  fns.subscribeExpo.mockResolvedValue({ subscribed: true })
  const body = JSON.stringify({ token: 'ExponentPushToken[abc]' })
  expect((await call('/push/expo', { method: 'PUT', body })).status).toBe(401)
  expect(fns.subscribeExpo).not.toHaveBeenCalled()
  const res = await call('/push/expo', { method: 'PUT', body, headers: auth })
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ subscribed: true })
  expect(fns.subscribeExpo).toHaveBeenCalledWith({ data: { token: 'ExponentPushToken[abc]' } })
})

it('forwards the endpoint on DELETE /push/expo', async () => {
  fns.unsubscribe.mockResolvedValue({ subscribed: false })
  const res = await call('/push/expo', { method: 'DELETE', body: JSON.stringify({ endpoint: 'ExponentPushToken[abc]' }), headers: auth })
  expect(res.status).toBe(200)
  expect(fns.unsubscribe).toHaveBeenCalledWith({ data: { endpoint: 'ExponentPushToken[abc]' } })
})
