import { useRef, useState } from 'react'
import { View } from 'react-native'
import { Eye, EyeOff } from 'lucide-react-native'
import { canSubmit, type AuthMode } from '@/lib/join'
import { useTheme } from '@/theme/ThemeProvider'
import { AlertRow } from '@/components/ui/AlertRow'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { LinkButton } from '@/components/ui/LinkButton'
import { TextField } from '@/components/ui/TextField'

export type AccountFormValues = { email: string; name: string; password: string }

export type AccountFormProps = {
  mode: AuthMode
  onModeChange: (mode: AuthMode) => void
  email?: string
  defaultName?: string
  error?: string | null
  // Owned by the parent when given: the form then sets no state of its own after submit.
  busy?: boolean
  onSubmit: (values: AccountFormValues) => Promise<void>
}

export function AccountForm({ mode, onModeChange, email, defaultName, error, busy: parentBusy, onSubmit }: AccountFormProps) {
  const { space } = useTheme()
  const [typedEmail, setTypedEmail] = useState('')
  const [name, setName] = useState(defaultName ?? '')
  const [password, setPassword] = useState('')
  const [shown, setShown] = useState(false)
  const [ownBusy, setOwnBusy] = useState(false)
  const busy = parentBusy ?? ownBusy
  const busyRef = useRef(false)

  const signUp = mode === 'signUp'
  const emailValue = (email ?? typedEmail).trim()
  const disabled = !canSubmit(mode, name, password) || (email === undefined && !signUp && emailValue === '')

  const submit = async () => {
    if (busyRef.current || disabled) return
    busyRef.current = true
    const own = parentBusy === undefined
    if (own) setOwnBusy(true)
    try {
      await onSubmit({ email: emailValue, name, password })
    } finally {
      busyRef.current = false
      if (own) setOwnBusy(false)
    }
  }

  return (
    <View style={{ gap: space[4] }}>
      {email !== undefined ? (
        <TextField label="Email" locked value={email} hint="Set by your invite" />
      ) : (
        <TextField
          label="Email"
          value={typedEmail}
          onChangeText={setTypedEmail}
          autoComplete="email"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
      )}
      {signUp && (
        <TextField
          label="Your name"
          value={name}
          onChangeText={setName}
          autoComplete="name"
          autoCapitalize="words"
          maxLength={80}
        />
      )}
      <TextField
        label={signUp ? 'Create a password' : 'Password'}
        value={password}
        onChangeText={setPassword}
        secureTextEntry={!shown}
        maxLength={128}
        autoComplete={signUp ? 'new-password' : 'current-password'}
        autoCapitalize="none"
        autoCorrect={false}
        helper={signUp ? 'At least 8 characters' : undefined}
        trailing={
          <IconButton
            toggle
            checked={shown}
            accessibilityLabel="Show password"
            icon={shown ? EyeOff : Eye}
            onPress={() => setShown((value) => !value)}
          />
        }
      />
      <View style={{ gap: space[4], marginTop: space[2] }}>
        {!!error && <AlertRow>{error}</AlertRow>}
        <Button size="lg" variant="primary" disabled={disabled} busy={busy} onPress={() => { void submit() }}>
          {signUp ? 'Create account' : 'Sign in'}
        </Button>
      </View>
      <View style={{ alignItems: 'center' }}>
        <LinkButton onPress={() => onModeChange(signUp ? 'signIn' : 'signUp')}>
          {signUp ? 'I already have an account' : 'Create an account'}
        </LinkButton>
      </View>
    </View>
  )
}
