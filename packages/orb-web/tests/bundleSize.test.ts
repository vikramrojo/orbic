import { describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webSrc = resolve(here, '../src');
const repoRoot = resolve(here, '../../..');

/**
 * Task 10.1 — a field a consumer does not use must not reach their bundle.
 *
 * Asserted by actually bundling, not by reading the import graph. The failure
 * this guards against is a barrel import: bundlers cannot drop unused
 * PROPERTIES of an object literal, so `FIELD_SHADERS[name]` pulls in every
 * field's source no matter how few are used. Static analysis of imports would
 * not notice, because the import genuinely is "one module" — it is the
 * object's contents that defeat tree-shaking.
 *
 * These bundle the TypeScript sources directly rather than the built package,
 * so the test does not depend on `pnpm build` having run first.
 */
async function bundle(entryContents: string): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'orbic-bundle-'));
  try {
    const entry = join(dir, 'entry.ts');
    writeFileSync(entry, entryContents);

    const result = await build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      format: 'esm',
      // Production settings: tree-shaking only does its job with minification
      // and no dev-only branches retained.
      minify: true,
      treeShaking: true,
      define: { 'process.env.NODE_ENV': '"production"' },
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      alias: {
        '@orbic/core': resolve(repoRoot, 'packages/orb-core/src/index.ts'),
      },
      loader: { '.ts': 'ts', '.tsx': 'tsx' },
      jsx: 'automatic',
      logLevel: 'silent',
    });

    return result.outputFiles![0]!.text;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('per-field entry points (task 10.1)', () => {
  it('a one-field consumer does not ship the other fields', async () => {
    const code = await bundle(`
      import { Orb, registerField } from '${webSrc}/minimal.ts';
      import veils from '${webSrc}/generated/fields/veils.ts';
      registerField('veils', veils);
      export { Orb };
    `);

    // The field that WAS imported is present...
    expect(code).toContain('VEIL_LAYER_COUNT');

    // ...and the ones that were not are absent. These are large: chladni,
    // silk and motes are tens of kB of shader source each.
    expect(code).not.toContain('chladniPattern');
    expect(code).not.toContain('fabricFold');
    expect(code).not.toContain('motePosition');
  }, 60_000);

  it('the all-fields entry point does ship them all, by design', async () => {
    const code = await bundle(`
      import { Orb } from '${webSrc}/index.ts';
      export { Orb };
    `);

    // The convenience of `<Orb field="anything" />` is exactly this cost.
    for (const marker of ['VEIL_LAYER_COUNT', 'chladniPattern', 'fabricFold', 'motePosition']) {
      expect(code, `all-fields entry should contain ${marker}`).toContain(marker);
    }
  }, 60_000);

  it('is dramatically smaller for one field than for all of them', async () => {
    const [oneField, allFields] = await Promise.all([
      bundle(`
        import { Orb, registerField } from '${webSrc}/minimal.ts';
        import veils from '${webSrc}/generated/fields/veils.ts';
        registerField('veils', veils);
        export { Orb };
      `),
      bundle(`
        import { Orb } from '${webSrc}/index.ts';
        export { Orb };
      `),
    ]);

    // Not an arbitrary threshold: four of five fields' sources are the
    // difference, so anything close to parity means tree-shaking silently
    // stopped working.
    expect(oneField.length).toBeLessThan(allFields.length * 0.65);
  }, 90_000);

  it('renders the flat fallback for a field nobody registered, rather than crashing', () => {
    // The minimal entry point makes unregistered fields a normal state, so the
    // renderer must treat it like a failed compile, not an exception.
    const renderFrame = readFileSync(resolve(webSrc, 'gl/renderFrame.ts'), 'utf8');
    expect(renderFrame).toMatch(/const sources = fieldSources\(fieldName\)/);
    expect(renderFrame).toMatch(/if \(!sources\) \{[\s\S]*?paintFallback\(/);
  });

  it('exposes the subpaths a consumer needs', () => {
    const manifest = JSON.parse(readFileSync(resolve(here, '../package.json'), 'utf8'));
    expect(manifest.exports).toHaveProperty('./minimal');
    expect(manifest.exports).toHaveProperty('./fields/*');
  });
});

/** Task 10.2 — record the measured figures rather than asserting a target. */
describe('bundle size (task 10.2)', () => {
  it('reports the measured web bundle size for a one-field consumer', async () => {
    const oneField = await bundle(`
      import { Orb, registerField } from '${webSrc}/minimal.ts';
      import veils from '${webSrc}/generated/fields/veils.ts';
      registerField('veils', veils);
      export { Orb };
    `);
    const allFields = await bundle(`
      import { Orb } from '${webSrc}/index.ts';
      export { Orb };
    `);

    const kb = (s: string) => Math.round((s.length / 1024) * 10) / 10;
    // Printed, not asserted: these are measurements, and pinning them would
    // turn every shader edit into a failing test.
    console.log(
      `[bundle size] minified ESM, react external — one field: ${kb(oneField)} kB, all five: ${kb(allFields)} kB`
    );

    expect(oneField.length).toBeGreaterThan(0);
  }, 90_000);
});
