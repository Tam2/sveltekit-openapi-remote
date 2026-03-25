import { describe, it, expect, vi } from 'vitest';
import { createRemoteHandlers } from '../src/runtime/index.js';

vi.mock('@sveltejs/kit', () => ({
  error: (status: number, message: string) => {
    const err = new Error(message);
    (err as any).status = status;
    return err;
  },
}));

function createMockClient() {
  return {
    GET: vi.fn(),
    POST: vi.fn(),
    PATCH: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
  };
}

describe('createRemoteHandlers', () => {
  describe('handleGetQuery', () => {
    it('calls client.GET with path and params', async () => {
      const client = createMockClient();
      client.GET.mockResolvedValue({
        data: [{ id: 1 }],
        error: undefined,
        response: { ok: true, status: 200 },
      });
      const { handleGetQuery } = createRemoteHandlers(client as any);
      const result = await handleGetQuery('/users', { query: { limit: 10 } });
      expect(client.GET).toHaveBeenCalledWith('/users', { params: { query: { limit: 10 } } });
      expect(result).toEqual([{ id: 1 }]);
    });

    it('throws on error response', async () => {
      const client = createMockClient();
      client.GET.mockResolvedValue({
        data: undefined,
        error: { statusCode: 404, message: 'Not found' },
        response: { ok: false, status: 404 },
      });
      const { handleGetQuery } = createRemoteHandlers(client as any);
      await expect(handleGetQuery('/users', {})).rejects.toThrow();
    });

    it('throws 503 on network failure (no response)', async () => {
      const client = createMockClient();
      client.GET.mockResolvedValue({
        data: undefined,
        error: undefined,
        response: undefined,
      });
      const { handleGetQuery } = createRemoteHandlers(client as any);
      await expect(handleGetQuery('/users', {})).rejects.toThrow();
    });

    it('throws 404 when data is missing', async () => {
      const client = createMockClient();
      client.GET.mockResolvedValue({
        data: undefined,
        error: undefined,
        response: { ok: true, status: 200 },
      });
      const { handleGetQuery } = createRemoteHandlers(client as any);
      await expect(handleGetQuery('/users', {})).rejects.toThrow();
    });
  });

  describe('handlePostCommand', () => {
    it('calls client.POST with path and body', async () => {
      const client = createMockClient();
      client.POST.mockResolvedValue({
        data: { id: 1, name: 'Test' },
        error: undefined,
        response: { ok: true, status: 201 },
      });
      const { handlePostCommand } = createRemoteHandlers(client as any);
      const result = await handlePostCommand('/users', { name: 'Test' });
      expect(client.POST).toHaveBeenCalledWith('/users', { body: { name: 'Test' } });
      expect(result).toEqual({ id: 1, name: 'Test' });
    });
  });

  describe('handlePatchCommand', () => {
    it('calls client.PATCH with path params and body', async () => {
      const client = createMockClient();
      client.PATCH.mockResolvedValue({
        data: { id: 1, name: 'Updated' },
        error: undefined,
        response: { ok: true, status: 200 },
      });
      const { handlePatchCommand } = createRemoteHandlers(client as any);
      const result = await handlePatchCommand('/users/{id}', {
        path: { id: 1 },
        body: { name: 'Updated' },
      });
      expect(client.PATCH).toHaveBeenCalledWith('/users/{id}', {
        params: { path: { id: 1 } },
        body: { name: 'Updated' },
      });
      expect(result).toEqual({ id: 1, name: 'Updated' });
    });

    it('calls client.PATCH with body only (no path params)', async () => {
      const client = createMockClient();
      client.PATCH.mockResolvedValue({
        data: { updated: true },
        error: undefined,
        response: { ok: true, status: 200 },
      });
      const { handlePatchCommand } = createRemoteHandlers(client as any);
      const result = await handlePatchCommand('/settings', { body: { theme: 'dark' } });
      expect(client.PATCH).toHaveBeenCalledWith('/settings', {
        body: { theme: 'dark' },
      });
      expect(result).toEqual({ updated: true });
    });
  });

  describe('handlePutCommand', () => {
    it('calls client.PUT with path params and body', async () => {
      const client = createMockClient();
      client.PUT.mockResolvedValue({
        data: { id: 1, name: 'Replaced' },
        error: undefined,
        response: { ok: true, status: 200 },
      });
      const { handlePutCommand } = createRemoteHandlers(client as any);
      const result = await handlePutCommand('/users/{id}', {
        path: { id: 1 },
        body: { name: 'Replaced' },
      });
      expect(client.PUT).toHaveBeenCalledWith('/users/{id}', {
        params: { path: { id: 1 } },
        body: { name: 'Replaced' },
      });
      expect(result).toEqual({ id: 1, name: 'Replaced' });
    });
  });

  describe('handleDeleteCommand', () => {
    it('calls client.DELETE with path and params', async () => {
      const client = createMockClient();
      client.DELETE.mockResolvedValue({
        data: { success: true },
        error: undefined,
        response: { ok: true, status: 200 },
      });
      const { handleDeleteCommand } = createRemoteHandlers(client as any);
      const result = await handleDeleteCommand('/users/{id}', { path: { id: 1 } });
      expect(client.DELETE).toHaveBeenCalledWith('/users/{id}', { params: { path: { id: 1 } } });
      expect(result).toEqual({ success: true });
    });
  });

  describe('form handlers', () => {
    it('handlePostForm behaves like handlePostCommand', async () => {
      const client = createMockClient();
      client.POST.mockResolvedValue({
        data: { id: 1 },
        error: undefined,
        response: { ok: true, status: 201 },
      });
      const { handlePostForm } = createRemoteHandlers(client as any);
      const result = await handlePostForm('/users', { name: 'Test' });
      expect(client.POST).toHaveBeenCalledWith('/users', { body: { name: 'Test' } });
      expect(result).toEqual({ id: 1 });
    });
  });
});
