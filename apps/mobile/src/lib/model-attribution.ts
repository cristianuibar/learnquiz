// Which Muse models produced what a screen shows, as one quiet caption.
// Names come from @learnquiz/api/models, shared with the web; ids that are not
// Muse models are never shown.
import type { SummaryView } from '@learnquiz/api'
import { generatedByLine } from '@learnquiz/api/models'
import type { TopicPath } from '@learnquiz/api/progress'

// Summary: the model behind the placement level line (only when that line is
// shown, as on the web), then the models that wrote the missed questions.
export function summaryAttribution(summary: Pick<SummaryView, 'kind' | 'level' | 'levelLine' | 'levelLineModel' | 'mistakes'>): string | null {
  const placed = summary.kind === 'placement' && summary.level !== null
  const lineModel = placed && summary.levelLine ? summary.levelLineModel : null
  return generatedByLine([lineModel, ...summary.mistakes.map((m) => m.generatedBy)])
}

// Path: the model that wrote the topic's curriculum.
export function pathAttribution(path: Pick<TopicPath, 'topic'>): string | null {
  return generatedByLine([path.topic.generatedBy])
}
