import { colors, contrast, brandProblem } from '@learnquiz/tokens'
import { RotateCw, Upload, ImageIcon } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Banner } from '@/components/admin/banner'
import { FieldError, fieldProps } from '@/components/admin/field-error'
import { Page, PageHeader } from '@/components/admin/page'
import { errorMessage } from '@/components/inline-error'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Segmented } from '@/components/ui/segmented'
import { Select } from '@/components/ui/select'
import { getCompanySettings, saveCompanySettings } from '@/server/org-settings'

type Settings = Awaited<ReturnType<typeof getCompanySettings>>

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const LOGO_MAX = 2 * 1024 * 1024
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const LOGO_ERROR = 'Logo must be a PNG, JPEG or WebP image up to 2 MB.'
const NAME_ERROR = 'Company name must be 2 to 80 characters.'
const DAYS_ERROR = 'Choose at least one working day'

function baselineOf(s: Settings) {
  return {
    name: s.name,
    accent: s.accent ?? '',
    timezone: s.timezone,
    days: s.workingHours.days.map(String),
    start: s.workingHours.start,
    end: s.workingHours.end,
    logo: s.logoUrl ?? null,
  }
}
type Values = ReturnType<typeof baselineOf>

function timeLabel(value: string) {
  const [h, m] = value.split(':').map(Number)
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}
const slot = (i: number) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`
const SLOTS = Array.from({ length: 48 }, (_, i) => slot(i))

function nextSlot(start: string) {
  return SLOTS.find((t) => t > start) ?? start
}

function zoneLabel(zone: string) {
  for (const style of ['shortGeneric', 'short'] as const) {
    try {
      const part = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: style as 'short' })
        .formatToParts(new Date())
        .find((p) => p.type === 'timeZoneName')
      if (part?.value) return `${zone} (${part.value})`
    } catch {
      // try the next style
    }
  }
  return zone
}

function accentState(value: string): { error: ReactNode; ratio: number | null } {
  if (!value) return { error: null, ratio: null }
  if (!/^#[0-9a-f]{6}$/i.test(value)) return { error: 'Use a color in #RRGGBB format.', ratio: null }
  const ratio = contrast(value, colors['surface-card'][0])
  if (ratio < 4.5) {
    return {
      error: <span className="tabular-nums">{ratio.toFixed(1)}:1 on white. Pick a darker color that reaches 4.5:1.</span>,
      ratio,
    }
  }
  const problem = brandProblem(value)
  return { error: problem, ratio }
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-wrap gap-x-12 gap-y-4 p-6">
      <h2 id={id} className="basis-[200px] text-title-2 text-ink">{title}</h2>
      <div className="flex min-w-0 max-w-[560px] flex-[1_1_400px] flex-col gap-6">{children}</div>
    </section>
  )
}

const Divider = () => <hr className="m-0 border-0 border-t border-border" />

type FormProps = { settings: Settings; readOnly?: boolean; onSaved?: () => unknown }

// Another company's settings start a fresh form, so no draft or in-flight save carries over.
export function SettingsForm(props: FormProps) {
  return <CompanyForm key={props.settings.slug} {...props} />
}

function CompanyForm({ settings, readOnly = settings.readOnly, onSaved }: FormProps) {
  const uid = useId()
  const base = baselineOf(settings)
  const [baseline, setBaseline] = useState<Values>(base)
  const [prevSettings, setPrevSettings] = useState(settings)
  const [name, setName] = useState(base.name)
  const [accent, setAccent] = useState(base.accent)
  const [timezone, setTimezone] = useState(base.timezone)
  const [days, setDays] = useState(base.days)
  const [start, setStart] = useState(base.start)
  const [end, setEnd] = useState(base.end)
  const [logo, setLogo] = useState<string | null>(base.logo)
  const [file, setFile] = useState<File | null>(null)
  const [removeLogo, setRemoveLogo] = useState(false)
  const [logoError, setLogoError] = useState('')
  const [showErrors, setShowErrors] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)

  const formRef = useRef<HTMLFormElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const colorRef = useRef<HTMLInputElement>(null)
  const daysRef = useRef<HTMLDivElement>(null)
  const savingRef = useRef(false)
  const owned = useRef(new Set<string>())
  const baselineRef = useRef(baseline)
  baselineRef.current = baseline
  const logoRef = useRef(logo)
  logoRef.current = logo

  function revokeOwned(...keep: (string | null)[]) {
    for (const url of owned.current) {
      if (!keep.includes(url)) {
        URL.revokeObjectURL(url)
        owned.current.delete(url)
      }
    }
  }
  useEffect(() => () => revokeOwned(), [])

  function applyBaseline(b: Values) {
    setBaseline(b)
    setName(b.name)
    setAccent(b.accent)
    setTimezone(b.timezone)
    setDays(b.days)
    setStart(b.start)
    setEnd(b.end)
    setLogo(b.logo)
    setFile(null)
    setRemoveLogo(false)
    setLogoError('')
    setShowErrors(false)
    setBanner(null)
    setStatus('')
    if (fileRef.current) fileRef.current.value = ''
    revokeOwned(b.logo)
  }

  if (settings !== prevSettings) {
    setPrevSettings(settings)
    const next = baselineOf(settings)
    // Fields edited since the last baseline (e.g. while a save was in flight) keep the newer edit.
    const keep = <T,>(current: T, saved: T, fresh: T) => (String(current) === String(saved) ? fresh : current)
    setBaseline(next)
    setName(keep(name, baseline.name, next.name))
    setAccent(keep(accent, baseline.accent, next.accent))
    setTimezone(keep(timezone, baseline.timezone, next.timezone))
    setDays(keep(days, baseline.days, next.days))
    setStart(keep(start, baseline.start, next.start))
    setEnd(keep(end, baseline.end, next.end))
    setShowErrors(false)
    setBanner(null)
    // The "Settings saved." announcement is kept so a reload after a save does not cut it off.
    if (logo === baseline.logo) {
      setLogo(next.logo)
      setFile(null)
      setRemoveLogo(false)
      setLogoError('')
      if (fileRef.current) fileRef.current.value = ''
      revokeOwned(next.logo)
    } else {
      revokeOwned(logo)
    }
  }

  const zones = useMemo(() => {
    let list: string[] = []
    try {
      list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? []
    } catch {
      list = []
    }
    return [...new Set([...list, 'UTC', settings.timezone])].sort().map((zone) => ({ zone, label: zoneLabel(zone) }))
  }, [settings.timezone])

  const fromOptions = useMemo(
    () => [...new Set([...SLOTS.slice(0, 47), start])].sort(),
    [start],
  )
  const toOptions = useMemo(() => [...new Set([...SLOTS, end])].filter((t) => t > start).sort(), [start, end])

  const nameError = name.trim().length < 2 || name.trim().length > 80 ? NAME_ERROR : ''
  const daysError = days.length === 0 ? DAYS_ERROR : ''
  const acc = accentState(accent)
  const accentOk = accent !== '' && acc.error === null && acc.ratio !== null
  const shownName = showErrors ? nameError : ''
  const shownDays = showErrors ? daysError : ''
  const edit = () => setStatus('')

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    edit()
    if (!f) return
    if (!LOGO_TYPES.includes(f.type) || f.size > LOGO_MAX) {
      e.target.value = ''
      setLogoError(LOGO_ERROR)
      return
    }
    revokeOwned(baselineRef.current.logo)
    const url = URL.createObjectURL(f)
    owned.current.add(url)
    setFile(f)
    setLogo(url)
    setRemoveLogo(false)
    setLogoError('')
  }

  function onRemove() {
    edit()
    revokeOwned(baselineRef.current.logo)
    if (fileRef.current) fileRef.current.value = ''
    setFile(null)
    setLogo(null)
    setRemoveLogo(true)
    setLogoError('')
  }

  function changeStart(value: string) {
    edit()
    setStart(value)
    if (value >= end) setEnd(nextSlot(value))
  }

  async function send(fd: FormData, snapshot: Values) {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setBanner(null)
    setStatus('')
    try {
      await saveCompanySettings({ data: fd })
    } catch (err) {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false
      const network = err instanceof TypeError || !(err instanceof Error) || !err.message || offline
      setBanner(network ? "The server didn't respond." : errorMessage(err))
      savingRef.current = false
      setSaving(false)
      return
    }
    setBaseline(snapshot)
    // A logo picked or removed while saving is a newer edit; leave it in the form.
    if (logoRef.current === snapshot.logo) {
      setFile(null)
      setRemoveLogo(false)
      if (fileRef.current) fileRef.current.value = ''
    }
    revokeOwned(snapshot.logo, logoRef.current)
    setStatus('Settings saved.')
    savingRef.current = false
    setSaving(false)
    await onSaved?.()
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (savingRef.current) return
    setStatus('')
    if (nameError || daysError || acc.error) {
      setShowErrors(true)
      const form = e.currentTarget
      const target = nameError
        ? form.querySelector<HTMLElement>('#name')
        : acc.error
          ? form.querySelector<HTMLElement>('#accent')
          : daysRef.current?.querySelector<HTMLElement>('button')
      target?.focus()
      return
    }
    const fd = new FormData(e.currentTarget)
    fd.delete('logo')
    if (file) fd.set('logo', file)
    if (removeLogo) fd.set('removeLogo', 'on')
    const snapshot = { name, accent, timezone, days, start, end, logo }
    void send(fd, snapshot)
  }

  function retry() {
    formRef.current?.requestSubmit()
  }

  function discard() {
    // While a save is in flight the saved values are not known yet.
    if (savingRef.current) return
    applyBaseline(baseline)
  }

  const nameId = `${uid}-company`
  const learnerId = `${uid}-learner`
  const pushId = `${uid}-pushes`
  const logoLabelId = `${uid}-logo-label`
  const logoMetaId = `${uid}-logo-meta`
  const daysLabelId = `${uid}-days-label`
  const accentValid = accent !== '' && /^#[0-9a-f]{6}$/i.test(accent)

  const sections = (
    <>
      <Section id={nameId} title="Company">
        <div className="flex flex-col gap-2">
          {readOnly ? <span className="text-label text-ink">Company name</span> : <Label htmlFor="name">Company name</Label>}
          {readOnly ? <p className="text-body text-ink">{settings.name}</p> : <Input
            id="name"
            name="name"
            autoComplete="organization"
            value={name}
            onChange={(e) => { edit(); setName(e.target.value) }}
            {...fieldProps('name', shownName)}
          />}
          {shownName && <FieldError id="name">{shownName}</FieldError>}
        </div>
        <div className="flex flex-col gap-2">
          <span id={logoLabelId} className="text-label text-ink">Logo</span>
          <div role="group" aria-labelledby={logoLabelId} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-4">
              {logo ? (
                <img src={logo} alt="Current logo" className="size-16 rounded-md border border-border object-contain" />
              ) : (
                <div className="flex size-16 items-center justify-center rounded-md border border-border bg-surface-sunken text-ink-muted">
                  <ImageIcon aria-hidden className="size-6" />
                </div>
              )}
              {!readOnly && <>
                <Button variant="secondary" type="button" aria-describedby={logoMetaId} onClick={() => fileRef.current?.click()}>
                  <Upload aria-hidden />Replace logo
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  name="logo"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden
                  onChange={onFile}
                />
                {logo && <Button variant="ghost" type="button" onClick={onRemove}>Remove</Button>}
              </>}
            </div>
            {!readOnly && <p id={logoMetaId} className="text-caption text-ink-muted">PNG, JPEG or WebP · up to 2 MB</p>}
            {logoError && <FieldError id="logo">{logoError}</FieldError>}
          </div>
        </div>
      </Section>
      <Divider />
      <Section id={learnerId} title="Learner app">
        <div className="flex flex-col gap-2">
          {readOnly ? <span className="text-label text-ink">Accent color</span> : <Label htmlFor="accent">Accent color</Label>}
          <div className="flex flex-wrap items-center gap-3">
            {readOnly ? (
              <>
                <p className="text-body text-ink tabular-nums">{settings.accent ?? 'Default'}</p>
                <span aria-hidden className="size-11 shrink-0 rounded-md border-2 border-border-strong" style={{ backgroundColor: settings.accent ?? 'var(--brand)' }} />
              </>
            ) : <>
              <Input
                id="accent"
                name="accent"
                className="w-40 tabular-nums"
                maxLength={7}
                spellCheck={false}
                autoComplete="off"
                value={accent}
                onChange={(e) => { edit(); setAccent(e.target.value) }}
                {...fieldProps('accent', acc.error ? 'x' : undefined)}
              />
              <button
                type="button"
                aria-label="Choose accent color"
                className="size-11 shrink-0 rounded-md border-2 border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                style={{ backgroundColor: accentValid ? accent : 'var(--brand)' }}
                onClick={() => colorRef.current?.click()}
              />
              <input
                ref={colorRef}
                type="color"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                value={accentValid ? accent.toLowerCase() : colors.brand[0].toLowerCase()}
                onChange={(e) => { edit(); setAccent(e.target.value.toUpperCase()) }}
              />
            </>}
            {((accentValid && acc.ratio !== null) || readOnly) && (
              <figure className="m-0 flex flex-wrap items-center gap-3">
                <span
                  className="inline-flex min-h-11 items-center rounded-md px-4 text-label"
                  style={{
                    backgroundColor: accent || 'var(--brand)',
                    color: acc.ratio === null ? 'var(--on-brand)' : acc.ratio >= contrast(accent, colors.ink[0]) ? colors['on-brand'][0] : colors.ink[0],
                  }}
                >
                  Start quiz
                </span>
                <figcaption className={accentOk || (readOnly && !accent) ? 'text-caption text-ink-muted tabular-nums' : 'sr-only'}>
                  <span className="sr-only">Learner app button preview{accentOk || (readOnly && !accent) ? ': ' : ''}</span>
                  {accentOk && acc.ratio !== null && <>{acc.ratio.toFixed(1)}:1 on white · passes AA</>}
                  {readOnly && !accent && 'Default accent'}
                </figcaption>
              </figure>
            )}
          </div>
          {acc.error && <FieldError id="accent">{acc.error}</FieldError>}
        </div>
      </Section>
      <Divider />
      <Section id={pushId} title="Learning pushes">
        <div className="flex flex-col gap-2">
          {readOnly ? <span className="text-label text-ink">Timezone</span> : <Label htmlFor="timezone">Timezone</Label>}
          {readOnly ? <p className="text-body text-ink">{zoneLabel(settings.timezone)}</p> : <Select id="timezone" name="timezone" value={timezone} onChange={(e) => { edit(); setTimezone(e.target.value) }}>
            {zones.map((z) => <option key={z.zone} value={z.zone}>{z.label}</option>)}
          </Select>}
        </div>
        <div className="flex flex-col gap-2">
          <span id={daysLabelId} className="text-label text-ink">Working days</span>
          {readOnly ? <p className="text-body text-ink">{settings.workingHours.days.map((d) => DAYS[d - 1]).join(', ')}</p> : <>
            <div ref={daysRef}>
              <Segmented
                mode="toggle"
                className="max-w-full flex-wrap"
                aria-labelledby={daysLabelId}
                value={days}
                onValueChange={(v) => { edit(); setDays(v) }}
                options={DAYS.map((d, i) => ({
                  value: String(i + 1),
                  label: (
                    <>
                      <span aria-hidden>{d.slice(0, 3)}</span>
                      <span className="sr-only">{d}</span>
                    </>
                  ),
                }))}
              />
            </div>
            {days.map((d) => <input key={d} type="hidden" name="days" value={d} tabIndex={-1} readOnly />)}
          </>}
          {shownDays && <FieldError id="days">{shownDays}</FieldError>}
        </div>
        {readOnly ? (
          <div className="flex flex-col gap-2">
            <span className="text-label text-ink">Working hours</span>
            <p className="text-body text-ink">{timeLabel(settings.workingHours.start)} – {timeLabel(settings.workingHours.end)}</p>
          </div>
        ) : (
          <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
            <legend className="mb-2 p-0 text-label text-ink">Working hours</legend>
            <div className="grid max-w-[420px] grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="start" className="text-caption text-ink-muted">From</Label>
                <Select id="start" name="start" value={start} onChange={(e) => changeStart(e.target.value)}>
                  {fromOptions.map((t) => <option key={t} value={t}>{timeLabel(t)}</option>)}
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="end" className="text-caption text-ink-muted">To</Label>
                <Select id="end" name="end" value={end} onChange={(e) => { edit(); setEnd(e.target.value) }}>
                  {toOptions.map((t) => <option key={t} value={t}>{timeLabel(t)}</option>)}
                </Select>
              </div>
            </div>
          </fieldset>
        )}
      </Section>
    </>
  )

  return (
    <Page capped>
      <PageHeader title="Settings" />
      <p role="status" className="sr-only">{status}</p>
      {banner !== null && (
        <Banner
          kind="alert"
          action={
            <Button variant="secondary" type="button" onClick={retry}>
              <RotateCw aria-hidden />Try again
            </Button>
          }
        >
          <strong>Couldn't save your changes.</strong> {banner} Your edits are still in the form.
        </Banner>
      )}
      <div className="rounded-md border border-border bg-surface-card">
        {readOnly ? sections : <form ref={formRef} aria-label="Company settings" noValidate onSubmit={onSubmit}>
          <input type="hidden" name="slug" value={settings.slug} tabIndex={-1} readOnly />
          {sections}
          <div className="flex flex-wrap justify-end gap-3 border-t border-border px-6 py-4">
            <Button variant="ghost" type="button" disabled={saving} onClick={discard}>Discard</Button>
            <Button type="submit">{saving ? 'Saving…' : 'Save changes'}</Button>
          </div>
        </form>}
      </div>
    </Page>
  )
}
