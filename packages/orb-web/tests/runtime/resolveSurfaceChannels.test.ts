import { describe, expect, it } from 'vitest';
import { presetChannels } from '@orbic/core';
import { resolveSurfaceChannels } from '../../src/runtime/resolveSurfaceChannels';

describe('resolveSurfaceChannels', () => {
  it('sets all four channels from the preset with no overrides', () => {
    const result = resolveSurfaceChannels('cooling', {});
    expect(result).toEqual(presetChannels('cooling'));
  });

  it('an explicit channel override wins; the rest still come from the preset', () => {
    const preset = presetChannels('cooling');
    const result = resolveSurfaceChannels('cooling', { warmth: 0.9 });
    expect(result.warmth).toBe(0.9);
    expect(result.energy).toBe(preset.energy);
    expect(result.coherence).toBe(preset.coherence);
    expect(result.pulse).toBe(preset.pulse);
  });

  it('multiple overrides can be combined', () => {
    const result = resolveSurfaceChannels('subtle', { energy: 0.5, pulse: 1.2 });
    expect(result.energy).toBe(0.5);
    expect(result.pulse).toBe(1.2);
    const preset = presetChannels('subtle');
    expect(result.coherence).toBe(preset.coherence);
    expect(result.warmth).toBe(preset.warmth);
  });

  it('an override of exactly 0 is honoured, not treated as "unset" (nullish coalescing, not ||)', () => {
    const result = resolveSurfaceChannels('active', { energy: 0 });
    expect(result.energy).toBe(0);
  });
});
