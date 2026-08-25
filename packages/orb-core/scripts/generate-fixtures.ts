import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FIXED_SUBSTEP, MAX_FRAME_DELTA, createSpringState, integrateSpring } from '../src/spring.js';
import { CHANNELS, PRESET_NAMES, presetChannels, resolveSpring } from '../src/states.js';
import type { Channel, PresetName } from '../src/states.js';
import type { AccumulatingSpringState } from '../src/spring.js';

/** Times, in seconds, at which every transition is sampled. Each is an exact multiple of FIXED_SUBSTEP. */
const SAMPLE_TIMES = [0, 0.05, 0.1, 0.2, 0.4, 0.6, 1.0, 1.5];

function simulateTransition(from: PresetName, to: PresetName) {
  const fromValues = presetChannels(from);
  const toValues = presetChannels(to);
  const params = resolveSpring(from, to);

  const states = {} as Record<Channel, AccumulatingSpringState>;
  for (const channel of CHANNELS) {
    states[channel] = createSpringState(fromValues[channel]);
  }

  const samples: Record<string, Record<Channel, number>> = {};

  const recordSample = (label: number) => {
    const sample = {} as Record<Channel, number>;
    for (const channel of CHANNELS) {
      sample[channel] = Number(states[channel].value.toFixed(6));
    }
    samples[label.toString()] = sample;
  };

  let sampleIndex = 0;
  let t = 0;

  if (SAMPLE_TIMES[0] === 0) {
    recordSample(0);
    sampleIndex = 1;
  }

  while (sampleIndex < SAMPLE_TIMES.length) {
    t += FIXED_SUBSTEP;
    for (const channel of CHANNELS) {
      states[channel] = integrateSpring(states[channel], toValues[channel], params, FIXED_SUBSTEP);
    }

    const nextTarget = SAMPLE_TIMES[sampleIndex];
    if (nextTarget !== undefined && t >= nextTarget - 1e-9) {
      recordSample(nextTarget);
      sampleIndex++;
    }
  }

  // The resolved spring params (including `mass`) are recorded per transition
  // so Swift can cross-check its own resolveSpring/spring(from:to:) output
  // against this fixture too, not just the resulting channel values.
  return { from, to, spring: params, sampleTimes: SAMPLE_TIMES, samples };
}

const transitions = [];
for (const from of PRESET_NAMES) {
  for (const to of PRESET_NAMES) {
    if (from === to) continue;
    transitions.push(simulateTransition(from, to));
  }
}

const fixture = {
  fixedSubstep: FIXED_SUBSTEP,
  maxFrameDelta: MAX_FRAME_DELTA,
  channels: CHANNELS,
  transitions,
};

const outPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../fixtures/golden-frames.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(fixture, null, 2) + '\n');

console.log(`Wrote ${transitions.length} transitions to ${outPath}`);
