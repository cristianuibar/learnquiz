import type { ReportReason } from '@learnquiz/api/reveal'
import { api } from './api'

export async function sendReport(input: {
  itemId: string
  attemptId: string | null
  reason: ReportReason
  note: string
}): Promise<boolean> {
  try {
    const data = await api<unknown>(`/items/${encodeURIComponent(input.itemId)}/report`, {
      method: 'POST',
      body: { reason: input.reason, note: input.note, attemptId: input.attemptId },
    })
    return data !== null && typeof data === 'object' && 'ok' in data && data.ok === true
  } catch {
    return false
  }
}
