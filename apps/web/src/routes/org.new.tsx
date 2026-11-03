import { useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { errorMessage, fieldErrors, useFocusInvalid } from '@/components/inline-error'
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
  const [fields, setFields] = useState<Record<string, string>>({})
  const formRef = useFocusInvalid(fields)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const name = String(f.get('name')).trim()
    const roleName = String(f.get('role')).trim()
    setError('')
    const missing: Record<string, string> = {}
    if (!name) missing.name = 'Enter a company name'
    if (!roleName) missing.roleName = 'Enter a role name'
    setFields(missing)
    if (Object.keys(missing).length) return
    setBusy(true)
    try {
      const { slug } = await create({ data: { name, roleName } })
      await router.navigate({ to: '/org/$slug', params: { slug } })
      await router.invalidate()
    } catch (err) {
      const found = fieldErrors(err)
      if (['name', 'roleName'].some((k) => found[k])) setFields(found)
      else setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 pt-8 pb-16">
      <h1 className="mb-8 text-3xl font-bold tracking-tight">Set up your company</h1>
      <form ref={formRef} className="flex flex-col gap-6" onSubmit={submit}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Company name</Label>
          <Input id="name" name="name" maxLength={80} required autoFocus aria-invalid={!!fields.name || undefined} aria-describedby={fields.name ? 'name-error' : undefined} />
          {fields.name && <p id="name-error" role="alert" className="text-sm font-medium text-wrong">{fields.name}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="role">First job role</Label>
          <Input id="role" name="role" maxLength={80} required aria-invalid={!!fields.roleName || undefined} aria-describedby={fields.roleName ? 'role-error' : undefined} />
          {fields.roleName && <p id="role-error" role="alert" className="text-sm font-medium text-wrong">{fields.roleName}</p>}
        </div>
        {error && (
          <p role="alert" className="text-sm font-medium text-wrong">
            {error}
          </p>
        )}
        <Button type="submit" className="self-end px-6" disabled={busy}>
          Create company
        </Button>
      </form>
    </main>
  )
}
