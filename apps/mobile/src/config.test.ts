import { existsSync } from 'node:fs'
import { join } from 'node:path'
import config from '../app.config'

jest.mock('node:fs', () => ({ existsSync: jest.fn() }))

const exists = jest.mocked(existsSync)
const googleServicesJson = process.env.GOOGLE_SERVICES_JSON
const easProjectId = process.env.EAS_PROJECT_ID

beforeEach(() => {
  exists.mockReturnValue(false)
  delete process.env.GOOGLE_SERVICES_JSON
  delete process.env.EAS_PROJECT_ID
})

afterEach(() => {
  if (googleServicesJson === undefined) delete process.env.GOOGLE_SERVICES_JSON
  else process.env.GOOGLE_SERVICES_JSON = googleServicesJson
  if (easProjectId === undefined) delete process.env.EAS_PROJECT_ID
  else process.env.EAS_PROJECT_ID = easProjectId
})

test('can prebuild without Firebase, environment overrides or supplied icons', () => {
  const result = config()
  expect(result.android?.googleServicesFile).toBeUndefined()
  expect(result.extra).toEqual({ eas: { projectId: '580a4fa9-148e-4503-a37e-1e630a9e249a' } })
  expect(result.icon).toBeUndefined()
  expect(result.android?.adaptiveIcon).toBeUndefined()
  expect(result.plugins).toContainEqual(['expo-notifications', { color: expect.any(String) }])
  expect(result.android?.permissions).toEqual(['POST_NOTIFICATIONS'])
  expect(result.plugins).toContainEqual(['expo-audio', { recordAudioAndroid: true, enableBackgroundPlayback: false }])
  expect(result.android?.blockedPermissions).not.toContain('android.permission.RECORD_AUDIO')
  expect(result.android?.blockedPermissions).toEqual([
    'android.permission.CAMERA',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.BODY_SENSORS',
    'android.permission.ACTIVITY_RECOGNITION',
    'android.permission.READ_MEDIA_IMAGES',
  ])
})

test.each(['icon.png', 'adaptive-icon.png', 'notification-icon.png'])('enables only the supplied %s', (file) => {
  exists.mockImplementation((path) => path === join(__dirname, '../assets', file))
  const result = config()
  expect(result.icon).toBe(file === 'icon.png' ? './assets/icon.png' : undefined)
  expect(result.android?.adaptiveIcon).toEqual(file === 'adaptive-icon.png' ? {
    foregroundImage: './assets/adaptive-icon.png',
    backgroundColor: expect.any(String),
  } : undefined)
  expect(result.plugins).toContainEqual(['expo-notifications', {
    color: expect.any(String),
    ...(file === 'notification-icon.png' && { icon: './assets/notification-icon.png' }),
  }])
})

test('uses the supplied launcher and notification assets with the official petrol background', () => {
  exists.mockImplementation(jest.requireActual<typeof import('node:fs')>('node:fs').existsSync)

  const result = config()
  expect(result.icon).toBe('./assets/icon.png')
  expect(result.android?.adaptiveIcon).toEqual({
    foregroundImage: './assets/adaptive-icon.png',
    backgroundColor: '#0E5A73',
  })
  expect(result.plugins).toContainEqual(['expo-notifications', {
    color: '#0E5A73',
    icon: './assets/notification-icon.png',
  }])
})

test('uses local Firebase configuration when supplied', () => {
  exists.mockImplementation((path) => path === join(__dirname, '../google-services.json'))
  expect(config().android?.googleServicesFile).toBe('./google-services.json')
})

test('uses environment Firebase configuration before the local fallback', () => {
  exists.mockReturnValue(true)
  process.env.GOOGLE_SERVICES_JSON = '/tmp/learnquiz-test-services.json'
  expect(config().android?.googleServicesFile).toBe('/tmp/learnquiz-test-services.json')
})

test('lets the environment override the default EAS project and update URL', () => {
  process.env.EAS_PROJECT_ID = 'test-project-id'
  const result = config()
  expect(result.extra).toEqual({ eas: { projectId: 'test-project-id' } })
  expect(result.updates).toEqual({ url: 'https://u.expo.dev/test-project-id' })
})

test('routes updates to the configured EAS project with a fingerprint runtime', () => {
  process.env.EAS_PROJECT_ID = '580a4fa9-148e-4503-a37e-1e630a9e249a'
  const result = config()
  expect(result.updates).toEqual({ url: 'https://u.expo.dev/580a4fa9-148e-4503-a37e-1e630a9e249a' })
  expect(result.runtimeVersion).toEqual({ policy: 'fingerprint' })
})

test.each([undefined, ''])('defaults the EAS project before environment download (%s)', (projectId) => {
  if (projectId !== undefined) process.env.EAS_PROJECT_ID = projectId
  const result = config()
  expect(result.extra).toEqual({ eas: { projectId: '580a4fa9-148e-4503-a37e-1e630a9e249a' } })
  expect(result.updates).toEqual({ url: 'https://u.expo.dev/580a4fa9-148e-4503-a37e-1e630a9e249a' })
  expect(result.runtimeVersion).toEqual({ policy: 'fingerprint' })
})
