import { useRef, useState } from 'react'
import { isAnswerReady } from '@learnquiz/api'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'
import { clozeAnswer, clozeMaxLength, splitClozeStem } from '../../lib/session/cloze'
import { useTheme } from '../../theme/ThemeProvider'
import { Text } from '../ui/Text'
import type { QuestionBodyProps } from './types'

export function ClozeBody({ item, answer, onAnswer, marks, disabled, onSubmit }: QuestionBodyProps) {
  const { colors, typography, space, radius, sizes } = useTheme()
  const input = useRef<TextInput>(null)
  const [focused, setFocused] = useState(false)
  const numeric = item.blank?.numeric === true
  const readOnly = disabled || marks !== null
  const { before, prefix, suffix, after } = splitClozeStem(item.stem)
  const sentence = [...before, `${prefix}blank${suffix}`, ...after].join(' ')
  const hitSlop = { top: space[2], bottom: space[2], left: space[1], right: space[1] }

  function focus() {
    if (!readOnly) input.current?.focus()
  }

  function words(values: string[], side: string) {
    return values.map((word, index) => (
      <Text
        key={`${side}-${index}`}
        variant="title2"
        accessible={false}
        importantForAccessibility="no"
        onPress={readOnly ? undefined : focus}
        style={{ lineHeight: typography.title2.lineHeight + space[3] }}
      >
        {word}
      </Text>
    ))
  }

  return (
    <Pressable
      accessible={false}
      focusable={false}
      disabled={readOnly}
      onPress={focus}
      hitSlop={hitSlop}
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: space[1],
        minHeight: sizes.target,
        paddingVertical: space[1],
      }}
    >
      {/* A sibling label keeps the sentence readable without grouping away the input. */}
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={sentence}
        importantForAccessibility="yes"
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
      {words(before, 'before')}
      <View style={{ flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', gap: 0 }}>
        {prefix ? (
          <Text variant="title2" accessible={false} importantForAccessibility="no" style={{ lineHeight: typography.title2.lineHeight + space[3] }}>
            {prefix}
          </Text>
        ) : null}
        <TextInput
          ref={input}
          value={answer.text ?? ''}
          onChangeText={(value) => { if (!readOnly) onAnswer(clozeAnswer(value, numeric)) }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          editable={!readOnly}
          autoFocus={!readOnly}
          keyboardType={numeric ? 'number-pad' : 'default'}
          maxLength={clozeMaxLength(numeric)}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={numeric ? 'Missing number' : 'Missing word'}
          accessibilityState={{ disabled: readOnly }}
          importantForAutofill="no"
          returnKeyType="done"
          submitBehavior="submit"
          onSubmitEditing={() => {
            if (!readOnly && isAnswerReady('cloze', answer, item.options.length)) onSubmit?.()
          }}
          hitSlop={hitSlop}
          selectionColor={colors.brand}
          underlineColorAndroid="transparent"
          style={{
            ...typography.title2,
            lineHeight: typography.title2.lineHeight - space[1],
            width: sizes.target + space[8] + space[2],
            minHeight: space[8] + space[1],
            paddingVertical: space[1],
            paddingHorizontal: space[2],
            borderWidth: 2,
            borderColor: colors.brand,
            outlineWidth: focused ? 2 : 0,
            outlineOffset: 2,
            outlineColor: colors.brand,
            borderRadius: radius.md,
            backgroundColor: colors.surfaceCard,
            color: colors.ink,
            textAlign: 'center',
            includeFontPadding: false,
            fontVariant: numeric ? ['tabular-nums'] : undefined,
          }}
        />
        {suffix ? (
          <Text variant="title2" accessible={false} importantForAccessibility="no" style={{ lineHeight: typography.title2.lineHeight + space[3] }}>
            {suffix}
          </Text>
        ) : null}
      </View>
      {words(after, 'after')}
    </Pressable>
  )
}
