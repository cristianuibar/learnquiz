const preset = require('jest-expo/jest-preset')

module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  transform: { '\\.mjs$': preset.transform['\\.[jt]sx?$'] },
  transformIgnorePatterns: preset.transformIgnorePatterns.map((pattern) => pattern.replace('(.pnpm|', '(.pnpm|lucide-react-native|')),
}
