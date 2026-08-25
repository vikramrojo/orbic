import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error — plain JS module, not part of the orb-core TS project.
import { loadCanvasKit, validateSkslWithCanvasKit } from '../../../scripts/check-shaders.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const generatedDir = resolve(here, '../shaders/generated');

// canvaskit-wasm is real Skia compiled to WASM — no native build step, no
// GPU, safe to load once and reuse across assertions in this file.
let CanvasKit: unknown;

beforeAll(async () => {
  CanvasKit = await loadCanvasKit();
}, 30_000);

describe('SkSL validation via the real Skia compiler (canvaskit-wasm)', () => {
  it('accepts the generated flat-color-orb.sksl artifact', () => {
    const source = readFileSync(resolve(generatedDir, 'flat-color-orb.sksl'), 'utf8');
    const result = validateSkslWithCanvasKit(CanvasKit, source);
    expect(result.ok, result.ok ? '' : result.error).toBe(true);
  });

  it('accepts the generated flat-color-surface.sksl artifact', () => {
    const source = readFileSync(resolve(generatedDir, 'flat-color-surface.sksl'), 'utf8');
    const result = validateSkslWithCanvasKit(CanvasKit, source);
    expect(result.ok, result.ok ? '' : result.error).toBe(true);
  });

  it('rejects deliberately broken SkSL, with a real compiler error', () => {
    const broken = 'half4 main(float2 fragCoord) { return this is not valid sksl; }';
    const result = validateSkslWithCanvasKit(CanvasKit, broken);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/error/i);
  });
});
