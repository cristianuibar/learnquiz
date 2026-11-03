import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts: the Cloudflare plugin cannot start under vitest, and the pure tests need no plugins.
export default defineConfig({ resolve: { tsconfigPaths: true } })
