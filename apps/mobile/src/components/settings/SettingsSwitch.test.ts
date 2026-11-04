import { createElement as h, useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { themes } from '@learnquiz/tokens/native'
import { ThemeProvider } from '../../theme/ThemeProvider'
import { SettingsSwitch } from './SettingsSwitch'

jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => true }))

test.each(['light', 'dark'] as const)('%s switch uses border-strong off and on-brand on', async (scheme) => {
  const onChange = jest.fn()
  function Control() {
    const [checked, setChecked] = useState(false)
    return h(SettingsSwitch, { checked, onChange: () => { onChange(); setChecked(!checked) } })
  }
  await render(h(ThemeProvider, { scheme, children: h(Control) }))
  const control = screen.getByRole('switch', { name: 'Send me questions' })
  // The decorative track/thumb are deliberately hidden from TalkBack.
  const track = control.children[1] as typeof control
  const thumb = track.children[0] as typeof control
  expect(control).toHaveProp('accessibilityState', expect.objectContaining({ checked: false }))
  expect(control).toHaveStyle({ minHeight: 48 })
  expect(track).toHaveStyle({ borderColor: themes[scheme].borderStrong })
  expect(thumb).toHaveStyle({ backgroundColor: themes[scheme].borderStrong })
  await fireEvent.press(control)
  expect(onChange).toHaveBeenCalledTimes(1)
  expect(control).toHaveProp('accessibilityState', expect.objectContaining({ checked: true }))
  expect(track).toHaveStyle({ backgroundColor: themes[scheme].brand })
  expect(thumb).toHaveStyle({ backgroundColor: themes[scheme].onBrand })
})
