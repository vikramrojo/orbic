// Task 3.5 gate probe — renders the out-of-lineage field and measures how
// much each ABI channel actually changes the image.
//
// "The field compiles" is a weak result: a field can compile while ignoring
// three of its four channels. What the gate needs to know is whether an
// unrelated field can express itself THROUGH the contract — so this sweeps
// each channel independently and reports the mean absolute pixel difference
// it produces, on both shapes.
//
// Run: node openspec/changes/orbic-foundation/gate-3.5/probe.mjs

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { makeUniforms, renderSksl } from '../../../../tools/render-check/lib/canvaskit.mjs';

const artifacts = process.argv[2] ?? '/tmp/gate35';

const SIZE = 180;

/** Mean absolute RGB difference between two frames, in 0-255 units. */
function meanAbsDiff(frameA, frameB) {
  const a = frameA.pixels;
  const b = frameB.pixels;
  let total = 0;
  let count = 0;
  for (let i = 0; i < a.length; i += 4) {
    total += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    count += 3;
  }
  return total / count;
}

async function render(sksl, shape, overrides) {
  const uniforms = makeUniforms({
    width: SIZE,
    height: SIZE,
    time: 4,
    energy: 0.5,
    coherence: 0.5,
    warmth: 0.5,
    pulse: 1,
    // Both shapes carry one trailing uniform, and they are different ones:
    // `scale` on a surface, `edge` on an orb. Same length, so passing the
    // wrong one renders silently wrong rather than erroring.
    ...(shape === 'surface' ? { scale: 3.0 } : { edge: 0.0 }),
    ...overrides,
  });
  return renderSksl(sksl, { width: SIZE, height: SIZE, uniforms });
}

const CHANNELS = ['energy', 'coherence', 'warmth', 'pulse'];

for (const shape of ['orb', 'surface']) {
  const sksl = readFileSync(resolve(artifacts, `cellular-drift-${shape}.sksl`), 'utf8');
  console.log(`\n${shape}:`);

  for (const channel of CHANNELS) {
    const low = await render(sksl, shape, { [channel]: channel === 'pulse' ? 0.2 : 0 });
    const high = await render(sksl, shape, { [channel]: channel === 'pulse' ? 2.0 : 1 });
    const diff = meanAbsDiff(low, high);

    // `pulse` is expected to measure zero here, and that is not a defect.
    // Since the double-application fix it acts entirely in the runtime, which
    // folds it into `t`; the uniform reaching the shader is a non-timing cue
    // no shipped field reads. Sweeping it at FIXED `t` therefore measures the
    // uniform's direct effect, which is correctly nil. Its real effect shows
    // up in the `time` control row.
    const verdict =
      channel === 'pulse'
        ? diff > 0.05
          ? 'UNEXPECTED — field reads pulse directly'
          : 'nil at fixed t (expected — acts via the runtime clock)'
        : diff > 1
          ? 'observable'
          : diff > 0.05
            ? 'faint'
            : 'INERT';

    console.log(`  ${channel.padEnd(10)} ${diff.toFixed(3).padStart(8)} /255   ${verdict}`);
  }

  // Time is the control: it must move on an orb and, since a Surface renders
  // exactly one frame, its behaviour here is informational only.
  const t0 = await render(sksl, shape, { time: 0 });
  const t1 = await render(sksl, shape, { time: 9 });
  console.log(`  ${'time'.padEnd(10)} ${meanAbsDiff(t0, t1).toFixed(3).padStart(8)} /255   (control)`);
}
