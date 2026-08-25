import { presetChannels } from '@orbic/core';
import type { ChannelValues, PresetName } from '@orbic/core';

export interface ChannelOverrides {
  energy?: number;
  coherence?: number;
  warmth?: number;
  pulse?: number;
}

/**
 * A preset sets all four channels statically; an explicit per-channel prop
 * wins over the preset's value for that channel only (surface-component
 * spec: "individual channels override the preset"). No spring — Surface
 * has no state machine.
 */
export function resolveSurfaceChannels(presetName: PresetName, overrides: ChannelOverrides): ChannelValues {
  const base = presetChannels(presetName);
  return {
    energy: overrides.energy ?? base.energy,
    coherence: overrides.coherence ?? base.coherence,
    warmth: overrides.warmth ?? base.warmth,
    pulse: overrides.pulse ?? base.pulse,
  };
}
