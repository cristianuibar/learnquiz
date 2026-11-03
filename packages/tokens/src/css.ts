import { breakpoints, colors, duration, easing, fontFamily, radius, shadow, sizes, space, typography } from './tokens.ts'

export function renderThemeCss(): string {
  const theme = [
    ...Object.keys(colors).map((name) => `  --color-${name}: var(--${name});`),
    `  --font-sans: ${fontFamily};`,
    ...Object.entries(typography).flatMap(([name, style]) => [
      `  --text-${name}: ${style.fontSize}px;`,
      `  --text-${name}--line-height: ${style.lineHeight}px;`,
      `  --text-${name}--font-weight: ${style.fontWeight};`,
      `  --text-${name}--letter-spacing: ${style.letterSpacing}em;`,
    ]),
    ...Object.entries(space).map(([name, value]) => `  --spacing-${name}: ${value}px;`),
    ...Object.entries(radius).map(([name, value]) => `  --radius-${name}: ${value}px;`),
    '  --spacing-target: var(--target);',
    '  --spacing-topbar: var(--topbar-h);',
    '  --spacing-nav: var(--nav-h);',
    '  --shadow-raised: var(--shadow-raised-value);',
    ...Object.keys(duration).map((name) => `  --transition-duration-${name}: var(--duration-${name});`),
    `  --ease-out: ${easing};`,
    ...Object.entries(breakpoints).map(([name, value]) => `  --breakpoint-${name}: ${value}px;`),
  ].join('\n')
  const palette = (index: 0 | 1) => [
    ...Object.entries(colors).map(([name, values]) => `  --${name}: ${values[index]};`),
    `  --shadow-raised-value: ${shadow.raised[index]};`,
  ].join('\n')

  return `@theme inline {
${theme}
}

:root {
  color-scheme: light dark;
${palette(0)}
  --target: ${sizes.target}px;
  --topbar-h: ${sizes.topbarH}px;
  --nav-h: ${sizes.navH}px;
${Object.entries(duration).map(([name, value]) => `  --duration-${name}: ${value}ms;`).join('\n')}
}

:root[data-theme="light"] {
  color-scheme: light;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${palette(1).replace(/^/gm, '  ')}
  }
}

[data-theme="dark"] {
  color-scheme: dark;
${palette(1)}
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --duration-reveal: 0ms;
  }
}

@layer base {
  :focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }
}
`
}
