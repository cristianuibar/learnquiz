import { questionSwitchOn, settingsTimeOptions, toggleSettingsDay } from './settings-rules'
const company = { name: 'Northwind', startMinute: 360, endMinute: 1080, days: [1, 2, 3, 4, 5], timezone: 'UTC' }
const prefs = { paused: false, startMinute: 420, endMinute: 930, days: [1, 2], timezone: 'UTC' }

test.each([
  [true, 'granted', false, true], [false, 'granted', false, false],
  [true, 'denied', false, false], [true, 'undetermined', false, false], [true, 'granted', true, false],
])('switch registered=%s permission=%s paused=%s is %s', (registered, permission, paused, expected) => {
  expect(questionSwitchOn({ registered, permission }, paused)).toBe(expected)
})
test('time choices stay inside company hours and preserve at least 30 minutes', () => {
  const from = settingsTimeOptions(company, prefs, 'from')
  const to = settingsTimeOptions(company, prefs, 'to')
  expect(from[0]).toEqual({ value: 360, label: '6:00 AM' })
  expect(from.at(-1)?.value).toBe(900)
  expect(to[0].value).toBe(450)
  expect(to.at(-1)?.value).toBe(1080)
  expect(from.every((option, i) => !i || option.value - from[i - 1].value === 30)).toBe(true)
})
test('off-grid company boundaries still yield valid 30-minute choices', () => {
  const options = settingsTimeOptions({ ...company, startMinute: 375 }, prefs, 'from')
  expect(options[0].value).toBe(375)
  expect(options.every(({ value }) => value <= prefs.endMinute - 30)).toBe(true)
})
test('days toggle only company working days and retain the last day', () => {
  expect(toggleSettingsDay([1, 2], 1, company.days)).toEqual([2])
  expect(toggleSettingsDay([2], 2, company.days)).toBeNull()
  expect(toggleSettingsDay([2], 1, company.days)).toEqual([1, 2])
  expect(toggleSettingsDay([2], 7, company.days)).toBeNull()
})
