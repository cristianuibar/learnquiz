import { useRef, useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Working } from '@/components/working'
import { authClient } from '@/lib/auth-client'
import { MAX_SOURCE_TEXT_CHARS } from '@/lib/limits'
import { createTopic } from '@/server/curriculum'
import { startPlacement } from '@/server/play'

export const Route = createFileRoute('/start')({
  validateSearch: (search: Record<string, unknown>): { topic?: string } => ({
    topic: typeof search.topic === 'string' ? search.topic : undefined,
  }),
  component: Start,
})

function Start() {
  const { user } = Route.useRouteContext()
  const search = Route.useSearch()
  const router = useRouter()
  const create = useServerFn(createTopic)
  const place = useServerFn(startPlacement)
  const created = useRef<{ key: string; topicId: string }>(undefined) // a retry after a failed placement reuses the topic
  const [topic, setTopic] = useState(search.topic ?? '')
  const [goal, setGoal] = useState('')
  const [sourceText, setSourceText] = useState('')
  const [status, setStatus] = useState<'idle' | 'curriculum' | 'questions'>('idle')
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('curriculum')
    setError('')
    try {
      if (!user) {
        const { error } = await authClient.signIn.anonymous()
        if (error) throw new Error(error.message ?? 'Could not sign in')
        await router.invalidate()
      }
      const key = JSON.stringify([topic.trim(), goal.trim(), sourceText.trim()])
      if (created.current?.key !== key) {
        const { topicId } = await create({
          data: {
            topic: topic.trim(),
            goal: goal.trim() || undefined,
            sourceText: sourceText.trim() || undefined,
          },
        })
        created.current = { key, topicId }
      }
      setStatus('questions')
      const { sessionId } = await place({ data: { topicId: created.current.topicId } })
      await router.navigate({ to: '/play/$sessionId', params: { sessionId } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setStatus('idle')
    }
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 pt-8 pb-16">
      <div className="mb-8 flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">What do you want to learn?</h1>
        <span className="shrink-0 text-sm font-medium text-muted-foreground">1 of 2</span>
      </div>
      {status === 'idle' ? (
        <form className="flex flex-col gap-6" onSubmit={submit}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="topic">Topic</Label>
            <Input
              id="topic"
              className="h-11"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              minLength={2}
              maxLength={200}
              required
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="goal">Goal (optional)</Label>
            <Input
              id="goal"
              className="h-11"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              maxLength={300}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="source">Paste your material (optional)</Label>
            <Textarea
              id="source"
              className="min-h-32"
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              maxLength={MAX_SOURCE_TEXT_CHARS}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm font-medium text-wrong">
              {error}
            </p>
          )}
          <Button type="submit" className="h-11 self-end px-6">
            Find my level
          </Button>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <Working label="Building your curriculum" done={status === 'questions'} />
          {status === 'questions' && <Working label="Writing your first questions" />}
        </div>
      )}
    </main>
  )
}
