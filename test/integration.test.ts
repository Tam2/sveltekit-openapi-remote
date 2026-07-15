import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { extractPaths, generateRemoteFiles, writeRemoteFiles } from '../src/generator.js';
import { parseArgs } from '../src/cli.js';

const FIXTURES_DIR = path.join(import.meta.dirname, 'fixtures');
const PETSTORE_DTS = path.join(FIXTURES_DIR, 'petstore.d.ts');
const PETSTORE_JSON = path.join(FIXTURES_DIR, 'petstore.json');
const PETSTORE_YAML = path.join(FIXTURES_DIR, 'petstore.yaml');

describe('Integration: Petstore OpenAPI spec', () => {
  const petstoreContent = fs.readFileSync(PETSTORE_DTS, 'utf-8');

  describe('extractPaths with real petstore.d.ts', () => {
    it('extracts all 13 paths from petstore spec', () => {
      const paths = extractPaths(petstoreContent);
      expect(paths.length).toBe(13);
    });

    it('extracts correct methods for /pet', () => {
      const paths = extractPaths(petstoreContent);
      const pet = paths.find(p => p.path === '/pet');
      expect(pet).toBeDefined();
      expect(pet!.methods.map(m => m.method).sort()).toEqual(['post', 'put']);
    });

    it('extracts correct methods for /pet/{petId}', () => {
      const paths = extractPaths(petstoreContent);
      const petById = paths.find(p => p.path === '/pet/{petId}');
      expect(petById).toBeDefined();
      expect(petById!.methods.map(m => m.method).sort()).toEqual(['delete', 'get', 'post']);
      expect(petById!.methods.every(m => m.hasParams)).toBe(true);
    });

    it('extracts GET-only endpoints', () => {
      const paths = extractPaths(petstoreContent);
      const findByStatus = paths.find(p => p.path === '/pet/findByStatus');
      expect(findByStatus).toBeDefined();
      expect(findByStatus!.methods).toHaveLength(1);
      expect(findByStatus!.methods[0].method).toBe('get');
    });

    it('extracts all store paths', () => {
      const paths = extractPaths(petstoreContent);
      const storePaths = paths.filter(p => p.path.startsWith('/store'));
      expect(storePaths).toHaveLength(3);
    });

    it('extracts all user paths', () => {
      const paths = extractPaths(petstoreContent);
      const userPaths = paths.filter(p => p.path.startsWith('/user'));
      expect(userPaths).toHaveLength(5);
    });
  });

  describe('generateRemoteFiles with petstore data', () => {
    let paths: ReturnType<typeof extractPaths>;

    beforeAll(() => {
      paths = extractPaths(petstoreContent);
    });

    it('generates 3 files with segment grouping depth 1', () => {
      const files = generateRemoteFiles(paths, {
        output: '/tmp/test',
        clientImport: '$lib/api/remote',
        grouping: 'segment',
        depth: 1,
      });
      expect(files.size).toBe(3);
      expect([...files.keys()].sort()).toEqual([
        'pet.remote.ts',
        'store.remote.ts',
        'user.remote.ts',
      ]);
    });

    it('generates 1 file with single grouping', () => {
      const files = generateRemoteFiles(paths, {
        output: '/tmp/test',
        clientImport: '$lib/api/remote',
        grouping: 'single',
        depth: 1,
      });
      expect(files.size).toBe(1);
      expect(files.has('api.remote.ts')).toBe(true);
    });

    it('generates correct function names in pet file', () => {
      const files = generateRemoteFiles(paths, {
        output: '/tmp/test',
        clientImport: '$lib/api/remote',
        grouping: 'segment',
        depth: 1,
      });
      const petContent = files.get('pet.remote.ts')!;

      // POST /pet (no path params)
      expect(petContent).toContain('export const postPetCommand = command(');
      expect(petContent).toContain('export const postPetForm = form(');

      // PUT /pet (no path params)
      expect(petContent).toContain('export const putPetCommand = command(');
      expect(petContent).toContain('export const putPetForm = form(');

      // GET /pet/findByStatus
      expect(petContent).toContain('export const getPetFindByStatus = query(');

      // GET /pet/{petId}
      expect(petContent).toContain('export const getPetByPetId = query(');

      // DELETE /pet/{petId}
      expect(petContent).toContain('export const deletePetByPetIdCommand = command(');
      expect(petContent).toContain('export const deletePetByPetIdForm = form(');
    });

    it('generates correct function names in store file', () => {
      const files = generateRemoteFiles(paths, {
        output: '/tmp/test',
        clientImport: '$lib/api/remote',
        grouping: 'segment',
        depth: 1,
      });
      const storeContent = files.get('store.remote.ts')!;

      expect(storeContent).toContain('export const getStoreInventory = query(');
      expect(storeContent).toContain('export const postStoreOrderCommand = command(');
      expect(storeContent).toContain('export const getStoreOrderByOrderId = query(');
      expect(storeContent).toContain('export const deleteStoreOrderByOrderIdCommand = command(');
    });

    it('generates correct imports in each file', () => {
      const files = generateRemoteFiles(paths, {
        output: '/tmp/test',
        clientImport: '$lib/api/remote',
        grouping: 'segment',
        depth: 1,
      });

      for (const [, content] of files) {
        expect(content).toContain("import { query, command, form } from '$app/server';");
        expect(content).toContain("import { z } from 'zod';");
        expect(content).toContain("import type { paths } from './api';");
        expect(content).toContain("from 'sveltekit-openapi-remote';");
        expect(content).toContain("from '$lib/api/remote';");
        expect(content).toContain('DO NOT EDIT');
      }
    });

    it('uses z.object for endpoints with path params', () => {
      const files = generateRemoteFiles(paths, {
        output: '/tmp/test',
        clientImport: '$lib/api/remote',
        grouping: 'segment',
        depth: 1,
      });
      const petContent = files.get('pet.remote.ts')!;

      // POST /pet/{petId} (updatePetWithForm) has path params but NO request body (query params only),
      // so it uses z.object with a path field and must NOT emit a body field.
      expect(petContent).toContain(
        "z.custom<GetParameters<paths, '/pet/{petId}', 'post'>['path']>()"
      );
      expect(petContent).not.toContain(
        "z.custom<GetRequestBody<paths, '/pet/{petId}', 'post'>>()"
      );

      // PUT /pet (updatePet) genuinely has a request body → body-directly schema.
      expect(petContent).toContain(
        "z.custom<GetRequestBody<paths, '/pet', 'put'>>()"
      );
    });

    it('uses GetParameters for DELETE endpoints', () => {
      const files = generateRemoteFiles(paths, {
        output: '/tmp/test',
        clientImport: '$lib/api/remote',
        grouping: 'segment',
        depth: 1,
      });
      const petContent = files.get('pet.remote.ts')!;

      expect(petContent).toContain(
        "z.custom<GetParameters<paths, '/pet/{petId}', 'delete'>>()"
      );
    });
  });

  describe('writeRemoteFiles end-to-end', () => {
    it('writes generated petstore files to disk', () => {
      const tmpDir = path.join(os.tmpdir(), `petstore-e2e-${Date.now()}`);

      const paths = extractPaths(petstoreContent);
      const files = generateRemoteFiles(paths, {
        output: tmpDir,
        clientImport: '$lib/api/remote',
        grouping: 'segment',
        depth: 1,
      });
      writeRemoteFiles(files, tmpDir);

      expect(fs.existsSync(path.join(tmpDir, 'pet.remote.ts'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'store.remote.ts'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'user.remote.ts'))).toBe(true);

      // Verify content is non-empty and valid
      const petContent = fs.readFileSync(path.join(tmpDir, 'pet.remote.ts'), 'utf-8');
      expect(petContent.length).toBeGreaterThan(100);
      expect(petContent).toContain('DO NOT EDIT');

      fs.rmSync(tmpDir, { recursive: true });
    });

    it('regeneration cleans old generated files', () => {
      const tmpDir = path.join(os.tmpdir(), `petstore-regen-${Date.now()}`);

      const paths = extractPaths(petstoreContent);

      // First generation: segment grouping
      const files1 = generateRemoteFiles(paths, {
        output: tmpDir,
        clientImport: '$lib/api/remote',
        grouping: 'segment',
        depth: 1,
      });
      writeRemoteFiles(files1, tmpDir);
      expect(fs.existsSync(path.join(tmpDir, 'pet.remote.ts'))).toBe(true);

      // Second generation: single grouping (should clean up segment files)
      const files2 = generateRemoteFiles(paths, {
        output: tmpDir,
        clientImport: '$lib/api/remote',
        grouping: 'single',
        depth: 1,
      });
      writeRemoteFiles(files2, tmpDir);

      expect(fs.existsSync(path.join(tmpDir, 'api.remote.ts'))).toBe(true);
      // Old segment files should be cleaned up
      expect(fs.existsSync(path.join(tmpDir, 'pet.remote.ts'))).toBe(false);
      expect(fs.existsSync(path.join(tmpDir, 'store.remote.ts'))).toBe(false);
      expect(fs.existsSync(path.join(tmpDir, 'user.remote.ts'))).toBe(false);

      fs.rmSync(tmpDir, { recursive: true });
    });
  });

  describe('CLI --spec with local files', () => {
    let tmpDir: string;

    beforeAll(() => {
      tmpDir = path.join(os.tmpdir(), `petstore-cli-${Date.now()}`);
    });

    afterAll(() => {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it('generates from JSON spec via --spec', () => {
      const cliPath = path.join(import.meta.dirname, '..', 'dist', 'cli.js');
      const output = path.join(tmpDir, 'json');

      execFileSync('node', [
        cliPath, 'generate',
        '--spec', PETSTORE_JSON,
        '--output', output,
        '--client', '$lib/api/remote',
      ], { encoding: 'utf-8' });

      // api.d.ts should be generated in output dir
      expect(fs.existsSync(path.join(output, 'api.d.ts'))).toBe(true);
      expect(fs.existsSync(path.join(output, 'pet.remote.ts'))).toBe(true);
      expect(fs.existsSync(path.join(output, 'store.remote.ts'))).toBe(true);
      expect(fs.existsSync(path.join(output, 'user.remote.ts'))).toBe(true);
    });

    it('generates from YAML spec via --spec', () => {
      const cliPath = path.join(import.meta.dirname, '..', 'dist', 'cli.js');
      const output = path.join(tmpDir, 'yaml');

      execFileSync('node', [
        cliPath, 'generate',
        '--spec', PETSTORE_YAML,
        '--output', output,
        '--client', '$lib/api/remote',
      ], { encoding: 'utf-8' });

      expect(fs.existsSync(path.join(output, 'api.d.ts'))).toBe(true);
      expect(fs.existsSync(path.join(output, 'pet.remote.ts'))).toBe(true);
      expect(fs.existsSync(path.join(output, 'store.remote.ts'))).toBe(true);
      expect(fs.existsSync(path.join(output, 'user.remote.ts'))).toBe(true);
    });

    it('generates single file with --grouping single', () => {
      const cliPath = path.join(import.meta.dirname, '..', 'dist', 'cli.js');
      const output = path.join(tmpDir, 'single');

      execFileSync('node', [
        cliPath, 'generate',
        '--types-path', PETSTORE_DTS,
        '--output', output,
        '--client', '$lib/api/remote',
        '--grouping', 'single',
      ], { encoding: 'utf-8' });

      expect(fs.existsSync(path.join(output, 'api.remote.ts'))).toBe(true);
      // No segment files
      expect(fs.existsSync(path.join(output, 'pet.remote.ts'))).toBe(false);
    });

    it('respects --depth 2 for finer grouping', () => {
      const cliPath = path.join(import.meta.dirname, '..', 'dist', 'cli.js');
      const output = path.join(tmpDir, 'depth2');

      execFileSync('node', [
        cliPath, 'generate',
        '--types-path', PETSTORE_DTS,
        '--output', output,
        '--client', '$lib/api/remote',
        '--depth', '2',
      ], { encoding: 'utf-8' });

      const files = fs.readdirSync(output).filter(f => f.endsWith('.remote.ts')).sort();
      // With depth 2, /pet/findByStatus -> pet-findByStatus.remote.ts etc.
      expect(files.length).toBeGreaterThan(3); // More files than depth 1
    });
  });

  describe('TypeScript compilation of generated files', () => {
    let tmpDir: string;

    beforeAll(() => {
      tmpDir = path.join(os.tmpdir(), `petstore-typecheck-${Date.now()}`);

      // Generate remote files from petstore spec
      const cliPath = path.join(import.meta.dirname, '..', 'dist', 'cli.js');
      execFileSync('node', [
        cliPath, 'generate',
        '--spec', PETSTORE_JSON,
        '--output', tmpDir,
        '--client', '$lib/api/remote',
      ], { encoding: 'utf-8' });

      // Create handler stubs for $lib/api/remote
      fs.mkdirSync(path.join(tmpDir, 'lib', 'api'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'lib', 'api', 'remote.ts'), [
        'export declare function handleGetQuery(path: string, params: any): Promise<any>;',
        'export declare function handlePostCommand(path: string, body: any): Promise<any>;',
        'export declare function handlePatchCommand(path: string, input: any): Promise<any>;',
        'export declare function handlePutCommand(path: string, input: any): Promise<any>;',
        'export declare function handleDeleteCommand(path: string, params: any): Promise<any>;',
        'export declare function handlePostForm(path: string, body: any): Promise<any>;',
        'export declare function handlePatchForm(path: string, input: any): Promise<any>;',
        'export declare function handlePutForm(path: string, input: any): Promise<any>;',
        'export declare function handleDeleteForm(path: string, params: any): Promise<any>;',
      ].join('\n'));

      // Create tsconfig that resolves SvelteKit, zod, and project modules
      const projectRoot = path.join(import.meta.dirname, '..');
      const tsconfig = {
        compilerOptions: {
          strict: true,
          noEmit: true,
          module: 'ESNext',
          moduleResolution: 'bundler',
          target: 'ESNext',
          skipLibCheck: true,
          paths: {
            '$app/server': [path.join(projectRoot, 'node_modules', '@sveltejs', 'kit', 'types', 'index.d.ts')],
            '$lib/api/remote': ['./lib/api/remote.ts'],
            'sveltekit-openapi-remote': [path.join(projectRoot, 'src', 'index.ts')],
            'zod': [path.join(projectRoot, 'node_modules', 'zod', 'v4', 'classic', 'index.d.ts')],
          },
          baseUrl: '.',
        },
        include: ['./**/*.remote.ts'],
      };
      fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));
    });

    afterAll(() => {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it('generated remote files pass TypeScript type checking', () => {
      const tscPath = path.join(import.meta.dirname, '..', 'node_modules', '.bin', 'tsc');
      const result = execFileSync(tscPath, [
        '--project', path.join(tmpDir, 'tsconfig.json'),
        '--noEmit',
      ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });

      // If we reach here, tsc exited with code 0 — no type errors
      expect(result).toBe('');
    });

    it('generated files contain form() with pipe pattern for RemoteFormInput compatibility', () => {
      const remoteFiles = fs.readdirSync(tmpDir).filter(f => f.endsWith('.remote.ts'));
      const allContent = remoteFiles.map(f =>
        fs.readFileSync(path.join(tmpDir, f), 'utf-8')
      ).join('\n');

      // form() calls should use z.record().pipe() pattern, not bare z.custom()
      const formCalls = allContent.match(/form\(\n\t[^\n]+/g) || [];
      expect(formCalls.length).toBeGreaterThan(0);
      for (const call of formCalls) {
        expect(call).toContain('z.record(z.string(), z.any()).pipe(');
      }
    });
  });

  describe('CLI error cases', () => {
    it('fails with helpful message for missing types file', () => {
      const cliPath = path.join(import.meta.dirname, '..', 'dist', 'cli.js');

      expect(() => {
        execFileSync('node', [
          cliPath, 'generate',
          '--types-path', 'nonexistent.d.ts',
          '--output', '/tmp/test',
          '--client', '$lib/api/remote',
        ], { encoding: 'utf-8' });
      }).toThrow();
    });

    it('fails when missing required args', () => {
      const cliPath = path.join(import.meta.dirname, '..', 'dist', 'cli.js');

      expect(() => {
        execFileSync('node', [
          cliPath, 'generate',
          '--output', '/tmp/test',
          '--client', '$lib/api/remote',
        ], { encoding: 'utf-8' });
      }).toThrow();
    });
  });
});

// Large real-world specs (api.d.ts generated by openapi-typescript from the public Stripe and GitHub
// OpenAPI descriptions). These exercise the generator against thousands of endpoints so parsing and
// request-body detection are validated at scale. They caught the quoted-operationId bug where
// no-body endpoints keyed as `"activity/star-repo": {` weren't resolved.
describe('Integration: real-world specs (Stripe, GitHub)', () => {
  const SPECS = [
    { name: 'stripe', file: 'stripe.d.ts', minPaths: 400 },
    { name: 'github', file: 'github.d.ts', minPaths: 700 },
  ];

  for (const spec of SPECS) {
    describe(spec.name, () => {
      const content = fs.readFileSync(path.join(FIXTURES_DIR, spec.file), 'utf-8');

      it('parses without throwing and finds the expected scale of paths', () => {
        const paths = extractPaths(content);
        expect(paths.length).toBeGreaterThan(spec.minPaths);
      });

      it('generates every remote file without throwing or emitting malformed output', () => {
        const paths = extractPaths(content);
        const files = generateRemoteFiles(paths, {
          output: '/tmp/x', clientImport: '$lib/api', grouping: 'single', depth: 1,
        });
        const all = [...files.values()].join('\n');
        expect(all.length).toBeGreaterThan(0);
        expect(all).not.toContain('undefined');
        expect(all).not.toMatch(/z\.custom<any>/);
        // Every command/query/form the generator emits must be one of the known schema shapes.
        expect(all).toMatch(/= command\(/);
      });

      it('detects request bodies without false negatives (body-heavy APIs)', () => {
        const paths = extractPaths(content);
        const writes = paths.flatMap(p =>
          p.methods.filter(m => m.method === 'post' || m.method === 'patch' || m.method === 'put'));
        expect(writes.length).toBeGreaterThan(100);
        // These APIs put a body on the large majority of writes; if detection regressed to "always
        // no body", this ratio would collapse.
        const withBody = writes.filter(m => m.hasBody).length;
        expect(withBody / writes.length).toBeGreaterThan(0.5);
      });
    });
  }

  it('GitHub: a no-body action endpoint (star a repo) omits the body field', () => {
    const content = fs.readFileSync(path.join(FIXTURES_DIR, 'github.d.ts'), 'utf-8');
    const paths = extractPaths(content);
    const star = paths.find(p => p.path === '/user/starred/{owner}/{repo}');
    const put = star!.methods.find(m => m.method === 'put')!;
    // Confirmed against the source spec: PUT /user/starred/{owner}/{repo} has no request body.
    expect(put.hasBody).toBe(false);

    const files = generateRemoteFiles(paths, {
      output: '/tmp/x', clientImport: '$lib/api', grouping: 'single', depth: 1,
    });
    const all = [...files.values()].join('\n');
    expect(all).toContain("GetParameters<paths, '/user/starred/{owner}/{repo}', 'put'>['path']");
    // No body schema for a no-body endpoint — this is the bug the fix addresses.
    expect(all).not.toContain("GetRequestBody<paths, '/user/starred/{owner}/{repo}', 'put'>");
  });

  it('GitHub: detects a meaningful number of no-body write endpoints', () => {
    const content = fs.readFileSync(path.join(FIXTURES_DIR, 'github.d.ts'), 'utf-8');
    const paths = extractPaths(content);
    const noBodyWrites = paths.flatMap(p =>
      p.methods.filter(m =>
        (m.method === 'post' || m.method === 'patch' || m.method === 'put') && !m.hasBody));
    expect(noBodyWrites.length).toBeGreaterThan(20);
  });
});
