// Shared abuse limits, importable from client and server (no server-only imports here).

// Longest pasted source kept in D1 and sent to the model: about a chapter excerpt.
export const MAX_SOURCE_TEXT_CHARS = 20_000

// Longest extracted or pasted text kept for one company role document.
export const MAX_ROLE_DOCUMENT_CHARS = 60_000

// Largest original file (PDF) a company admin can upload for a role document.
export const MAX_ROLE_DOCUMENT_BYTES = 10 * 1024 * 1024

// Model calls per learner per UTC day, counted in model_calls: 150 per guest and
// 500 per registered account (owner decision, 2026-11-04), so judges can try several
// sessions tonight: placement plus prefetch alone uses about 20-25 calls.
// Guest abuse is bounded by the edge per-IP guest-creation limit: 5 per 10 seconds.
export const GUEST_DAILY_MODEL_CALL_CAP = 150
export const ACCOUNT_DAILY_MODEL_CALL_CAP = 500

// Model calls per company per UTC day, counted through its topics: background role item generation.
export const COMPANY_DAILY_MODEL_CALL_CAP = 400

export const utcDayStart = (nowMs: number): number => {
  const d = new Date(nowMs)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

export const isOverDailyCap = (callsToday: number, cap: number = GUEST_DAILY_MODEL_CALL_CAP): boolean => callsToday >= cap
