import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const read = (relative: string) => readFileSync(resolve(src, relative), 'utf8');

/**
 * Source with comments stripped. Needed because these files *discuss*
 * Reanimated in their own doc comments while deliberately not importing it —
 * matching raw text would flag the explanation as the violation.
 */
const readCode = (relative: string) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

/**
 * Task 8.4 — `<Surface>` must render in a project without Reanimated
 * installed, and task 8.3 — Reanimated must be genuinely optional.
 *
 * These are asserted structurally, against the source, rather than by
 * rendering: Metro resolves imports at BUILD time, so what decides whether a
 * Surface-only consumer can bundle at all is the import graph, not runtime
 * behaviour. A test that rendered `<Surface>` with Reanimated mocked would
 * pass even if a static import made the package unbundleable for that
 * consumer — it would be testing the wrong layer.
 */
describe('Reanimated is genuinely optional', () => {
  it('Surface reaches no Reanimated API and no animation runtime', () => {
    const surface = readCode('Surface.tsx');
    expect(surface).not.toMatch(/react-native-reanimated/);
    expect(surface).not.toMatch(/useOrbUniforms/);
    expect(surface).not.toMatch(/reanimated/i);
  });

  it('no module imports react-native-reanimated statically', () => {
    // A static `import ... from 'react-native-reanimated'` anywhere in the
    // package would make Metro treat it as a hard dependency, so a consumer
    // without it installed would fail to bundle rather than fall back.
    for (const file of ['index.ts', 'Orb.tsx', 'Surface.tsx', 'runtime/useOrbUniforms.ts', 'runtime/effects.ts']) {
      expect(readCode(file)).not.toMatch(/^\s*import\s[^\n]*['"]react-native-reanimated['"]/m);
    }
  });

  it('resolves Reanimated lazily, and tolerates it being absent', () => {
    const module = readCode('runtime/reanimated.ts');
    expect(module).toMatch(/require\(['"]react-native-reanimated['"]\)/);
    // The require must be guarded — an unguarded one throws at import time in
    // a project that does not have it.
    expect(module).toMatch(/try\s*\{/);
    expect(module).toMatch(/catch/);
  });

  it('declares Reanimated optional in the manifest, and Skia required', () => {
    const manifest = JSON.parse(read('../package.json'));
    expect(manifest.peerDependencies).toHaveProperty('react-native-reanimated');
    expect(manifest.peerDependencies).toHaveProperty('@shopify/react-native-skia');
    expect(manifest.peerDependenciesMeta?.['react-native-reanimated']?.optional).toBe(true);
    // Skia must NOT be optional — both components need it.
    expect(manifest.peerDependenciesMeta?.['@shopify/react-native-skia']?.optional).toBeUndefined();
    // The components are React components.
    expect(manifest.peerDependencies).toHaveProperty('react');
  });
});

describe('Surface is always static', () => {
  it('schedules no ongoing work', () => {
    const surface = readCode('Surface.tsx');
    // No animation loop of any kind: this is what makes "always static"
    // structural rather than a default someone could flip.
    expect(surface).not.toMatch(/requestAnimationFrame/);
    expect(surface).not.toMatch(/setInterval/);
    expect(surface).not.toMatch(/useFrameCallback/);
  });

  it('pins the shader clock at zero so a preset always renders the same frame', () => {
    expect(readCode('Surface.tsx')).toMatch(/u_time:\s*0/);
  });

  it('never absorbs touches, since it sits behind content', () => {
    expect(readCode('Surface.tsx')).toMatch(/pointerEvents="none"/);
  });
});
