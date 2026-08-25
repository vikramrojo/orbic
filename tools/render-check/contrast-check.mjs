// Task 7.3 — contrast / legibility: renders each field x preset as a
// Surface and checks the WCAG contrast ratio between the single brightest
// rendered pixel (not the mean -- a hotspot must not pass on average) and
// an assumed body-text colour, against the AA-for-normal-text floor of
// 4.5:1 (specs/surface-component/spec.md).

import { listFields, getSksl } from './lib/build-artifact.mjs';
import { PRESETS, PRESET_NAMES } from './lib/presets.mjs';
import { renderSksl, makeUniforms, SURFACE_DEFAULT_SCALE } from './lib/canvaskit.mjs';
import { relativeLuminance8, contrastRatio } from './lib/color.mjs';

const WIDTH = 300;
const HEIGHT = 300;

export const WCAG_AA_NORMAL_TEXT = 4.5;

// Assumed body-text colour: white, matching surface.orb's own documented
// assumption ("light/white text over a dark, receded surface" -- see that
// file's header). If a future design direction uses dark text on a light
// surface instead, this constant -- and the assumption behind it -- both
// need revisiting together, not just the number.
export const BODY_TEXT_LUMINANCE = 1.0;

function findBrightestLuminance(frame) {
  let maxL = -1;
  let maxRgb = [0, 0, 0];
  const n = frame.width * frame.height;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const l = relativeLuminance8(frame.pixels[o], frame.pixels[o + 1], frame.pixels[o + 2]);
    if (l > maxL) {
      maxL = l;
      maxRgb = [frame.pixels[o], frame.pixels[o + 1], frame.pixels[o + 2]];
    }
  }
  return { luminance: maxL, rgb: maxRgb };
}

export async function checkContrast(field, presetName) {
  const preset = PRESETS[presetName];
  const uniforms = makeUniforms({
    width: WIDTH,
    height: HEIGHT,
    time: 0, // Surface is static; pulse has no observable effect at t=0 (docs/shader-abi.md)
    energy: preset.energy,
    coherence: preset.coherence,
    warmth: preset.warmth,
    pulse: preset.pulse,
    scale: SURFACE_DEFAULT_SCALE, // surface-only uniform; see lib/canvaskit.mjs
  });
  const frame = await renderSksl(getSksl(field, 'surface'), { width: WIDTH, height: HEIGHT, uniforms });
  const { luminance, rgb } = findBrightestLuminance(frame);
  const ratio = contrastRatio(BODY_TEXT_LUMINANCE, luminance);
  return { field, preset: presetName, luminance, rgb, ratio, pass: ratio >= WCAG_AA_NORMAL_TEXT };
}

export async function runContrastCheckForAllCombinations() {
  const fields = listFields();
  const results = [];
  for (const field of fields) {
    for (const presetName of PRESET_NAMES) {
      results.push(await checkContrast(field, presetName));
    }
  }
  return results;
}

async function main() {
  console.log('=== Task 7.3: contrast / legibility (surface, brightest pixel vs white body text) ===\n');
  const results = await runContrastCheckForAllCombinations();

  console.log('field         preset     brightest RGB      luminance   ratio    verdict  margin-to-4.5');
  let anyFail = false;
  for (const r of results) {
    if (!r.pass) anyFail = true;
    const rgbStr = `(${r.rgb[0]},${r.rgb[1]},${r.rgb[2]})`.padEnd(18);
    const margin = r.ratio - WCAG_AA_NORMAL_TEXT;
    console.log(
      `${r.field.padEnd(14)}${r.preset.padEnd(11)}${rgbStr}${r.luminance.toFixed(4).padEnd(12)}` +
        `${(r.ratio.toFixed(2) + ':1').padEnd(9)}${r.pass ? 'PASS' : 'FAIL'}     ${margin >= 0 ? '+' : ''}${margin.toFixed(2)}`
    );
  }
  console.log('');
  if (anyFail) {
    console.error(`FAIL: one or more field x preset combinations are below WCAG AA ${WCAG_AA_NORMAL_TEXT}:1.`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: all ${results.length} combinations meet WCAG AA ${WCAG_AA_NORMAL_TEXT}:1 against white body text.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
