// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('sharedTicker', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('registers and unregisters tickers, tracked by activeTickerCount', async () => {
    const { registerTicker, activeTickerCount } = await import('../../src/runtime/sharedTicker');
    expect(activeTickerCount()).toBe(0);

    const unregister = registerTicker(() => {});
    expect(activeTickerCount()).toBe(1);

    unregister();
    expect(activeTickerCount()).toBe(0);
  });

  it('calls every registered ticker on each animation frame with the frame timestamp', async () => {
    const { registerTicker } = await import('../../src/runtime/sharedTicker');
    const calls: number[] = [];
    const unregister = registerTicker((now) => calls.push(now));

    await vi.advanceTimersByTimeAsync(16);
    expect(calls.length).toBe(1);
    await vi.advanceTimersByTimeAsync(16);
    expect(calls.length).toBe(2);

    unregister();
  });

  it('does not schedule any frame when the document is hidden', async () => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    try {
      const { registerTicker } = await import('../../src/runtime/sharedTicker');
      const fn = vi.fn();
      registerTicker(fn);
      await vi.advanceTimersByTimeAsync(500);
      expect(fn).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    }
  });

  it('resumes scheduling on visibilitychange once the document becomes visible again', async () => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    const { registerTicker } = await import('../../src/runtime/sharedTicker');
    const fn = vi.fn();
    registerTicker(fn);
    await vi.advanceTimersByTimeAsync(200);
    expect(fn).not.toHaveBeenCalled();

    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    await vi.advanceTimersByTimeAsync(16);
    expect(fn).toHaveBeenCalled();
  });

  it('stops scheduling frames once the last ticker unregisters', async () => {
    const { registerTicker } = await import('../../src/runtime/sharedTicker');
    const fn = vi.fn();
    const unregister = registerTicker(fn);
    await vi.advanceTimersByTimeAsync(16);
    const callsBeforeUnregister = fn.mock.calls.length;

    unregister();
    await vi.advanceTimersByTimeAsync(500);
    expect(fn.mock.calls.length).toBe(callsBeforeUnregister);
  });
});
