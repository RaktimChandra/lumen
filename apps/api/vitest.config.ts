import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./test/global-setup.ts'],
    include: ['test/**/*.test.ts'],
    // Files share one database; run them one at a time for deterministic counts.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/scripts/**', 'src/db/migrate.ts'],
      reporter: ['text-summary', 'html', 'lcov'],
    },
  },
});
