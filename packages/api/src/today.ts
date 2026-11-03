export type Today = {
  topic: { id: string; title: string; placed: boolean; placeable: boolean; due: number; xp: number; streak: number } | null
  role: { name: string; company: string; topicTitle: string; preparing: boolean } | null
}
