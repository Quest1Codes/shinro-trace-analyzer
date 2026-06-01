import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['backend/**/__tests__/**/*.ts', 'backend/**/?(*.)+(spec|test).ts'],
    // CRITICAL: Automatically restore mocks after each test to prevent mock leakage
    restoreMocks: true,
    // HIGH: Clear mocks between tests to prevent call count contamination
    clearMocks: true,
    // MEDIUM: Reset modules to ensure proper isolation between tests
    resetModules: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'backend/**/router.ts',
        'backend/index.ts',
        'backend/**/*.test.ts',
        'backend/**/__tests__/**',
      ],
      // HIGH: Set coverage thresholds to maintain code quality
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
    // HIGH: Use threads for parallel test execution (better performance)
    threads: true,
    // MEDIUM: Set max concurrency for resource management
    maxConcurrency: 4,
    // MEDIUM: Add bail for fast failure in CI environments
    bail: 1,
  },
});