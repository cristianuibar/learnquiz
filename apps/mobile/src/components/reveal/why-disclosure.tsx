import { useState, type ReactNode } from 'react'
import { View } from 'react-native'
import { ChevronDown, ChevronUp } from 'lucide-react-native'
import { revealCopy } from '@learnquiz/api/reveal'
import { useTheme } from '../../theme/ThemeProvider'
import { LinkButton } from '../ui/LinkButton'

export function WhyDisclosure({ children, openByDefault = false }: { children: ReactNode; openByDefault?: boolean }) {
  const { space } = useTheme()
  const [expanded, setExpanded] = useState(openByDefault)
  return (
    <View style={{ gap: space[4] }}>
      <LinkButton
        icon={expanded ? ChevronUp : ChevronDown}
        onPress={() => setExpanded((value) => !value)}
        accessibilityLabel={revealCopy.why}
        accessibilityState={{ expanded }}
        style={{ alignSelf: 'flex-start', flexDirection: 'row-reverse', marginTop: -space[3], marginLeft: -space[2] }}
      >
        {revealCopy.why}
      </LinkButton>
      {expanded ? <>{children}</> : null}
    </View>
  )
}
