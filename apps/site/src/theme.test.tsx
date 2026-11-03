import { afterEach, expect, it, vi } from 'vitest'
import { applyTheme, readTheme, themeBootstrap, themeStorageKey } from './theme'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

it('applies a saved theme before paint and returns to the system theme, including when storage is unavailable', () => {
  localStorage.setItem(themeStorageKey, 'dark')
  new Function(themeBootstrap)()
  expect(document.documentElement.dataset.theme).toBe('dark')
  expect(readTheme()).toBe('dark')

  for (const choice of [null, 'invalid', 'system']) {
    document.documentElement.removeAttribute('data-theme')
    if (choice === null) localStorage.removeItem(themeStorageKey)
    else localStorage.setItem(themeStorageKey, choice)
    new Function(themeBootstrap)()
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(readTheme()).toBe('system')
  }

  applyTheme('light')
  expect(localStorage.getItem(themeStorageKey)).toBe('light')
  expect(document.documentElement.dataset.theme).toBe('light')
  expect(readTheme()).toBe('light')
  document.documentElement.removeAttribute('data-theme')
  new Function(themeBootstrap)()
  expect(document.documentElement.dataset.theme).toBe('light')

  applyTheme('system')
  expect(localStorage.getItem(themeStorageKey)).toBeNull()
  expect(document.documentElement.hasAttribute('data-theme')).toBe(false)

  const unavailable = () => { throw new Error('Storage unavailable') }
  vi.spyOn(localStorage, 'getItem').mockImplementation(unavailable)
  vi.spyOn(localStorage, 'setItem').mockImplementation(unavailable)
  vi.spyOn(localStorage, 'removeItem').mockImplementation(unavailable)
  expect(() => new Function(themeBootstrap)()).not.toThrow()
  expect(readTheme()).toBe('system')
  expect(() => applyTheme('dark')).not.toThrow()
  expect(document.documentElement.dataset.theme).toBe('dark')
  expect(() => applyTheme('system')).not.toThrow()
  expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
})
