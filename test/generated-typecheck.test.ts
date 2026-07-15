import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { extractPaths, generateRemoteFiles } from '../src/generator.js';

const LIB_ROOT = path.resolve(import.meta.dirname, '..');
const FIXTURES = path.join(import.meta.dirname, 'fixtures');

/**
 * Compile the generator's OUTPUT against the real handler + type signatures — the gap that let a
 * handler/generator arity mismatch (no-arg `z.void()` commands calling a 2-arg handler) ship in
 * 0.1.9 despite green unit tests. The generator's string output and the runtime handlers were only
 * tested separately; nothing checked that generated code actually type-checks in a consumer.
 */
describe('generated output type-checks against the real handlers', () => {
  function typecheckFixture(fixture: string): { ok: boolean; out: string } {
    const dir = fs.mkdtempSync(path.join(LIB_ROOT, '.gen-tc-'));
    try {
      const dts = fs.readFileSync(path.join(FIXTURES, fixture), 'utf8');
      fs.writeFileSync(path.join(dir, 'api.d.ts'), dts);

      const files = generateRemoteFiles(extractPaths(dts), {
        output: dir, clientImport: './handlers', grouping: 'single', depth: 1,
      });
      for (const [name, content] of files) fs.writeFileSync(path.join(dir, name), content);

      // Handlers wired from the REAL createRemoteHandlers — this is what makes an arity/signature
      // mismatch between the generated calls and the handlers a compile error.
      fs.writeFileSync(path.join(dir, 'handlers.ts'), [
        `import { createRemoteHandlers } from 'sveltekit-openapi-remote';`,
        `export const {`,
        `  handleGetQuery, handlePostCommand, handlePatchCommand, handlePutCommand, handleDeleteCommand,`,
        `  handlePostForm, handlePatchForm, handlePutForm, handleDeleteForm,`,
        `} = createRemoteHandlers({} as never);`,
        ``,
      ].join('\n'));

      // Minimal typed stub for SvelteKit's remote-function factories.
      fs.writeFileSync(path.join(dir, 'app-server.ts'), [
        `export function query<S, R>(_schema: S, fn: (input: any) => R): (arg?: any) => R { return fn; }`,
        `export function command<S, R>(_schema: S, fn: (input: any) => R): (arg?: any) => R { return fn; }`,
        `export function form<S, R>(_schema: S, fn: (input: any) => R): (arg?: any) => R { return fn; }`,
        ``,
      ].join('\n'));

      fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({
        compilerOptions: {
          strict: true,
          module: 'esnext',
          moduleResolution: 'bundler',
          noEmit: true,
          skipLibCheck: true,
          types: [],
          baseUrl: '.',
          paths: {
            '$app/server': ['./app-server.ts'],
            'sveltekit-openapi-remote': ['../src/index.ts'],
          },
        },
        include: ['*.ts'],
      }));

      try {
        execFileSync(path.join(LIB_ROOT, 'node_modules', '.bin', 'tsc'), ['-p', 'tsconfig.json'], {
          cwd: dir, encoding: 'utf8',
        });
        return { ok: true, out: '' };
      } catch (e) {
        const err = e as { stdout?: string; stderr?: string };
        return { ok: false, out: (err.stdout ?? '') + (err.stderr ?? '') };
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  it('compiles every command/query/form shape (edge-cases fixture incl. z.void())', () => {
    const { ok, out } = typecheckFixture('edge-cases.d.ts');
    expect(ok, `Generated output failed to type-check:\n${out}`).toBe(true);
  });

  it('compiles the petstore fixture', () => {
    const { ok, out } = typecheckFixture('petstore.d.ts');
    expect(ok, `Generated output failed to type-check:\n${out}`).toBe(true);
  });
});
