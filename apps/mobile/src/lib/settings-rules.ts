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

// Normalize the entire PUT, including edits unrelated to hours. Saved hours
// can predate a narrower company window (#636).
export function clampPreferences(prefs: QuestionPreferences, company: CompanyWindow | null, deviceTimezone: string): QuestionPreferences {
  if (!company) return { ...prefs, timezone: deviceTimezone }
  const startMinute = Math.min(Math.max(prefs.startMinute, company.startMinute), company.endMinute - 30)
  const endMinute = Math.min(Math.max(prefs.endMinute, startMinute + 30), company.endMinute)
  return { ...prefs, startMinute, endMinute, timezone: company.timezone }
}
// The server rejects an empty days list but keeps the saved days when `days` is
// omitted. Days are empty when the company dropped every day the learner chose (#669).
export function pushPreferencesBody(prefs: QuestionPreferences, company: CompanyWindow | null, deviceTimezone: string): Omit<QuestionPreferences, 'days'> & { days?: number[] } {
  const { days, ...rest } = clampPreferences(prefs, company, deviceTimezone)
  return days.length ? { ...rest, days } : rest
}
export function deviceTimezone(fallback: string): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || fallback }
  catch { return fallback }
}
