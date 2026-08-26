// Task 6.7 — brand unity: for a field, the orb and surface artifacts must
// genuinely differ (the compositors really are different shapes, not the
// same image twice), and swapping the field must change BOTH shapes. That
// second assertion is the actual claim this project is built around: swap
// the material, both shapes reskin together, by construction rather than
// convention.

import { listFields, getSksl } from './lib/build-artifact.mjs';
import { renderSksl, makeUniforms, meanAbsDiff, ORB_DEFAULT_EDGE, SURFACE_DEFAULT_SCALE } from './lib/canvaskit.mjs';

const WIDTH = 200;
const HEIGHT = 200;
// Sum of per-channel mean-abs-diff (r+g+b) above which two renders are
// considered "genuinely different" rather than noise-level identical.
// Chosen well below what any real shape/material change produces (orb vs
// surface differs by an entire alpha-masked region; a field swap changes
// almost every pixel's colour) and well above float/rounding noise (which
// this check doesn't exercise -- these are exact re-renders, not repeated
// samples of a random process).
export const DIFFERENCE_THRESHOLD = 2.0;

function sumRGB(diff) {
  return diff.r + diff.g + diff.b;
}

export async function checkBrandUnity(fieldA, fieldB) {
  // Orb and surface take different uniform counts: only the surface
  // epilogue has a `u_scale` uniform (see lib/canvaskit.mjs) -- reusing one
  // array for both would either be rejected outright (wrong length) or, at
  // matching lengths by coincidence, silently misalign a uniform, which is
  // the exact failure mode renderSksl's own defensive check exists to catch.
  const orbUniforms = makeUniforms({
    width: WIDTH, height: HEIGHT, time: 0, energy: 0.6, coherence: 0.5, warmth: 0.5, pulse: 0,
    edge: ORB_DEFAULT_EDGE,
  });
  const surfaceUniforms = makeUniforms({
    width: WIDTH, height: HEIGHT, time: 0, energy: 0.6, coherence: 0.5, warmth: 0.5, pulse: 0,
    scale: SURFACE_DEFAULT_SCALE,
  });
  const render = (field, shape) =>
    renderSksl(getSksl(field, shape), { width: WIDTH, height: HEIGHT, uniforms: shape === 'orb' ? orbUniforms : surfaceUniforms });

  const orbA = await render(fieldA, 'orb');
  const surfaceA = await render(fieldA, 'surface');
  const orbB = await render(fieldB, 'orb');
  const surfaceB = await render(fieldB, 'surface');

  const shapeDiffA = sumRGB(meanAbsDiff(orbA, surfaceA));
  const shapeDiffB = sumRGB(meanAbsDiff(orbB, surfaceB));
  const orbFieldDiff = sumRGB(meanAbsDiff(orbA, orbB));
  const surfaceFieldDiff = sumRGB(meanAbsDiff(surfaceA, surfaceB));

  return {
    fieldA,
    fieldB,
    shapeDiffA,
    shapeDiffB,
    orbFieldDiff,
    surfaceFieldDiff,
    shapesDifferWithinField: shapeDiffA > DIFFERENCE_THRESHOLD && shapeDiffB > DIFFERENCE_THRESHOLD,
    bothShapesChangedAcrossFields: orbFieldDiff > DIFFERENCE_THRESHOLD && surfaceFieldDiff > DIFFERENCE_THRESHOLD,
  };
}

export async function runBrandUnityForAllFieldPairs() {
  const fields = listFields();
  const results = [];
  for (let i = 0; i < fields.length; i++) {
    const j = (i + 1) % fields.length;
    if (fields.length < 2) break;
    results.push(await checkBrandUnity(fields[i], fields[j]));
  }
  return results;
}

async function main() {
  console.log('=== Task 6.7: brand unity (orb + surface share the field; swapping the field changes both) ===\n');
  const results = await runBrandUnityForAllFieldPairs();
  let anyFail = false;
  for (const r of results) {
    const pass = r.shapesDifferWithinField && r.bothShapesChangedAcrossFields;
    if (!pass) anyFail = true;
    console.log(`${r.fieldA} -> ${r.fieldB}: ${pass ? 'PASS' : 'FAIL'}`);
    console.log(`    shape differs within ${r.fieldA} (orb vs surface): ${r.shapeDiffA.toFixed(2)} (need > ${DIFFERENCE_THRESHOLD})`);
    console.log(`    shape differs within ${r.fieldB} (orb vs surface): ${r.shapeDiffB.toFixed(2)} (need > ${DIFFERENCE_THRESHOLD})`);
    console.log(`    orb changed across fields:     ${r.orbFieldDiff.toFixed(2)} (need > ${DIFFERENCE_THRESHOLD})`);
    console.log(`    surface changed across fields: ${r.surfaceFieldDiff.toFixed(2)} (need > ${DIFFERENCE_THRESHOLD})`);
  }
  console.log('');
  if (anyFail) {
    console.error('FAIL: brand unity does not hold for one or more field pairs.');
    process.exitCode = 1;
  } else {
    console.log('PASS: every field pair shows both shapes changing together.');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
