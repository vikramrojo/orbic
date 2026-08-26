import { describe, expect, it, vi } from 'vitest';
import { PRESET_NAMES } from '@orbic/core';
import { FIELD_NAMES, resolveFieldName, resolveStateName } from '../src/resolveNames';

describe('resolveStateName', () => {
  it('passes through a valid preset name unchanged, without warning', () => {
    const warn = vi.fn();
    for (const name of PRESET_NAMES) {
      expect(resolveStateName(name, warn)).toBe(name);
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it('falls back to "subtle" and warns, naming the invalid value and the valid options', () => {
    const warn = vi.fn();
    const result = resolveStateName('thinking', warn);
    expect(result).toBe('subtle');
    expect(warn).toHaveBeenCalledTimes(1);
    const message = warn.mock.calls[0]![0] as string;
    expect(message).toContain('thinking');
    for (const name of PRESET_NAMES) {
      expect(message).toContain(name);
    }
  });

  it('defaults to console.warn when no warn function is supplied', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resolveStateName('nonsense');
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe('resolveFieldName', () => {
  it('passes through a shipped field unchanged, without warning', () => {
    const warn = vi.fn();
    for (const name of FIELD_NAMES) {
      expect(resolveFieldName(name, warn)).toBe(name);
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it('falls back to the first shipped field and warns, naming the invalid value and the valid options', () => {
    const warn = vi.fn();
    const result = resolveFieldName('silk-cascade', warn);
    expect(result).toBe(FIELD_NAMES[0]);
    expect(warn).toHaveBeenCalledTimes(1);
    const message = warn.mock.calls[0]![0] as string;
    expect(message).toContain('silk-cascade');
    for (const name of FIELD_NAMES) {
      expect(message).toContain(name);
    }
  });
});
