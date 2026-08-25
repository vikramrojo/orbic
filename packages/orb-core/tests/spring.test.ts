import { describe, expect, it } from 'vitest';
import { MAX_FRAME_DELTA, createSpringState, integrateSpring } from '../src/spring';
import type { SpringParams } from '../src/spring';

const params: SpringParams = { stiffness: 180, damping: 16, mass: 1 };
const target = 1;

function simulate(fps: number, totalSeconds: number): number {
  const dt = 1 / fps;
  const steps = Math.round(totalSeconds * fps);
  let state = createSpringState(0);
  for (let i = 0; i < steps; i++) {
    state = integrateSpring(state, target, params, dt);
  }
  return state.value;
}

describe('integrateSpring frame-rate independence', () => {
  it('agrees within tolerance across 30, 60 and 120 fps at a single elapsed time', () => {
    const totalSeconds = 1.0;
    const v30 = simulate(30, totalSeconds);
    const v60 = simulate(60, totalSeconds);
    const v120 = simulate(120, totalSeconds);

    expect(Math.abs(v30 - v120)).toBeLessThan(0.001);
    expect(Math.abs(v60 - v120)).toBeLessThan(0.001);
  });

  it('agrees within tolerance across the whole transition, not just at rest', () => {
    // Each value is an exact multiple of 1/30 s, so it lands on a frame
    // boundary at 30, 60 and 120 fps alike — no rounding ambiguity.
    for (const totalSeconds of [0.1, 0.3, 0.5, 0.7, 1.5]) {
      const v30 = simulate(30, totalSeconds);
      const v60 = simulate(60, totalSeconds);
      const v120 = simulate(120, totalSeconds);

      expect(Math.abs(v30 - v120)).toBeLessThan(0.001);
      expect(Math.abs(v60 - v120)).toBeLessThan(0.001);
    }
  });

  it('settles to the target and stays there', () => {
    const value = simulate(60, 5);
    expect(Math.abs(value - target)).toBeLessThan(0.001);
  });
});

describe('integrateSpring accumulator', () => {
  it('carries a fractional substep across calls rather than dropping it', () => {
    // 1/1000 s frames never land exactly on a 1/120 s substep boundary; the
    // accumulator must retain the remainder so no motion is lost or duplicated.
    let state = createSpringState(0);
    for (let i = 0; i < 1000; i++) {
      state = integrateSpring(state, target, params, 1 / 1000);
    }
    const reference = simulate(120, 1);
    expect(Math.abs(state.value - reference)).toBeLessThan(0.001);
  });
});

describe('integrateSpring large-delta clamp', () => {
  it('clamps a single huge delta to MAX_FRAME_DELTA instead of spiralling through thousands of substeps', () => {
    const start = createSpringState(0);
    const clamped = integrateSpring(start, target, params, MAX_FRAME_DELTA);
    const huge = integrateSpring(start, target, params, 60);

    expect(huge).toEqual(clamped);
  });
});
