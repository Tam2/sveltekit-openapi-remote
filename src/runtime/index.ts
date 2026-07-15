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
    throw svelteError(
      (error as any).statusCode ?? 500,
      (error as any).message ?? 'An error occurred',
    );
  }
  if (!data) {
    throw svelteError(404, 'Not found');
  }
  return data;
}

export function createRemoteHandlers(client: OpenapiClient) {
  async function handleGetQuery(path: string, params: any) {
    const { data, error, response } = await client.GET(path, { params });
    return handleResponse(response, error, data);
  }

  async function handlePostCommand(path: string, input: any) {
    const hasPath = input && typeof input === 'object' && 'path' in input;
    const hasBody = input && typeof input === 'object' && 'body' in input;
    const { data, error, response } = await client.POST(path, {
      ...(hasPath && { params: { path: input.path } }),
      body: hasBody ? input.body : input,
    });
    return handleResponse(response, error, data);
  }

  async function handlePatchCommand(path: string, input: any) {
    const hasPath = input && typeof input === 'object' && 'path' in input;
    const hasBody = input && typeof input === 'object' && 'body' in input;
    // For a no-path endpoint the generated wrapper passes the body directly (no `body` key), so fall
    // back to the whole input as the body — matching handlePostCommand. Without this, a bare body was
    // silently dropped, sending an empty PATCH.
    const { data, error, response } = await client.PATCH(path, {
      ...(hasPath && { params: { path: input.path } }),
      body: hasBody ? input.body : input,
    });
    return handleResponse(response, error, data);
  }

  async function handlePutCommand(path: string, input: any) {
    const hasPath = input && typeof input === 'object' && 'path' in input;
    const hasBody = input && typeof input === 'object' && 'body' in input;
    // Same bare-body fallback as handlePostCommand/handlePatchCommand.
    const { data, error, response } = await client.PUT(path, {
      ...(hasPath && { params: { path: input.path } }),
      body: hasBody ? input.body : input,
    });
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
