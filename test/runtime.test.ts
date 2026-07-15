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

    it('returns empty data on a successful (2xx) response with no body', async () => {
      // 204 No Content / void endpoints: an empty body on an ok response is success, not a 404.
      const client = createMockClient();
      client.GET.mockResolvedValue({
        data: undefined,
        error: undefined,
        response: { ok: true, status: 204 },
      });
      const { handleGetQuery } = createRemoteHandlers(client as any);
      await expect(handleGetQuery('/users', {})).resolves.toBeUndefined();
    });

    it('throws when a non-ok response has no data', async () => {
      const client = createMockClient();
      client.GET.mockResolvedValue({
        data: undefined,
        error: undefined,
        response: { ok: false, status: 404 },
      });
      const { handleGetQuery } = createRemoteHandlers(client as any);
      await expect(handleGetQuery('/users', {})).rejects.toThrow();
    });

    it('uses response.status for errors, not just error.statusCode', async () => {
      // Non-Nest APIs return an error body without `statusCode`; the real status must still surface.
      const client = createMockClient();
      client.POST.mockResolvedValue({
        data: undefined,
        error: { message: 'Conflict' },
        response: { ok: false, status: 409 },
      });
      const { handlePostCommand } = createRemoteHandlers(client as any);
      const err = await handlePostCommand('/things', { name: 'x' }).catch((e) => e);
      expect((err as { status: number }).status).toBe(409);
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

    it('sends params but NO body for a path-only input (no request body)', async () => {
      const client = createMockClient();
      client.POST.mockResolvedValue({
        data: { ok: true },
        error: undefined,
        response: { ok: true, status: 200 },
      });
      const { handlePostCommand } = createRemoteHandlers(client as any);
      await handlePostCommand('/invitations/{id}/resend', { path: { id: 'abc' } });
      // Must NOT forward `{ path }` as the request body to a no-body endpoint.
      expect(client.POST).toHaveBeenCalledWith('/invitations/{id}/resend', {
        params: { path: { id: 'abc' } },
      });
    });

    it('sends neither params nor body for a no-arg action (undefined input)', async () => {
      const client = createMockClient();
      client.POST.mockResolvedValue({
        data: { ok: true },
        error: undefined,
        response: { ok: true, status: 200 },
      });
      const { handlePostCommand } = createRemoteHandlers(client as any);
      await handlePostCommand('/billing/reactivate', undefined);
      expect(client.POST).toHaveBeenCalledWith('/billing/reactivate', {});
    });

    it('is callable with only a path (no-arg action command shape)', async () => {
      // The generator emits `command(z.void(), async () => handlePostCommand(path))` for no-path,
      // no-body endpoints, i.e. a 1-argument call. `input` is optional so that type-checks.
      const client = createMockClient();
      client.POST.mockResolvedValue({
        data: { ok: true },
        error: undefined,
        response: { ok: true, status: 200 },
      });
      const { handlePostCommand } = createRemoteHandlers(client as any);
      await handlePostCommand('/billing/reactivate');
      expect(client.POST).toHaveBeenCalledWith('/billing/reactivate', {});
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

    it('treats a bare body (no path/body key) as the request body, like POST', async () => {
      // A no-path endpoint's generated wrapper passes the body directly (e.g. patchUsersCommand({...})).
      // Regression: handlePatchCommand used to only forward input.body, silently dropping a bare body.
      const client = createMockClient();
      client.PATCH.mockResolvedValue({
        data: { updated: true },
        error: undefined,
        response: { ok: true, status: 200 },
      });
      const { handlePatchCommand } = createRemoteHandlers(client as any);
      const result = await handlePatchCommand('/users', { firstName: 'Tam', lastName: 'M' });
      expect(client.PATCH).toHaveBeenCalledWith('/users', {
        body: { firstName: 'Tam', lastName: 'M' },
      });
      expect(result).toEqual({ updated: true });
    });

    it('sends params but NO body for a path-only input (no request body)', async () => {
      const client = createMockClient();
      client.PATCH.mockResolvedValue({
        data: { ok: true },
        error: undefined,
        response: { ok: true, status: 200 },
      });
      const { handlePatchCommand } = createRemoteHandlers(client as any);
      await handlePatchCommand('/things/{id}/toggle', { path: { id: 7 } });
      expect(client.PATCH).toHaveBeenCalledWith('/things/{id}/toggle', {
        params: { path: { id: 7 } },
      });
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

    it('treats a bare body (no path/body key) as the request body, like POST', async () => {
      const client = createMockClient();
      client.PUT.mockResolvedValue({
        data: { replaced: true },
        error: undefined,
        response: { ok: true, status: 200 },
      });
      const { handlePutCommand } = createRemoteHandlers(client as any);
      const result = await handlePutCommand('/settings', { theme: 'dark' });
      expect(client.PUT).toHaveBeenCalledWith('/settings', {
        body: { theme: 'dark' },
      });
      expect(result).toEqual({ replaced: true });
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
