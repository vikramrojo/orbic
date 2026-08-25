// @vitest-environment jsdom
import { act, cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useRef } from 'react';
import { useIsIntersecting } from '../../src/hooks/useIsIntersecting';

type ObserveCallback = (entries: Array<{ isIntersecting: boolean }>) => void;

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  callback: ObserveCallback;
  observed: Element[] = [];
  disconnected = false;

  constructor(callback: ObserveCallback) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  disconnect() {
    this.disconnected = true;
  }
  unobserve() {}
}

describe('useIsIntersecting', () => {
  let originalIO: typeof IntersectionObserver | undefined;

  beforeEach(() => {
    FakeIntersectionObserver.instances = [];
    originalIO = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver = FakeIntersectionObserver as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    cleanup();
    globalThis.IntersectionObserver = originalIO as typeof IntersectionObserver;
  });

  it('defaults to true (fails open) before any observer callback fires', () => {
    function Probe() {
      const ref = useRef<HTMLDivElement>(null);
      const intersecting = useIsIntersecting(ref);
      return <div ref={ref} data-testid="probe" data-intersecting={intersecting} />;
    }
    const { getByTestId } = render(<Probe />);
    expect(getByTestId('probe').dataset.intersecting).toBe('true');
  });

  it('flips to false when the observer reports not intersecting, and back on return', () => {
    function Probe() {
      const ref = useRef<HTMLDivElement>(null);
      const intersecting = useIsIntersecting(ref);
      return <div ref={ref} data-testid="probe" data-intersecting={intersecting} />;
    }
    const { getByTestId } = render(<Probe />);
    const observer = FakeIntersectionObserver.instances[0]!;

    act(() => observer.callback([{ isIntersecting: false }]));
    expect(getByTestId('probe').dataset.intersecting).toBe('false');

    act(() => observer.callback([{ isIntersecting: true }]));
    expect(getByTestId('probe').dataset.intersecting).toBe('true');
  });

  it('disconnects the observer on unmount', () => {
    const ref = { current: document.createElement('div') };
    const { unmount } = renderHook(() => useIsIntersecting(ref));
    const observer = FakeIntersectionObserver.instances[0]!;
    expect(observer.disconnected).toBe(false);
    unmount();
    expect(observer.disconnected).toBe(true);
  });
});
