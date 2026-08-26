import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// @ts-expect-error — plain .mjs CLI, no type declarations
import { buildShaderCommand, main, parseArgs } from '../bin/orbic.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const shippedField = resolve(here, '../shaders/fields/veils.orb');

/** A field that violates the portable subset: two-argument `atan` is banned. */
const INVALID_FIELD = `vec3 field(vec2 p, float t, float energy, float coherence, float warmth, float pulse) {
    float a = atan(p.y, p.x);
    return vec3(a, a, a);
}
`;

describe('orbic CLI — argument parsing', () => {
  it('parses a field path with defaults', () => {
    const options = parseArgs(['build-shader', './my-field.orb']);
    expect(options.command).toBe('build-shader');
    expect(options.fieldPath).toBe('./my-field.orb');
    expect(options.outDir).toBe('orbic-out');
  });

  it('parses the output and name options', () => {
    const options = parseArgs([
      'build-shader',
      'f.orb',
      '--out-dir',
      'dist',
      '--metal-out-dir',
      'metal',
      '--name',
      'custom',
    ]);
    expect(options).toMatchObject({ outDir: 'dist', metalOutDir: 'metal', name: 'custom' });
  });

  it('treats no arguments and --help as help', () => {
    expect(parseArgs([]).command).toBe('help');
    expect(parseArgs(['--help']).command).toBe('help');
    expect(parseArgs(['build-shader', 'f.orb', '--help']).command).toBe('help');
  });

  it('reports an unknown command rather than assuming build-shader', () => {
    expect(parseArgs(['frobnicate'])).toMatchObject({ command: 'unknown', name: 'frobnicate' });
  });

  it('rejects a flag with no value instead of silently consuming the next flag', () => {
    expect(() => parseArgs(['build-shader', 'f.orb', '--out-dir', '--name', 'x'])).toThrow(
      /--out-dir requires a value/
    );
  });

  it('rejects zero or multiple field files', () => {
    expect(() => parseArgs(['build-shader'])).toThrow(/no field file given/);
    expect(() => parseArgs(['build-shader', 'a.orb', 'b.orb'])).toThrow(/expected one field file/);
  });

  it('rejects an unknown option', () => {
    expect(() => parseArgs(['build-shader', 'f.orb', '--turbo'])).toThrow(/unknown option --turbo/);
  });
});

describe('orbic build-shader', () => {
  // Absolute paths throughout rather than process.chdir(): cwd is
  // process-global, and mutating it here could break any test file sharing
  // this worker.
  let workDir: string;
  const out = (...parts: string[]) => join(workDir, ...parts);

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'orbic-cli-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('emits all six artifacts — both shapes across all three targets', () => {
    const artifacts = buildShaderCommand({ fieldPath: shippedField, outDir: out('out') });

    expect(artifacts).toHaveLength(6);
    expect(new Set(artifacts.map((a: { fileName: string }) => a.fileName))).toEqual(
      new Set([
        'veils-orb.glsl',
        'veils-orb.sksl',
        'veils-orb.metal',
        'veils-surface.glsl',
        'veils-surface.sksl',
        'veils-surface.metal',
      ])
    );
    expect(readdirSync(out('out'))).toHaveLength(6);
  });

  it('gives the orb and surface shapes genuinely different compositors', () => {
    const artifacts = buildShaderCommand({ fieldPath: shippedField, outDir: out('out') });
    const orb = artifacts.find((a: { fileName: string }) => a.fileName === 'veils-orb.glsl');
    const surface = artifacts.find((a: { fileName: string }) => a.fileName === 'veils-surface.glsl');

    // Both shapes must render the new material, not the same output twice.
    expect(orb.content).not.toBe(surface.content);
    expect(orb.content).toContain('ORB_FADE_RADIUS');
    expect(surface.content).toContain('SURFACE_BLUR_RADIUS');
  });

  it('honours --name and --metal-out-dir', () => {
    buildShaderCommand({
      fieldPath: shippedField,
      outDir: out('out'),
      metalOutDir: out('metal'),
      name: 'custom',
    });

    expect(readdirSync(out('out')).sort()).toContain('custom-orb.glsl');
    // Only the Metal artifacts are duplicated into metalOutDir.
    expect(readdirSync(out('metal')).sort()).toEqual(['custom-orb.metal', 'custom-surface.metal']);
  });

  it('writes NO artifacts when the lint fails, and does not create the output directory', () => {
    writeFileSync(out('bad.orb'), INVALID_FIELD);

    expect(() => buildShaderCommand({ fieldPath: out('bad.orb'), outDir: out('out') })).toThrow(
      /shader lint failed/
    );

    // Not merely empty — absent. If the CLI created the directory before
    // linting, a failed build would leave a misleading empty output dir.
    expect(existsSync(out('out'))).toBe(false);
  });

  it('fails on a missing field file rather than emitting an empty shader', () => {
    expect(() => buildShaderCommand({ fieldPath: out('nope.orb'), outDir: out('out') })).toThrow(
      /field file not found/
    );
    expect(existsSync(out('out'))).toBe(false);
  });
});

describe('orbic CLI — exit codes', () => {
  let workDir: string;
  const out = (...parts: string[]) => join(workDir, ...parts);

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'orbic-cli-exit-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('exits 0 on success and 1 on a lint failure', () => {
    expect(main(['build-shader', shippedField, '--out-dir', out('ok')])).toBe(0);

    writeFileSync(out('bad.orb'), INVALID_FIELD);
    expect(main(['build-shader', out('bad.orb'), '--out-dir', out('nope')])).toBe(1);
    expect(existsSync(out('nope'))).toBe(false);
  });

  it('exits 2 on a usage error, distinguishing it from a failed build', () => {
    expect(main(['frobnicate'])).toBe(2);
    expect(main(['build-shader'])).toBe(2);
    expect(main(['--help'])).toBe(0);
  });

  it('names the violated rule and line so the failure is actionable', () => {
    writeFileSync(out('bad.orb'), INVALID_FIELD);
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((msg?: unknown) => {
      errors.push(String(msg));
    });

    main(['build-shader', out('bad.orb'), '--out-dir', out('unused')]);

    const combined = errors.join('\n');
    expect(combined).toMatch(/two-arg-atan/);
    expect(combined).toMatch(/line 2/);
    expect(combined).toMatch(/No artifacts were written/);
  });
});

describe('orbic CLI — packaging', () => {
  it('is registered as a bin so `orbic` resolves once installed', () => {
    const manifest = JSON.parse(readFileSync(resolve(here, '../package.json'), 'utf8'));
    expect(manifest.bin).toMatchObject({ orbic: './bin/orbic.mjs' });
    // Without this the bin would be missing from a published tarball.
    expect(manifest.files).toContain('bin');
  });
});
