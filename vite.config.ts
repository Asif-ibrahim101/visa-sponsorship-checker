import { defineConfig } from 'vitest/config';

// The extension itself is built by scripts/build.mjs; this config is for tests.
export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] },
});
