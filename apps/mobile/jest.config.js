module.exports = {
  preset: 'jest-expo',
  resolver: require.resolve('react-native-worklets/jest/resolver'),
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  moduleNameMapper: { '^lucide-react-native$': require.resolve('lucide-react-native') },
}
