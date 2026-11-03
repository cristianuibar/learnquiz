import * as Haptics from 'expo-haptics'

export type ResultHaptic = 'correct' | 'miss'

export function resultHaptic(kind: ResultHaptic): void {
  const done = kind === 'correct'
    ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
  done.catch(() => {})
}
