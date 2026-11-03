import { createElement as h, useState } from 'react'
import { View } from 'react-native'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { Eye } from 'lucide-react-native'
import { ThemeProvider } from '../../theme/ThemeProvider'
import { TextField } from './TextField'
import { IconButton } from './IconButton'
import { Button } from './Button'
import { Text } from './Text'

test('typing a valid password unlocks account creation and the eye toggles visibility', async () => {
  function Join() {
    const [password, setPassword] = useState('')
    const [shown, setShown] = useState(false)
    const [created, setCreated] = useState(false)
    return h(View, null,
      created ? h(Text, null, 'Account created') : null,
      h(TextField, {
        label: 'Create a password', helper: 'At least 8 characters', value: password, onChangeText: setPassword, secureTextEntry: !shown,
        trailing: h(IconButton, { icon: Eye, toggle: true, checked: shown, accessibilityLabel: 'Show password', onPress: () => setShown(!shown) }),
      }),
      h(Button, { disabled: password.length < 8, onPress: () => setCreated(true), children: 'Create account' }),
    )
  }
  await render(h(ThemeProvider, { children: h(Join) }))
  expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled()
  const input = screen.getByLabelText('Create a password')
  expect(input).toHaveProp('accessibilityHint', 'At least 8 characters')
  await fireEvent.changeText(input, 'new-password')
  expect(input).toHaveDisplayValue('new-password')
  await fireEvent.press(screen.getByRole('button', { name: 'Show password' }))
  expect(input).toHaveProp('secureTextEntry', false)
  await fireEvent.press(screen.getByRole('button', { name: 'Create account' }))
  expect(screen.getByText('Account created')).toBeOnTheScreen()
})

test('locked invite email is readable with its hint and cannot be edited', async () => {
  await render(h(ThemeProvider, { children: h(TextField, { locked: true, label: 'Email', value: 'jordan@northwind.example', hint: 'Set by your invite' }) }))
  const email = screen.getByLabelText('Email, jordan@northwind.example')
  expect(email).toHaveProp('accessibilityHint', 'Set by your invite')
  expect(screen.getByText('jordan@northwind.example')).toBeOnTheScreen()
  expect(screen.queryByDisplayValue('jordan@northwind.example')).toBeNull()
})
