import { describe, it, expectTypeOf } from 'vitest';
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
