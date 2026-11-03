import { useEffect, useRef, useState } from 'react'
import { Linking, View, type Text as NativeText } from 'react-native'
import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import { Lock } from 'lucide-react-native'
import type { DisclosureAccepted } from '@learnquiz/api'
import { possessive } from '@learnquiz/api/invite'
import { AlertRow } from '@/components/ui/AlertRow'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { LinkButton } from '@/components/ui/LinkButton'
import { Screen, useHeadingFocus } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { api } from '@/lib/api'
import { acknowledgeDisclosure } from '@/lib/disclosure'
import { takeHeldTarget } from '@/lib/held-target'
import { canOpenTarget } from '@/lib/route-gates'
import { useSession } from '@/lib/session-store'
import { useTheme } from '@/theme/ThemeProvider'

const PRIVACY_URL = 'https://learnquiz.com/privacy'
const SAVE_ERROR = "Couldn't save. Check your connection and try again."
const TODAY = '/(tabs)/today'

export default function Welcome() {
  const { colors, space } = useTheme()
  const router = useRouter()
  const { review } = useLocalSearchParams<{ review?: string }>()
  const isReview = review === '1'
  const { branding, needsDisclosure, setDisclosed } = useSession()
  const headingRef = useRef<NativeText | null>(null)
  useHeadingFocus(headingRef)
  const busyRef = useRef(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [destination, setDestination] = useState<string | null>(null)

  useEffect(() => {
    // The private routes must unlock before replacing this screen.
    if (!needsDisclosure && !isReview && !pending) {
      router.replace((destination ?? TODAY) as Href)
    }
  }, [needsDisclosure, isReview, pending, destination, router])

  const seenBy = branding?.name
    ? `You and ${possessive(branding.name)} training admins.`
    : 'You and your company’s training admins.'

  const handleGotIt = () => {
    if (isReview) {
      router.back()
      return
    }
    if (busyRef.current) return
    busyRef.current = true
    setPending(true)
    setError(null)
    void acknowledgeDisclosure({
      acknowledge: () => api<DisclosureAccepted>('/disclosure', { method: 'POST', body: {} }),
      setDisclosed,
      takeHeldTarget,
    }).then(
      (target) => {
        // Acknowledged, so the learner is ready and disclosed. A held link that
        // is still closed (for example /sign-in) falls back to Today, so Got it
        // always leaves this screen. busyRef stays set: the screen is leaving.
        setDestination(canOpenTarget(target, { status: 'ready', needsDisclosure: false }) ? target : TODAY)
        setPending(false)
      },
      () => {
        busyRef.current = false
        setPending(false)
        setError(SAVE_ERROR)
      },
    )
  }

  return (
    <Screen
      dock={
        <>
          {error ? <AlertRow>{error}</AlertRow> : null}
          <Button size="lg" variant="primary" busy={pending} onPress={handleGotIt}>
            Got it
          </Button>
        </>
      }
    >
      <Text ref={headingRef} header variant="title1">
        Before you start
      </Text>
      <View style={{ gap: space[6] }}>
        <View style={{ gap: space[1] }}>
          <Text variant="label" header>
            What we record
          </Text>
          <Text variant="body">
            Your answers, how sure you were, how long you took, your progress, and anything you
            type in a reflection or a report note.
          </Text>
        </View>
        <View style={{ gap: space[1] }}>
          <Text variant="label" header>
            Who sees it
          </Text>
          <Text variant="body">{seenBy}</Text>
        </View>
        <View style={{ gap: space[1] }}>
          <Text variant="label" header>
            What it’s for
          </Text>
          <Text variant="body">Your training and development. Nothing else.</Text>
        </View>
      </View>
      <Card style={{ backgroundColor: colors.surfaceSunken, borderWidth: 0 }}>
        <View style={{ flexDirection: 'row', gap: space[4] }}>
          <Lock size={space[6]} color={colors.inkMuted} accessible={false} />
          <View style={{ flex: 1, gap: space[1] }}>
            <Text variant="label" header>
              Never recorded
            </Text>
            <Text variant="body">
              Camera, location, sensors or health data. The microphone only while you record a
              voice answer.
            </Text>
          </View>
        </View>
      </Card>
      <LinkButton
        accessibilityRole="link"
        role="link"
        accessibilityHint="Opens in your browser"
        style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
        onPress={() => {
          void Linking.openURL(PRIVACY_URL)
        }}
      >
        Read the full privacy notice
      </LinkButton>
    </Screen>
  )
}
