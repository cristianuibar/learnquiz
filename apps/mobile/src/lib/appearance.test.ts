import { APPEARANCE_KEY, applyStoredAppearance, persistAppearance } from './appearance'

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

test.each([['system', null], ['light', 'light'], ['dark', 'dark'], ['invalid', null], [null, null]])('stored %s applies %s', async (value, expected) => {
  const setColorScheme = jest.fn()
  expect(await applyStoredAppearance({ getJSON: async () => value, setColorScheme })).toBe(value === 'light' || value === 'dark' ? value : 'system')
  expect(setColorScheme).toHaveBeenCalledWith(expected)
})
test('an unreadable value applies System', async () => {
  const setColorScheme = jest.fn()
  await expect(applyStoredAppearance({ getJSON: async () => { throw new Error('unreadable') }, setColorScheme })).resolves.toBe('system')
  expect(setColorScheme).toHaveBeenCalledWith(null)
})
test('persists per device outside the learner cleanup prefix', async () => {
  const setJSON = jest.fn(async () => {})
  await persistAppearance('dark', { setJSON })
  expect(setJSON).toHaveBeenCalledWith(APPEARANCE_KEY, 'dark')
  expect(APPEARANCE_KEY.startsWith('lq:')).toBe(false)
})
