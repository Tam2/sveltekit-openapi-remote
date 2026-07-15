import { error as svelteError } from '@sveltejs/kit';

interface OpenapiClient {
  GET: any;
  POST: any;
  PATCH: any;
  PUT: any;
  DELETE: any;
}

function handleResponse(response: any, error: any, data: any) {
  if (!response) {
    throw svelteError(503, 'Network error: no response from service');
  }
  if (error) {
    // Use the real HTTP status from the response (works for any API); fall back to 500 only if it's
    // somehow absent. The error body's `message`, when present, gives a better message than a generic.
    throw svelteError(
      response.status ?? 500,
      (error as { message?: string })?.message ?? 'An error occurred',
    );
  }
  if (data === undefined || data === null) {
    // A successful (2xx) response may legitimately carry no body — 204 No Content, or a void /
    // action endpoint (e.g. "resend invitation"). Only treat missing data as an error when the
    // response itself was not ok; otherwise return it so the caller sees success, not a false 404.
    if (response.ok) return data;
    throw svelteError(response.status ?? 404, 'Not found');
  }
  return data;
}

/**
 * Build the openapi-fetch request options from a command's single input argument.
 *
 * The generated command wrappers pass their input in one of these shapes, and this normalizes them:
 *  - `{ path, body }`          → params.path + body            (path + body endpoint)
 *  - `{ body }`                → body                          (no-path endpoint, wrapped)
 *  - `{ path }` (no `body`)    → params.path, NO body          (path-only endpoint, no request body)
 *  - a bare body `{ ...fields }` → body                        (no-path endpoint whose wrapper passes
 *                                                                the body directly)
 *  - `undefined`               → neither                       (no-path, no-body action endpoint)
 *
 * The key subtlety: a bare body has no `body` key, so it must be forwarded whole; but a path-only
 * input (has `path`, no `body`) must NOT be forwarded as the body, or `{ path }` would be sent as
 * the request body to a no-body endpoint.
 */
function buildRequestOptions(input: any) {
  const hasPath = input && typeof input === 'object' && 'path' in input;
  const hasBody = input && typeof input === 'object' && 'body' in input;
  const body = hasBody ? input.body : hasPath ? undefined : input;
  return {
    ...(hasPath && { params: { path: input.path } }),
    ...(body !== undefined && { body }),
  };
}

export function createRemoteHandlers(client: OpenapiClient) {
  async function handleGetQuery(path: string, params: any) {
    const { data, error, response } = await client.GET(path, { params });
    return handleResponse(response, error, data);
  }

  async function handlePostCommand(path: string, input: any) {
    const { data, error, response } = await client.POST(path, buildRequestOptions(input));
    return handleResponse(response, error, data);
  }

  async function handlePatchCommand(path: string, input: any) {
    const { data, error, response } = await client.PATCH(path, buildRequestOptions(input));
    return handleResponse(response, error, data);
  }

  async function handlePutCommand(path: string, input: any) {
    const { data, error, response } = await client.PUT(path, buildRequestOptions(input));
    return handleResponse(response, error, data);
  }

  async function handleDeleteCommand(path: string, params: any) {
    const { data, error, response } = await client.DELETE(path, { params });
    return handleResponse(response, error, data);
  }

  return {
    handleGetQuery,
    handlePostCommand,
    handlePatchCommand,
    handlePutCommand,
    handleDeleteCommand,
    handlePostForm: handlePostCommand,
    handlePatchForm: handlePatchCommand,
    handlePutForm: handlePutCommand,
    handleDeleteForm: handleDeleteCommand,
  };
}
