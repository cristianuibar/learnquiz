import { useEffect, useRef, useState } from 'react'
import { View, type Text as NativeText } from 'react-native'
import { useKeyboardState } from 'react-native-keyboard-controller'
import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import { roleHeadline, type InviteView } from '@learnquiz/api/invite'
import { networkError } from '@learnquiz/api/system-copy'
import { AccountForm, type AccountFormValues } from '@/components/account-form'
import { AlertRow } from '@/components/ui/AlertRow'
import { Button } from '@/components/ui/Button'
import { Mark } from '@/components/ui/Mark'
import { OrgLogo } from '@/components/ui/OrgLogo'
import { Screen, useHeadingFocus } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { api, mediaSource } from '@/lib/api'
import { acceptInvitation, signIn, signOut, signUp } from '@/lib/auth'
import { deferReplay, takeHeldTarget } from '@/lib/held-target'
import { useReplayHold } from '@/lib/use-replay-hold'
import {
  createJoinFlow,
  invalidScreen,
  inviteScreen,
  loadInvite,
  type AuthMode,
  type InviteLoad,
  type JoinInput,
  type Viewer,
} from '@/lib/join'
import { canOpenTarget, homeTarget } from '@/lib/route-gates'
import { useSession } from '@/lib/session-store'
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider'

const joinApi = {
  signUp,
  signIn,
  accept: acceptInvitation,
  session: () => api<{ needsDisclosure: boolean }>('/session'),
  takeHeldTarget,
  deferReplay,
}

export default function JoinScreen() {
  const { invitationId } = useLocalSearchParams<{ invitationId: string }>()
  const [load, setLoad] = useState<InviteLoad | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    setLoad(null)
    void loadInvite(() => api<InviteView | null>(`/invites/${encodeURIComponent(invitationId)}`)).then((result) => {
      if (live) setLoad(result)
    })
    return () => { live = false }
  }, [invitationId, attempt])

  return (
    <ThemeProvider accent={load?.kind === 'found' ? load.invite.accent : null}>
      <JoinLayout>
        {!load ? <Skeleton />
          : load.kind === 'failed' ? <LoadFailed message={load.message} onRetry={() => setAttempt((n) => n + 1)} />
          : load.kind === 'invalid' ? <Heading title={invalidScreen.title} body={invalidScreen.body} />
          : <Invite invitationId={invitationId} invite={load.invite} />}
      </JoinLayout>
    </ThemeProvider>
  )
}

function LoadFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { space } = useTheme()
  return (
    <View style={{ gap: space[4] }}>
      <AlertRow>{message}</AlertRow>
      <Button size="lg" variant="secondary" onPress={onRetry}>Try again</Button>
    </View>
  )
}

function JoinLayout({ children }: { children: React.ReactNode }) {
  const { space } = useTheme()
  const keyboardVisible = useKeyboardState((state) => state.isVisible)
  return (
    <Screen
      // The artboard pads 32 below a status bar the app does not draw: inset + 16.
      contentContainerStyle={{ paddingTop: space[4] }}
      footer={keyboardVisible ? undefined : <Footer />}
    >
      {children}
    </Screen>
  )
}

function Invite({ invitationId, invite }: { invitationId: string; invite: InviteView }) {
  const { space } = useTheme()
  const session = useSession()
  const router = useRouter()
  const flow = useRef(createJoinFlow(joinApi, invitationId)).current
  const [mode, setMode] = useState<AuthMode>('signUp')
  const [signInOpen, setSignInOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  // While a submit runs the session changes underneath; keep the screen it started on.
  const [frozen, setFrozen] = useState<{ viewer: Viewer } | null>(null)
  const [target, setTarget] = useState<string | null>(null)
  // From the first submit while this screen is in front, only the join flow navigates:
  // a session refresh that lands after a failed accept must not replay a held link.
  const holdReplay = useReplayHold()

  const user = session.status === 'ready' && session.user && !session.user.isAnonymous ? session.user : null
  const viewer: Viewer = frozen ? frozen.viewer : user && { name: user.name }
  // This flow signs in only with the invite's email, so it is never another account.
  const view = inviteScreen(flow.authenticated ? { ...invite, otherAccount: false } : invite, viewer, roleHeadline(invite.roleName, invite.company))

  useEffect(() => {
    if (!target) return
    if (canOpenTarget(target, session)) {
      setTarget(null)
      router.replace(target as Href)
    } else if (session.status === 'signedOut') {
      setTarget(null)
      setFrozen(null)
      setError(networkError)
      busyRef.current = false
      setBusy(false)
    }
  }, [target, session, router])

  async function run(input: JoinInput) {
    if (busyRef.current) return
    busyRef.current = true
    holdReplay()
    setBusy(true)
    setError(null)
    setFrozen({ viewer })
    const outcome = await flow.run(input, viewer !== null)
    if (outcome.kind === 'done') {
      await session.refresh()
      setTarget(outcome.target)
      return
    }
    busyRef.current = false
    setBusy(false)
    setFrozen(null)
    setError(outcome.message)
    if (outcome.mode) setMode(outcome.mode)
  }

  function changeMode(next: AuthMode) {
    setMode(next)
    setError(null)
  }

  async function switchAccount() {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    await signOut()
    busyRef.current = false
    setBusy(false)
    setError(null)
    setMode('signIn')
  }

  const { action } = view
  const formOpen = action.kind === 'form' || (action.kind === 'signIn' && signInOpen)
  return (
    <>
      <View style={{ gap: space[4] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <OrgLogo size={56} name={invite.company} source={invite.logoUrl ? mediaSource(invite.logoUrl) : undefined} />
          <Text variant="label" style={{ flexShrink: 1 }}>{invite.company}</Text>
        </View>
        <Heading title={view.title} body={view.body} />
      </View>
      {formOpen ? (
        <AccountForm
          mode={mode}
          onModeChange={changeMode}
          email={invite.email}
          defaultName={invite.name}
          error={error}
          onSubmit={(values: AccountFormValues) => run({ ...values, mode, accept: action.kind !== 'signIn' })}
        />
      ) : action.kind !== 'none' && (
        <View style={{ gap: space[4] }}>
          {!!error && <AlertRow>{error}</AlertRow>}
          <Button
            size="lg"
            variant="primary"
            busy={busy}
            onPress={() => {
              if (action.kind === 'join') void run({ mode: 'signIn', email: invite.email, name: '', password: '' })
              else if (action.kind === 'switchAccount') void switchAccount()
              else if (action.kind === 'signIn') { changeMode('signIn'); setSignInOpen(true) }
              else if (action.kind === 'today') router.replace(homeTarget(session) as Href)
            }}
          >
            {action.label}
          </Button>
        </View>
      )}
    </>
  )
}

// Mounted only once the invite resolved, and re-keyed by title, so TalkBack lands on the current heading.
function Heading({ title, body }: { title: string; body: string | null }) {
  return <FocusedHeading key={title} title={title} body={body} />
}

function FocusedHeading({ title, body }: { title: string; body: string | null }) {
  const { space } = useTheme()
  const ref = useRef<NativeText>(null)
  useHeadingFocus(ref)
  return (
    <View style={{ gap: space[2] }}>
      <Text ref={ref} variant="title1" header>{title}</Text>
      {body && <Text>{body}</Text>}
    </View>
  )
}

function Skeleton() {
  const { colors, space, sizes, radius } = useTheme()
  const block = (width: number | `${number}%`, minHeight: number) => (
    <View style={{ width, minHeight, borderRadius: radius.md, backgroundColor: colors.surfaceSunken }} />
  )
  return (
    <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ gap: space[6] }}>
      <View style={{ gap: space[4] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          {block(sizes.topbarH, sizes.topbarH)}
          {block('40%', space[4] + space[1])}
        </View>
        {block('80%', space[8] + space[1])}
      </View>
      <View style={{ gap: space[4] }}>
        {block('100%', sizes.target)}
        {block('100%', sizes.target)}
        {block('100%', sizes.target)}
        {block('100%', sizes.topbarH)}
      </View>
    </View>
  )
}

function Footer() {
  const { space } = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
      <Mark size={space[4] + space[1]} />
      <Text variant="caption" muted>Training by Learn Quiz</Text>
    </View>
  )
}
