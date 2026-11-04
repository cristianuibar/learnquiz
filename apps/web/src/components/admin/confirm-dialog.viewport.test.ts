import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import tailwindcss from '@tailwindcss/vite'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, it } from 'vitest'

const exec = promisify(execFile)
const session = `dialog-viewport-${process.pid}`
let server: ViteDevServer

async function browser(...args: string[]) {
  const { stdout } = await exec('agent-browser', ['--session', session, '--json', ...args], { timeout: 15_000 })
  return JSON.parse(stdout).data
}

async function evaluate<T>(fn: () => T): Promise<T> {
  return (await browser('eval', '--base64', Buffer.from(`(${fn})()`).toString('base64'))).result
}

beforeAll(async () => {
  // Serve the real component and application CSS without starting Cloudflare or a database.
  server = await createServer({
    configFile: false,
    resolve: { tsconfigPaths: true },
    plugins: [tailwindcss()],
    server: { host: '127.0.0.1', port: 0 },
  })
  await server.listen()
  await browser('set', 'viewport', '1024', '768')
  await browser('set', 'media', 'light', 'reduced-motion')
  // Font hosting is an external boundary; the layout regression needs no network access.
  await browser('network', 'route', 'https://fonts.googleapis.com/**', '--abort')
  await browser('network', 'route', 'https://fonts.gstatic.com/**', '--abort')
  await browser('open', `${server.resolvedUrls!.local[0]}tests/fixtures/confirm-dialog.html`)
}, 30_000)

afterAll(async () => {
  try { await browser('close') } finally { await server?.close() }
})

it('keeps both controls on screen at 1024×768 while twenty shared concepts scroll with the keyboard', async () => {
  await browser('find', 'role', 'button', 'click', '--name', 'Retire', '--exact')
  await browser('wait', '[role="dialog"]')
  const layout = await evaluate(() => {
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
    const region = dialog.querySelector<HTMLElement>('[role="region"][aria-label="Consequences"]')!
    const inViewport = (el: Element) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth
    }
    return {
      viewport: [innerWidth, innerHeight],
      dialogVisible: inViewport(dialog),
      controls: [...dialog.querySelectorAll('button')]
        .filter((b) => ['Cancel', 'Retire document'].includes(b.textContent!))
        .map((b) => ({ name: b.textContent, visible: inViewport(b), top: b.getBoundingClientRect().top })),
      scrollable: region.scrollHeight > region.clientHeight,
      concepts: region.querySelectorAll('li').length,
    }
  })
  expect(layout.viewport).toEqual([1024, 768])
  expect(layout.dialogVisible, 'dialog must fit within the viewport').toBe(true)
  expect(layout.controls.map(({ name, visible }) => ({ name, visible }))).toEqual([
    { name: 'Cancel', visible: true },
    { name: 'Retire document', visible: true },
  ])
  expect(layout.concepts).toBe(20)
  expect(layout.scrollable, 'consequences must overflow inside their own region').toBe(true)

  await browser('focus', '[role="region"][aria-label="Consequences"]')
  await browser('press', 'End')
  await browser('wait', '--fn', `(() => {
    const r = document.querySelector('[role="region"][aria-label="Consequences"]');
    return r.scrollTop > 0 && Math.abs(r.scrollHeight - r.clientHeight - r.scrollTop) < 1;
  })()`)
  const scrolled = await evaluate(() => {
    const region = document.querySelector<HTMLElement>('[role="region"][aria-label="Consequences"]')!
    const last = region.querySelector('li:last-child')!.getBoundingClientRect()
    const bounds = region.getBoundingClientRect()
    return {
      focused: document.activeElement === region,
      lastVisible: last.top >= bounds.top && last.bottom <= bounds.bottom,
      controls: [...document.querySelectorAll('[role="dialog"] button')]
        .filter((b) => ['Cancel', 'Retire document'].includes(b.textContent!))
        .map((b) => b.getBoundingClientRect().top),
    }
  })
  expect(scrolled.focused).toBe(true)
  expect(scrolled.lastVisible, 'keyboard scrolling must reveal the final concept').toBe(true)
  expect(scrolled.controls).toEqual(layout.controls.map(({ top }) => top))
  await browser('find', 'role', 'button', 'click', '--name', 'Retire document', '--exact')
  await browser('wait', '[role="status"]')
  expect(await evaluate(() => document.querySelector('[role="status"]')?.textContent)).toBe('Document retired')
}, 15_000)
