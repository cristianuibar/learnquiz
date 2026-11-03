import { writeFileSync } from 'node:fs'
import { renderThemeCss } from '../src/css.ts'

writeFileSync(new URL('../theme.css', import.meta.url), renderThemeCss())
