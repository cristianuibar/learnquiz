import { Appearance } from 'react-native'
import { APPEARANCE_KEY, applyAppearance, applyStoredAppearance, persistAppearance } from './appearance'

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

test.each([['system', 'unspecified'], ['light', 'light'], ['dark', 'dark'], ['invalid', 'unspecified'], [null, 'unspecified']])('stored %s applies %s', async (value, expected) => {
  const setColorScheme = jest.fn()
  expect(await applyStoredAppearance({ getJSON: async () => value, setColorScheme })).toBe(value === 'light' || value === 'dark' ? value : 'system')
  expect(setColorScheme).toHaveBeenCalledWith(expected)
})
test('an unreadable value applies System', async () => {
  const setColorScheme = jest.fn()
  await expect(applyStoredAppearance({ getJSON: async () => { throw new Error('unreadable') }, setColorScheme })).resolves.toBe('system')
  expect(setColorScheme).toHaveBeenCalledWith('unspecified')
})
test('persists per device outside the learner cleanup prefix', async () => {
  const setJSON = jest.fn(async () => {})
  await persistAppearance('dark', { setJSON })
  expect(setJSON).toHaveBeenCalledWith(APPEARANCE_KEY, 'dark')
  expect(APPEARANCE_KEY.startsWith('lq:')).toBe(false)
})

// Exercise the real native boundary as well as the injected storage tests.
// Android RN 0.86 rejects null in Kotlin before any appearance change happens.
test('all native appearance paths use a non-null Android style, including fresh startup', async () => {
  const set = jest.spyOn(Appearance, 'setColorScheme').mockImplementation((style) => {
    if (style == null) throw new Error('Android requires a non-null appearance style')
  })
  try {
    for (const choice of ['system', 'light', 'dark'] as const) applyAppearance(choice)
    await applyStoredAppearance({ getJSON: async () => null, setColorScheme: Appearance.setColorScheme })
    await applyStoredAppearance({ getJSON: async () => { throw new Error('unreadable') }, setColorScheme: Appearance.setColorScheme })
    expect(set.mock.calls.map(([style]) => style)).toEqual(['unspecified', 'light', 'dark', 'unspecified', 'unspecified'])
  } finally { set.mockRestore() }
})
