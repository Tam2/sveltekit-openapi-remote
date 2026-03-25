import { describe, it, expectTypeOf } from 'vitest';
import { z } from 'zod';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { RemoteFormInput } from '@sveltejs/kit';
import type { PathsWithMethod, GetParameters, GetRequestBody, GetResponse } from '../src/types.js';

interface MockPaths {
  '/users': {
    get: {
      parameters: {
        query?: { limit?: number };
      };
      responses: {
        200: { content: { 'application/json': { id: number; name: string }[] } };
      };
    };
    post: {
      requestBody: { content: { 'application/json': { name: string; email: string } } };
      responses: {
        201: { content: { 'application/json': { id: number; name: string } } };
      };
    };
  };
  '/users/{id}': {
    get: {
      parameters: {
        path: { id: number };
      };
      responses: {
        200: { content: { 'application/json': { id: number; name: string } } };
      };
    };
    patch: {
      parameters: {
        path: { id: number };
      };
      requestBody: { content: { 'application/json': { name?: string; email?: string } } };
      responses: {
        200: { content: { 'application/json': { id: number; name: string } } };
      };
    };
    put: {
      parameters: {
        path: { id: number };
      };
      requestBody: { content: { 'application/json': { name: string; email: string } } };
      responses: {
        200: { content: { 'application/json': { id: number; name: string } } };
      };
    };
    delete: {
      parameters: {
        path: { id: number };
      };
      responses: {
        200: { content: { 'application/json': { success: boolean } } };
      };
    };
  };
  '/posts': {
    get: {
      parameters: {
        query?: { page?: number };
      };
      responses: {
        200: { content: { 'application/json': { id: number; title: string }[] } };
      };
    };
  };
}

describe('PathsWithMethod', () => {
  it('filters paths that support GET', () => {
    type Result = PathsWithMethod<MockPaths, 'get'>;
    expectTypeOf<Result>().toEqualTypeOf<'/users' | '/users/{id}' | '/posts'>();
  });

  it('filters paths that support POST', () => {
    type Result = PathsWithMethod<MockPaths, 'post'>;
    expectTypeOf<Result>().toEqualTypeOf<'/users'>();
  });

  it('filters paths that support DELETE', () => {
    type Result = PathsWithMethod<MockPaths, 'delete'>;
    expectTypeOf<Result>().toEqualTypeOf<'/users/{id}'>();
  });
});

describe('GetParameters', () => {
  it('extracts query parameters', () => {
    type Result = GetParameters<MockPaths, '/users', 'get'>;
    expectTypeOf<Result>().toEqualTypeOf<{ query?: { limit?: number } }>();
  });

  it('extracts path parameters', () => {
    type Result = GetParameters<MockPaths, '/users/{id}', 'get'>;
    expectTypeOf<Result>().toEqualTypeOf<{ path: { id: number } }>();
  });
});

describe('GetRequestBody', () => {
  it('extracts JSON request body', () => {
    type Result = GetRequestBody<MockPaths, '/users', 'post'>;
    expectTypeOf<Result>().toEqualTypeOf<{ name: string; email: string }>();
  });
});

describe('GetResponse', () => {
  it('extracts 200 response', () => {
    type Result = GetResponse<MockPaths, '/users', 'get'>;
    expectTypeOf<Result>().toEqualTypeOf<{ id: number; name: string }[]>();
  });

  it('extracts 201 response', () => {
    type Result = GetResponse<MockPaths, '/users', 'post'>;
    expectTypeOf<Result>().toEqualTypeOf<{ id: number; name: string }>();
  });
});

// Type alias matching what form() requires: StandardSchemaV1<RemoteFormInput, Record<string, any>>
type FormSchema = StandardSchemaV1<RemoteFormInput, Record<string, any>>;
// Type alias matching what query()/command() require: StandardSchemaV1 (unconstrained)
type CommandSchema = StandardSchemaV1;

// Helper used in generated form() schemas: z.record(z.string(), z.any()) provides
// a RemoteFormInput-compatible input type, piped to z.custom<T>() for typed output.
const formInput = () => z.record(z.string(), z.any());

describe('SvelteKit form() schema compatibility', () => {
  // DELETE: params-only — pipe from record to typed custom
  it('DELETE form schema: pipe to GetParameters', () => {
    const schema = formInput().pipe(z.custom<GetParameters<MockPaths, '/users/{id}', 'delete'>>());
    expectTypeOf(schema).toMatchTypeOf<FormSchema>();
  });

  // POST body-only (no path params) — pipe from record to typed custom
  it('POST body-only form schema: pipe to GetRequestBody', () => {
    const schema = formInput().pipe(z.custom<GetRequestBody<MockPaths, '/users', 'post'>>());
    expectTypeOf(schema).toMatchTypeOf<FormSchema>();
  });

  // PATCH with path params + body — pipe from record to typed custom with combined type
  it('PATCH form schema with path + body', () => {
    type PatchInput = { path: GetParameters<MockPaths, '/users/{id}', 'patch'>['path']; body: GetRequestBody<MockPaths, '/users/{id}', 'patch'> };
    const schema = formInput().pipe(z.custom<PatchInput>());
    expectTypeOf(schema).toMatchTypeOf<FormSchema>();
  });

  // PUT with path params + body — pipe from record to typed custom with combined type
  it('PUT form schema with path + body', () => {
    type PutInput = { path: GetParameters<MockPaths, '/users/{id}', 'put'>['path']; body: GetRequestBody<MockPaths, '/users/{id}', 'put'> };
    const schema = formInput().pipe(z.custom<PutInput>());
    expectTypeOf(schema).toMatchTypeOf<FormSchema>();
  });

  // Regression: bare z.custom without pipe does NOT satisfy form() in Zod v4
  it('bare z.custom<GetParameters> does NOT satisfy form() constraint', () => {
    const schema = z.custom<GetParameters<MockPaths, '/users/{id}', 'delete'>>();
    expectTypeOf(schema).not.toMatchTypeOf<FormSchema>();
  });

  it('bare z.custom<GetRequestBody> does NOT satisfy form() constraint', () => {
    const schema = z.custom<GetRequestBody<MockPaths, '/users', 'post'>>();
    expectTypeOf(schema).not.toMatchTypeOf<FormSchema>();
  });

  it('bare z.object({ path, body }) does NOT satisfy form() constraint', () => {
    const schema = z.object({
      path: z.custom<GetParameters<MockPaths, '/users/{id}', 'patch'>['path']>(),
      body: z.custom<GetRequestBody<MockPaths, '/users/{id}', 'patch'>>(),
    });
    expectTypeOf(schema).not.toMatchTypeOf<FormSchema>();
  });
});

describe('SvelteKit query() schema compatibility', () => {
  it('GET with query params', () => {
    const schema = z.custom<GetParameters<MockPaths, '/users', 'get'>>();
    expectTypeOf(schema).toMatchTypeOf<CommandSchema>();
  });

  it('GET with path params', () => {
    const schema = z.custom<GetParameters<MockPaths, '/users/{id}', 'get'>>();
    expectTypeOf(schema).toMatchTypeOf<CommandSchema>();
  });
});

describe('SvelteKit command() schema compatibility', () => {
  it('DELETE command: GetParameters', () => {
    const schema = z.custom<GetParameters<MockPaths, '/users/{id}', 'delete'>>();
    expectTypeOf(schema).toMatchTypeOf<CommandSchema>();
  });

  it('POST command body-only: GetRequestBody', () => {
    const schema = z.custom<GetRequestBody<MockPaths, '/users', 'post'>>();
    expectTypeOf(schema).toMatchTypeOf<CommandSchema>();
  });

  it('PATCH command with path + body: z.object', () => {
    const schema = z.object({
      path: z.custom<GetParameters<MockPaths, '/users/{id}', 'patch'>['path']>(),
      body: z.custom<GetRequestBody<MockPaths, '/users/{id}', 'patch'>>(),
    });
    expectTypeOf(schema).toMatchTypeOf<CommandSchema>();
  });

  it('PUT command with path + body: z.object', () => {
    const schema = z.object({
      path: z.custom<GetParameters<MockPaths, '/users/{id}', 'put'>['path']>(),
      body: z.custom<GetRequestBody<MockPaths, '/users/{id}', 'put'>>(),
    });
    expectTypeOf(schema).toMatchTypeOf<CommandSchema>();
  });
});
