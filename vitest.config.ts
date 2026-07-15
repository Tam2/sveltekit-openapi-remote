import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Run the type-level assertions (test/types.test-d.ts) as real type checks — not no-op runtime
    // calls — so the GetRequestBody / schema-compatibility contracts are verified in CI alongside
    // the runtime suite. Uses tsconfig.test.json because the build tsconfig excludes test/.
    typecheck: {
      enabled: true,
      tsconfig: './tsconfig.test.json',
    },
  },
});
