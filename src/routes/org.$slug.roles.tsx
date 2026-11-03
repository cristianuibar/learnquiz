import { useState } from 'react'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { RouteError, errorMessage, fieldErrors, useFocusInvalid } from '@/components/inline-error'
import { RoleDocumentForm } from '@/components/role-document-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createRole, listRoles } from '@/server/org'

export const Route = createFileRoute('/org/$slug/roles')({
  loader: ({ params }) => listRoles({ data: { slug: params.slug } }),
  errorComponent: RouteError,
  component: Roles,
})

function Roles() {
  const org = Route.useLoaderData()
  const router = useRouter()
  const create = useServerFn(createRole)
  const [error, setError] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const formRef = useFocusInvalid(fields)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    const name = String(f.get('name')).trim()
    setError('')
    if (!name) {
      setFields({ name: 'Enter a role name' })
      return
    }
    setFields({})
    setBusy(true)
    try {
      await create({ data: { slug: org.slug, name, benchmark: Number(f.get('benchmark')), onboardingDays: Number(f.get('onboardingDays')) } })
      form.reset()
      await router.invalidate()
    } catch (err) {
      const found = fieldErrors(err)
      if (['name', 'benchmark', 'onboardingDays'].some((k) => found[k])) setFields(found)
      else setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16">
      <Link to="/org/$slug" params={{ slug: org.slug }} className="inline-flex min-h-11 items-center font-medium underline outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        {org.name}
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">Job roles</h1>
      {org.roles.length > 0 ? (
        <ul className="mt-6 flex flex-col gap-3">
          {org.roles.map((role) => (
            <li key={role.id} className="rounded-lg border p-4">
              <Link to="/org/$slug/roles/$roleId" params={{ slug: org.slug, roleId: role.id }} className="inline-flex min-h-11 items-center font-medium underline outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                {role.name}
              </Link>
              <p className="text-sm text-muted-foreground">Benchmark: {Math.round(role.benchmark * 100)}% · Onboarding: {role.onboardingDays} days · {role.topicStatus}</p>
              {(role.topicStatus === 'draft' || role.topicStatus === 'failed') && (
                <RoleDocumentForm slug={org.slug} roleId={role.id} roleName={role.name} onUploaded={() => router.invalidate()} />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 text-muted-foreground">Create a job role to start your company’s training.</p>
      )}
      <section className="mt-10">
        <h2 className="text-xl font-semibold">Create a job role</h2>
        <form ref={formRef} className="mt-6 flex flex-col gap-6" onSubmit={submit}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Role name</Label>
            <Input id="name" name="name" className="h-11" maxLength={80} required aria-invalid={!!fields.name || undefined} aria-describedby={fields.name ? 'name-error' : undefined} />
            {fields.name && <p id="name-error" role="alert" className="text-sm font-medium text-wrong">{fields.name}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="benchmark">Benchmark (%)</Label>
            <Input id="benchmark" name="benchmark" type="number" className="h-11" min={50} max={100} step="any" defaultValue={85} required aria-invalid={!!fields.benchmark || undefined} aria-describedby={fields.benchmark ? 'benchmark-error' : undefined} />
            {fields.benchmark && <p id="benchmark-error" role="alert" className="text-sm font-medium text-wrong">{fields.benchmark}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="onboardingDays">Onboarding days</Label>
            <Input id="onboardingDays" name="onboardingDays" type="number" className="h-11" min={1} max={365} step={1} defaultValue={30} required aria-invalid={!!fields.onboardingDays || undefined} aria-describedby={fields.onboardingDays ? 'onboardingDays-error' : undefined} />
            {fields.onboardingDays && <p id="onboardingDays-error" role="alert" className="text-sm font-medium text-wrong">{fields.onboardingDays}</p>}
          </div>
          {error && <p role="alert" className="text-sm font-medium text-wrong">{error}</p>}
          <Button type="submit" className="h-11 self-end px-6" disabled={busy}>
            {busy ? 'Creating…' : 'Create role'}
          </Button>
        </form>
      </section>
    </main>
  )
}
