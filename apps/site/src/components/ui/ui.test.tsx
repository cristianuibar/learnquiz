import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { Logo, LogoMark } from './logo'
import { PhoneFrame } from './phone-frame'

it('renders multiple independently masked marks with one accessible home link', () => {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(<><Logo href="/" /><LogoMark size={16} mono /></>)
  expect(container.querySelector('a')?.getAttribute('aria-label')).toBe('Learn Quiz home')
  expect(container.querySelector('a')?.getAttribute('href')).toBe('/')
  const marks = [...container.querySelectorAll('svg')]
  const maskIds = marks.map((mark) => mark.querySelector('mask')!.id)
  expect(new Set(maskIds).size).toBe(2)
  for (const [index, mark] of marks.entries()) {
    expect(mark.getAttribute('aria-hidden')).toBe('true')
    expect(mark.querySelector('path')?.getAttribute('mask')).toBe(`url(#${maskIds[index]})`)
  }
  expect(marks[1].querySelector('path')?.getAttribute('fill')).toBe('var(--on-brand)')
  expect(marks[1].querySelector(':scope > circle')?.getAttribute('fill')).toBe('var(--on-brand)')
})

it('presents a labelled phone as an illustration and leaves an unlabelled demo live', () => {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(<>
    <PhoneFrame label="A shift notification" os className="push-step" screenClassName="notification">
      <p>One question</p>
    </PhoneFrame>
    <PhoneFrame><button type="button">Check</button></PhoneFrame>
  </>)
  const phones = [...container.querySelectorAll('.phone')]
  expect(phones[0].getAttribute('role')).toBe('img')
  expect(phones[0].getAttribute('aria-label')).toBe('A shift notification')
  const staticScreen = phones[0].querySelector('.phone-screen')!
  expect(staticScreen.getAttribute('aria-hidden')).toBe('true')
  expect(staticScreen.classList.contains('os')).toBe(true)
  expect(staticScreen.classList.contains('notification')).toBe(true)
  expect(phones[1].hasAttribute('role')).toBe(false)
  expect(phones[1].querySelector('.phone-screen')?.hasAttribute('aria-hidden')).toBe(false)
  expect(phones[1].querySelector('button')?.textContent).toBe('Check')
})
