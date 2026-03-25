import { describe, it, expect } from 'vitest';
import { createProgram, validateArgs } from '../src/cli.js';

describe('validateArgs', () => {
  it('validates --spec with required args', () => {
    const args = validateArgs({
      spec: 'https://api.example.com/openapi.json',
      output: 'src/lib/remote/generated',
      client: '$lib/api/remote',
      grouping: 'segment',
      depth: '1',
    });
    expect(args).toEqual({
      spec: 'https://api.example.com/openapi.json',
      typesPath: undefined,
      output: 'src/lib/remote/generated',
      client: '$lib/api/remote',
      grouping: 'segment',
      depth: 1,
      dryRun: false,
      quiet: false,
    });
  });

  it('validates --types-path instead of --spec', () => {
    const args = validateArgs({
      typesPath: 'src/lib/types/api.d.ts',
      output: 'src/lib/remote/generated',
      client: '$lib/api/remote',
      grouping: 'segment',
      depth: '1',
    });
    expect(args.typesPath).toBe('src/lib/types/api.d.ts');
    expect(args.spec).toBeUndefined();
  });

  it('validates --grouping single', () => {
    const args = validateArgs({
      typesPath: 'api.d.ts',
      output: 'out',
      client: '$lib/api/remote',
      grouping: 'single',
      depth: '1',
    });
    expect(args.grouping).toBe('single');
  });

  it('validates --depth', () => {
    const args = validateArgs({
      typesPath: 'api.d.ts',
      output: 'out',
      client: '$lib/api/remote',
      grouping: 'segment',
      depth: '2',
    });
    expect(args.depth).toBe(2);
  });

  it('throws when neither --spec nor --types-path provided', () => {
    expect(() => validateArgs({
      output: 'out',
      client: '$lib/api/remote',
      grouping: 'segment',
      depth: '1',
    })).toThrow('must provide either --spec or --types-path');
  });

  it('throws when both --spec and --types-path provided', () => {
    expect(() => validateArgs({
      spec: 'url',
      typesPath: 'file',
      output: 'out',
      client: '$lib/api/remote',
      grouping: 'segment',
      depth: '1',
    })).toThrow('cannot provide both --spec and --types-path');
  });
});

describe('createProgram', () => {
  it('creates a program with generate command', () => {
    const program = createProgram();
    expect(program.name()).toBe('sveltekit-openapi-remote');

    const generateCmd = program.commands.find(c => c.name() === 'generate');
    expect(generateCmd).toBeDefined();
  });

  it('parses valid generate args', async () => {
    const program = createProgram();
    // Override the action to capture parsed opts
    let capturedOpts: Record<string, any> | undefined;
    const generateCmd = program.commands.find(c => c.name() === 'generate')!;
    generateCmd.action((opts) => { capturedOpts = opts; });

    await program.parseAsync([
      'node', 'cli.js', 'generate',
      '--spec', 'https://api.example.com/openapi.json',
      '--output', 'out',
      '--client', '$lib/api/remote',
    ]);

    expect(capturedOpts).toBeDefined();
    expect(capturedOpts!.spec).toBe('https://api.example.com/openapi.json');
    expect(capturedOpts!.output).toBe('out');
    expect(capturedOpts!.client).toBe('$lib/api/remote');
    expect(capturedOpts!.grouping).toBe('segment');
    expect(capturedOpts!.depth).toBe('1');
  });

  it('enforces --grouping choices', () => {
    const program = createProgram();
    program.exitOverride();

    expect(() => {
      program.parse([
        'node', 'cli.js', 'generate',
        '--spec', 'url',
        '--output', 'out',
        '--client', 'c',
        '--grouping', 'invalid',
      ]);
    }).toThrow();
  });

  it('requires --output', () => {
    const program = createProgram();
    program.exitOverride();

    expect(() => {
      program.parse([
        'node', 'cli.js', 'generate',
        '--spec', 'url',
        '--client', 'c',
      ]);
    }).toThrow();
  });

  it('requires --client', () => {
    const program = createProgram();
    program.exitOverride();

    expect(() => {
      program.parse([
        'node', 'cli.js', 'generate',
        '--spec', 'url',
        '--output', 'out',
      ]);
    }).toThrow();
  });
});
