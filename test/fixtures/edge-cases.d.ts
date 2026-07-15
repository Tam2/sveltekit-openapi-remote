// Hand-written api.d.ts covering every command/query/form shape the generator emits, so the
// "generated output type-checks" test exercises each against the real handler signatures.
export interface paths {
    "/items": {
        get: operations["listItems"];       // GET (query)
        post: operations["createItem"];     // no-path + body
    };
    "/items/{id}": {
        patch: operations["updateItem"];    // path + body
        delete: operations["deleteItem"];   // DELETE
    };
    "/items/{id}/archive": {
        post: operations["archiveItem"];    // path + NO body  -> z.object({ path })
    };
    "/ping": {
        post: operations["ping"];           // no-path + NO body -> z.void() (the regression case)
    };
    "/notes": {
        post: operations["addNote"];        // no-path + OPTIONAL body
    };
    "/things/{id}": {
        put: operations["replaceThing"];    // path + body (PUT)
    };
}
export interface operations {
    listItems: {
        parameters: { query?: { limit?: number } };
        responses: { 200: { content: { "application/json": { id: string }[] } } };
    };
    createItem: {
        requestBody: { content: { "application/json": { name: string } } };
        responses: { 201: { content: { "application/json": { id: string } } } };
    };
    updateItem: {
        parameters: { path: { id: string } };
        requestBody: { content: { "application/json": { name?: string } } };
        responses: { 200: { content: { "application/json": { id: string } } } };
    };
    deleteItem: {
        parameters: { path: { id: string } };
        responses: { 200: { content: { "application/json": { ok: boolean } } } };
    };
    archiveItem: {
        parameters: { path: { id: string } };
        requestBody?: never;
        responses: { 200: { content: { "application/json": { ok: boolean } } } };
    };
    ping: {
        requestBody?: never;
        responses: { 200: { content: { "application/json": { ok: boolean } } } };
    };
    addNote: {
        requestBody?: { content: { "application/json": { text?: string } } };
        responses: { 200: { content: { "application/json": { id: string } } } };
    };
    replaceThing: {
        parameters: { path: { id: string } };
        requestBody: { content: { "application/json": { value: number } } };
        responses: { 200: { content: { "application/json": { id: string } } } };
    };
}
