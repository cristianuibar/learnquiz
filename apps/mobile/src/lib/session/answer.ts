import type { Answer, Draft, ItemView } from '@learnquiz/api'
import { ApiError } from '../api'

export type AnswerBody = {
  itemId: string
  answer: Answer
  confidence: Draft['confidence']
  responseMs: number
}

export function answerBody(item: ItemView, draft: Draft, responseMs: number): AnswerBody {
  let answer: Answer
  switch (item.format) {
    case 'mcq': answer = { optionId: draft.answer.optionId }; break
    case 'multi': answer = { optionIds: draft.answer.optionIds?.slice() }; break
    case 'order': answer = { order: draft.answer.order?.slice() }; break
    case 'cloze':
    case 'short': answer = { text: draft.answer.text }; break
    default: answer = {}
  }
  return { itemId: item.id, answer, confidence: draft.confidence, responseMs }
}

export function answerError(error: unknown): 'resync' | 'error' {
  return error instanceof ApiError && error.status === 409 ? 'resync' : 'error'
}
