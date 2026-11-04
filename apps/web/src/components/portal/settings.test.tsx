// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SettingsForm } from '@/components/portal/settings'
import { saveCompanySettings } from '@/server/org-settings'

vi.mock('@/server/org-settings', () => ({ saveCompanySettings: vi.fn(), getCompanySettings: vi.fn() }))

const settings = {
  slug: 'northwind',
  name: 'Northwind Logistics',
  timezone: 'America/Chicago',
  workingHours: { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' },
  accent: null,
  hasLogo: true,
  logoUrl: '/api/org/o/logo?v=k',
} as never

const roots: { unmount: () => void; container: HTMLElement }[] = []
const createObjectURL = vi.fn(() => 'blob:preview')

beforeEach(() => {
  URL.createObjectURL = createObjectURL
  URL.revokeObjectURL = vi.fn()
})

afterEach(async () => {
  for (const { unmount, container } of roots.splice(0)) {
    await act(async () => unmount())
    container.remove()
  }
  vi.clearAllMocks()
})

async function mount() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push({ unmount: () => root.unmount(), container })
  await act(async () => root.render(<SettingsForm settings={settings} />))
  return container
}

const field = <T extends HTMLElement>(c: HTMLElement, sel: string) => c.querySelector<T>(sel)!
const button = (c: HTMLElement, text: string) =>
  Array.from(c.querySelectorAll('button')).find((b) => b.textContent?.includes(text))!
const alerts = (c: HTMLElement) => Array.from(c.querySelectorAll('[role="alert"]')).map((a) => a.textContent ?? '')

async function setValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  })
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.click()
  })
}

const sent = (n: number) => (vi.mocked(saveCompanySettings).mock.calls[n][0] as unknown as { data: FormData }).data

it('blocks saving a low-contrast accent and focuses the field', async () => {
  const c = await mount()
  await setValue(field(c, '#accent'), '#F4C430')
  expect(alerts(c).join(' ')).toContain('1.6:1 on white. Pick a darker color that reaches 4.5:1.')
  expect(field(c, '#accent').getAttribute('aria-invalid')).toBe('true')
  await click(button(c, 'Save changes'))
  expect(saveCompanySettings).not.toHaveBeenCalled()
  expect(document.activeElement).toBe(field(c, '#accent'))
})

it('keeps edits after a failed save and Try again resends the form', async () => {
  vi.mocked(saveCompanySettings).mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(undefined as never)
  const c = await mount()
  await setValue(field(c, '#name'), 'Northwind Logistics Ltd')
  const saturday = () => Array.from(c.querySelectorAll('button')).find((b) => b.textContent?.includes('Saturday'))!
  await click(saturday())
  expect(saturday().getAttribute('aria-pressed')).toBe('true')
  await click(button(c, 'Save changes'))
  const banner = c.querySelector('[role="alert"]')!
  expect(banner.textContent).toContain("Couldn't save your changes.")
  expect(banner.textContent).toContain("The server didn't respond.")
  expect(field<HTMLInputElement>(c, '#name').value).toBe('Northwind Logistics Ltd')
  expect(saturday().getAttribute('aria-pressed')).toBe('true')
  expect(sent(0).get('name')).toBe('Northwind Logistics Ltd')
  expect(sent(0).getAll('days')).toEqual(['1', '2', '3', '4', '5', '6'])

  await click(button(c, 'Try again'))
  expect(saveCompanySettings).toHaveBeenCalledTimes(2)
  expect(sent(1).get('name')).toBe('Northwind Logistics Ltd')
  expect(sent(1).getAll('days')).toEqual(['1', '2', '3', '4', '5', '6'])
  expect(c.querySelector('[role="alert"]')).toBeNull()
  expect(c.querySelector('[role="status"]')?.textContent).toBe('Settings saved.')
})

it('Try again after a failed save sends the working days edited since', async () => {
  vi.mocked(saveCompanySettings).mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(undefined as never)
  const c = await mount()
  await click(button(c, 'Save changes'))
  expect(sent(0).getAll('days')).toEqual(['1', '2', '3', '4', '5'])
  await click(button(c, 'Saturday'))
  await click(button(c, 'Try again'))
  expect(saveCompanySettings).toHaveBeenCalledTimes(2)
  expect(sent(1).getAll('days')).toEqual(['1', '2', '3', '4', '5', '6'])
  expect(c.querySelector('[role="status"]')?.textContent).toBe('Settings saved.')
})

it('Discard restores the saved values without a request', async () => {
  const c = await mount()
  await setValue(field(c, '#name'), 'Something else')
  await setValue(field(c, '#accent'), '#123456')
  await setValue(field(c, '#timezone'), 'UTC')
  const monday = () => Array.from(c.querySelectorAll('button')).find((b) => b.textContent?.includes('Monday'))!
  await click(monday())
  expect(monday().getAttribute('aria-pressed')).toBe('false')
  await click(button(c, 'Discard'))
  expect(field<HTMLInputElement>(c, '#name').value).toBe('Northwind Logistics')
  expect(field<HTMLInputElement>(c, '#accent').value).toBe('')
  expect(field<HTMLInputElement>(c, '#timezone').value).toBe('America/Chicago')
  expect(monday().getAttribute('aria-pressed')).toBe('true')
  expect(saveCompanySettings).not.toHaveBeenCalled()
})

const badLogos = [
  new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' }),
  new File(['x'], 'logo.gif', { type: 'image/gif' }),
]

for (const file of badLogos) {
  it(`refuses logo ${file.name} without sending it`, async () => {
    vi.mocked(saveCompanySettings).mockResolvedValue(undefined as never)
    const c = await mount()
    const input = field<HTMLInputElement>(c, 'input[type="file"][name="logo"]')
    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true })
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(alerts(c).join(' ')).toContain('Logo must be a PNG, JPEG or WebP image up to 2 MB.')
    expect(field<HTMLImageElement>(c, 'img[alt="Current logo"]').getAttribute('src')).toContain('/api/org/o/logo')
    expect(createObjectURL).not.toHaveBeenCalled()
    expect(saveCompanySettings).not.toHaveBeenCalled()
    await click(button(c, 'Save changes'))
    expect(saveCompanySettings).toHaveBeenCalledTimes(1)
    expect(sent(0).get('logo')).toBeNull()
  })
}
