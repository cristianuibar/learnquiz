import serverEntry from '@tanstack/react-start/server-entry'
import { drainConceptQueue } from '@/server/concept-gen'

export default {
  fetch(request) {
    return serverEntry.fetch(request)
  },
  async queue() {},
  scheduled(_controller, _env, ctx) {
    ctx.waitUntil(drainConceptQueue())
  },
} satisfies ExportedHandler<Env>
