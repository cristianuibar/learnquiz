import * as Haptics from 'expo-haptics'
import { resultHaptic } from './haptics'

jest.mock('expo-haptics', () => ({
  ...jest.requireActual('expo-haptics'),
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
}))

beforeEach(() => jest.clearAllMocks())

test('a correct result is one light impact', () => {
  resultHaptic('correct')
  expect(Haptics.impactAsync).toHaveBeenCalledTimes(1)
  expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light)
  expect(Haptics.notificationAsync).not.toHaveBeenCalled()
})

test('a miss is one warning notification', () => {
  resultHaptic('miss')
  expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1)
  expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Warning)
  expect(Haptics.impactAsync).not.toHaveBeenCalled()
})

test('a device without a vibrator does not throw', async () => {
  jest.mocked(Haptics.impactAsync).mockRejectedValueOnce(new Error('unavailable'))
  expect(() => resultHaptic('correct')).not.toThrow()
  await Promise.resolve()
})
