export type Today = {
  topic: { id: string; title: string; placed: boolean; due: number; xp: number; streak: number } | null
  role: { name: string; topicTitle: string } | null
}
