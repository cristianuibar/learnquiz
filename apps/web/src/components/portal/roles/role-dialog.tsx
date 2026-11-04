import { useEffect, useId, useRef, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { Banner } from '@/components/admin/banner'
import { FieldError, fieldProps } from '@/components/admin/field-error'
import { errorMessage, fieldErrors, useFocusInvalid } from '@/components/inline-error'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createRole } from '@/server/org'

type Errors = { name?: string; benchmark?: string; onboardingDays?: string }

export function RoleDialog({ open, onOpenChange, slug, onCreated, onCloseAutoFocus }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  slug: string
  onCreated: (roleId: string) => void
  onCloseAutoFocus?: (e: Event) => void
}) {
  const uid = useId()
  const create = useServerFn(createRole)
  const pending = useRef(false)
  const firstField = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [benchmark, setBenchmark] = useState('85')
  const [onboardingDays, setOnboardingDays] = useState('30')
  const [errors, setErrors] = useState<Errors>({})
  const [banner, setBanner] = useState('')
  const [busy, setBusy] = useState(false)
  const formRef = useFocusInvalid(errors as Record<string, string>)
  const id = (field: string) => `${uid}-${field}`

  useEffect(() => {
    if (!open) return
    setName('')
    setBenchmark('85')
    setOnboardingDays('30')
    setErrors({})
    setBanner('')
  }, [open])

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (pending.current) return
    setBanner('')
    if (!name.trim()) {
      setErrors({ name: 'Enter a role name' })
      return
    }
    setErrors({})
    pending.current = true
    setBusy(true)
    try {
      const res = await create({ data: { slug, name: name.trim(), benchmark: Number(benchmark), onboardingDays: Number(onboardingDays) } })
      onCreated(res.id)
    } catch (err) {
      const found = fieldErrors(err)
      const next: Errors = {}
      if (found.name) next.name = found.name
      if (found.benchmark) next.benchmark = found.benchmark
      if (found.onboardingDays) next.onboardingDays = found.onboardingDays
      setErrors(next)
      if (!Object.keys(next).length) setBanner(errorMessage(err))
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} initialFocus={firstField} onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader><DialogTitle>Create role</DialogTitle></DialogHeader>
        <form ref={formRef} noValidate onSubmit={submit} className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Label htmlFor={id('name')}>Name</Label>
            <Input ref={firstField} id={id('name')} name="name" autoComplete="off" maxLength={80} value={name} onChange={(ev) => setName(ev.target.value)} {...fieldProps(id('name'), errors.name)} />
            {errors.name && <FieldError id={id('name')}>{errors.name}</FieldError>}
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor={id('benchmark')}>Benchmark<span className="sr-only"> (percent)</span></Label>
              <Input id={id('benchmark')} name="benchmark" type="number" inputMode="numeric" min={50} max={100} step={1} suffix="%" value={benchmark} onChange={(ev) => setBenchmark(ev.target.value)} {...fieldProps(id('benchmark'), errors.benchmark)} />
              {errors.benchmark && <FieldError id={id('benchmark')}>{errors.benchmark}</FieldError>}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={id('onboardingDays')}>Onboarding period<span className="sr-only"> (days)</span></Label>
              <Input id={id('onboardingDays')} name="onboardingDays" type="number" inputMode="numeric" min={1} max={365} step={1} suffix="days" className="pr-14" value={onboardingDays} onChange={(ev) => setOnboardingDays(ev.target.value)} {...fieldProps(id('onboardingDays'), errors.onboardingDays)} />
              {errors.onboardingDays && <FieldError id={id('onboardingDays')}>{errors.onboardingDays}</FieldError>}
            </div>
          </div>
          {banner && <Banner kind="alert">{banner}</Banner>}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" aria-disabled={busy || undefined} className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50">Create role</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
