import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ExpoConfig } from 'expo/config'

export default function config(): ExpoConfig {
  return {
    name: 'Learn Quiz',
    slug: 'learnquiz',
    scheme: 'learnquiz',
    userInterfaceStyle: 'automatic',
    ...(existsSync(join(__dirname, 'assets/icon.png')) && { icon: './assets/icon.png' }),
    android: {
      package: 'com.learnquiz.app',
      permissions: ['POST_NOTIFICATIONS'],
      blockedPermissions: [
        'android.permission.CAMERA',
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.BODY_SENSORS',
        'android.permission.ACTIVITY_RECOGNITION',
        'android.permission.READ_MEDIA_IMAGES',
      ],
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON || (
        existsSync(join(__dirname, 'google-services.json')) ? './google-services.json' : undefined
      ),
      ...(existsSync(join(__dirname, 'assets/adaptive-icon.png')) && {
        adaptiveIcon: {
          foregroundImage: './assets/adaptive-icon.png',
          backgroundColor: '#0E5A73',
        },
      }),
    },
    plugins: [
      'expo-router',
      ['expo-notifications', {
        color: '#0E5A73',
        ...(existsSync(join(__dirname, 'assets/notification-icon.png')) && {
          icon: './assets/notification-icon.png',
        }),
      }],
      'expo-secure-store',
      'expo-splash-screen',
      'expo-sqlite',
      // The microphone, only while a learner records a voice answer; no background audio service.
      ['expo-audio', { recordAudioAndroid: true, enableBackgroundPlayback: false }],
    ],
    ...(process.env.EAS_PROJECT_ID && { extra: { eas: { projectId: process.env.EAS_PROJECT_ID } } }),
  }
}
