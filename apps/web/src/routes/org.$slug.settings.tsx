import { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { RouteError, errorMessage } from '@/components/inline-error'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getCompanySettings, saveCompanySettings } from '@/server/org-settings'

export const Route = createFileRoute('/org/$slug/settings')({
  loader: ({ params }) => getCompanySettings({ data: { slug: params.slug } }),
  errorComponent: RouteError,
  component: Settings,
})

function Settings() {
  const settings = Route.useLoaderData()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    setBusy(true)
    setError('')
    setSaved(false)
    try {
      await saveCompanySettings({ data: new FormData(form) })
      await router.invalidate()
      form.querySelector<HTMLInputElement>('#logo')!.value = ''
      const remove = form.querySelector<HTMLInputElement>('#removeLogo')
      if (remove) remove.checked = false
      setSaved(true)
    } catch (err) {
      setError(errorMessage(err, 'Could not save settings. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16">
      <h1 className="text-3xl font-bold tracking-tight">Company settings</h1>
      <form className="mt-8 flex flex-col gap-6" onSubmit={save} onChange={() => setSaved(false)}>
        <input type="hidden" name="slug" value={settings.slug} />
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Company name</Label>
          <Input id="name" name="name" defaultValue={settings.name} minLength={2} maxLength={80} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="timezone">Timezone</Label>
          <Input id="timezone" name="timezone" defaultValue={settings.timezone} placeholder="Europe/London" maxLength={100} aria-describedby="timezone-help" required />
          <p id="timezone-help" className="text-sm text-muted-foreground">Use a timezone such as Europe/London, America/New_York or UTC.</p>
        </div>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 font-medium">Working hours</legend>
          <div className="flex flex-wrap gap-3">
            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day, i) => (
              <label key={day} className="flex min-h-11 items-center gap-2">
                <input type="checkbox" name="days" value={i + 1} defaultChecked={settings.workingHours.days.includes(i + 1)} className="size-4" />
                {day}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="start">Start time</Label>
              <Input id="start" name="start" type="time" defaultValue={settings.workingHours.start} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="end">End time</Label>
              <Input id="end" name="end" type="time" defaultValue={settings.workingHours.end} required />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Times use the company timezone. The end time must be later on the same day.</p>
        </fieldset>
        <div className="flex flex-col gap-2">
          <Label htmlFor="logo">Company logo</Label>
          <Input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" aria-describedby="logo-help" />
          <p id="logo-help" className="text-sm text-muted-foreground">PNG, JPEG or WebP, up to 2 MB. Leave empty to keep the current logo.</p>
          {settings.hasLogo && <label className="flex min-h-11 items-center gap-2"><input id="removeLogo" name="removeLogo" type="checkbox" className="size-4" />Remove current logo</label>}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="accent">Accent color</Label>
          <Input id="accent" name="accent" defaultValue={settings.accent ?? ''} placeholder="#0E5A73" pattern="#[0-9a-fA-F]{6}" maxLength={7} aria-describedby="accent-help" />
          <p id="accent-help" className="text-sm text-muted-foreground">Use a hex color such as #0E5A73. Green and red are reserved for answer feedback, and the color needs 4.5:1 contrast. Leave empty for the default brand.</p>
        </div>
        {error && <p role="alert" className="text-sm font-medium text-wrong">{error}</p>}
        {saved && <p role="status" className="text-sm">Settings saved.</p>}
        <Button type="submit" className="self-end px-6" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</Button>
      </form>
    </main>
  )
}
