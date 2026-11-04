import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'

function worker() {
  const handlers = new Map<string, (event: unknown) => void>()
  const self = {
    addEventListener: (name: string, handler: (event: unknown) => void) => handlers.set(name, handler),
    location: { origin: 'https://learnquiz.test' },
    registration: { showNotification: vi.fn(async () => {}) },
    clients: { matchAll: vi.fn(async (): Promise<{ url: string; focus: () => Promise<void> }[]> => []), openWindow: vi.fn(async () => {}) },
  }
  runInNewContext(readFileSync('public/sw.js', 'utf8'), { self, URL })
  return { self, async dispatch(name: string, event: object) {
    let pending: Promise<unknown> | undefined
    handlers.get(name)!({ ...event, waitUntil: (promise: Promise<unknown>) => { pending = promise } })
    await pending
  } }
}

it('displays push payloads and a visible fallback for an empty or malformed push', async () => {
  const { self, dispatch } = worker()
  await dispatch('push', { data: { json: () => ({ title: 'Learn Quiz', body: 'Test arrived', url: '/me' }) } })
  expect(self.registration.showNotification).toHaveBeenLastCalledWith('Learn Quiz', expect.objectContaining({ body: 'Test arrived', data: { url: '/me' } }))
  for (const data of [undefined, { json: () => { throw new Error('Invalid JSON') } }]) {
    await dispatch('push', { data })
    expect(self.registration.showNotification).toHaveBeenLastCalledWith('Learn Quiz', expect.objectContaining({ body: 'Ready for a little learning?' }))
  }
})

it('shows a title-only question push without a fallback body, tagged so a repeat replaces it', async () => {
  const { self, dispatch } = worker()
  await dispatch('push', { data: { json: () => ({ title: 'Which valve isolates the line?', url: '/play/quick/i1?pushId=p1' }) } })
  const [title, options] = self.registration.showNotification.mock.lastCall as unknown as [string, { body?: string; tag?: string; data: unknown }]
  expect(title).toBe('Which valve isolates the line?')
  expect(options.body).toBeUndefined()
  expect(options.tag).toBe('q-i1')
  expect(options.data).toEqual({ url: '/play/quick/i1?pushId=p1' })
})

it('still shows a question push whose item id is not valid percent-encoding', async () => {
  const { self, dispatch } = worker()
  await dispatch('push', { data: { json: () => ({ title: 'Which valve isolates the line?', url: '/play/quick/%' }) } })
  expect(self.registration.showNotification).toHaveBeenLastCalledWith('Which valve isolates the line?', expect.objectContaining({ tag: 'q-%', data: { url: '/play/quick/%' } }))
})

it('focuses an existing app window or opens the target, refusing off-origin notification URLs', async () => {
  const { self, dispatch } = worker()
  const focus = vi.fn(async () => {})
  self.clients.matchAll.mockResolvedValueOnce([{ url: 'https://learnquiz.test/me', focus }])
  const close = vi.fn()
  await dispatch('notificationclick', { notification: { close, data: { url: '/me' } } })
  expect(close).toHaveBeenCalledOnce()
  expect(focus).toHaveBeenCalledOnce()
  expect(self.clients.openWindow).not.toHaveBeenCalled()
  for (const url of ['/start', '/play/quick/i1?pushId=p1', 'https://attacker.test', '//attacker.test', 'javascript:alert(1)']) {
    await dispatch('notificationclick', { notification: { close, data: { url } } })
    expect(self.clients.openWindow).toHaveBeenLastCalledWith(`https://learnquiz.test${url.startsWith('/start') || url.startsWith('/play/') ? url : '/me'}`)
  }
})
