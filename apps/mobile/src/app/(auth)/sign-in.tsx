import { useEffect, useRef, useState } from 'react'
import { View, type Text as NativeText } from 'react-native'
import { useKeyboardState } from 'react-native-keyboard-controller'
import { useIsFocused, useLocalSearchParams } from 'expo-router'
import { AccountForm, type AccountFormValues } from '@/components/account-form'
import { Mark } from '@/components/ui/Mark'
import { Screen, useHeadingFocus } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { api } from '@/lib/api'
import { acceptInvitation, signIn, signUp, subscribeAuth } from '@/lib/auth'
import { useSession } from '@/lib/session-store'
import { createSignInFlow, type SignInState } from '@/lib/sign-in'
import { useReplayHold } from '@/lib/use-replay-hold'
import { useTheme } from '@/theme/ThemeProvider'

const accountApi = {
  signIn,
  signUp,
  accept: acceptInvitation,
  session: () => api<{ needsDisclosure: boolean }>('/session'),
}

export default function SignInScreen() {
  const { email } = useLocalSearchParams<{ email?: string | string[] }>()
  const { space } = useTheme()
  const session = useSession()
  const { refresh } = session
  const focused = useIsFocused()
  const holdReplay = useReplayHold()
  const keyboardVisible = useKeyboardState((state) => state.isVisible)
  const heading = useRef<NativeText>(null)
  useHeadingFocus(heading)
  const [state, setState] = useState<SignInState>({ busy: false, error: null })
  const [settled, setSettled] = useState(0)
  const flow = useRef<ReturnType<typeof createSignInFlow> | null>(null)
  const latest = useRef({ focused, session })
  latest.current = { focused, session }

  useEffect(() => {
    const next = createSignInFlow(accountApi, {
      refresh,
      holdReplay,
      changed: setState,
      settled: () => setSettled((count) => count + 1),
    })
    flow.current = next
    next.update(latest.current)
    const unsubscribe = subscribeAuth((event) => {
      if (event === 'signedOut') next.signedOut()
    })
    return () => {
      unsubscribe()
      next.dispose()
      flow.current = null
    }
  }, [refresh, holdReplay])

  useEffect(() => { flow.current?.update({ focused, session }) }, [focused, session, settled])

  async function submit({ email, password }: AccountFormValues) {
    await flow.current?.submit(email, password)
  }

  return (
    <Screen
      contentContainerStyle={{ paddingTop: space[4] }}
      footer={keyboardVisible ? undefined : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <Mark size={space[4] + space[1]} />
          <Text variant="caption" muted>Training by Learn Quiz</Text>
        </View>
      )}
    >
      <Text ref={heading} variant="title1" header>Sign in</Text>
      <AccountForm
        mode="signIn"
        onModeChange={() => {}}
        defaultEmail={Array.isArray(email) ? email[0] : email}
        showModeLink={false}
        busy={state.busy}
        error={state.error}
        onSubmit={submit}
      />
    </Screen>
  )
}
