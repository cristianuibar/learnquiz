import { createElement } from 'react'
import { Text } from 'react-native'
import { act, render, screen } from '@testing-library/react-native'
import * as SecureStore from 'expo-secure-store'
import { api, ApiError } from './api'
import { getToken } from './auth'
import { getJSON, setJSON } from './kv'
import { SessionProvider, useSession } from './session-store'

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => 'expired-token'),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}))
jest.mock('expo-sqlite/kv-store', () => {
  const values = new Map<string, string>()
  return { AsyncStorage: {
    getItemAsync: async (key: string) => values.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => { values.set(key, value) },
    removeItemAsync: async (key: string) => values.delete(key),
    getAllKeysAsync: async () => [...values.keys()],
  } }
})

function response(status: number, data: unknown) {
  return { ok: status === 200, status, text: async () => JSON.stringify(data),
    headers: { get: () => null } } as unknown as Response
}
function Probe() {
  const session = useSession()
  return createElement(Text, null, `${session.status}:${session.branding?.name ?? '-'}`)
}

test('parallel 401s erase secure credentials and private SQLite data and reset the mounted session once', async () => {
  const fetchMock = jest.fn()
    .mockResolvedValueOnce(response(200, { user: { id: 'u1', name: 'Learner', isAnonymous: false }, needsDisclosure: false }))
    .mockResolvedValueOnce(response(200, { name: 'Company', logoUrl: null, accent: null }))
  globalThis.fetch = fetchMock
  for (const key of ['lq:draft:1', 'lq:today', 'lq:prompt', 'lq:push-token', 'unrelated']) {
    await setJSON(key, { private: true })
  }
  await render(createElement(SessionProvider, { children: createElement(Probe) }))
  expect(screen.getByText('ready:Company')).toBeOnTheScreen()
  expect(getToken()).toBe('expired-token')

  fetchMock.mockResolvedValue(response(401, { error: 'Session expired' }))
  let results: PromiseSettledResult<unknown>[] = []
  await act(async () => { results = await Promise.allSettled([api('/today'), api('/me/profile')]) })
  for (const result of results) {
    expect(result.status).toBe('rejected')
    if (result.status === 'rejected') {
      expect(result.reason).toBeInstanceOf(ApiError)
      expect(result.reason).toMatchObject({ status: 401, message: 'Session expired' })
    }
  }
  expect(getToken()).toBeNull()
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(1)
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('lq.token')
  expect(screen.getByText('signedOut:-')).toBeOnTheScreen()
  for (const key of ['lq:draft:1', 'lq:today', 'lq:prompt', 'lq:push-token']) {
    await expect(getJSON(key)).resolves.toBeNull()
  }
  await expect(getJSON('unrelated')).resolves.toEqual({ private: true })
})
