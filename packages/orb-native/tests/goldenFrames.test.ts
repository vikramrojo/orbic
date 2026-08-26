import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FIXED_SUBSTEP, presetChannels, resolveSpring } from '@orbic/core';
import type { Channel, PresetName } from '@orbic/core';

import { initialSprings, stepUniforms } from '../src/runtime/useOrbUniforms.js';

const fixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../fixtures/golden-frames.json'
);
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

const CHANNELS: Channel[] = ['energy', 'coherence', 'warmth', 'pulse'];

/**
 * Task 8.8 — the native path against the shared golden-frame fixture.
 *
 * `stepUniforms` is what the Reanimated UI-thread worklet actually runs, and
 * it re-expresses the orchestration around the integrator (per-channel
 * iteration, the delta clamp, the clock accumulation) because a worklet
 * cannot call methods on the `OrbRuntime` class. The integrator itself is
 * shared, so what this test guards is precisely the part that could drift
 * without anyone noticing.
 */
describe('native UI-thread path vs the golden-frame fixture', () => {
  it('reproduces every sampled channel value within the cross-platform tolerance', () => {
    const mismatches: string[] = [];

    for (const transition of fixture.transitions) {
      const from = transition.from as PresetName;
      const to = transition.to as PresetName;

      let springs = initialSprings(from);
      let clock = 0;
      const target = presetChannels(to);
      const params = resolveSpring(from, to);

      let simulated = 0;
      for (const time of transition.sampleTimes as number[]) {
        while (simulated + FIXED_SUBSTEP <= time + 1e-9) {
          const stepped = stepUniforms({
            springs,
            target,
            params,
            clock,
            speed: 1,
            dtSeconds: FIXED_SUBSTEP,
          });
          springs = stepped.springs;
          clock = stepped.clock;
          simulated += FIXED_SUBSTEP;
        }

        const expected = fixture.transitions
          .find((t: { from: string; to: string }) => t.from === from && t.to === to)
          .samples[String(time)];

        for (const channel of CHANNELS) {
          const actual = springs[channel].value;
          if (Math.abs(actual - expected[channel]) > 0.001) {
            mismatches.push(
              `${from}->${to} @ t=${time} [${channel}]: expected ${expected[channel]}, got ${actual}`
            );
          }
        }
      }
    }

    expect(mismatches).toEqual([]);
  });

  it('matches the recorded velocities too, pinning the integration order', () => {
    // Positions alone do not pin the integrator: an explicit-Euler ordering
    // bug can match every sampled position and still carry a wrong velocity
    // into the next frame.
    const mismatches: string[] = [];

    for (const transition of fixture.transitions) {
      if (!transition.velocities) continue;

      const from = transition.from as PresetName;
      const to = transition.to as PresetName;

      let springs = initialSprings(from);
      let clock = 0;
      const target = presetChannels(to);
      const params = resolveSpring(from, to);

      let simulated = 0;
      for (const time of transition.sampleTimes as number[]) {
        while (simulated + FIXED_SUBSTEP <= time + 1e-9) {
          const stepped = stepUniforms({
            springs,
            target,
            params,
            clock,
            speed: 1,
            dtSeconds: FIXED_SUBSTEP,
          });
          springs = stepped.springs;
          clock = stepped.clock;
          simulated += FIXED_SUBSTEP;
        }

        const expected = transition.velocities[String(time)];
        for (const channel of CHANNELS) {
          if (Math.abs(springs[channel].velocity - expected[channel]) > 0.01) {
            mismatches.push(
              `${from}->${to} @ t=${time} [${channel} velocity]: expected ${expected[channel]}, got ${springs[channel].velocity}`
            );
          }
        }
      }
    }

    expect(mismatches).toEqual([]);
  });
});

describe('stepUniforms', () => {
  const base = () => ({
    springs: initialSprings('subtle'),
    target: presetChannels('active'),
    params: resolveSpring('subtle', 'active'),
    clock: 0,
    speed: 1,
  });

  it('clamps a huge delta rather than spiralling, matching MAX_FRAME_DELTA', () => {
    const clamped = stepUniforms({ ...base(), dtSeconds: 0.25 });
    const huge = stepUniforms({ ...base(), dtSeconds: 60 });
    expect(huge.uniforms).toEqual(clamped.uniforms);
  });

  it('floors a negative delta at zero, matching the other two platforms', () => {
    const zero = stepUniforms({ ...base(), dtSeconds: 0 });
    const negative = stepUniforms({ ...base(), dtSeconds: -5 });
    expect(negative.uniforms).toEqual(zero.uniforms);
  });

  it('scales the clock by speed and pulse, but never the springs', () => {
    const slow = stepUniforms({ ...base(), dtSeconds: 1 / 60, speed: 1 });
    const fast = stepUniforms({ ...base(), dtSeconds: 1 / 60, speed: 4 });

    expect(fast.uniforms.energy).toBe(slow.uniforms.energy);
    expect(fast.clock).toBeCloseTo(slow.clock * 4, 12);
    expect(slow.clock).toBeGreaterThan(0);
  });

  it('wraps the clock at an hour so shader phase precision holds', () => {
    const stepped = stepUniforms({ ...base(), clock: 3599.9, dtSeconds: 0.25, speed: 100 });
    expect(stepped.clock).toBeGreaterThanOrEqual(0);
    expect(stepped.clock).toBeLessThan(3600);
  });
});
