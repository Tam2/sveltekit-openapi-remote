import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Several tests spawn slow subprocesses — the CLI tests run `openapi-typescript`, and the
    // generated-output test runs `tsc`. Run in parallel on a contended CI runner these can exceed
    // the 5s default, so give every test more headroom.
    testTimeout: 30000,
    // Run the type-level assertions (test/types.test-d.ts) as real type checks — not no-op runtime
    // calls — so the GetRequestBody / schema-compatibility contracts are verified in CI alongside
    // the runtime suite. Uses tsconfig.test.json because the build tsconfig excludes test/.
    typecheck: {
      enabled: true,
      tsconfig: './tsconfig.test.json',
    },
  },
});
