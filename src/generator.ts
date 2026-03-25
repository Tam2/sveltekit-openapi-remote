import * as fs from 'node:fs';
import * as path from 'node:path';

export interface PathInfo {
  path: string;
  methods: {
    method: 'get' | 'post' | 'patch' | 'put' | 'delete';
    hasParams: boolean;
    hasBody: boolean;
    hasQuery: boolean;
  }[];
}

export interface GeneratorOptions {
  output: string;
  clientImport: string;
  grouping: 'single' | 'segment';
  depth: number;
}

function extractInterfaceBody(content: string, name: string): string | null {
  const startRegex = new RegExp(`export interface ${name}\\s*\\{`);
  const startMatch = startRegex.exec(content);
  if (!startMatch) return null;

  let depth = 1;
  let pos = startMatch.index + startMatch[0].length;

  while (pos < content.length && depth > 0) {
    if (content[pos] === '{') depth++;
    else if (content[pos] === '}') depth--;
    pos++;
  }

  return content.slice(startMatch.index + startMatch[0].length, pos - 1);
}

function extractPathBlock(content: string, startIndex: number): string | null {
  // Find the colon after the key, then the opening brace after it
  const colonPos = content.indexOf(':', startIndex);
  if (colonPos === -1) return null;
  let pos = content.indexOf('{', colonPos);
  if (pos === -1) return null;

  let depth = 1;
  pos++;

  while (pos < content.length && depth > 0) {
    if (content[pos] === '{') depth++;
    else if (content[pos] === '}') depth--;
    pos++;
  }

  return content.slice(startIndex, pos);
}

export function extractPaths(apiTypesContent: string): PathInfo[] {
  const pathsContent = extractInterfaceBody(apiTypesContent, 'paths');
  if (!pathsContent) {
    throw new Error('Could not find paths interface in api.d.ts');
  }

  const pathKeyRegex = /"(\/[^"]*)":\s*\{/g;
  const paths: PathInfo[] = [];

  let match;
  while ((match = pathKeyRegex.exec(pathsContent)) !== null) {
    const pathStr = match[1];
    const pathBlock = extractPathBlock(pathsContent, match.index);
    if (!pathBlock) continue;

    // Advance past this block to avoid matching nested keys
    pathKeyRegex.lastIndex = match.index + pathBlock.length;

    const methods: PathInfo['methods'] = [];
    const methodChecks = [
      { method: 'get' as const, regex: /\bget:\s*(?:operations\[|\{)/ },
      { method: 'post' as const, regex: /\bpost:\s*(?:operations\[|\{)/ },
      { method: 'patch' as const, regex: /\bpatch:\s*(?:operations\[|\{)/ },
      { method: 'put' as const, regex: /\bput:\s*(?:operations\[|\{)/ },
      { method: 'delete' as const, regex: /\bdelete:\s*(?:operations\[|\{)/ },
    ];

    for (const { method, regex } of methodChecks) {
      if (regex.test(pathBlock)) {
        const hasParams = pathStr.includes('{');
        const hasBody = method !== 'get' && method !== 'delete';
        const hasQuery = method === 'get';
        methods.push({ method, hasParams, hasBody, hasQuery });
      }
    }

    if (methods.length > 0) {
      paths.push({ path: pathStr, methods });
    }
  }

  if (paths.length === 0 && pathsContent.trim().length > 0) {
    console.warn(
      'Warning: paths interface found but no HTTP methods detected. ' +
      'The api.d.ts format may be unsupported.',
    );
  }

  return paths;
}

export function pathToFunctionName(
  pathStr: string,
  method: string,
  variant?: 'Command' | 'Form',
): string {
  const segments = pathStr.replace(/^\//, '').split('/');

  const parts = segments.map((segment, index) => {
    if (segment.startsWith('{') && segment.endsWith('}')) {
      const param = segment.slice(1, -1);
      return 'By' + param.charAt(0).toUpperCase() + param.slice(1);
    }

    const words = segment.split('-');
    return words
      .map((word, i) => {
        if (index === 0 && i === 0) {
          return word;
        }
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join('');
  });

  const baseName = parts.join('');
  const functionName =
    method.toLowerCase() + baseName.charAt(0).toUpperCase() + baseName.slice(1);

  return variant ? functionName + variant : functionName;
}

export function pathToFilename(pathStr: string, depth: number): string {
  const segments = pathStr
    .replace(/^\//, '')
    .split('/')
    .filter(s => !s.startsWith('{'));

  if (segments.length === 0) {
    return 'root.remote.ts';
  }

  const groupSegments = segments.slice(0, depth);
  const fileBase = groupSegments.join('-').replace(/[^a-zA-Z0-9-]/g, '-');

  return `${fileBase}.remote.ts`;
}

/** Generate the content for a single .remote.ts file */
export function generateFileContent(paths: PathInfo[], clientImport: string): string {
  const allHandlers = new Set<string>();
  const allTypes = new Set<string>();

  for (const pathInfo of paths) {
    for (const methodInfo of pathInfo.methods) {
      const m = methodInfo.method;
      if (m === 'get') {
        allHandlers.add('handleGetQuery');
        allTypes.add('GetParameters');
      } else if (m === 'delete') {
        allHandlers.add('handleDeleteCommand');
        allHandlers.add('handleDeleteForm');
        allTypes.add('GetParameters');
      } else {
        const Method = m.charAt(0).toUpperCase() + m.slice(1);
        allHandlers.add(`handle${Method}Command`);
        allHandlers.add(`handle${Method}Form`);
        if (methodInfo.hasParams) allTypes.add('GetParameters');
        allTypes.add('GetRequestBody');
      }
    }
  }

  const handlerImports = Array.from(allHandlers).sort().join(',\n  ');
  const typeImportList = Array.from(allTypes).sort();
  const typeImportLine = typeImportList.length > 0
    ? `import { type ${typeImportList.join(', type ')} } from 'sveltekit-openapi-remote';\n`
    : '';

  const imports = `import { query, command, form } from '$app/server';
import { z } from 'zod';
import type { paths } from './api';
${typeImportLine}import {
  ${handlerImports},
} from '${clientImport}';

/**
 * Auto-generated remote functions
 * DO NOT EDIT - Run 'npx sveltekit-openapi-remote generate' to regenerate
 */
`;

  const functions: string[] = [];
  for (const pathInfo of paths) {
    for (const methodInfo of pathInfo.methods) {
      functions.push(...generateFunctionCode(pathInfo.path, methodInfo.method, methodInfo));
    }
  }

  return imports + '\n' + functions.join('\n\n') + '\n';
}

function generateFunctionCode(
  pathStr: string,
  method: 'get' | 'post' | 'patch' | 'put' | 'delete',
  info: PathInfo['methods'][0],
): string[] {
  const codes: string[] = [];

  if (method === 'get') {
    const funcName = pathToFunctionName(pathStr, method);
    codes.push(`export const ${funcName} = query(\n\tz.custom<GetParameters<paths, '${pathStr}', 'get'>>(),\n\tasync (params) => handleGetQuery('${pathStr}', params)\n);`);
  } else if (method === 'delete') {
    const commandName = pathToFunctionName(pathStr, method, 'Command');
    const formName = pathToFunctionName(pathStr, method, 'Form');
    codes.push(`export const ${commandName} = command(\n\tz.custom<GetParameters<paths, '${pathStr}', 'delete'>>(),\n\tasync (params) => handleDeleteCommand('${pathStr}', params)\n);`);
    codes.push(`export const ${formName} = form(\n\tz.custom<GetParameters<paths, '${pathStr}', 'delete'>>(),\n\tasync (params) => handleDeleteForm('${pathStr}', params)\n);`);
  } else if (info.hasParams) {
    const commandName = pathToFunctionName(pathStr, method, 'Command');
    const formName = pathToFunctionName(pathStr, method, 'Form');
    const Method = method.charAt(0).toUpperCase() + method.slice(1);
    const commandHandler = `handle${Method}Command`;
    const formHandler = `handle${Method}Form`;
    codes.push(`export const ${commandName} = command(\n\tz.object({\n\t\tpath: z.custom<GetParameters<paths, '${pathStr}', '${method}'>['path']>(),\n\t\tbody: z.custom<GetRequestBody<paths, '${pathStr}', '${method}'>>()\n\t}),\n\tasync (input) => ${commandHandler}('${pathStr}', input)\n);`);
    codes.push(`export const ${formName} = form(\n\tz.object({\n\t\tpath: z.custom<GetParameters<paths, '${pathStr}', '${method}'>['path']>(),\n\t\tbody: z.custom<GetRequestBody<paths, '${pathStr}', '${method}'>>()\n\t}),\n\tasync (input) => ${formHandler}('${pathStr}', input)\n);`);
  } else {
    const commandName = pathToFunctionName(pathStr, method, 'Command');
    const formName = pathToFunctionName(pathStr, method, 'Form');
    const Method = method.charAt(0).toUpperCase() + method.slice(1);
    const commandHandler = `handle${Method}Command`;
    const formHandler = `handle${Method}Form`;
    codes.push(`export const ${commandName} = command(\n\tz.custom<GetRequestBody<paths, '${pathStr}', '${method}'>>(),\n\tasync (body) => ${commandHandler}('${pathStr}', body)\n);`);
    codes.push(`export const ${formName} = form(\n\tz.custom<GetRequestBody<paths, '${pathStr}', '${method}'>>(),\n\tasync (body) => ${formHandler}('${pathStr}', body)\n);`);
  }

  return codes;
}

export function generateRemoteFiles(
  paths: PathInfo[],
  options: GeneratorOptions,
): Map<string, string> {
  const nameMap = new Map<string, string>();
  for (const pathInfo of paths) {
    for (const methodInfo of pathInfo.methods) {
      const variants = methodInfo.method === 'get'
        ? [pathToFunctionName(pathInfo.path, methodInfo.method)]
        : [
            pathToFunctionName(pathInfo.path, methodInfo.method, 'Command'),
            pathToFunctionName(pathInfo.path, methodInfo.method, 'Form'),
          ];
      for (const name of variants) {
        if (nameMap.has(name)) {
          throw new Error(
            `Function name collision: "${name}" is generated by both "${nameMap.get(name)}" and "${pathInfo.path}" (${methodInfo.method})`,
          );
        }
        nameMap.set(name, `${pathInfo.path} (${methodInfo.method})`);
      }
    }
  }

  const fileMap = new Map<string, PathInfo[]>();
  if (options.grouping === 'single') {
    fileMap.set('api.remote.ts', paths);
  } else {
    for (const pathInfo of paths) {
      const filename = pathToFilename(pathInfo.path, options.depth);
      if (!fileMap.has(filename)) {
        fileMap.set(filename, []);
      }
      fileMap.get(filename)!.push(pathInfo);
    }
  }

  const result = new Map<string, string>();
  for (const [filename, filePaths] of fileMap.entries()) {
    result.set(filename, generateFileContent(filePaths, options.clientImport));
  }

  return result;
}

export function writeRemoteFiles(
  files: Map<string, string>,
  outputDir: string,
): void {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  } else {
    const existingFiles = fs.readdirSync(outputDir);
    for (const file of existingFiles) {
      if (file.endsWith('.remote.ts')) {
        const filePath = path.join(outputDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        if (content.includes('DO NOT EDIT')) {
          fs.unlinkSync(filePath);
        }
      }
    }
  }

  for (const [filename, content] of files.entries()) {
    fs.writeFileSync(path.join(outputDir, filename), content, 'utf-8');
  }
}
