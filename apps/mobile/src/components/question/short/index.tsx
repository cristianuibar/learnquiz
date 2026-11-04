import { useCallback, useRef, type Ref } from 'react'
import { AccessibilityInfo, findNodeHandle, Linking, Pressable, View, type TextInput } from 'react-native'
import { Mic } from 'lucide-react-native'
import { useReducedMotion } from 'react-native-reanimated'
import { useTheme } from '../../../theme/ThemeProvider'
import { AlertRow } from '../../ui/AlertRow'
import { Button } from '../../ui/Button'
import { LinkButton } from '../../ui/LinkButton'
import { Text } from '../../ui/Text'
import { TextField } from '../../ui/TextField'
import { MAX_ANSWER_LENGTH, levelBars, voiceCopy, type VoicePorts } from '../../../lib/session/voice'
import { DiagramImage } from '../diagram-image'
import type { QuestionBodyProps } from '../types'
import { useVoiceAnswer } from './recorder'

export function ShortBody(props: QuestionBodyProps) {
  const { item, voiceSessionId } = props
  const { space } = useTheme()
  // No session id (quick session, role topic, voice off): the typed answer only.
  return (
    <View style={{ gap: space[3] }}>
      {item.image && <DiagramImage image={item.image} />}
      {voiceSessionId ? <VoiceAnswer {...props} sessionId={voiceSessionId} /> : <TypedAnswer {...props} />}
    </View>
  )
}

function TypedAnswer({ answer, onAnswer, marks, disabled, fieldRef }: QuestionBodyProps & { fieldRef?: Ref<TextInput> }) {
  const { colors } = useTheme()
  const readOnly = disabled || marks !== null
  return (
    <TextField
      ref={fieldRef}
      label="Your answer"
      value={answer.text ?? ''}
      onChangeText={(text) => onAnswer({ text })}
      editable={!readOnly}
      multiline
      numberOfLines={4}
      maxLength={MAX_ANSWER_LENGTH}
      autoCapitalize="sentences"
      importantForAutofill="no"
      textAlignVertical="top"
      style={readOnly ? { backgroundColor: colors.surfaceSunken, borderColor: colors.border } : undefined}
    />
  )
}

function VoiceAnswer(props: QuestionBodyProps & { sessionId: string }) {
  const { item, answer, onAnswer, marks, disabled, sessionId } = props
  const { colors, space } = useTheme()
  const reducedMotion = useReducedMotion()
  const readOnly = disabled || marks !== null
  const fieldRef = useRef<TextInput>(null)
  const stopRef = useRef<View>(null)

  const focus = useCallback<VoicePorts['focus']>((target) => {
    requestAnimationFrame(() => {
      if (target === 'type') return fieldRef.current?.focus()
      const node = target === 'stop' ? stopRef.current : fieldRef.current
      const tag = node && findNodeHandle(node)
      if (tag != null) AccessibilityInfo.setAccessibilityFocus(tag)
    })
  }, [])

  const { state, voice } = useVoiceAnswer({
    sessionId,
    itemId: item.id,
    text: answer.text ?? '',
    onText: (text) => onAnswer(text === undefined ? {} : { text }),
    disabled: readOnly,
    focus,
  })

  if (!state.available) return <TypedAnswer {...props} fieldRef={fieldRef} />
  const step = marks !== null ? 'review' : state.step
  const alert = state.alert && marks === null ? (
    <View style={{ gap: space[2], alignSelf: 'stretch' }}>
      <AlertRow>{state.alert.kind === 'denied' ? voiceCopy.denied : voiceCopy.failed}</AlertRow>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] }}>
        {state.alert.kind === 'failed' && state.alert.retry ? (
          <Button variant="secondary" disabled={readOnly} onPress={() => voice.retry()}>Try again</Button>
        ) : null}
        {state.alert.kind === 'denied' && state.alert.settings ? (
          <LinkButton onPress={() => { void Linking.openSettings() }}>Open settings</LinkButton>
        ) : null}
        {step !== 'review' ? <LinkButton disabled={readOnly} onPress={() => voice.typeInstead()}>Type instead</LinkButton> : null}
      </View>
    </View>
  ) : null

  if (step === 'review') {
    return (
      <View accessibilityLabel="Review your answer" style={{ gap: space[3], alignItems: 'flex-start' }}>
        {alert}
        <View style={{ alignSelf: 'stretch' }}>
          <TypedAnswer {...props} fieldRef={fieldRef} />
        </View>
        {marks === null ? (
          <Button variant="secondary" icon={Mic} disabled={readOnly} onPress={() => voice.tap()}>Record again</Button>
        ) : null}
      </View>
    )
  }

  if (step === 'transcribing') {
    return (
      <View style={{ paddingVertical: space[6] }}>
        <Text accessibilityLiveRegion="polite" style={{ textAlign: 'center' }}>{voiceCopy.transcribing}</Text>
      </View>
    )
  }

  const recording = step === 'recording'
  const bars = levelBars(state.level, reducedMotion, space[8])
  return (
    <View
      accessibilityLabel={recording ? 'Recording' : 'Voice answer'}
      style={{ alignItems: 'center', justifyContent: 'center', gap: recording ? space[4] : space[1], paddingBottom: space[6] }}
    >
      {alert}
      {recording ? (
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={{ flexDirection: 'row', alignItems: 'center', gap: space[1], minHeight: space[8] }}
        >
          {bars.map((height, index) => (
            <View key={index} style={{ width: space[1], height, borderRadius: space[1] / 2, backgroundColor: colors.brand }} />
          ))}
        </View>
      ) : null}
      <MicButton ref={stopRef} recording={recording} disabled={readOnly || step === 'requesting'} onPress={() => voice.tap()} />
      <Text variant="label" style={recording ? undefined : { marginTop: space[2] }}>{recording ? voiceCopy.recording : voiceCopy.idle}</Text>
      {!recording && !state.alert ? (
        <LinkButton disabled={readOnly || step === 'requesting'} onPress={() => voice.typeInstead()}>Type instead</LinkButton>
      ) : null}
    </View>
  )
}

// The 64 dp round record button; while recording it shows the pressed style
// (brand-hover with a 2 dp ring) and a filled stop square.
function MicButton({ ref, recording, disabled, onPress }: { ref: Ref<View>; recording: boolean; disabled: boolean; onPress(): void }) {
  const { colors, space, radius, sizes } = useTheme()
  const ring = space[1] + 2
  return (
    <View
      style={{
        borderRadius: radius.full,
        borderWidth: 2,
        borderColor: recording ? colors.brand : 'transparent',
        padding: space[1],
        margin: -ring,
      }}
    >
      <Pressable
        ref={ref}
        accessible
        focusable
        accessibilityRole="togglebutton"
        accessibilityLabel={recording ? 'Stop recording' : 'Record answer'}
        accessibilityState={{ checked: recording, disabled }}
        disabled={disabled}
        onPress={onPress}
        style={(state) => ({
          minWidth: sizes.navH,
          minHeight: sizes.navH,
          borderRadius: radius.full,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: disabled && !recording ? colors.surfaceSunken : recording || state.pressed ? colors.brandHover : colors.brand,
        })}
      >
        {recording ? (
          <View style={{ width: space[3], height: space[3], borderRadius: 2, backgroundColor: colors.onBrand }} />
        ) : (
          <Mic size={space[6]} strokeWidth={2} color={disabled ? colors.inkMuted : colors.onBrand} accessible={false} />
        )}
      </Pressable>
    </View>
  )
}
