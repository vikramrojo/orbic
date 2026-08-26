import { describe, expect, it } from 'vitest';
import { FIELD_NAMES } from '@orbic/core';

/**
 * Every shipped field must be registered by the all-fields entry point.
 *
 * This is the failure that reached the browser as a flat green disc: the
 * renderer looks a field up in the registry and, finding nothing, correctly
 * degrades to the fallback colour. Correct behaviour, but it means a missing
 * registration looks like a rendering choice rather than an error — there is
 * no console warning and no thrown exception to notice.
 *
 * Importing the entry point for its side effect is the whole point here.
 */
import '../src/index.js';
import { fieldSources, registeredFieldNames } from '../src/registry.js';

describe('the all-fields entry point registers every shipped field', () => {
  it('registers exactly the fields the build produced', () => {
    expect([...registeredFieldNames()].sort()).toEqual([...FIELD_NAMES].sort());
  });

  it('gives every field usable sources for both shapes', () => {
    for (const field of FIELD_NAMES) {
      const sources = fieldSources(field);
      expect(sources, `${field} is not registered`).toBeDefined();
      // A truncated or empty source would compile to nothing and fall back
      // just as silently as a missing one.
      expect(sources!.orb.length, `${field} orb source is empty`).toBeGreaterThan(500);
      expect(sources!.surface.length, `${field} surface source is empty`).toBeGreaterThan(500);
    }
  });

  it('gives each field its OWN sources, not another field’s', () => {
    // Guards a generator bug that emitted the same artifact under every name.
    const orbSources = FIELD_NAMES.map((f) => fieldSources(f)!.orb);
    expect(new Set(orbSources).size).toBe(FIELD_NAMES.length);
  });

  it('returns undefined for an unknown field rather than throwing', () => {
    expect(fieldSources('no-such-field')).toBeUndefined();
  });
});
