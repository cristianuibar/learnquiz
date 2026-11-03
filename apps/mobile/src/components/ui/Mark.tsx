import { useId } from 'react'
import Svg, { Circle, Defs, Mask, Path, type SvgProps } from 'react-native-svg'
import { useTheme } from '../../theme/ThemeProvider'

export type MarkProps = SvgProps & { size?: number }

export function Mark({ size, ...props }: MarkProps) {
  const { colors, sizes } = useTheme()
  const id = useId()
  return (
    <Svg width={size ?? sizes.navH} height={size ?? sizes.navH} viewBox="0 0 64 64" accessible={false} {...props}>
      <Defs>
        <Mask id={id} x="0" y="0" width="64" height="64" maskUnits="userSpaceOnUse" maskType="alpha">
          <Path d="M0 0h64v64H0z M35 48a13 13 0 1 0 26 0a13 13 0 1 0-26 0" fill={colors.ink} fillRule="evenodd" />
        </Mask>
      </Defs>
      <Circle cx="32" cy="32" r="19" strokeWidth="14" stroke={colors.brand} fill="none" mask={`url(#${id})`} />
      <Circle cx="48" cy="48" r="9" fill={colors.accent} />
    </Svg>
  )
}
