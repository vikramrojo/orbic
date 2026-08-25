import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHANNELS, PRESET_NAMES, resolveSpring } from '../src/states';

const fixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../fixtures/golden-frames.json'
);
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

describe('golden-frames fixture', () => {
  it('covers every ordered preset-to-preset transition', () => {
    const expectedPairs = PRESET_NAMES.length * (PRESET_NAMES.length - 1);
    expect(fixture.transitions).toHaveLength(expectedPairs);

    const seen = new Set(fixture.transitions.map((t: { from: string; to: string }) => `${t.from}>${t.to}`));
    for (const from of PRESET_NAMES) {
      for (const to of PRESET_NAMES) {
        if (from === to) continue;
        expect(seen.has(`${from}>${to}`)).toBe(true);
      }
    }
  });

  it('samples every channel at every declared sample time', () => {
    for (const transition of fixture.transitions) {
      for (const time of transition.sampleTimes) {
        const sample = transition.samples[String(time)];
        expect(sample).toBeDefined();
        for (const channel of CHANNELS) {
          expect(typeof sample[channel]).toBe('number');
        }
      }
    }
  });

  it('records channel velocities at every sample time, so Swift can pin the integrator ordering', () => {
    for (const transition of fixture.transitions) {
      for (const time of transition.sampleTimes) {
        const velocity = transition.velocities[String(time)];
        expect(velocity).toBeDefined();
        for (const channel of CHANNELS) {
          expect(typeof velocity[channel]).toBe('number');
        }
      }
    }
  });

  it('starts every transition at rest — every channel velocity is zero at t=0', () => {
    for (const transition of fixture.transitions) {
      for (const channel of CHANNELS) {
        expect(transition.velocities['0'][channel]).toBe(0);
      }
    }
  });

  it('starts every transition at the source preset and records the fixed substep', () => {
    expect(fixture.fixedSubstep).toBeCloseTo(1 / 120, 9);
  });

  it('records the max-frame-delta clamp so every platform integrator matches it', () => {
    expect(fixture.maxFrameDelta).toBeCloseTo(0.25, 9);
  });

  it('records the resolved spring params, including mass, for every transition', () => {
    for (const transition of fixture.transitions) {
      const expected = resolveSpring(transition.from, transition.to);
      expect(transition.spring).toEqual(expected);
      expect(typeof transition.spring.mass).toBe('number');
    }
  });
});
