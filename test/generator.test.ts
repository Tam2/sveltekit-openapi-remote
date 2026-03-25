import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { extractPaths, pathToFunctionName, pathToFilename, generateFileContent, generateRemoteFiles, writeRemoteFiles, type PathInfo } from '../src/generator.js';

const MOCK_API_DTS = `
export interface paths {
    "/users": {
        get: operations["getUsers"];
        post: operations["createUser"];
    };
    "/users/{id}": {
        get: operations["getUser"];
        patch: operations["updateUser"];
        delete: operations["deleteUser"];
    };
    "/posts": {
        get: operations["getPosts"];
    };
    "/posts/{id}/comments": {
        get: operations["getComments"];
        post: operations["createComment"];
    };
}
`;

describe('extractPaths', () => {
  it('extracts all paths with their methods', () => {
    const paths = extractPaths(MOCK_API_DTS);
    expect(paths).toHaveLength(4);
    const userPath = paths.find(p => p.path === '/users');
    expect(userPath).toBeDefined();
    expect(userPath!.methods.map(m => m.method)).toEqual(['get', 'post']);
  });

  it('detects path parameters', () => {
    const paths = extractPaths(MOCK_API_DTS);
    const userById = paths.find(p => p.path === '/users/{id}');
    expect(userById!.methods[0].hasParams).toBe(true);
  });

  it('throws when paths interface not found', () => {
    expect(() => extractPaths('export interface foo {}')).toThrow('Could not find paths interface');
  });

  it('extracts paths with inline type definitions (not operations[])', () => {
    const inlineDts = `
export interface paths {
    "/health": {
        get: {
            parameters: {};
            responses: {
                200: { content: { "application/json": { status: string } } };
            };
        };
    };
}
`;
    const paths = extractPaths(inlineDts);
    expect(paths).toHaveLength(1);
    expect(paths[0].path).toBe('/health');
    expect(paths[0].methods[0].method).toBe('get');
  });
});

describe('pathToFunctionName', () => {
  it('converts simple path with GET', () => {
    expect(pathToFunctionName('/users', 'get')).toBe('getUsers');
  });
  it('converts path with params', () => {
    expect(pathToFunctionName('/users/{id}', 'get')).toBe('getUsersById');
  });
  it('adds Command suffix', () => {
    expect(pathToFunctionName('/users', 'post', 'Command')).toBe('postUsersCommand');
  });
  it('adds Form suffix', () => {
    expect(pathToFunctionName('/users', 'post', 'Form')).toBe('postUsersForm');
  });
  it('converts kebab-case to camelCase', () => {
    expect(pathToFunctionName('/user-profiles', 'get')).toBe('getUserProfiles');
  });
  it('handles deep nested paths', () => {
    expect(pathToFunctionName('/users/{id}/posts/{postId}/comments', 'get'))
      .toBe('getUsersByIdPostsByPostIdComments');
  });
  it('preserves camelCase in path segments', () => {
    expect(pathToFunctionName('/pet/findByStatus', 'get')).toBe('getPetFindByStatus');
    expect(pathToFunctionName('/pet/findByTags', 'get')).toBe('getPetFindByTags');
    expect(pathToFunctionName('/user/createWithList', 'post', 'Command')).toBe('postUserCreateWithListCommand');
  });
});

describe('pathToFilename', () => {
  it('groups by first segment at depth 1', () => {
    expect(pathToFilename('/users', 1)).toBe('users.remote.ts');
    expect(pathToFilename('/users/{id}', 1)).toBe('users.remote.ts');
  });
  it('groups by two segments at depth 2', () => {
    expect(pathToFilename('/posts/{id}/comments', 2)).toBe('posts-comments.remote.ts');
  });
  it('handles kebab-case segments', () => {
    expect(pathToFilename('/user-profiles', 1)).toBe('user-profiles.remote.ts');
  });
  it('skips path parameter segments for grouping', () => {
    expect(pathToFilename('/users/{id}/posts', 2)).toBe('users-posts.remote.ts');
  });
  it('falls back to root.remote.ts when all segments are parameters', () => {
    expect(pathToFilename('/{tenantId}/{resourceId}', 1)).toBe('root.remote.ts');
  });
});

describe('generateFileContent', () => {
  it('generates correct imports', () => {
    const paths: PathInfo[] = [{
      path: '/users',
      methods: [{ method: 'get', hasParams: false, hasBody: false, hasQuery: true }],
    }];
    const content = generateFileContent(paths, '$lib/api/remote');
    expect(content).toContain("import { query, command, form } from '$app/server';");
    expect(content).toContain("import { z } from 'zod';");
    expect(content).toContain("import type { paths } from './api';");
    expect(content).toContain("from 'sveltekit-openapi-remote';");
    expect(content).toContain("from '$lib/api/remote';");
  });

  it('generates GET query function', () => {
    const paths: PathInfo[] = [{
      path: '/users',
      methods: [{ method: 'get', hasParams: false, hasBody: false, hasQuery: true }],
    }];
    const content = generateFileContent(paths, '$lib/api/remote');
    expect(content).toContain('export const getUsers = query(');
    expect(content).toContain("z.custom<GetParameters<paths, '/users', 'get'>>()");
    expect(content).toContain("handleGetQuery('/users', params)");
  });

  it('generates POST command and form without path params', () => {
    const paths: PathInfo[] = [{
      path: '/users',
      methods: [{ method: 'post', hasParams: false, hasBody: true, hasQuery: false }],
    }];
    const content = generateFileContent(paths, '$lib/api/remote');
    expect(content).toContain('export const postUsersCommand = command(');
    expect(content).toContain('export const postUsersForm = form(');
    expect(content).toContain("z.custom<GetRequestBody<paths, '/users', 'post'>>()");
  });

  it('generates PATCH with path params using z.object', () => {
    const paths: PathInfo[] = [{
      path: '/users/{id}',
      methods: [{ method: 'patch', hasParams: true, hasBody: true, hasQuery: false }],
    }];
    const content = generateFileContent(paths, '$lib/api/remote');
    expect(content).toContain('z.object({');
    expect(content).toContain("z.custom<GetParameters<paths, '/users/{id}', 'patch'>['path']>()");
    expect(content).toContain("z.custom<GetRequestBody<paths, '/users/{id}', 'patch'>>()");
  });

  it('generates DELETE command and form', () => {
    const paths: PathInfo[] = [{
      path: '/users/{id}',
      methods: [{ method: 'delete', hasParams: true, hasBody: false, hasQuery: false }],
    }];
    const content = generateFileContent(paths, '$lib/api/remote');
    expect(content).toContain('export const deleteUsersByIdCommand = command(');
    expect(content).toContain('export const deleteUsersByIdForm = form(');
  });

  it('includes DO NOT EDIT header', () => {
    const paths: PathInfo[] = [{
      path: '/users',
      methods: [{ method: 'get', hasParams: false, hasBody: false, hasQuery: true }],
    }];
    const content = generateFileContent(paths, '$lib/api/remote');
    expect(content).toContain('DO NOT EDIT');
  });
});

describe('generateRemoteFiles', () => {
  it('detects function name collisions and throws', () => {
    const paths: PathInfo[] = [
      { path: '/users', methods: [{ method: 'get', hasParams: false, hasBody: false, hasQuery: true }] },
      { path: '/users', methods: [{ method: 'get', hasParams: false, hasBody: false, hasQuery: true }] },
    ];
    expect(() => generateRemoteFiles(paths, {
      output: '/tmp/test',
      clientImport: '$lib/api/remote',
      grouping: 'segment',
      depth: 1,
    })).toThrow();
  });

  it('produces single api.remote.ts file with --grouping single', () => {
    const paths: PathInfo[] = [
      { path: '/users', methods: [{ method: 'get', hasParams: false, hasBody: false, hasQuery: true }] },
      { path: '/posts', methods: [{ method: 'get', hasParams: false, hasBody: false, hasQuery: true }] },
    ];
    const files = generateRemoteFiles(paths, {
      output: '/tmp/test',
      clientImport: '$lib/api/remote',
      grouping: 'single',
      depth: 1,
    });
    expect(files.size).toBe(1);
    expect(files.has('api.remote.ts')).toBe(true);
    const content = files.get('api.remote.ts')!;
    expect(content).toContain('getUsers');
    expect(content).toContain('getPosts');
  });

  it('groups into separate files with --grouping segment', () => {
    const paths: PathInfo[] = [
      { path: '/users', methods: [{ method: 'get', hasParams: false, hasBody: false, hasQuery: true }] },
      { path: '/posts', methods: [{ method: 'get', hasParams: false, hasBody: false, hasQuery: true }] },
    ];
    const files = generateRemoteFiles(paths, {
      output: '/tmp/test',
      clientImport: '$lib/api/remote',
      grouping: 'segment',
      depth: 1,
    });
    expect(files.size).toBe(2);
    expect(files.has('users.remote.ts')).toBe(true);
    expect(files.has('posts.remote.ts')).toBe(true);
  });
});

describe('writeRemoteFiles', () => {
  it('preserves hand-written .remote.ts files without DO NOT EDIT header', () => {
    const tmpDir = path.join(os.tmpdir(), `test-cleanup-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'custom.remote.ts'), 'export const custom = true;\n');
    fs.writeFileSync(path.join(tmpDir, 'old.remote.ts'), '// DO NOT EDIT\nexport const old = true;\n');

    const newFiles = new Map([['users.remote.ts', '// DO NOT EDIT\nexport const users = true;\n']]);
    writeRemoteFiles(newFiles, tmpDir);

    expect(fs.existsSync(path.join(tmpDir, 'custom.remote.ts'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'old.remote.ts'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'users.remote.ts'))).toBe(true);

    fs.rmSync(tmpDir, { recursive: true });
  });
});
