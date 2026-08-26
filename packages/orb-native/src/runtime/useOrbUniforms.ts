import { useEffect, useRef, useState } from 'react';
import {
  CHANNELS,
  MAX_FRAME_DELTA,
  OrbRuntime,
  createSpringState,
  integrateSpring,
  presetChannels,
  resolveSpring,
} from '@orbic/core';
import type {
  AccumulatingSpringState,
  Channel,
  ChannelValues,
  OrbUniforms,
  PresetName,
  SpringParams,
} from '@orbic/core';

import { reanimated } from './reanimated.js';

/** Matches OrbRuntime's own wrap — `t` wraps at an hour to protect phase precision (docs/shader-abi.md). */
const TIME_WRAP_SECONDS = 3600;

export interface UseOrbUniformsOptions {
  state: PresetName;
  speed: number;
  /** False when paused, reduced-motion, offscreen or backgrounded — the caller owns that decision. */
  active: boolean;
}

export type UseOrbUniforms = (options: UseOrbUniformsOptions) => OrbUniforms;

/**
 * JS-thread path, used when Reanimated is absent.
 *
 * DEGRADATION, not an equivalent: this pump shares the JS thread with
 * application work, so spring updates are delayed exactly when that thread is
 * busy — which is when responsiveness matters most. Stated as a degradation
 * in the package README, as the platform-renderers spec requires.
 *
 * This path can use `OrbRuntime` directly because everything stays on the JS
 * thread.
 */
export function useJsThreadUniforms({ state, speed, active }: UseOrbUniformsOptions): OrbUniforms {
  const runtimeRef = useRef<OrbRuntime | null>(null);
  runtimeRef.current ??= new OrbRuntime(state, speed);
  const runtime = runtimeRef.current;

  const [uniforms, setUniforms] = useState<OrbUniforms>(() => runtime.uniforms());

  // Retarget rather than reconstruct, so a mid-flight change continues from
  // the current values and velocities (orb-component spec).
  useEffect(() => {
    runtime.setState(state);
  }, [runtime, state]);

  useEffect(() => {
    runtime.setSpeed(speed);
  }, [runtime, speed]);

  useEffect(() => {
    if (!active) {
      runtime.deactivate();
      setUniforms(runtime.uniforms());
      return;
    }

    // Drop the stale timestamp so an idle gap is not integrated as one delta.
    runtime.activate();

    let frame = requestAnimationFrame(function tick(now: number) {
      setUniforms(runtime.tick(now));
      frame = requestAnimationFrame(tick);
    });

    return () => cancelAnimationFrame(frame);
  }, [active, runtime]);

  return uniforms;
}

/**
 * UI-thread path, used when Reanimated is installed.
 *
 * Deliberately does NOT use `OrbRuntime`: it is a plain JS class, and a
 * Reanimated worklet cannot invoke methods on a JS-thread object. The state
 * therefore lives in shared values and is advanced by `integrateSpring`,
 * which `@orbic/core` marks `'worklet'` precisely so the numerically critical
 * part — the integrator the golden-frame fixture pins — is shared rather than
 * reimplemented here. What this path does re-express is only the
 * orchestration around it: per-channel iteration and the clock accumulation.
 *
 * Reanimated's `withSpring` is not used, per design.md decision 8: its
 * formulation and rest threshold differ from the shared integrator and from
 * the Swift one, so the platforms would disagree on exactly the transitions
 * that are the product.
 */
export function useUiThreadUniforms({ state, speed, active }: UseOrbUniformsOptions): OrbUniforms {
  const Reanimated = reanimated!;

  const springs = Reanimated.useSharedValue<Record<Channel, AccumulatingSpringState>>(
    initialSprings(state)
  );
  const target = Reanimated.useSharedValue(presetChannels(state));
  const params = Reanimated.useSharedValue(resolveSpring(state, state));
  const clock = Reanimated.useSharedValue(0);
  const speedValue = Reanimated.useSharedValue(speed);
  const output = Reanimated.useSharedValue<OrbUniforms>(restingUniforms(state));

  const [mirrored, setMirrored] = useState<OrbUniforms>(() => restingUniforms(state));
  const previousState = useRef<PresetName>(state);

  useEffect(() => {
    params.value = resolveSpring(previousState.current, state);
    target.value = presetChannels(state);
    previousState.current = state;
  }, [params, state, target]);

  useEffect(() => {
    speedValue.value = speed;
  }, [speed, speedValue]);

  const frameCallback = Reanimated.useFrameCallback((frame) => {
    'worklet';
    // Null on the first frame after (re)activation, which is exactly the
    // dt = 0 the integrator wants — no mount jump, no idle gap.
    const stepped = stepUniforms({
      springs: springs.value,
      target: target.value,
      params: params.value,
      clock: clock.value,
      speed: speedValue.value,
      dtSeconds: (frame.timeSincePreviousFrame ?? 0) / 1000,
    });

    springs.value = stepped.springs;
    clock.value = stepped.clock;
    output.value = stepped.uniforms;
  }, false);

  useEffect(() => {
    frameCallback.setActive(active);
    if (!active) {
      setMirrored(output.value);
    }
    return () => frameCallback.setActive(false);
  }, [active, frameCallback, output]);

  // While active, Skia reads the shared value directly on the UI thread; the
  // mirrored copy exists so the paused frame stays consistent with the React
  // tree without setting state every frame.
  return active ? output.value : mirrored;
}

export interface StepInput {
  springs: Record<Channel, AccumulatingSpringState>;
  target: ChannelValues;
  params: SpringParams;
  /** Field clock in seconds, already wrapped. */
  clock: number;
  speed: number;
  dtSeconds: number;
}

export interface StepResult {
  springs: Record<Channel, AccumulatingSpringState>;
  clock: number;
  uniforms: OrbUniforms;
}

/**
 * One frame of the UI-thread path, as a pure function.
 *
 * Extracted from the worklet so it can be asserted against the golden-frame
 * fixture (task 8.8) — the orchestration this path re-expresses (per-channel
 * iteration, the clock accumulation, the delta clamp) is exactly the part
 * that could drift from `OrbRuntime` unnoticed, since the integrator itself
 * is shared. Marked `'worklet'` so the frame callback can still call it on
 * the UI thread.
 */
export function stepUniforms({ springs, target, params, clock, speed, dtSeconds }: StepInput): StepResult {
  'worklet';
  // Clamped identically to OrbRuntime and OrbicSpring: a shared bound, not a
  // per-platform detail (see MAX_FRAME_DELTA's own docs).
  const dt = Math.min(Math.max(dtSeconds, 0), MAX_FRAME_DELTA);

  const next = { ...springs };
  for (const channel of CHANNELS) {
    next[channel] = integrateSpring(next[channel], target[channel], params, dt);
  }

  // `pulse` scales the field clock and `speed` scales it further; the shader
  // must NOT apply pulse again (docs/shader-abi.md).
  const advanced = clock + dt * speed * next.pulse.value;

  return {
    springs: next,
    clock: advanced % TIME_WRAP_SECONDS,
    uniforms: {
      energy: next.energy.value,
      coherence: next.coherence.value,
      warmth: next.warmth.value,
      pulse: next.pulse.value,
      t: advanced % TIME_WRAP_SECONDS,
    },
  };
}

export function initialSprings(state: PresetName): Record<Channel, AccumulatingSpringState> {
  const values = presetChannels(state);
  const springs = {} as Record<Channel, AccumulatingSpringState>;
  for (const channel of CHANNELS) {
    springs[channel] = createSpringState(values[channel]);
  }
  return springs;
}

function restingUniforms(state: PresetName): OrbUniforms {
  const values = presetChannels(state);
  return { ...values, t: 0 };
}

/**
 * Bound once at module load, never per render: whether Reanimated is
 * installed cannot change during a process's life, and React forbids
 * conditionally calling hooks.
 */
export const useOrbUniforms: UseOrbUniforms =
  reanimated === null ? useJsThreadUniforms : useUiThreadUniforms;
