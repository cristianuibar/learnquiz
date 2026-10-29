// Shared abuse limits, importable from client and server (no server-only imports here).

// Longest pasted source kept in D1 and sent to the model: about a chapter excerpt.
export const MAX_SOURCE_TEXT_CHARS = 20_000

// Model calls per learner per UTC day, counted in model_calls. A full onboarding
// (curriculum, placement items and line) uses about 8, so 20 leaves room for a
// second topic or a practice session while stopping a looping guest script.
export const DAILY_MODEL_CALL_CAP = 20

export const utcDayStart = (nowMs: number): number => {
  const d = new Date(nowMs)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

export const isOverDailyCap = (callsToday: number, cap: number = DAILY_MODEL_CALL_CAP): boolean => callsToday >= cap
