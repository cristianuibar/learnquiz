import { z } from 'zod'
import { seedNorthwind } from './northwind'

// This entry is used only by the seed command, never by the deployed app Worker.
const Input = z.object({
  sopText: z.string().trim().min(100).max(20_000),
  ownerPassword: z.string().min(8).max(128),
  learnerPassword: z.string().min(8).max(128),
}).strict()

export default {
  async fetch(request: Request, env: { NORTHWIND_SEED_TOKEN: string }): Promise<Response> {
    if (!env.NORTHWIND_SEED_TOKEN || request.headers.get('x-northwind-seed-token') !== env.NORTHWIND_SEED_TOKEN) {
      return new Response('Forbidden', { status: 403 })
    }
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/seed') {
      return new Response('Not found', { status: 404 })
    }
    const body = await request.text()
    if (body.length > 64_000) return new Response('Seed input too large', { status: 413 })
    let input: z.infer<typeof Input>
    try {
      input = Input.parse(JSON.parse(body))
    } catch {
      return new Response('Invalid SOP or runtime passwords', { status: 400 })
    }
    try {
      return Response.json(await seedNorthwind(input))
    } catch (error) {
      // Auth/provider/database errors can contain request data. Do not return or log them.
      const status = error instanceof Error && 'status' in error && typeof error.status === 'number' ? error.status : 500
      return new Response('Northwind seed could not finish. Check migrations, model configuration, daily limits and demo account conflicts before retrying.', { status: status >= 400 && status <= 599 ? status : 500 })
    }
  },
}
