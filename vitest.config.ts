import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['backend/**/__tests__/**/*.ts', 'backend/**/?(*.)+(spec|test).ts'],
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
    },
  },
});