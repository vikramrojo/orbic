import { describe, expect, it } from 'vitest';
import { CHANNELS, PRESET_NAMES, presetChannels, resolveSpring, springs } from '../src/states';

describe('resolveSpring', () => {
  it('falls back to default for a transition with no explicit override', () => {
    // 'cooling' -> 'active' has no override entry in presets.json.
    expect(springs['cooling>active']).toBeUndefined();
    expect(resolveSpring('cooling', 'active')).toEqual(springs.default);
  });

  it('uses the explicit override when one exists', () => {
    expect(resolveSpring('subtle', 'active')).toEqual(springs['subtle>active']);
  });

  it('snaps awake going subtle→active and sighs out going active→subtle', () => {
    const awake = resolveSpring('subtle', 'active');
    const settle = resolveSpring('active', 'subtle');
    expect(awake.stiffness).toBeGreaterThan(settle.stiffness);
  });
});

describe('preset data', () => {
  it('ships exactly the five specified presets', () => {
    expect(new Set(PRESET_NAMES)).toEqual(
      new Set(['subtle', 'active', 'cooling', 'warming', 'pacing'])
    );
  });

  it('defines all four channels for every preset', () => {
    for (const name of PRESET_NAMES) {
      const channels = presetChannels(name);
      for (const channel of CHANNELS) {
        expect(typeof channels[channel]).toBe('number');
      }
    }
  });

  it('has a default spring entry', () => {
    expect(springs.default).toBeDefined();
  });
});
