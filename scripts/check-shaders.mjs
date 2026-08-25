#!/usr/bin/env node
// Validates the shader pipeline as far as this environment honestly can.
//
// SkSL — validated for real, via `canvaskit-wasm` (the actual Skia compiler
// compiled to WASM). `CanvasKit.RuntimeEffect.Make(source)` is exactly what
// Skia's own RuntimeEffect path uses; a null return with an error string is
// a genuine rejection by the real compiler, not a heuristic.
//
// GLSL ES 3.00 — NOT validated here. Two real attempts were made and both
// failed for documented reasons (see README notes below and the handback
// that accompanied this file): `@webgpu/glslang`'s only exposed API
// (`compileGLSL`) is SPIR-V-only and enforces GLSL ES 3.10+ with explicit
// `layout(location=...)` outputs — a different, stricter dialect than our
// real WebGL2/GLSL-ES-3.00 target — and it hangs indefinitely on a second
// call in the same process. `gl` (headless-gl) fails to build on this
// machine: its vendored ANGLE subproject shells out to a literal `python`
// binary, which isn't on PATH here (only `python3`/`python3.14`). This is
// reported honestly rather than papered over with a regex "validator".
//
// Metal stays CI-only (`xcrun metal` requires a full Xcode install, not
// available here — see .github/workflows/ci.yml's shader-compile-metal
// job).

import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArtifacts } from './build-shaders.mjs';

const require = createRequire(import.meta.url);
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fieldsDir = resolve(rootDir, 'packages/orb-core/shaders/fields');
const compositorsDir = resolve(rootDir, 'packages/orb-core/shaders/compositors');

/** Loads the real Skia WASM compiler. Resolved once and reused — safe to call RuntimeEffect.Make repeatedly on the same instance. */
export async function loadCanvasKit() {
  const CanvasKitInit = (await import('canvaskit-wasm')).default;
  const canvaskitEntry = require.resolve('canvaskit-wasm/bin/canvaskit.js');
  const binDir = dirname(canvaskitEntry);
  return CanvasKitInit({ locateFile: (file) => resolve(binDir, file) });
}

/** Compiles `source` as SkSL via the real Skia RuntimeEffect compiler. */
export function validateSkslWithCanvasKit(CanvasKit, source) {
  let errorText = '';
  const effect = CanvasKit.RuntimeEffect.Make(source, (err) => {
    errorText = err;
  });
  if (effect) {
    effect.delete();
    return { ok: true };
  }
  return { ok: false, error: errorText };
}

function collectAllArtifacts() {
  // Both shapes now have their real compositor: orb.orb (task 5.1) and
  // surface.orb (task 6.4).
  const fieldFiles = readdirSync(fieldsDir).filter((f) => f.endsWith('.orb'));
  const orbCompositorSource = readFileSync(resolve(compositorsDir, 'orb.orb'), 'utf8');
  const surfaceCompositorSource = readFileSync(resolve(compositorsDir, 'surface.orb'), 'utf8');
  const results = [];
  for (const fieldFile of fieldFiles) {
    const fieldSource = readFileSync(resolve(fieldsDir, fieldFile), 'utf8');
    const name = fieldFile.replace(/\.orb$/, '');
    const artifacts = buildArtifacts({
      name,
      fieldSource,
      compositors: { orb: orbCompositorSource, surface: surfaceCompositorSource },
    });
    results.push(...artifacts);
  }
  return results;
}

async function main() {
  let exitCode = 0;

  console.log('check-shaders: rebuilding and linting all known field/compositor pairs...');
  let artifacts;
  try {
    artifacts = collectAllArtifacts();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
    return;
  }
  console.log(`  built ${artifacts.length} artifact(s), all lint-clean (see scripts/lint-shader.mjs)`);
  console.log('');

  console.log('check-shaders: SkSL — validating with canvaskit-wasm (real Skia RuntimeEffect compiler)...');
  const CanvasKit = await loadCanvasKit();
  const skslArtifacts = artifacts.filter((a) => a.target === 'sksl');
  for (const artifact of skslArtifacts) {
    const result = validateSkslWithCanvasKit(CanvasKit, artifact.content);
    if (result.ok) {
      console.log(`  OK    ${artifact.fileName}`);
    } else {
      console.error(`  FAIL  ${artifact.fileName}`);
      console.error(result.error);
      exitCode = 1;
    }
  }
  console.log('');

  console.log('check-shaders: GLSL ES 3.00 — NOT VALIDATED in this environment.');
  console.log('  Two real compilers were tried and both failed:');
  console.log('    - @webgpu/glslang: only compiles to SPIR-V, which requires GLSL ES 3.10+');
  console.log('      with explicit `layout(location=...)` outputs — a different dialect than');
  console.log('      our real WebGL2/GLSL-ES-3.00 target — and it hangs on a second call in');
  console.log('      the same process. Not usable.');
  console.log('    - gl (headless-gl): fails to build here — its vendored ANGLE subproject');
  console.log('      shells out to a literal `python` binary not present on this machine');
  console.log('      (only python3 is installed).');
  console.log('  This is a real, unresolved gap, not a passing check — do not treat this');
  console.log('  message as equivalent to a compile.');
  console.log('');

  console.log('check-shaders: Metal — deferred to CI (requires a full Xcode install; this');
  console.log('  machine has Command Line Tools only). See .github/workflows/ci.yml.');

  process.exit(exitCode);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
