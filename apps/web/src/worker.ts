import serverEntry from '@tanstack/react-start/server-entry'
import { getDb } from '@/db'
import { abandonPendingModelCalls } from '@/server/model-cap'
import { drainConceptQueue } from '@/server/concept-gen'
import { sendDuePushes } from '@/server/push/schedule'

export default {
  fetch(request) {
    return serverEntry.fetch(request)
  },
  async queue() {},
  scheduled(controller, _env, ctx) {
    ctx.waitUntil(abandonPendingModelCalls(getDb()))
    ctx.waitUntil(drainConceptQueue())
    // The cron ticks every minute for the concept drain; learning pushes go out on the quarter hour.
    if (new Date(controller.scheduledTime).getUTCMinutes() % 15 === 0) ctx.waitUntil(sendDuePushes(Date.now()))
  },
} satisfies ExportedHandler<Env>
