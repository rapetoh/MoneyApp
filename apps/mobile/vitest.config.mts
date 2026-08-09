import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Scoped to plain-TS logic (services, stores, sync) that is written to
    // run off-device — see src/services/sync/localDb.ts's SchemaDb seam.
    // Component tests need RN/jsdom mocking that Stage 2 will set up
    // separately; keep this config node-only so it stays cheap and honest
    // about what it covers.
    include: ['src/**/*.test.ts'],
  },
})
