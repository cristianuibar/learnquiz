// With the local app running and agent-browser signed in as a non-staff company owner:
// FOCUS_TEST_COMPANY=<company-slug> node --test apps/web/test/error-focus.browser.mjs
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { after, test } from 'node:test'

const slug = process.env.FOCUS_TEST_COMPANY
assert.match(slug ?? '', /^[a-z0-9-]+$/, 'Pass the local company slug')
const origin = 'http://127.0.0.1:8800'
const browser = (...args) => {
  const result = JSON.parse(execFileSync('agent-browser', ['--json', ...args], { encoding: 'utf8', timeout: 45_000 }))
  assert.equal(result.success, true, result.error)
  return result.data
}
const evaluate = (script) => browser('eval', script).result
browser('open', `${origin}/start`)
const originalTheme = evaluate('localStorage.getItem("lq-theme")')
after(() => evaluate(`(() => {
  const theme = ${JSON.stringify(originalTheme)};
  if (theme === null) { localStorage.removeItem('lq-theme'); delete document.documentElement.dataset.theme; }
  else { localStorage.setItem('lq-theme', theme); document.documentElement.dataset.theme = theme; }
})()`))

for (const [name, path, title, recovery] of [
  ['Denied', '/org/focus-test-inaccessible', 'No access to this portal', 'Sign in with another account'],
  ['Staff denied', '/admin', 'No access to the staff admin', 'Go to your portal'],
  ['Not found', `/org/${slug}/roles/focus-test-missing`, 'Role not found', 'Go to Overview'],
]) {
  test(`${name}: keyboard focus ring and recovery, pointer focus, light and dark`, () => {
    for (const theme of ['light', 'dark']) {
      evaluate(`localStorage.setItem('lq-theme', '${theme}')`)
      for (const input of ['keyboard', 'pointer']) {
        // A real link and native input preserve the browser's focus-visible modality.
        evaluate(`(() => {
          const link = document.createElement('a');
          link.id = 'focus-test-entry'; link.href = ${JSON.stringify(origin + path)};
          link.textContent = 'Open page'; document.body.prepend(link); link.focus();
        })()`)
        if (input === 'keyboard') browser('press', 'Enter')
        else browser('click', '#focus-test-entry')
        browser('wait', '--fn', `document.querySelector('h1')?.textContent === ${JSON.stringify(title)} && document.activeElement === document.querySelector('h1')`)
        const focus = evaluate(`(() => {
          const h1 = document.querySelector('h1'), style = getComputedStyle(h1);
          const brand = document.createElement('span');
          brand.style.color = 'var(--brand)'; h1.append(brand);
          const brandColor = getComputedStyle(brand).color; brand.remove();
          return { visible: h1.matches(':focus-visible'), width: style.outlineWidth,
            offset: style.outlineOffset, color: style.outlineColor, style: style.outlineStyle, brandColor };
        })()`)
        if (input === 'keyboard') {
          assert.equal(focus.visible, true, `${name} ${theme}: keyboard focus-visible`)
          assert.equal(focus.style, 'solid', `${name} ${theme}: visible outline`)
          assert.equal(focus.width, '2px', `${name} ${theme}: outline width`)
          assert.equal(focus.offset, '2px', `${name} ${theme}: outline offset`)
          assert.equal(focus.color, focus.brandColor, `${name} ${theme}: brand outline`)
          browser('press', 'Tab')
          assert.equal(evaluate('document.activeElement.textContent'), recovery)
        } else if (!focus.visible) {
          assert.equal(focus.style, 'none', `${name} ${theme}: no pointer outline`)
        }
      }
    }
  })
}
