import presetsData from './presets.json' with { type: 'json' };
import type { SpringParams } from './spring.js';

export type Channel = 'energy' | 'coherence' | 'warmth' | 'pulse';
export type PresetName = 'subtle' | 'active' | 'cooling' | 'warming' | 'pacing';
export type ChannelValues = Record<Channel, number>;

export const CHANNELS = presetsData.channels as Channel[];
export const PRESET_NAMES = Object.keys(presetsData.presets) as PresetName[];

export const presets = presetsData.presets as Record<PresetName, ChannelValues>;
export const springs = presetsData.springs as Record<string, SpringParams>;

export function transitionKey(from: PresetName, to: PresetName): string {
  return `${from}>${to}`;
}

/** Resolves a (from, to) transition to its spring parameters, falling back to `default`. */
export function resolveSpring(from: PresetName, to: PresetName): SpringParams {
  const key = transitionKey(from, to);
  return springs[key] ?? springs.default!;
}

export function presetChannels(name: PresetName): ChannelValues {
  return presets[name];
}
