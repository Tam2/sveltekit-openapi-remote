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

      // POST /pet/{petId} should use z.object with path + body
      expect(petContent).toContain(
        "z.custom<GetParameters<paths, '/pet/{petId}', 'post'>['path']>()"
      );
      expect(petContent).toContain(
        "z.custom<GetRequestBody<paths, '/pet/{petId}', 'post'>>()"
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
