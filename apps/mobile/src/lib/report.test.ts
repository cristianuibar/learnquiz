import type { ReportReason } from '@learnquiz/api/reveal'
import { api } from './api'
import { sendReport } from './report'

jest.mock('./api', () => ({
  api: jest.fn(),
}))

const mockApi = api as unknown as jest.Mock

beforeEach(() => {
  mockApi.mockReset()
})

test.each<ReportReason>(['incorrect', 'unclear', 'mismatch', 'other'])(
  'sends exact body for reason %s',
  async (reason) => {
    mockApi.mockResolvedValue({ ok: true })
    await expect(
      sendReport({ itemId: 'item-1', attemptId: 'attempt-1', reason, note: 'a note' }),
    ).resolves.toBe(true)
    expect(mockApi).toHaveBeenCalledTimes(1)
    expect(mockApi).toHaveBeenCalledWith('/items/item-1/report', {
      method: 'POST',
      body: { reason, note: 'a note', attemptId: 'attempt-1' },
    })
  },
)

test('sends blank note unchanged with null attemptId', async () => {
  mockApi.mockResolvedValue({ ok: true })
  await expect(
    sendReport({ itemId: 'item-1', attemptId: null, reason: 'other', note: '' }),
  ).resolves.toBe(true)
  expect(mockApi).toHaveBeenCalledWith('/items/item-1/report', {
    method: 'POST',
    body: { reason: 'other', note: '', attemptId: null },
  })
})

test('sends a 301-character note capped at 300', async () => {
  mockApi.mockResolvedValue({ ok: true })
  await sendReport({ itemId: 'item-1', attemptId: null, reason: 'other', note: 'x'.repeat(301) })
  expect(mockApi.mock.calls[0][1].body.note).toBe('x'.repeat(300))
})

test('sends a whitespace-only note as an empty string', async () => {
  mockApi.mockResolvedValue({ ok: true })
  await sendReport({ itemId: 'item-1', attemptId: null, reason: 'other', note: '  \n\t ' })
  expect(mockApi.mock.calls[0][1].body.note).toBe('')
})

test('trims surrounding whitespace from the note', async () => {
  mockApi.mockResolvedValue({ ok: true })
  await sendReport({ itemId: 'item-1', attemptId: null, reason: 'other', note: '  hi  ' })
  expect(mockApi.mock.calls[0][1].body.note).toBe('hi')
})

test('encodes the item id in the path', async () => {
  mockApi.mockResolvedValue({ ok: true })
  await expect(
    sendReport({ itemId: 'a/b?c d', attemptId: null, reason: 'unclear', note: 'x' }),
  ).resolves.toBe(true)
  expect(mockApi.mock.calls[0][0]).toBe(`/items/${encodeURIComponent('a/b?c d')}/report`)
})

test('rejected api resolves false', async () => {
  mockApi.mockRejectedValue(new Error('Network request failed'))
  await expect(
    sendReport({ itemId: 'item-1', attemptId: null, reason: 'incorrect', note: '' }),
  ).resolves.toBe(false)
})

test.each([[{ ok: false }], [{}], [null], [undefined], ['ok'], [42]])(
  'non-ok response %p resolves false',
  async (response) => {
    mockApi.mockResolvedValue(response)
    await expect(
      sendReport({ itemId: 'item-1', attemptId: 'a', reason: 'mismatch', note: 'n' }),
    ).resolves.toBe(false)
  },
)

test('retry after failure can succeed', async () => {
  mockApi.mockRejectedValueOnce(new Error('boom'))
  mockApi.mockResolvedValueOnce({ ok: true })
  await expect(
    sendReport({ itemId: 'item-1', attemptId: null, reason: 'other', note: 'retry' }),
  ).resolves.toBe(false)
  await expect(
    sendReport({ itemId: 'item-1', attemptId: null, reason: 'other', note: 'retry' }),
  ).resolves.toBe(true)
  expect(mockApi).toHaveBeenCalledTimes(2)
})
