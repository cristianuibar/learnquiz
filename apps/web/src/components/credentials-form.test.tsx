// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { CredentialsForm } from '@/components/credentials-form'

vi.mock('@/lib/auth-client', () => ({ authClient: { signUp: { email: vi.fn() }, signIn: { email: vi.fn() } } }))

it.each([
  { prefill: undefined, typed: 'Sam', ready: false },
  { prefill: 'Ana', typed: '', ready: true },
])('keeps Create account in step with the name shown after toggling to sign-in and back (prefill $prefill)', async ({ prefill, typed, ready }) => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const field = (id: string) => container.querySelector<HTMLInputElement>('#' + id)!
  const button = (text: string) => [...container.querySelectorAll('button')].find((b) => b.textContent === text)!
  const type = (id: string, value: string) => act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field(id), value)
    field(id).dispatchEvent(new Event('input', { bubbles: true }))
  })
  try {
    await act(async () => { root.render(<CredentialsForm name={prefill} onDone={async () => {}} />) })
    await type('name', typed)
    await type('password', 'long-enough')
    expect(button('Create account').disabled).toBe(typed === '')
    await act(async () => { button('I already have an account').click() })
    await act(async () => { button('Create an account').click() })
    expect(field('name').value).toBe(prefill ?? '')
    expect(button('Create account').disabled).toBe(!ready)
  } finally {
    act(() => root.unmount())
    container.remove()
  }
})
