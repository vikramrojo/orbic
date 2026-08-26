// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRESET_NAMES } from '@orbic/core';
import { Orb } from '../src/Orb';
import { FIELD_NAMES } from '@orbic/core';

class FakeIntersectionObserver {
  constructor(_callback: unknown) {}
  observe() {}
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  globalThis.IntersectionObserver = FakeIntersectionObserver as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('<Orb> SSR-safe hydration', () => {
  it('server-renders the CSS-gradient fallback, with no canvas', () => {
    // Genuine SSR via React's own server renderer: renderToStaticMarkup
    // never runs effects at all (that's what makes it "static"), so
    // `mounted` stays false and the fallback branch is what actually gets
    // emitted — this is what a real server render produces. Testing
    // library's render(), by contrast, always mounts client-side and
    // flushes effects synchronously, so it cannot observe this moment
    // (this test file's jsdom environment doesn't affect that: it's the
    // absence of an effect pass, not the absence of `window`, that matters
    // here).
    const html = renderToStaticMarkup(<Orb size={64} />);
    expect(html).not.toContain('<canvas');
    expect(html).toContain('64px');
    expect(html).toContain('gradient');
  });

  it('swaps to a canvas after mounting, at the same size (no layout shift)', async () => {
    const { container } = render(<Orb size={64} />);
    await act(async () => {}); // flush the mount effect

    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas!.style.width).toBe('64px');
    expect(canvas!.style.height).toBe('64px');

    const wrapper = canvas!.parentElement as HTMLElement;
    expect(wrapper.style.width).toBe('64px');
    expect(wrapper.style.height).toBe('64px');
  });
});

describe('<Orb> unknown name fallback', () => {
  it('warns naming the unknown state and valid options, and still renders', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(<Orb state="thinking" />);
    await act(async () => {});

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = warnSpy.mock.calls[0]![0] as string;
    expect(message).toContain('thinking');
    for (const name of PRESET_NAMES) expect(message).toContain(name);

    // Continues rendering rather than throwing/blanking.
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('warns naming the unknown field and valid options, and still renders', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(<Orb field="silk-cascade" />);
    await act(async () => {});

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = warnSpy.mock.calls[0]![0] as string;
    expect(message).toContain('silk-cascade');
    for (const name of FIELD_NAMES) expect(message).toContain(name);
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('does not warn for a valid state and field', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<Orb state="active" field={FIELD_NAMES[0]} />);
    await act(async () => {});
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('<Orb> DPR-capped canvas sizing, through the real component', () => {
  const originalDpr = window.devicePixelRatio;

  afterEach(() => {
    Object.defineProperty(window, 'devicePixelRatio', { value: originalDpr, configurable: true });
  });

  it('sizes the drawing buffer using a DPR of 2 when the device reports 3', async () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 3, configurable: true });
    const { container } = render(<Orb size={50} paused />);
    await act(async () => {});

    const canvas = container.querySelector('canvas')!;
    // paused => the "inactive still re-renders once" effect runs and sets
    // canvas.width/height even though jsdom has no real 2D/WebGL backend
    // (paintFallback sets dimensions before attempting to get a 2d context).
    expect(canvas.width).toBe(100); // 50 * min(3, 2)
    expect(canvas.height).toBe(100);
  });
});

describe('<Orb> size change re-renders rather than rescales', () => {
  it('updates the canvas backing-buffer dimensions when size changes while paused', async () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
    const { container, rerender } = render(<Orb size={40} paused />);
    await act(async () => {});
    const canvas = container.querySelector('canvas')!;
    expect(canvas.width).toBe(40);

    rerender(<Orb size={80} paused />);
    await act(async () => {});
    expect(canvas.width).toBe(80);
    // The CSS size (style) tracks size directly too — never a transform scale.
    expect(canvas.style.transform).toBe('');
  });
});
