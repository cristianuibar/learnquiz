import { createSerializationAdapter } from '@tanstack/react-router'
import { createStart } from '@tanstack/react-start'

// The router serializes only an error's message; keep the HTTP status so the client can tell a refusal from a failure.
const statusErrorAdapter = createSerializationAdapter({
  key: 'status-error',
  test: (v): v is Error & { status: number } => v instanceof Error && typeof (v as { status?: unknown }).status === 'number',
  toSerializable: (e) => ({ message: e.message, status: e.status }),
  fromSerializable: ({ message, status }) => Object.assign(new Error(message), { status }),
})

export const startInstance = createStart(() => ({ serializationAdapters: [statusErrorAdapter] }))
