#!/usr/bin/env node

import { Command, Option } from 'commander';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import ora from 'ora';
import { extractPaths, generateRemoteFiles, writeRemoteFiles } from './generator.js';

export interface CliArgs {
  spec?: string;
  typesPath?: string;
  output: string;
  client: string;
  grouping: 'single' | 'segment';
  depth: number;
  dryRun: boolean;
  quiet: boolean;
}

function getVersion(): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const pkgPath = path.resolve(__dirname, '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  return pkg.version;
}

function getNpxCommand(): string {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

export function createProgram(): Command {
  const program = new Command();

  program
    .name('sveltekit-openapi-remote')
    .description('Generate typed SvelteKit remote functions from OpenAPI specs')
    .version(getVersion());

  program
    .command('generate')
    .description('Generate remote function files from an OpenAPI spec or api.d.ts')
    .option('--spec <path|url>', 'OpenAPI spec file or URL (runs openapi-typescript)')
    .option('--types-path <path>', 'path to existing api.d.ts (skips type generation)')
    .requiredOption('--output <dir>', 'output directory for generated files')
    .requiredOption('--client <path>', 'import path to your initialized handlers file')
    .addOption(
      new Option('--grouping <mode>', 'file output mode')
        .choices(['single', 'segment'])
        .default('segment')
    )
    .option('--depth <n>', 'segment depth for file grouping', '1')
    .option('--dry-run', 'preview what files would be generated without writing', false)
    .option('--quiet', 'suppress all output except errors', false)
    .action(async (opts) => {
      try {
        const args = validateArgs(opts);
        await runGenerate(args);
      } catch (e) {
        console.error(chalk.red(`\nError: ${(e as Error).message}`));
        process.exit(1);
      }
    });

  return program;
}

export function validateArgs(opts: Record<string, any>): CliArgs {
  if (!opts.spec && !opts.typesPath) {
    throw new Error('must provide either --spec or --types-path');
  }
  if (opts.spec && opts.typesPath) {
    throw new Error('cannot provide both --spec and --types-path');
  }

  return {
    spec: opts.spec,
    typesPath: opts.typesPath,
    output: opts.output!,
    client: opts.client!,
    grouping: opts.grouping as 'single' | 'segment',
    depth: parseInt(opts.depth ?? '1', 10),
    dryRun: opts.dryRun ?? false,
    quiet: opts.quiet ?? false,
  };
}

function createLogger(quiet: boolean) {
  const noop = () => {};
  return {
    log: quiet ? noop : (...a: any[]) => console.log(...a),
    spinner: (text: string) => quiet ? { start: () => ({ succeed: noop, fail: noop }) } : ora(text),
  };
}

async function runGenerate(args: CliArgs): Promise<void> {
  const { log, spinner } = createLogger(args.quiet);

  log();
  log(chalk.bold('sveltekit-openapi-remote'));
  log();

  let typesPath = args.typesPath;

  // Step 1: Generate types from spec if needed
  if (args.spec) {
    if (args.dryRun) {
      log(`  ${chalk.dim('•')} Would run openapi-typescript on ${chalk.cyan(args.spec)}`);
      log(`  ${chalk.dim('•')} Would write api.d.ts to ${chalk.cyan(args.output)}`);
      log();
      log(chalk.yellow('Dry run: --spec requires running openapi-typescript to proceed.'));
      log(chalk.yellow('Use --types-path with an existing api.d.ts for a full dry run.'));
      return;
    }

    const s = spinner(`Running openapi-typescript on ${chalk.cyan(args.spec)}`).start();
    const outputTypesPath = path.join(args.output, 'api.d.ts');

    if (!fs.existsSync(args.output)) {
      fs.mkdirSync(args.output, { recursive: true });
    }

    try {
      execFileSync(getNpxCommand(), ['openapi-typescript', args.spec, '-o', outputTypesPath], {
        stdio: 'pipe',
      });
      s.succeed(`Types generated ${chalk.dim(`→ ${outputTypesPath}`)}`);
    } catch (e: any) {
      s.fail('openapi-typescript failed');
      const stderr = e?.stderr?.toString().trim();
      const detail = stderr ? `\n${stderr}` : '';
      throw new Error(`openapi-typescript failed. Is it installed? (npm install -D openapi-typescript)${detail}`);
    }

    typesPath = outputTypesPath;
  }

  // Step 2: Read types file
  const s2 = spinner(`Reading types from ${chalk.cyan(typesPath!)}`).start();

  if (!fs.existsSync(typesPath!)) {
    s2.fail(`Types file not found: ${typesPath}`);
    throw new Error(`Types file not found: ${typesPath}`);
  }
  const apiTypesContent = fs.readFileSync(typesPath!, 'utf-8');
  s2.succeed(`Types loaded from ${chalk.cyan(typesPath!)}`);

  // Step 3: Extract paths
  const s3 = spinner('Extracting API paths').start();
  const paths = extractPaths(apiTypesContent);
  s3.succeed(`Found ${chalk.green(paths.length.toString())} API paths`);

  // Step 4: Generate files
  const s4 = spinner('Generating remote functions').start();
  const files = generateRemoteFiles(paths, {
    output: args.output,
    clientImport: args.client,
    grouping: args.grouping,
    depth: args.depth,
  });
  s4.succeed(`Generated ${chalk.green(files.size.toString())} file(s)`);

  // Step 5: Write files (or preview for dry run)
  if (args.dryRun) {
    log();
    log(chalk.bold.yellow('Dry run') + ' — files that would be generated:');
    log();
    for (const filename of files.keys()) {
      log(`  ${chalk.dim('•')} ${path.join(args.output, filename)}`);
    }
    log();
    return;
  }

  const s5 = spinner(`Writing to ${chalk.cyan(args.output)}`).start();
  writeRemoteFiles(files, args.output);
  s5.succeed(`Written to ${chalk.cyan(args.output)}`);

  // Summary
  log();
  log(`${chalk.bold.green('Done!')} Generated files:`);
  log();
  for (const filename of files.keys()) {
    log(`  ${chalk.dim('•')} ${filename}`);
  }
  log();
}

// Only run when executed directly (not when imported by tests)
const thisFile = fs.realpathSync(fileURLToPath(import.meta.url));
const entryFile = process.argv[1] ? fs.realpathSync(path.resolve(process.argv[1])) : '';
if (thisFile === entryFile) {
  createProgram().parseAsync();
}
