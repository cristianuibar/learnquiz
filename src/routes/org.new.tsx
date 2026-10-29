import { useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { errorMessage } from '@/components/inline-error'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createCompany } from '@/server/org'

export const Route = createFileRoute('/org/new')({
  beforeLoad: ({ context }) => {
    if (!context.user || context.user.isAnonymous) throw redirect({ to: '/sign-in', search: { redirect: '/org/new' } })
  },
  component: NewCompany,
})

function NewCompany() {
  const router = useRouter()
  const create = useServerFn(createCompany)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setBusy(true)
    setError('')
    try {
      const { slug } = await create({ data: { name: String(f.get('name')), roleName: String(f.get('role')) } })
      await router.navigate({ to: '/org/$slug', params: { slug } })
      await router.invalidate()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 pt-8 pb-16">
      <h1 className="mb-8 text-3xl font-bold tracking-tight">Set up your company</h1>
      <form className="flex flex-col gap-6" onSubmit={submit}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Company name</Label>
          <Input id="name" name="name" className="h-11" minLength={2} maxLength={80} required autoFocus />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="role">First job role</Label>
          <Input id="role" name="role" className="h-11" minLength={2} maxLength={80} required />
        </div>
        {error && (
          <p role="alert" className="text-sm font-medium text-wrong">
            {error}
          </p>
        )}
        <Button type="submit" className="h-11 self-end px-6" disabled={busy}>
          Create company
        </Button>
      </form>
    </main>
  )
}
