# sveltekit-openapi-remote

Generate typed SvelteKit remote functions (`query`, `command`, `form`) directly from OpenAPI specs. Point it at your API spec and get ready-to-use server functions with full type safety.

## How it works

1. You provide an OpenAPI spec (URL, file path, or pre-generated `api.d.ts`)
2. The CLI generates TypeScript types via [openapi-typescript](https://github.com/openapi-ts/openapi-typescript)
3. It parses those types and generates SvelteKit remote function files
4. Your app imports these generated functions and uses them with full type safety

The generated functions use SvelteKit's `query()`, `command()`, and `form()` from `$app/server`, wired up to your API through [openapi-fetch](https://github.com/openapi-ts/openapi-typescript/tree/main/packages/openapi-fetch).

## Installation

```bash
npm install sveltekit-openapi-remote
# or
pnpm add sveltekit-openapi-remote
```

### Peer dependencies

These are required in your SvelteKit project:

```bash
npm install openapi-fetch zod
# openapi-typescript is only needed if using --spec (optional)
npm install -D openapi-typescript
```

## Quick start

### 1. Set up your openapi-fetch client

```ts
// src/lib/api/client.ts
import createClient from 'openapi-fetch';

export const client = createClient({
  baseUrl: 'https://api.example.com',
});
```

### 2. Initialize the remote handlers

```ts
// src/lib/api/remote.ts
import { createRemoteHandlers } from 'sveltekit-openapi-remote';
import { client } from './client';

export const {
  handleGetQuery,
  handlePostCommand,
  handlePatchCommand,
  handlePutCommand,
  handleDeleteCommand,
  handlePostForm,
  handlePatchForm,
  handlePutForm,
  handleDeleteForm,
} = createRemoteHandlers(client);
```

### 3. Generate remote functions

```bash
# From an OpenAPI spec URL
npx sveltekit-openapi-remote generate \
  --spec https://petstore3.swagger.io/api/v3/openapi.json \
  --output src/lib/remote/generated \
  --client '$lib/api/remote'

# From a local spec file (JSON or YAML)
npx sveltekit-openapi-remote generate \
  --spec ./openapi.yaml \
  --output src/lib/remote/generated \
  --client '$lib/api/remote'

# From an existing api.d.ts (skip openapi-typescript step)
npx sveltekit-openapi-remote generate \
  --types-path src/lib/types/api.d.ts \
  --output src/lib/remote/generated \
  --client '$lib/api/remote'
```

### 4. Use in your SvelteKit app

```svelte
<!-- src/routes/pets/+page.svelte -->
<script>
  import { getPetFindByStatus } from '$lib/remote/generated/pet.remote';

  let pets = $derived(getPetFindByStatus({ query: { status: 'available' } }));
</script>
```

## CLI reference

```
npx sveltekit-openapi-remote generate [options]
```

### Options

| Option | Required | Description |
|--------|----------|-------------|
| `--spec <path\|url>` | * | OpenAPI spec file or URL. Runs openapi-typescript to generate types. |
| `--types-path <path>` | * | Path to an existing `api.d.ts` file. Skips type generation. |
| `--output <dir>` | Yes | Output directory for generated files. |
| `--client <path>` | Yes | Import path to your initialized handlers file (e.g. `$lib/api/remote`). |
| `--grouping <mode>` | No | `"segment"` (default) or `"single"`. Controls file output. |
| `--depth <n>` | No | Segment depth for grouping (default: `1`). Only used with `--grouping segment`. |
| `--dry-run` | No | Preview what files would be generated without writing. |
| `--quiet` | No | Suppress all output except errors. Useful for CI. |
| `--help` | No | Show help text. |

\* Must provide either `--spec` or `--types-path`, not both.

### `--spec` vs `--types-path`

Use `--spec` when you want the CLI to handle everything — it runs `openapi-typescript` internally and writes `api.d.ts` to the output directory.

Use `--types-path` if you already generate your `api.d.ts` separately (e.g. as part of your build pipeline) and just want the remote function generation.

### `--grouping` and `--depth`

Controls how generated functions are split across files.

**`--grouping segment --depth 1`** (default) groups by the first URL segment:

```
src/lib/remote/generated/
├── api.d.ts
├── pet.remote.ts       # /pet, /pet/{petId}, /pet/findByStatus, ...
├── store.remote.ts     # /store/inventory, /store/order, ...
└── user.remote.ts      # /user, /user/{username}, /user/login, ...
```

**`--grouping segment --depth 2`** groups by the first two non-parameter segments:

```
src/lib/remote/generated/
├── api.d.ts
├── pet.remote.ts
├── pet-findByStatus.remote.ts
├── pet-findByTags.remote.ts
├── store-inventory.remote.ts
├── store-order.remote.ts
├── user.remote.ts
├── user-createWithList.remote.ts
├── user-login.remote.ts
└── user-logout.remote.ts
```

**`--grouping single`** puts everything in one file:

```
src/lib/remote/generated/
├── api.d.ts
└── api.remote.ts
```

### `--client`

The import path that generated files will use to import your handlers. This should match how your SvelteKit project resolves imports — typically a `$lib` alias:

```bash
--client '$lib/api/remote'
```

The generated files will contain:

```ts
import {
  handleGetQuery,
  handlePostCommand,
  // ...
} from '$lib/api/remote';
```

## What gets generated

For each endpoint in your OpenAPI spec, the CLI generates typed SvelteKit remote functions:

| HTTP Method | Has Path Params | Generated Functions |
|-------------|----------------|---------------------|
| GET | any | `query()` |
| POST | no | `command()` + `form()` |
| POST | yes | `command()` + `form()` with `{ path, body }` |
| PATCH | no | `command()` + `form()` |
| PATCH | yes | `command()` + `form()` with `{ path, body }` |
| PUT | no | `command()` + `form()` |
| PUT | yes | `command()` + `form()` with `{ path, body }` |
| DELETE | any | `command()` + `form()` |

### Function naming

- HTTP method as prefix: `get`, `post`, `put`, `patch`, `delete`
- Path segments in camelCase: `/store/order` becomes `StoreOrder`
- Path parameters become `By{Param}`: `/pet/{petId}` becomes `PetByPetId`
- Mutations get `Command` and `Form` suffixes

**Examples:**

| Endpoint | Generated name |
|----------|---------------|
| `GET /pet/findByStatus` | `getPetFindByStatus` |
| `GET /pet/{petId}` | `getPetByPetId` |
| `POST /pet` | `postPetCommand`, `postPetForm` |
| `DELETE /store/order/{orderId}` | `deleteStoreOrderByOrderIdCommand`, `deleteStoreOrderByOrderIdForm` |
| `PUT /user/{username}` | `putUserByUsernameCommand`, `putUserByUsernameForm` |

### Example output

For the [Petstore API](https://petstore3.swagger.io/), the generated `store.remote.ts` looks like:

```ts
import { query, command, form } from '$app/server';
import { z } from 'zod';
import type { paths } from './api';
import { type GetParameters, type GetRequestBody } from 'sveltekit-openapi-remote';
import {
  handleDeleteCommand,
  handleDeleteForm,
  handleGetQuery,
  handlePostCommand,
  handlePostForm,
} from '$lib/api/remote';

/**
 * Auto-generated remote functions
 * DO NOT EDIT - Run 'npx sveltekit-openapi-remote generate' to regenerate
 */

export const getStoreInventory = query(
  z.custom<GetParameters<paths, '/store/inventory', 'get'>>(),
  async (params) => handleGetQuery('/store/inventory', params)
);

export const postStoreOrderCommand = command(
  z.custom<GetRequestBody<paths, '/store/order', 'post'>>(),
  async (body) => handlePostCommand('/store/order', body)
);

export const postStoreOrderForm = form(
  z.custom<GetRequestBody<paths, '/store/order', 'post'>>(),
  async (body) => handlePostForm('/store/order', body)
);

export const getStoreOrderByOrderId = query(
  z.custom<GetParameters<paths, '/store/order/{orderId}', 'get'>>(),
  async (params) => handleGetQuery('/store/order/{orderId}', params)
);

export const deleteStoreOrderByOrderIdCommand = command(
  z.custom<GetParameters<paths, '/store/order/{orderId}', 'delete'>>(),
  async (params) => handleDeleteCommand('/store/order/{orderId}', params)
);

export const deleteStoreOrderByOrderIdForm = form(
  z.custom<GetParameters<paths, '/store/order/{orderId}', 'delete'>>(),
  async (params) => handleDeleteForm('/store/order/{orderId}', params)
);
```

## Regeneration

Running the generator again will:
- Delete previously generated `.remote.ts` files (identified by the `DO NOT EDIT` header)
- Preserve any hand-written `.remote.ts` files you've added
- Write the new generated files

Add the generate command to your `package.json` scripts:

```json
{
  "scripts": {
    "generate:api": "sveltekit-openapi-remote generate --spec https://api.example.com/openapi.json --output src/lib/remote/generated --client '$lib/api/remote'"
  }
}
```

## Error handling

The runtime handlers throw SvelteKit errors automatically:

- **No response** (network failure) throws `error(503)`
- **API error response** throws `error(statusCode)` with the error message
- **No data returned** throws `error(404)`

## Requirements

- Node.js 20+
- SvelteKit 2.x
- openapi-typescript 7.x (only if using `--spec`)
- openapi-fetch
- zod 3.x

## License

MIT
