import { useState } from 'react'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { FieldError, fieldProps } from '@/components/admin/field-error'
import { RouteError, errorMessage, fieldErrors, useFocusInvalid } from '@/components/inline-error'
import { RoleDocumentForm } from '@/components/role-document-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TRAINING_STATUS } from '@/lib/training-status'
import { plural } from '@/lib/utils'
import { createRole, listRoles } from '@/server/org'
import { Page, PageHeader } from '@/components/admin/page'
import { usePortalLinks } from '@/components/portal/portal-context'

export const Route = createFileRoute('/org/$slug/roles')({
  loader: ({ params }) => listRoles({ data: { slug: params.slug } }),
  errorComponent: RouteError,
  component: Roles,
})

function Roles() {
  const org = Route.useLoaderData()
  const links = usePortalLinks()
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
    <Page capped>
      <PageHeader
        crumbs={<Link {...links.overview} className="inline-flex min-h-11 items-center font-medium underline outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
          {org.name}
        </Link>}
        title="Job roles"
      />
      {org.roles.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {org.roles.map((role) => (
            <li key={role.id} className="rounded-lg border p-4">
              <Link {...links.role(role.id)} className="inline-flex min-h-11 max-w-full items-center font-medium underline outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                <span className="line-clamp-2 min-w-0 break-words">{role.name}</span>
              </Link>
              <p className="text-caption text-ink-muted">Benchmark: {Math.round(role.benchmark * 100)}% · Onboarding: {plural(role.onboardingDays, 'day', 'days')} · {TRAINING_STATUS[role.topicStatus]}</p>
              {(role.topicStatus === 'draft' || role.topicStatus === 'failed') && (
                <RoleDocumentForm slug={org.slug} roleId={role.id} roleName={role.name} onUploaded={() => router.invalidate()} />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body text-ink-muted">Create your first job role.</p>
      )}
      <section>
        <h2 className="text-title-2">Create a job role</h2>
        <form ref={formRef} className="mt-6 flex max-w-xl flex-col gap-6" onSubmit={submit}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Role name</Label>
            <Input id="name" name="name" maxLength={80} required {...fieldProps('name', fields.name)} />
            {fields.name && <FieldError id="name">{fields.name}</FieldError>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="benchmark">Benchmark (%)</Label>
            <Input id="benchmark" name="benchmark" type="number" min={50} max={100} step="any" defaultValue={85} required {...fieldProps('benchmark', fields.benchmark)} />
            {fields.benchmark && <FieldError id="benchmark">{fields.benchmark}</FieldError>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="onboardingDays">Onboarding days</Label>
            <Input id="onboardingDays" name="onboardingDays" type="number" min={1} max={365} step={1} defaultValue={30} required {...fieldProps('onboardingDays', fields.onboardingDays)} />
            {fields.onboardingDays && <FieldError id="onboardingDays">{fields.onboardingDays}</FieldError>}
          </div>
          {error && <p role="alert" className="text-body font-medium text-wrong">{error}</p>}
          <Button type="submit" className="self-end px-6" disabled={busy}>
            {busy ? 'Creating…' : 'Create role'}
          </Button>
        </form>
      </section>
    </Page>
  )
}
