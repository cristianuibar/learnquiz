import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'node', include: ['src/**/*.test.ts'] } },
      { test: { name: 'dom', include: ['src/**/*.test.tsx'], environment: 'happy-dom' } },
    ],
  },
})
