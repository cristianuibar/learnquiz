import { colors } from './tokens.ts'

export type BrandColors = {
  brand: string
  brandHover: string
  brandTint: string
  onBrand: string
}

export type BrandThemes = { light: BrandColors; dark: BrandColors }

function rgb(color: string): number[] {
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Use a color in #RRGGBB format.')
  return [1, 3, 5].map((start) => Number.parseInt(color.slice(start, start + 2), 16) / 255)
}

function luminance(color: string): number {
  const [r, g, b] = rgb(color).map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  )
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string): number {
  const first = luminance(a)
  const second = luminance(b)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

function hsl(color: string): [number, number, number] {
  const [r, g, b] = rgb(color)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  const lightness = (max + min) / 2
  if (delta === 0) return [0, 0, lightness]
  const hue = max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4
  return [(hue * 60 + 360) % 360, delta / (1 - Math.abs(2 * lightness - 1)), lightness]
}

function hex(hue: number, saturation: number, lightness: number): string {
  const amplitude = saturation * Math.min(lightness, 1 - lightness)
  return `#${[0, 8, 4].map((offset) => {
    const k = (offset + hue / 30) % 12
    const value = lightness - amplitude * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(value * 255).toString(16).padStart(2, '0')
  }).join('').toUpperCase()}`
}

function onBrand(color: string): string {
  return contrast(color, '#FFFFFF') >= contrast(color, '#14181F') ? '#FFFFFF' : '#14181F'
}

export function brandProblem(color: string): string | null {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return 'Use a color in #RRGGBB format.'
  const [hue, saturation] = hsl(color)
  if (saturation > 0.35 && ((hue >= 90 && hue <= 160) || hue >= 345 || hue <= 15)) {
    return 'Green and red are reserved for answer feedback.'
  }
  if (contrast(color, colors['surface-page'][0]) < 4.5 || contrast(color, onBrand(color)) < 4.5) {
    return 'Choose a color with at least 4.5:1 contrast against the page and its text.'
  }
  return null
}

export function deriveBrand(color: string): BrandThemes {
  const problem = brandProblem(color)
  if (problem) throw new Error(problem)
  const [hue, saturation, lightness] = hsl(color)
  let darkLightness = lightness
  let dark = color
  while (contrast(dark, colors['surface-page'][1]) < 4.5 || contrast(dark, onBrand(dark)) < 4.5) {
    darkLightness = Math.min(1, darkLightness + 0.001)
    dark = hex(hue, saturation, darkLightness)
  }
  return {
    light: {
      brand: color,
      brandHover: hex(hue, saturation, lightness * 0.88),
      brandTint: hex(hue, saturation, 0.92),
      onBrand: onBrand(color),
    },
    dark: {
      brand: dark,
      brandHover: hex(hue, saturation, Math.min(1, darkLightness * 1.12)),
      brandTint: hex(hue, saturation, 0.18),
      onBrand: onBrand(dark),
    },
  }
}

export function brandCss(color: string): string {
  if (brandProblem(color) !== null) return ''
  const { light, dark } = deriveBrand(color)
  const declarations = (brand: BrandColors) =>
    `  --brand: ${brand.brand};\n  --brand-hover: ${brand.brandHover};\n  --brand-tint: ${brand.brandTint};\n  --on-brand: ${brand.onBrand};`
  return `:root {\n${declarations(light)}\n}\n\n@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {\n${declarations(dark).replace(/^/gm, '  ')}\n  }\n}\n\n[data-theme="dark"] {\n${declarations(dark)}\n}\n`
}
