import { createElement as h, useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { Eye, Flag } from 'lucide-react-native'
import { themes } from '@learnquiz/tokens/native'
import { ThemeProvider } from '../../theme/ThemeProvider'
import { Button } from './Button'
import { LinkButton } from './LinkButton'
import { IconButton } from './IconButton'
import { Text } from './Text'
import { RetryIcon } from './icons'

test.each(['primary', 'secondary', 'ghost', 'accent'] as const)('%s buttons perform their action', async (variant) => {
  function Action() {
    const [done, setDone] = useState(false)
    return done ? h(Text, null, 'Session ready') : h(Button, { variant, size: 'lg', icon: RetryIcon, onPress: () => setDone(true), children: 'Try again' })
  }
  await render(h(ThemeProvider, { children: h(Action) }))
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
  expect(screen.getByText('Session ready')).toBeOnTheScreen()
})

test.each([{ disabled: true }, { busy: true }])('unavailable buttons keep their label and block activation: %p', async (state) => {
  const onPress = jest.fn()
  const view = await render(h(ThemeProvider, { children: h(Button, { ...state, onPress, children: 'Check' }) }))
  const check = screen.getByRole('button', { name: 'Check', disabled: true })
  expect(check).toHaveStyle({ backgroundColor: themes.light.surfaceSunken, borderStyle: 'dashed', borderWidth: 2 })
  await fireEvent.press(check)
  expect(onPress).not.toHaveBeenCalled()
  expect(screen.getByText('Check')).toBeOnTheScreen()
  await view.rerender(h(ThemeProvider, { children: h(Button, { onPress, children: 'Check' }) }))
  await fireEvent.press(screen.getByRole('button', { name: 'Check', disabled: false }))
  expect(onPress).toHaveBeenCalledTimes(1)
})

test('busy announces its state while keeping the action readable', async () => {
  await render(h(ThemeProvider, { scheme: 'dark', children: h(Button, { busy: true, children: 'Create account' }) }))
  expect(screen.getByRole('button', { name: 'Create account', busy: true })).toBeDisabled()
  expect(screen.getByText('Create account')).toHaveStyle({ color: themes.dark.inkMuted })
})

test('keyboard focus is visible and is cleared on blur', async () => {
  await render(h(ThemeProvider, { children: h(Button, { children: 'Continue' }) }))
  const button = screen.getByRole('button', { name: 'Continue' })
  await fireEvent(button, 'focus', {})
  expect(button).toHaveStyle({ outlineWidth: 2, outlineOffset: 2, outlineColor: themes.light.brand })
  await fireEvent(button, 'blur', {})
  expect(button).toHaveStyle({ outlineWidth: 0 })
})

test('the report link opens its destination', async () => {
  function Report() {
    const [open, setOpen] = useState(false)
    return open ? h(Text, { header: true }, 'Report a problem') : h(LinkButton, { tone: 'muted', icon: Flag, onPress: () => setOpen(true), children: 'Report this question' })
  }
  await render(h(ThemeProvider, { children: h(Report) }))
  await fireEvent.press(screen.getByRole('button', { name: 'Report this question' }))
  expect(screen.getByRole('header', { name: 'Report a problem' })).toBeOnTheScreen()
})

test('icon toggles expose and update the checked state', async () => {
  function Toggle() {
    const [checked, setChecked] = useState(false)
    return h(IconButton, { icon: Eye, toggle: true, checked, accessibilityLabel: 'Show password', onPress: () => setChecked(!checked) })
  }
  await render(h(ThemeProvider, { children: h(Toggle) }))
  expect(screen.getByRole('button', { name: 'Show password' })).toHaveProp('accessibilityState', expect.objectContaining({ checked: false }))
  await fireEvent.press(screen.getByRole('button', { name: 'Show password' }))
  expect(screen.getByRole('button', { name: 'Show password' })).toHaveProp('accessibilityState', expect.objectContaining({ checked: true }))
  expect(screen.getByRole('button', { name: 'Show password' })).toHaveStyle({ backgroundColor: themes.light.brandTint })
  await fireEvent.press(screen.getByRole('button', { name: 'Show password' }))
  expect(screen.getByRole('button', { name: 'Show password' })).toHaveProp('accessibilityState', expect.objectContaining({ checked: false }))
})
