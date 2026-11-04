// A queue drains submitted edits even after its screen closes. Its owner
// predicate ends writes when the token changes. Only the last confirmed snapshot survives failure;
// intermediate edits coalesce while the single request is in flight.
export function createSettingsSave<T>({ initial, save, onChange, onError, isCurrent = () => true }: {
  initial: T
  save(value: T): Promise<unknown>
  onChange(value: T): void
  onError(): void
  isCurrent?: () => boolean
}) {
  let confirmed = initial
  let latest = initial
  let pending: { value: T } | null = null
  let saving = false
  let disposed = false
  const current = () => !disposed && isCurrent()
  async function drain() {
    if (saving || !current()) return
    saving = true
    try {
      while (pending && current()) {
        const { value } = pending
        pending = null
        try {
          await save(value)
          if (!current()) return
          confirmed = value
        } catch {
          if (!current()) return
          pending = null
          latest = confirmed
          onChange(confirmed)
          onError()
          return
        }
      }
    } finally { saving = false }
  }
  return {
    value: () => latest,
    isCurrent: current,
    change(value: T) {
      if (!current()) return
      latest = value
      pending = { value }
      onChange(value)
      void drain()
    },
    dispose() { disposed = true; pending = null },
  }
}
