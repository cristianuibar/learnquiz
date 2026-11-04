module.exports = {
  preset: 'jest-expo',
  resolver: require.resolve('react-native-worklets/jest/resolver'),
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  moduleNameMapper: { '^lucide-react-native$': require.resolve('lucide-react-native') },
  // The first test in a renderRouter suite pays the cold route load (several seconds on
  // a loaded CI runner), which can exceed jest's 5 s default. Hanging tests still fail.
  testTimeout: 20000,
}
