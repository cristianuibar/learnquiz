export type TodayState = 'first' | 'normal' | 'basics' | 'done'
export type Today = {
  topic: { id: string; title: string; placed: boolean; placeable: boolean; due: number; xp: number; streak: number } | null
  role: { name: string; company: string; topicTitle: string; preparing: boolean; mastery: number | null; benchmark: number
          day: number; days: number; building: { ready: number; total: number } | null } | null
  plan: { state: TodayState; start: 'session' | 'placement'; nextUnit: string | null; reviewsLeft: number
          reviewsCleared: number; sessionDone: boolean; sessionSize: number; playable: boolean
          nextReviewAt: number | null } | null
}
