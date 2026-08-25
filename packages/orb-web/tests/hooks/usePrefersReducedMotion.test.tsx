// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { usePrefersReducedMotion } from '../../src/hooks/usePrefersReducedMotion';

class FakeMediaQueryList extends EventTarget {
  matches: boolean;
  constructor(matches: boolean) {
    super();
    this.matches = matches;
  }
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    super.addEventListener(type, listener);
  }
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    super.removeEventListener(type, listener);
  }
  setMatches(matches: boolean) {
    this.matches = matches;
    this.dispatchEvent(Object.assign(new Event('change'), { matches }));
  }
}

describe('usePrefersReducedMotion', () => {
  let mql: FakeMediaQueryList;
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    mql = new FakeMediaQueryList(false);
    window.matchMedia = () => mql as unknown as MediaQueryList;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('reflects the initial matchMedia state', () => {
    mql.matches = true;
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
  });

  it('updates when the media query change event fires', () => {
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);

    act(() => {
      mql.setMatches(true);
    });
    expect(result.current).toBe(true);

    act(() => {
      mql.setMatches(false);
    });
    expect(result.current).toBe(false);
  });
});
