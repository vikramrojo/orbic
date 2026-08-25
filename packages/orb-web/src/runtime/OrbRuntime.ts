import { CHANNELS, createSpringState, integrateSpring, presetChannels, resolveSpring } from '@orbic/core';
import type { AccumulatingSpringState, Channel, ChannelValues, PresetName, SpringParams } from '@orbic/core';

/** `t` wraps at 3600 s to keep phase precision from decaying under mobile half/mediump float (docs/shader-abi.md). */
const TIME_WRAP_SECONDS = 3600;

export interface OrbUniforms {
  energy: number;
  coherence: number;
  warmth: number;
  pulse: number;
  t: number;
}

/**
 * Per-instance spring + clock state machine, independent of React, the DOM,
 * or WebGL — the same shared `@orbic/core` integrator drives it that drives
 * the golden-frame fixture, so nothing here reimplements the spring.
 *
 * Callers own the activity decision (paused / offscreen / hidden / reduced
 * motion): call `tick()` only while active, and call `deactivate()` /
 * `activate()` on the transitions, so the `t`-wrap discontinuity is deferred
 * to exactly the moment nobody is watching (orb-component spec, "defer the
 * t wrap").
 */
export class OrbRuntime {
  private channelStates: Record<Channel, AccumulatingSpringState>;
  private target: ChannelValues;
  private springParams: SpringParams;
  private targetPresetName: PresetName;
  private tRaw = 0;
  private lastTimestamp: number | null = null;
  private speed: number;

  constructor(initialState: PresetName, speed = 1) {
    const initial = presetChannels(initialState);
    this.channelStates = {} as Record<Channel, AccumulatingSpringState>;
    for (const channel of CHANNELS) {
      this.channelStates[channel] = createSpringState(initial[channel]);
    }
    this.target = initial;
    this.targetPresetName = initialState;
    this.springParams = resolveSpring(initialState, initialState);
    this.speed = speed;
  }

  setSpeed(speed: number): void {
    this.speed = speed;
  }

  get currentTargetPreset(): PresetName {
    return this.targetPresetName;
  }

  /**
   * Retargets the springs to `newState` from their CURRENT value and
   * velocity — never snaps. This is what makes a mid-flight retarget
   * (state changes again before the previous transition settles)
   * continuous: only `target` and `springParams` change here, the channel
   * states themselves are untouched.
   */
  setState(newState: PresetName): void {
    if (newState === this.targetPresetName) return;
    this.springParams = resolveSpring(this.targetPresetName, newState);
    this.target = presetChannels(newState);
    this.targetPresetName = newState;
  }

  /** Snaps every channel directly to `presetName`'s resting values with zero velocity — the reduced-motion static frame. */
  snapTo(presetName: PresetName): void {
    const values = presetChannels(presetName);
    for (const channel of CHANNELS) {
      this.channelStates[channel] = createSpringState(values[channel]);
    }
    this.target = values;
    this.targetPresetName = presetName;
    this.springParams = resolveSpring(presetName, presetName);
    this.tRaw = 0;
  }

  /** Call when this instance stops being actively ticked (paused, offscreen, hidden) — wraps `t` while nothing is being observed. */
  deactivate(): void {
    this.tRaw = this.tRaw % TIME_WRAP_SECONDS;
  }

  /** Call right before resuming ticks, so the next tick's `dt` doesn't include the idle gap as one huge jump. */
  activate(): void {
    this.lastTimestamp = null;
  }

  /**
   * Advances the springs and clock by real elapsed time up to `nowMs`
   * (a `performance.now()`/rAF-style timestamp in milliseconds) and returns
   * the resulting uniforms. The very first tick after construction or after
   * `activate()` uses `dt = 0` (no jump), because `lastTimestamp` is null.
   */
  tick(nowMs: number): OrbUniforms {
    const dt = this.lastTimestamp === null ? 0 : (nowMs - this.lastTimestamp) / 1000;
    this.lastTimestamp = nowMs;

    for (const channel of CHANNELS) {
      this.channelStates[channel] = integrateSpring(this.channelStates[channel], this.target[channel], this.springParams, dt);
    }
    // `pulse` is a speed multiplier on the field's internal clock
    // (docs/shader-abi.md); `speed` scales the same clock further, without
    // touching channel values or spring behaviour (orb-component spec).
    this.tRaw += dt * this.speed * this.channelStates.pulse.value;

    return this.uniforms();
  }

  /** Current uniforms without advancing anything. */
  uniforms(): OrbUniforms {
    return {
      energy: this.channelStates.energy.value,
      coherence: this.channelStates.coherence.value,
      warmth: this.channelStates.warmth.value,
      pulse: this.channelStates.pulse.value,
      t: this.tRaw,
    };
  }
}
