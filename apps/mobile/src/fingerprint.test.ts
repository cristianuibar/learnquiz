import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const mobileRoot = resolve(__dirname, '..')
let fixtureRoot: string

beforeAll(() => {
  const scratchRoot = join(mobileRoot, '.expo')
  mkdirSync(scratchRoot, { recursive: true })
  fixtureRoot = mkdtempSync(join(scratchRoot, 'fingerprint-test-'))
  symlinkSync(join(mobileRoot, 'node_modules'), join(fixtureRoot, 'node_modules'), 'dir')
  copyFileSync(join(mobileRoot, 'fingerprint.config.js'), join(fixtureRoot, 'fingerprint.config.js'))
  writeFileSync(join(fixtureRoot, 'package.json'), JSON.stringify({ name: 'fingerprint-test', version: '1.0.0' }))
  writeFileSync(join(fixtureRoot, 'app.config.js'), `module.exports = () => ({
    name: 'Fingerprint test', slug: 'fingerprint-test',
    android: {
      package: 'com.learnquiz.app',
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON || undefined,
      permissions: process.env.FINGERPRINT_TEST_PERMISSION ? ['android.permission.CAMERA'] : [],
    },
  })`)
})

afterAll(() => {
  if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true })
})

function fingerprint(googleServicesFile = '', permission = ''): string {
  // Separate processes mirror local EAS metadata, builder, and Update evaluation.
  return execFileSync(process.execPath, ['-e', `
    require('expo/fingerprint').createFingerprintAsync(process.argv[1], {
      platforms: ['android'], silent: true,
    }).then(result => process.stdout.write(result.hash)).catch(error => {
      console.error(error); process.exit(1);
    });
  `, fixtureRoot], {
    cwd: mobileRoot,
    env: { ...process.env, GOOGLE_SERVICES_JSON: googleServicesFile, FINGERPRINT_TEST_PERMISSION: permission },
    encoding: 'utf8',
    timeout: 30000,
  }).trim()
}

test('Firebase secret files do not split runtimes, while native permission changes do', () => {
  const secretDir = join(fixtureRoot, 'eas-environment-secrets')
  mkdirSync(secretDir)
  const fileA = join(secretDir, 'a123456')
  const fileB = join(secretDir, 'b[123456]')
  writeFileSync(fileA, JSON.stringify({ project_info: { project_id: 'dummy-a' } }))
  writeFileSync(fileB, JSON.stringify({ project_info: { project_id: 'dummy-b' } }))

  const baseline = fingerprint()
  expect(baseline).toMatch(/^[a-f0-9]{40}$/)
  expect(fingerprint(fileA)).toBe(baseline)
  expect(fingerprint(fileB)).toBe(baseline)
  expect(fingerprint(fileB, 'camera')).not.toBe(baseline)
}, 60000)
