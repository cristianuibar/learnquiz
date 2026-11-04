import { useEffect, useRef, useState } from 'react'
import { createFileRoute, redirect, useRouteContext, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Banner } from '@/components/admin/banner'
import { LearnQuizMark } from '@/components/learn-quiz-mark'
import { FieldError, fieldProps } from '@/components/admin/field-error'
import { errorMessage, fieldErrors, useFocusInvalid, useSignOut } from '@/components/inline-error'
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
  const { user } = useRouteContext({ strict: false }) as { user?: { email?: string } }
  const { busy: signingOut, error: signOutError, signOut } = useSignOut()
  const [error, setError] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const formRef = useFocusInvalid(fields)
  const [busy, setBusy] = useState(false)
  const working = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => heading.current?.focus(), [])

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (working.current) return
    const f = new FormData(e.currentTarget)
    const name = String(f.get('name')).trim()
    const roleName = String(f.get('role')).trim()
    setError('')
    const missing: Record<string, string> = {}
    if (!name) missing.name = 'Enter a company name'
    if (!roleName) missing.roleName = 'Enter a role name'
    setFields(missing)
    if (Object.keys(missing).length) return
    working.current = true
    setBusy(true)
    try {
      const { slug } = await create({ data: { name, roleName } })
      await router.navigate({ to: '/org/$slug', params: { slug } })
      await router.invalidate()
    } catch (err) {
      const found = fieldErrors(err)
      if (['name', 'roleName'].some((k) => found[k])) setFields(found)
      else {
        const reason = errorMessage(err, 'The connection dropped before it saved.')
        setError(/[.!?]$/.test(reason) ? reason : `${reason}.`)
        button.current?.focus()
      }
    }
    working.current = false
    setBusy(false)
  }

  return (
    <div className="flex min-h-svh flex-col bg-surface-page">
      <header className="flex min-h-[72px] items-center gap-2 px-4 sm:px-8">
        <LearnQuizMark className="size-6" />
        <span className="text-label text-ink">Learn Quiz</span>
      </header>
      <main className="mx-auto flex w-full flex-col items-center gap-4 px-4 pt-8 pb-16 sm:pt-[120px]">
        <section aria-labelledby="create-company" className="w-full max-w-[480px] rounded-md border border-border bg-surface-card">
          <form ref={formRef} className="flex flex-col gap-6 p-6 sm:p-8" onSubmit={submit}>
            <h1 ref={heading} id="create-company" tabIndex={-1} className="text-title-1 text-ink">
              Create your company
            </h1>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">Company name</Label>
                <Input id="name" name="name" maxLength={80} required autoComplete="organization" {...fieldProps('name', fields.name)} />
                {fields.name && <FieldError id="name">{fields.name}</FieldError>}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="role">First job role</Label>
                <Input id="role" name="role" maxLength={80} required autoComplete="off" {...fieldProps('role', fields.roleName)} />
                {fields.roleName && <FieldError id="role">{fields.roleName}</FieldError>}
              </div>
            </div>
            {error && (
              <Banner kind="alert">
                <strong>Couldn't create the company.</strong> {error} Your entries are still here.
              </Banner>
            )}
            <Button ref={button} variant="accent" type="submit" className="w-full" aria-disabled={busy || undefined}>
              Create company
            </Button>
          </form>
        </section>
        <p className="flex flex-wrap items-center justify-center gap-2 text-center text-caption text-ink-muted">
          <span>Signed in as {user?.email}</span>
          <Button variant="link" type="button" aria-disabled={signingOut || undefined} onClick={() => !signingOut && void signOut()}>
            Sign out
          </Button>
        </p>
        {signOutError && (
          <p role="alert" className="text-caption text-ink">
            {signOutError}
          </p>
        )}
      </main>
    </div>
  )
}
