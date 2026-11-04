import { canToggleDay, timeOptions, type CompanyWindow } from '@learnquiz/api/settings'

export type QuestionPreferences = { paused: boolean; startMinute: number; endMinute: number; days: number[]; timezone: string }
export type PushSettings = { prefs: QuestionPreferences; company: CompanyWindow | null }
export function questionSwitchOn(state: { registered: boolean; permission: string }, paused: boolean) {
  return state.registered && state.permission === 'granted' && !paused
}
export function settingsTimeOptions(company: CompanyWindow | null, prefs: QuestionPreferences, field: 'from' | 'to') {
  return field === 'from'
    ? timeOptions(company, 0, prefs.endMinute - 30)
    : timeOptions(company, prefs.startMinute + 30, 1440)
}
export function toggleSettingsDay(days: number[], day: number, workingDays: number[]) {
  if (!workingDays.includes(day) || !canToggleDay(days, day)) return null
  return days.includes(day) ? days.filter((value) => value !== day) : [...days, day].sort((a, b) => a - b)
}
