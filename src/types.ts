/** Filter paths that support a given HTTP method */
export type PathsWithMethod<
  Paths,
  TMethod extends 'get' | 'post' | 'patch' | 'put' | 'delete',
> = {
  [P in keyof Paths]: TMethod extends keyof Paths[P] ? P : never;
}[keyof Paths];

/** Extract parameters (path + query) for a given path and method */
export type GetParameters<
  Paths,
  TPath extends keyof Paths,
  TMethod extends keyof Paths[TPath],
> = Paths[TPath][TMethod] extends { parameters: infer P } ? P : never;

/** Extract JSON request body for a given path and method */
export type GetRequestBody<
  Paths,
  TPath extends keyof Paths,
  TMethod extends keyof Paths[TPath],
> = Paths[TPath][TMethod] extends {
  requestBody: { content: { 'application/json': infer B } };
}
  ? B
  : never;

/** Extract JSON response body (checks 200, then 201, falls back to unknown) */
export type GetResponse<
  Paths,
  TPath extends keyof Paths,
  TMethod extends keyof Paths[TPath],
> = Paths[TPath][TMethod] extends {
  responses: { 200: { content: { 'application/json': infer R } } };
}
  ? R
  : Paths[TPath][TMethod] extends {
        responses: { 201: { content: { 'application/json': infer R } } };
      }
    ? R
    : unknown;
