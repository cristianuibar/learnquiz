// With the local app running and agent-browser signed in as a company owner, use an empty draft role:
// RECOVERY_TEST_ROLE=/org/<slug>/roles/<id> node --test apps/web/test/document-recovery.browser.mjs
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

const role = process.env.RECOVERY_TEST_ROLE
assert.match(role ?? '', /^\/org\/[a-z0-9-]+\/roles\/[a-z0-9-]+$/, 'Pass a local draft role path')
const browser = (...args) => {
  const result = JSON.parse(execFileSync('agent-browser', ['--json', ...args], { encoding: 'utf8', timeout: 45_000 }))
  assert.equal(result.success, true, result.error)
  return result.data
}
const evaluate = (script) => browser('eval', script).result
browser('open', `http://127.0.0.1:8800${role}`)
browser('wait', '--text', 'Documents')
browser('wait', '--load', 'networkidle')
const original = evaluate('({ theme: localStorage.getItem("lq-theme"), width: innerWidth, height: innerHeight })')
const directory = mkdtempSync(join(tmpdir(), 'learnquiz-recovery-'))
const file = join(directory, 'Recovery scan.pdf')
const more = 'button[aria-label="More actions for Recovery scan"]'
after(() => {
  try {
    browser('set', 'viewport', '1280', '844')
    if (evaluate(`!!document.querySelector('${more}')`)) {
      browser('click', more)
      browser('wait', '[role="menuitem"]')
      browser('find', 'role', 'menuitem', 'click', '--name', 'Remove', '--exact')
      browser('wait', '--fn', `!document.querySelector('${more}')`)
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
    evaluate(`(() => {
      const theme = ${JSON.stringify(original.theme)};
      if (theme === null) { localStorage.removeItem('lq-theme'); delete document.documentElement.dataset.theme; }
      else { localStorage.setItem('lq-theme', theme); document.documentElement.dataset.theme = theme; }
    })()`)
    browser('set', 'viewport', String(original.width), String(original.height))
  }
})

// A valid one-page PDF with a drawn rectangle and no selectable text.
const content = '0 0 100 100 re S'
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << >> >>',
  `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
]
let pdf = '%PDF-1.4\n'
const offsets = objects.map((object, i) => {
  const offset = pdf.length
  pdf += `${i + 1} 0 obj\n${object}\nendobj\n`
  return offset
})
const xref = pdf.length
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
writeFileSync(file, pdf)
browser('upload', 'input[type="file"]', file)
browser('wait', '--text', 'Extraction failed')
browser('wait', more)

for (const theme of ['light', 'dark']) {
  test(`failed PDF recovery stays inside its card at 390px (${theme})`, () => {
    browser('set', 'viewport', '390', '844')
    evaluate(`document.documentElement.dataset.theme = '${theme}'`)
    const layout = evaluate(`(() => {
      const menu = document.querySelector('${more}');
      const row = menu.closest('li'), card = row.closest('ul').getBoundingClientRect();
      const buttons = [...row.querySelectorAll('button')].map(button => {
        const { left, right, top, width, height } = button.getBoundingClientRect();
        return { label: button.getAttribute('aria-label') || button.textContent, left, right, top, width, height };
      });
      return { viewport: innerWidth, scroll: document.documentElement.scrollWidth, card: { left: card.left, right: card.right }, buttons };
    })()`)
    assert.equal(layout.scroll, layout.viewport, 'page must not scroll horizontally')
    assert.deepEqual(layout.buttons.map(button => button.label), ['Replace file Recovery scan', 'Paste text instead', 'More actions for Recovery scan'])
    for (const button of layout.buttons) {
      assert.ok(button.left >= layout.card.left && button.right <= layout.card.right, `${button.label} stays inside the card`)
      assert.ok(button.width >= 44 && button.height >= 44, `${button.label} keeps its touch target`)
    }
    assert.ok(new Set(layout.buttons.map(button => button.top)).size > 1, 'recovery actions wrap onto another line')
    browser('find', 'role', 'button', 'click', '--name', 'Paste text instead', '--exact')
    browser('wait', '#rd-paste-text')
    browser('find', 'role', 'button', 'click', '--name', 'Paste text instead', '--exact')
    browser('click', more)
    browser('wait', '[role="menuitem"]')
    assert.equal(evaluate('document.querySelector(\'[role="menuitem"]\').textContent'), 'Remove')
    browser('press', 'Escape')
  })
}
