import { createSerializationAdapter } from '@tanstack/react-router'
import { createCsrfMiddleware, createStart } from '@tanstack/react-start'

// The router serializes only an error's message; keep the HTTP status so the client can tell a refusal from a failure.
const statusErrorAdapter = createSerializationAdapter({
  key: 'status-error',
  test: (v): v is Error & { status: number } => v instanceof Error && typeof (v as { status?: unknown }).status === 'number',
  toSerializable: (e) => ({ message: e.message, status: e.status }),
  fromSerializable: ({ message, status }) => Object.assign(new Error(message), { status }),
})

// A custom start instance replaces Start's default, so its server function CSRF check is added back here.
const csrfMiddleware = createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === 'serverFn' })

export const startInstance = createStart(() => ({ requestMiddleware: [csrfMiddleware], serializationAdapters: [statusErrorAdapter] }))
