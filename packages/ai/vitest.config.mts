import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The golden corpus is expensive to author and is designed to be read
    // as a table — keep it out of coverage noise.
    coverage: {
      provider: 'v8',
      exclude: ['src/__tests__/**'],
    },
  },
})
