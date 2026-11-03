import type { Answer, ItemFormat, Reveal } from '@learnquiz/api'
import { optionMarks, type OptionMark } from '@learnquiz/api/reveal'

/** What the reveal overlay shows on its one mounted Sheet. */
export type OverlayMode = 'result' | 'report'
/** Where accessibility focus goes after the overlay changes mode. */
export type OverlayFocus = 'band' | 'heading' | 'report'

export type OverlayState = {
  mode: OverlayMode
  focus: OverlayFocus
  /** Reflection text; it lives here so it survives the Report round trip. */
  reflection: string
  /** A report was sent for this reveal: Report cannot open again. */
  reported: boolean
}

export type OverlayAction =
  | { type: 'report' }
  | { type: 'back' }
  | { type: 'sent' }
  | { type: 'continue' }
  | { type: 'reflection'; text: string }

export type ContinueRequest = { why?: string; reported: boolean }

export const initialOverlay: OverlayState = { mode: 'result', focus: 'band', reflection: '', reported: false }

/**
 * Applies one overlay action. `advance` is set when the session should call
 * `POST /next`: Continue on the result, or a successful report. A report can be
 * sent at most once per reveal, so a second `sent` never advances again.
 */
export function overlayStep(state: OverlayState, action: OverlayAction): { state: OverlayState; advance: ContinueRequest | null } {
  switch (action.type) {
    case 'reflection':
      return { state: { ...state, reflection: action.text }, advance: null }
    case 'report':
      if (state.mode !== 'result' || state.reported) return { state, advance: null }
      return { state: { ...state, mode: 'report', focus: 'heading' }, advance: null }
    case 'back':
      if (state.mode !== 'report') return { state, advance: null }
      return { state: { ...state, mode: 'result', focus: 'report' }, advance: null }
    case 'sent': {
      if (state.mode !== 'report' || state.reported) return { state, advance: null }
      const next: OverlayState = { ...state, mode: 'result', focus: 'band', reported: true }
      return { state: next, advance: continueRequest(next) }
    }
    case 'continue':
      if (state.mode !== 'result') return { state, advance: null }
      return { state, advance: continueRequest(state) }
  }
}

export function continueRequest(state: OverlayState): ContinueRequest {
  const why = state.reflection.trim()
  return { ...(why ? { why } : {}), reported: state.reported }
}

/**
 * `GET /sessions/:id` advances an answered slot on the server, so it must not
 * run while another request is pending or while the reveal overlay is open.
 */
export function canLoadSession(input: { active: boolean; inFlight: boolean; overlayOpen: boolean }): boolean {
  return input.active && !input.inFlight && !input.overlayOpen
}

/** One pending flag: Continue only calls `POST /next` when nothing else is in flight. */
export function canAdvance(input: { active: boolean; inFlight: boolean; overlayOpen: boolean }): boolean {
  return input.active && !input.inFlight && input.overlayOpen
}

/** The options the learner picked, read by format so stale keys in a draft are ignored. */
export function pickedOptionIds(format: ItemFormat, answer: Answer): string[] {
  if (format === 'mcq') return answer.optionId ? [answer.optionId] : []
  if (format === 'multi') return answer.optionIds ?? []
  return []
}

/** Marks for the question behind the sheet; none until a reveal is open. */
export function revealMarks(reveal: Reveal | null, format: ItemFormat, answer: Answer): Record<string, OptionMark> | null {
  return reveal ? optionMarks(reveal, pickedOptionIds(format, answer)) : null
}

/** The "Report sent" notice shows only on the question that follows the report. */
export function noticeFor(notice: { key: string; text: string } | null, key: string | null): string | null {
  return notice && key !== null && notice.key === key ? notice.text : null
}
