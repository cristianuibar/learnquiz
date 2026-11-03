// Shared abuse limits, importable from client and server (no server-only imports here).

// Longest pasted source kept in D1 and sent to the model: about a chapter excerpt.
export const MAX_SOURCE_TEXT_CHARS = 20_000

// Longest extracted or pasted text kept for one company role document.
export const MAX_ROLE_DOCUMENT_CHARS = 60_000

// Largest original file (PDF) a company admin can upload for a role document.
export const MAX_ROLE_DOCUMENT_BYTES = 10 * 1024 * 1024

// Model calls per learner per UTC day, counted in model_calls. Guests stay low to stop a
// looping guest script; a full onboarding (curriculum, placement items and line) uses about 8.
// Signed-in accounts get room for a topic, placement and several sessions of written answers
// in one day, and this is still the hard daily ceiling.
export const GUEST_DAILY_MODEL_CALL_CAP = 20
export const ACCOUNT_DAILY_MODEL_CALL_CAP = 150

export const utcDayStart = (nowMs: number): number => {
  const d = new Date(nowMs)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

export const isOverDailyCap = (callsToday: number, cap: number = GUEST_DAILY_MODEL_CALL_CAP): boolean => callsToday >= cap
