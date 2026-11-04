// Which Muse models produced what a screen shows, as one quiet caption.
// Names come from @learnquiz/api/models, shared with the web; ids that are not
// Muse models are never shown.
import type { SummaryView } from '@learnquiz/api'
import { generatedByLine } from '@learnquiz/api/models'
import type { TopicPath } from '@learnquiz/api/progress'

// Summary: the model behind the placement level line (only when that line is
// shown, as on the web), then the session's models. A server that sends
// `models` is authoritative, so an empty list hides the caption; an older
// server without it falls back to the models that wrote the missed questions.
export function summaryAttribution(summary: Pick<SummaryView, 'kind' | 'level' | 'levelLine' | 'levelLineModel' | 'mistakes' | 'models'>): string | null {
  const placed = summary.kind === 'placement' && summary.level !== null
  const lineModel = placed && summary.levelLine ? summary.levelLineModel : null
  const models = Array.isArray(summary.models) ? summary.models : summary.mistakes.map((m) => m.generatedBy)
  return generatedByLine([lineModel, ...models])
}

// Path: the models behind the curriculum, its questions and its diagrams; an
// older server without `models` names the curriculum model only.
export function pathAttribution(path: Pick<TopicPath, 'topic' | 'models'>): string | null {
  return generatedByLine(Array.isArray(path.models) ? path.models : [path.topic.generatedBy])
}
