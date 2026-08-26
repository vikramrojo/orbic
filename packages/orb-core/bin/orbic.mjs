#!/usr/bin/env node
// `orbic` CLI — builds a custom field into the six shipped artifacts
// (2 shapes x 3 targets), per the shader-build-pipeline spec's
// "Custom fields are built by CLI" requirement.
//
// The lint runs inside buildArtifacts and THROWS before anything is written,
// so "writes no artifacts when the lint fails" is structural here rather than
// a cleanup step that could itself fail halfway. This file must never create
// the output directory before calling it, or an invalid field would leave an
// empty directory behind and the guarantee would be weaker than it looks.

import { readFileSync, existsSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildArtifacts } from '../../../scripts/build-shaders.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const compositorsDir = resolve(repoRoot, 'packages/orb-core/shaders/compositors');

const USAGE = `orbic build-shader <field.orb> [options]

Builds a custom field into six artifacts (orb + surface, for GLSL, SkSL and
Metal). The field is linted against the portable subset first; if it fails,
nothing is written.

Options:
  --out-dir <dir>        Where to write all six artifacts (default: ./orbic-out)
  --metal-out-dir <dir>  Additionally write just the .metal artifacts here
  --name <name>          Artifact basename (default: the field file's basename)
  -h, --help             Show this message
`;

/** Minimal flag parser — deliberately no dependency for one command. */
export function parseArgs(argv) {
  const [command, ...rest] = argv;

  if (command === '-h' || command === '--help' || command === undefined) {
    return { command: 'help' };
  }

  if (command !== 'build-shader') {
    return { command: 'unknown', name: command };
  }

  const options = { command: 'build-shader', outDir: 'orbic-out' };
  const positional = [];

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '-h' || arg === '--help') return { command: 'help' };

    if (arg === '--out-dir' || arg === '--metal-out-dir' || arg === '--name') {
      const value = rest[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${arg} requires a value`);
      }
      if (arg === '--out-dir') options.outDir = value;
      else if (arg === '--metal-out-dir') options.metalOutDir = value;
      else options.name = value;
      i++;
      continue;
    }

    if (arg.startsWith('-')) throw new Error(`unknown option ${arg}`);
    positional.push(arg);
  }

  if (positional.length === 0) throw new Error('no field file given');
  if (positional.length > 1) {
    throw new Error(`expected one field file, got ${positional.length}: ${positional.join(', ')}`);
  }

  options.fieldPath = positional[0];
  return options;
}

export function buildShaderCommand(options) {
  const fieldPath = resolve(process.cwd(), options.fieldPath);

  if (!existsSync(fieldPath)) {
    throw new Error(`field file not found: ${options.fieldPath}`);
  }

  const fieldSource = readFileSync(fieldPath, 'utf8');
  const name = options.name ?? basename(fieldPath).replace(/\.orb$/, '');

  const compositors = {
    orb: readFileSync(resolve(compositorsDir, 'orb.orb'), 'utf8'),
    surface: readFileSync(resolve(compositorsDir, 'surface.orb'), 'utf8'),
  };

  // buildArtifacts lints and throws before writing. Passing the directories
  // straight through means no partial output is possible.
  return buildArtifacts({
    name,
    fieldSource,
    compositors,
    outDir: resolve(process.cwd(), options.outDir),
    metalOutDir: options.metalOutDir ? resolve(process.cwd(), options.metalOutDir) : undefined,
  });
}

function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`orbic: ${error.message}\n`);
    console.error(USAGE);
    return 2;
  }

  if (options.command === 'help') {
    console.log(USAGE);
    return 0;
  }

  if (options.command === 'unknown') {
    console.error(`orbic: unknown command "${options.name}"\n`);
    console.error(USAGE);
    return 2;
  }

  try {
    const artifacts = buildShaderCommand(options);
    console.log(`Wrote ${artifacts.length} artifact(s) to ${resolve(process.cwd(), options.outDir)}:`);
    for (const artifact of artifacts) console.log(`  ${artifact.fileName}`);
    return 0;
  } catch (error) {
    // A lint failure is the expected way to fail here, and its message
    // already names each violating rule and line.
    console.error(`orbic build-shader: ${error.message}`);
    console.error('\nNo artifacts were written.');
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}

export { main, USAGE };
