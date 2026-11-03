import type { SessionView, SummaryView } from '@learnquiz/api'
import { api } from './api'

export async function prepareNext(sessionId: string): Promise<void> {
  try {
    await api(`/sessions/${encodeURIComponent(sessionId)}/prepare-next`, { method: 'POST' })
  } catch {
    // Preparation is optional; a failure must not interrupt the current session.
  }
}

export function sessionToPrepare(
  view: Pick<SessionView, 'id' | 'kind' | 'ended'> | null,
  preparedId: string | null,
  active: boolean,
): string | null {
  if (!active || !view || view.ended || view.kind !== 'session' || view.id === preparedId) return null
  return view.id
}

export function placementToPrepare(
  summary: Pick<SummaryView, 'sessionId' | 'kind'> | null,
  preparedId: string | null,
): string | null {
  if (!summary || summary.kind !== 'placement' || summary.sessionId === preparedId) return null
  return summary.sessionId
}
