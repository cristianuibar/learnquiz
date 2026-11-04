import type { Answer, ItemFormat } from '@learnquiz/api'

export function toAnswer(format: ItemFormat, choice: string): Answer {
  const ids = choice ? choice.split(',') : []
  switch (format) {
    case 'mcq': return { optionId: choice }
    case 'multi': return { optionIds: ids }
    case 'order': return { order: ids }
    case 'cloze':
    case 'short': return { text: choice.trim() }
  }
}
