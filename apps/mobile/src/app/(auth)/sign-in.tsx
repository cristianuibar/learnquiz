import { useEffect, useRef, useState } from 'react'
import { Alert, Linking, View, type Text as NativeText } from 'react-native'
import { useKeyboardState } from 'react-native-keyboard-controller'
import { useIsFocused, useLocalSearchParams } from 'expo-router'
import { FacebookSignIn } from '@/components/facebook-sign-in'
import { AlertRow } from '@/components/ui/AlertRow'
import { AccountForm, type AccountFormValues } from '@/components/account-form'
import { Mark } from '@/components/ui/Mark'
import { LinkButton } from '@/components/ui/LinkButton'
import { Screen, useHeadingFocus } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { api } from '@/lib/api'
import { acceptInvitation, finishFacebookSignIn, signIn, signUp, subscribeAuth } from '@/lib/auth'
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
  const { email, facebookState, facebookCode, facebookError } = useLocalSearchParams<{ email?: string | string[]; facebookState?: string; facebookCode?: string; facebookError?: string }>()
  const [socialBusy, setSocialBusy] = useState(false)
  const [socialError, setSocialError] = useState<string | null>(null)
  const lastFacebook = useRef<string | null>(null)
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

  useEffect(() => {
    if (!focused || !facebookState || lastFacebook.current === facebookState) return
    lastFacebook.current = facebookState
    setSocialBusy(true)
    setSocialError(null)
    holdReplay()
    void finishFacebookSignIn(facebookState, facebookCode, facebookError).catch((error: unknown) => {
      setSocialError(error instanceof Error ? error.message : 'Facebook sign-in could not finish. Please try again.')
    }).finally(() => setSocialBusy(false))
  }, [focused, facebookState, facebookCode, facebookError, holdReplay])

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
      {socialError && <AlertRow>{socialError}</AlertRow>}
      <FacebookSignIn disabled={state.busy || socialBusy} />
      <AccountForm
        mode="signIn"
        onModeChange={() => {}}
        defaultEmail={Array.isArray(email) ? email[0] : email}
        showModeLink={false}
        busy={state.busy || socialBusy}
        error={state.error}
        onSubmit={submit}
      />
      <View style={{ gap: space[2] }}>
        <Text variant="body">New to Learn Quiz? Create your account on the web, then sign in here.</Text>
        <LinkButton
          accessibilityLabel="Open web sign-up, opens browser"
          accessibilityRole="link"
          role="link"
          accessibilityHint="Opens in your browser"
          style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
          onPress={() => {
            void Linking.openURL('https://app.learnquiz.com/sign-in?mode=up').catch(() => {
              Alert.alert('Could not open browser', 'Visit https://app.learnquiz.com/sign-in?mode=up to create your account.')
            })
          }}
        >Open web sign-up</LinkButton>
      </View>
    </Screen>
  )
}
