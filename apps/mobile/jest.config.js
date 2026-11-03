module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  moduleNameMapper: { '^lucide-react-native$': require.resolve('lucide-react-native') },
}
