// Proves the rendering harness itself before anything else in this
// directory is trusted -- a rendering comparator has more ways to be
// silently wrong than a linter (a sign flip, a swapped axis, a bad
// threshold), and a false result here would be repeating exactly the
// mistake this batch was warned about: a diagnostic that reports a
// specific, plausible-looking wrong number because of a bug in the
// diagnostic, not in the thing it's checking.
//
// Three checks:
//   1. Two renders of the IDENTICAL shader must report zero difference.
//   2. Two renders of a DELIBERATELY DIFFERENT shader must report a large
//      difference.
//   3. The real aspect-check logic (imported, not reimplemented) must PASS
//      a correct, min()-based radial shader and must FAIL a deliberately
//      stretched one -- both directions, not just the failing one, so a
//      systematic "always reports large diff" bug in the comparator
//      couldn't masquerade as "the check correctly caught a bug."

import { renderSksl, makeUniforms, meanAbsDiff } from './lib/canvaskit.mjs';
import { checkAspectDistortion, MEAN_DIFF_TOLERANCE } from './aspect-check.mjs';

const SOLID_RED_SKSL = `
uniform float2 u_resolution;
uniform float u_time;
uniform float u_energy;
uniform float u_coherence;
uniform float u_warmth;
uniform float u_pulse;
half4 main(float2 fragCoord) {
    return half4(1.0, 0.0, 0.0, 1.0);
}
`;

const SOLID_BLUE_SKSL = `
uniform float2 u_resolution;
uniform float u_time;
uniform float u_energy;
uniform float u_coherence;
uniform float u_warmth;
uniform float u_pulse;
half4 main(float2 fragCoord) {
    return half4(0.0, 0.0, 1.0, 1.0);
}
`;

// A correct reference: world-space `p` via the same min()-based formula
// every real epilogue uses, producing a filled disc. Radially symmetric,
// so it renders as a circle at any aspect ratio if (and only if) the
// coordinate convention is right.
const CORRECT_DISC_SKSL = `
uniform float2 u_resolution;
uniform float u_time;
uniform float u_energy;
uniform float u_coherence;
uniform float u_warmth;
uniform float u_pulse;
half4 main(float2 fragCoord) {
    vec2 p = (fragCoord - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
    float d = length(p);
    float v = 1.0 - smoothstep(0.28, 0.32, d);
    return half4(v, v, v, 1.0);
}
`;

// A deliberately BROKEN reference, reproducing the exact historical bug
// class this ABI exists to prevent: Silk Cascade's original
// `(uv - 0.5) * vec2(aspect, 1.0)` per-axis correction (see
// packages/orb-core/shaders/fields/silk.orb's header). Same disc pattern,
// wrong coordinate convention -- it should render as an oval, not a circle,
// and the aspect check must catch that.
const STRETCHED_DISC_SKSL = `
uniform float2 u_resolution;
uniform float u_time;
uniform float u_energy;
uniform float u_coherence;
uniform float u_warmth;
uniform float u_pulse;
half4 main(float2 fragCoord) {
    vec2 uv = fragCoord / u_resolution;
    vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
    vec2 p = (uv - 0.5) * aspect;
    float d = length(p);
    float v = 1.0 - smoothstep(0.28, 0.32, d);
    return half4(v, v, v, 1.0);
}
`;

async function testIdenticalRendersAreZeroDiff() {
  const uniforms = makeUniforms({ width: 64, height: 64, time: 0, energy: 0.6, coherence: 0.4, warmth: 0.7, pulse: 0 });
  const a = await renderSksl(CORRECT_DISC_SKSL, { width: 64, height: 64, uniforms });
  const b = await renderSksl(CORRECT_DISC_SKSL, { width: 64, height: 64, uniforms });
  const diff = meanAbsDiff(a, b);
  const pass = diff.r === 0 && diff.g === 0 && diff.b === 0 && diff.a === 0;
  return { name: '1. Identical renders -> zero difference', pass, detail: JSON.stringify(diff) };
}

async function testDifferentRendersAreLargeDiff() {
  const uniforms = makeUniforms({ width: 64, height: 64 });
  const red = await renderSksl(SOLID_RED_SKSL, { width: 64, height: 64, uniforms });
  const blue = await renderSksl(SOLID_BLUE_SKSL, { width: 64, height: 64, uniforms });
  const diff = meanAbsDiff(red, blue);
  // Solid red (255,0,0) vs solid blue (0,0,255): r and b should each differ
  // by the full 255.
  const pass = diff.r === 255 && diff.b === 255;
  return { name: '2. Deliberately different renders -> large difference', pass, detail: JSON.stringify(diff) };
}

async function testAspectCheckPassesCorrectShader() {
  const result = await checkAspectDistortion(CORRECT_DISC_SKSL);
  return {
    name: '3a. Aspect check PASSES a correct (min()-based) shader',
    pass: result.pass,
    detail: `worst per-channel mean diff = ${result.worstStrictDiff.toFixed(3)}/255 (tolerance ${MEAN_DIFF_TOLERANCE})`,
  };
}

async function testAspectCheckFailsStretchedShader() {
  const result = await checkAspectDistortion(STRETCHED_DISC_SKSL);
  // Must fail, and fail by a wide, unambiguous margin -- not just barely
  // over the tolerance, which would suggest the check is only marginally
  // sensitive rather than genuinely measuring the distortion.
  const failsClearly = !result.pass && result.worstStrictDiff > MEAN_DIFF_TOLERANCE * 5;
  return {
    name: '3b. Aspect check FAILS a deliberately stretched shader',
    pass: failsClearly,
    detail: `worst per-channel mean diff = ${result.worstStrictDiff.toFixed(3)}/255 (tolerance ${MEAN_DIFF_TOLERANCE}, must exceed it by 5x+ to count as a clear catch)`,
  };
}

async function main() {
  console.log('=== Harness self-tests ===\n');
  const tests = [
    testIdenticalRendersAreZeroDiff,
    testDifferentRendersAreLargeDiff,
    testAspectCheckPassesCorrectShader,
    testAspectCheckFailsStretchedShader,
  ];

  let anyFail = false;
  for (const test of tests) {
    const result = await test();
    if (!result.pass) anyFail = true;
    console.log(`${result.pass ? 'PASS' : 'FAIL'}  ${result.name}`);
    console.log(`      ${result.detail}`);
  }

  console.log('');
  if (anyFail) {
    console.error('FAIL: the harness itself did not pass its own self-tests -- do not trust its other output.');
    process.exitCode = 1;
  } else {
    console.log('PASS: harness self-tests all green -- safe to trust aspect-check.mjs, brand-unity-check.mjs, and contrast-check.mjs.');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
