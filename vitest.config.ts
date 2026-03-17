import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/mcp/server.ts', 'src/watcher/daemon.ts'],
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
});
