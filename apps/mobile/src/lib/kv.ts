import { AsyncStorage } from 'expo-sqlite/kv-store'

// JSON wrappers over the SQLite-backed key-value store. Values are always
// stored as JSON strings so callers can persist drafts, cached payloads and
// the locally stored push token without manual serialization.
export async function getJSON<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItemAsync(key)
  if (raw == null) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export async function setJSON(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItemAsync(key, JSON.stringify(value))
}

export async function remove(key: string): Promise<void> {
  await AsyncStorage.removeItemAsync(key)
}

// Remove only the keys starting with `prefix` (e.g. 'lq:' on sign-out),
// leaving unrelated keys stored by other libraries untouched.
export async function clearPrefix(prefix: string): Promise<void> {
  const keys = await AsyncStorage.getAllKeysAsync()
  await Promise.all(keys.filter((key) => key.startsWith(prefix)).map((key) => AsyncStorage.removeItemAsync(key)))
}
