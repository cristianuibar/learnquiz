import { Appearance } from 'react-native'

export type AppearanceChoice = 'system' | 'light' | 'dark'
// Appearance belongs to the device, so learner sign-out must not clear it.
export const APPEARANCE_KEY = 'device:appearance'
type ReadDeps = { getJSON(key: string): Promise<unknown>; setColorScheme(value: 'light' | 'dark' | 'unspecified'): void }
export function applyAppearance(value: AppearanceChoice) {
  Appearance.setColorScheme(value === 'system' ? 'unspecified' : value)
}
export async function readAppearance(getJSON?: ReadDeps['getJSON']): Promise<AppearanceChoice> {
  try {
    const read: ReadDeps['getJSON'] = getJSON ?? require('./kv').getJSON
    const value = await read(APPEARANCE_KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch { return 'system' }
}
export async function applyStoredAppearance(deps?: ReadDeps): Promise<AppearanceChoice> {
  const value = await readAppearance(deps?.getJSON)
  if (deps) deps.setColorScheme(value === 'system' ? 'unspecified' : value)
  else applyAppearance(value)
  return value
}
export async function persistAppearance(value: AppearanceChoice, deps: { setJSON(key: string, value: unknown): Promise<void> } = require('./kv')) {
  await deps.setJSON(APPEARANCE_KEY, value)
}
