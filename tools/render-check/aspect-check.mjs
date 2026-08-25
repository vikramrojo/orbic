// Task 6.6 — aspect-distortion regression: renders each field's *surface*
// artifact at 400x180, 180x400 and 300x300 and asserts a shared central
// region matches across all three, per-channel mean absolute difference
// <= 1/255.
//
// Two subtleties, found by actually running this rather than assuming it
// would work, both documented here because getting either wrong would make
// this check pass or fail vacuously in exactly the way the batch warned
// about:
//
// 1. 400x180 and 180x400 share a minimum dimension of 180, but 300x300 does
//    not (its minimum dimension is 300). Since world-space `p` is
//    `(fragCoord - 0.5*resolution) / min(resolution.x, resolution.y) *
//    scale`, pixel density per world-space unit differs between a
//    minimum-dimension-180 canvas and a minimum-dimension-300 canvas. A raw
//    pixel crop of "the central 180x180 pixels" from the 300x300 render
//    therefore covers a SMALLER slice of world space than the central
//    180x180 crop of the other two (+/-0.3 vs +/-0.5, in scale=1 units) --
//    comparing those two crops directly reports a large, spurious
//    difference for a perfectly correct, unstretched field, because
//    they're different zoom levels of the same image, not because of any
//    real distortion.
//
// 2. The natural fix -- render 300x300, then resample it down to 180x180 --
//    turns out to have its own, smaller but real, cost: any resampling
//    filter (nearest-neighbour, area-average, both were tried) introduces
//    a small but nonzero and *reproducible* discrepancy for Chladni
//    specifically, because Chladni's cos()-based interference pattern is
//    higher-frequency than the other fields' (sharp near-nodal-line
//    gradients), so it's more sensitive to exactly which discrete pixel
//    grid samples it. Both resampling methods put Chladni at ~1.5-2/255
//    while every other field stayed under 0.3/255 -- and switching methods
//    made Chladni's number move (1.515 -> 1.931), not converge, which is
//    itself evidence the resampling step was the source, not the field.
//    Confirmed directly: a NATIVE 180x180 render (no resampling at all)
//    compared against the 400x180 central crop gives an exact
//    `{r:0,g:0,b:0,a:0}` for Chladni. Since world-space `p` under the
//    min()-normalisation depends only on a canvas's ASPECT RATIO, not its
//    absolute pixel count, a native 180x180 render and an ideal
//    infinite-resolution downsample of 300x300 are mathematically the same
//    image -- the native render just has no resampling step to introduce
//    error.
//
// So: the STRICT, tolerance-gated comparison here is among three natively-
// rendered, resampling-free 180x180 regions (400x180's and 180x400's
// central crops, plus a native 180x180 render standing in for the "square"
// case). The literal 300x300 render is still genuinely produced and
// reported (compared against the native 180x180 with a wide, clearly
// separate, informational-only tolerance) so "render at 300x300" is
// actually exercised, not silently dropped -- see `runAspectCheckForAllFields`.

import { listFields, getSksl } from './lib/build-artifact.mjs';
import { renderSksl, makeUniforms, cropRegion, resizeAreaAverage, meanAbsDiff, SURFACE_DEFAULT_SCALE } from './lib/canvaskit.mjs';

export const REGION_SIZE = 180;
export const RECTANGULAR_SIZES = [
  { width: 400, height: 180 },
  { width: 180, height: 400 },
];
export const MEAN_DIFF_TOLERANCE = 1; // per channel, out of 255 -- the strict, binding assertion
export const INFORMATIONAL_RESAMPLE_TOLERANCE = 5; // per channel, out of 255 -- 300x300 vs native, resampling noise expected

/**
 * Renders `sksl` at `width`x`height` and crops the central REGION_SIZE x
 * REGION_SIZE region -- valid only when `min(width, height) === REGION_SIZE`,
 * which both RECTANGULAR_SIZES entries satisfy by construction.
 */
async function renderRectangularRegion(sksl, width, height, uniformsFor) {
  const shorter = Math.min(width, height);
  if (shorter !== REGION_SIZE) {
    throw new Error(
      `renderRectangularRegion: expected the shorter dimension to equal REGION_SIZE (${REGION_SIZE}), ` +
        `got ${width}x${height}. The crop below assumes that relationship.`
    );
  }
  const frame = await renderSksl(sksl, { width, height, uniforms: uniformsFor(width, height) });
  const x0 = width > height ? Math.round((width - REGION_SIZE) / 2) : 0;
  const y0 = height > width ? Math.round((height - REGION_SIZE) / 2) : 0;
  return cropRegion(frame, x0, y0, REGION_SIZE, REGION_SIZE);
}

/**
 * Renders `sksl` at the three standard test sizes with a fixed, consistent
 * channel setting (t=0, matching a Surface's static single frame).
 *
 * Returns:
 *   - `strictDiffs` / `worstStrictDiff` / `pass`: the binding comparison
 *     among 400x180's crop, 180x400's crop, and a native 180x180 render
 *     (see file header for why the square case is rendered natively rather
 *     than resampled from 300x300).
 *   - `resampleCheck`: 300x300 (rendered for real) vs the same native
 *     180x180 reference, area-averaged down, reported against a much wider
 *     informational tolerance -- expected to show *some* difference (that's
 *     the resampling noise documented above), not gated into pass/fail.
 *
 * `scale`, if given, is appended as an 8th uniform float (`u_scale`) --
 * real surface artifacts need this (see lib/canvaskit.mjs); self-test.mjs's
 * synthetic shaders don't declare that uniform at all, so they call this
 * with no `scale`, and must not have one silently assumed for them.
 */
export async function checkAspectDistortion(sksl, { scale } = {}) {
  const uniformsFor = (width, height) =>
    makeUniforms({ width, height, time: 0, energy: 0.5, coherence: 0.5, warmth: 0.5, pulse: 0, scale });

  const rectRegions = await Promise.all(
    RECTANGULAR_SIZES.map(async (size) => ({
      size,
      region: await renderRectangularRegion(sksl, size.width, size.height, uniformsFor),
    }))
  );

  const nativeSquare = await renderSksl(sksl, {
    width: REGION_SIZE,
    height: REGION_SIZE,
    uniforms: uniformsFor(REGION_SIZE, REGION_SIZE),
  });

  const strictRegions = [...rectRegions, { size: { width: REGION_SIZE, height: REGION_SIZE, label: 'native' }, region: nativeSquare }];
  const pairs = [
    [0, 1],
    [0, 2],
    [1, 2],
  ];
  const strictDiffs = pairs.map(([i, j]) => ({
    a: strictRegions[i].size,
    b: strictRegions[j].size,
    diff: meanAbsDiff(strictRegions[i].region, strictRegions[j].region),
  }));
  const worstStrictDiff = Math.max(...strictDiffs.flatMap(({ diff }) => [diff.r, diff.g, diff.b]));

  // 300x300 is still genuinely rendered and checked, just not held to the
  // zero-resampling-error tolerance -- see file header.
  const frame300 = await renderSksl(sksl, { width: 300, height: 300, uniforms: uniformsFor(300, 300) });
  const resampled300 = resizeAreaAverage(frame300, REGION_SIZE, REGION_SIZE);
  const resampleDiff = meanAbsDiff(resampled300, nativeSquare);
  const worstResampleDiff = Math.max(resampleDiff.r, resampleDiff.g, resampleDiff.b);

  return {
    strictDiffs,
    worstStrictDiff,
    pass: worstStrictDiff <= MEAN_DIFF_TOLERANCE,
    resampleCheck: {
      diff: resampleDiff,
      worst: worstResampleDiff,
      pass: worstResampleDiff <= INFORMATIONAL_RESAMPLE_TOLERANCE,
    },
  };
}

export async function runAspectCheckForAllFields() {
  const fields = listFields();
  const results = [];
  for (const field of fields) {
    const sksl = getSksl(field, 'surface');
    const result = await checkAspectDistortion(sksl, { scale: SURFACE_DEFAULT_SCALE });
    results.push({ field, ...result });
  }
  return results;
}

async function main() {
  console.log('=== Task 6.6: aspect-distortion regression (surface artifacts) ===\n');
  const results = await runAspectCheckForAllFields();
  let anyFail = false;
  for (const { field, strictDiffs, worstStrictDiff, pass, resampleCheck } of results) {
    console.log(`${field}: worst strict per-channel mean diff = ${worstStrictDiff.toFixed(3)}/255 -> ${pass ? 'PASS' : 'FAIL'}`);
    for (const { a, b, diff } of strictDiffs) {
      const labelA = a.label ?? `${a.width}x${a.height}`;
      const labelB = b.label ?? `${b.width}x${b.height}`;
      console.log(`    ${labelA} vs ${labelB}: r=${diff.r.toFixed(3)} g=${diff.g.toFixed(3)} b=${diff.b.toFixed(3)}`);
    }
    console.log(
      `    [informational] literal 300x300 (area-averaged to 180) vs native 180x180: ` +
        `worst=${resampleCheck.worst.toFixed(3)}/255 (tolerance ${INFORMATIONAL_RESAMPLE_TOLERANCE}, not gated into pass/fail)`
    );
    if (!pass) anyFail = true;
  }
  console.log('');
  if (anyFail) {
    console.error('FAIL: one or more fields exceed the aspect-distortion tolerance.');
    process.exitCode = 1;
  } else {
    console.log('PASS: all fields hold their central region across 400x180, 180x400 and a native 180x180 square (300x300 also rendered and checked informationally).');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
