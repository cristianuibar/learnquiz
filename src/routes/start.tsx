import { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Working } from '@/components/working'
import { authClient } from '@/lib/auth-client'
import { createTopic } from '@/server/curriculum'

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
  const [topic, setTopic] = useState(search.topic ?? '')
  const [goal, setGoal] = useState('')
  const [sourceText, setSourceText] = useState('')
  const [status, setStatus] = useState<'idle' | 'working' | 'done'>('idle')
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('working')
    setError('')
    try {
      if (!user) {
        const { error } = await authClient.signIn.anonymous()
        if (error) throw new Error(error.message ?? 'Could not sign in')
        await router.invalidate()
      }
      const { topicId } = await create({
        data: {
          topic: topic.trim(),
          goal: goal.trim() || undefined,
          sourceText: sourceText.trim() || undefined,
        },
      })
      setStatus('done')
      await new Promise((r) => setTimeout(r, 400)) // let "Ready" register
      await router.navigate({ to: '/t/$topicId/path', params: { topicId } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setStatus('idle')
    }
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 pt-8 pb-16">
      <h1 className="mb-8 text-3xl font-bold tracking-tight">What do you want to learn?</h1>
      {status === 'idle' ? (
        <form className="flex flex-col gap-6" onSubmit={submit}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="topic">Topic</Label>
            <Input
              id="topic"
              className="h-11"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
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
              maxLength={400000}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm font-medium text-wrong">
              {error}
            </p>
          )}
          <Button type="submit" className="h-11 self-end px-6">
            Build my path
          </Button>
        </form>
      ) : (
        <Working label="Building your curriculum" done={status === 'done'} />
      )}
    </main>
  )
}
