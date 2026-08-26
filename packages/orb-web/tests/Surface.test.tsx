// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRESET_NAMES } from '@orbic/core';
import { Surface } from '../src/Surface';
import { FIELD_NAMES } from '@orbic/core';

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  callback: () => void;
  observed: Element[] = [];
  disconnected = false;
  constructor(callback: () => void) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  disconnect() {
    this.disconnected = true;
  }
  unobserve() {}
}

beforeEach(() => {
  FakeResizeObserver.instances = [];
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function stubClientRect(el: HTMLElement, width: number, height: number) {
  Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
}

describe('<Surface> SSR-safe hydration', () => {
  it('server-renders a CSS-gradient fallback with no canvas', () => {
    const html = renderToStaticMarkup(<Surface />);
    expect(html).not.toContain('<canvas');
    expect(html).toContain('gradient');
  });

  it('swaps to a canvas after mounting', async () => {
    const { container } = render(<Surface />);
    stubClientRect(container.querySelector('div')!, 400, 180);
    await act(async () => {});
    expect(container.querySelector('canvas')).not.toBeNull();
  });
});

describe('<Surface> never schedules a requestAnimationFrame loop (7.2)', () => {
  it('does not call requestAnimationFrame at all across mount and prop updates', async () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame');
    const { container, rerender } = render(<Surface preset="active" />);
    stubClientRect(container.querySelector('div')!, 300, 300);
    await act(async () => {});

    rerender(<Surface preset="cooling" />);
    await act(async () => {});

    expect(rafSpy).not.toHaveBeenCalled();
  });

  it('eight mounted Surfaces together schedule zero requestAnimationFrame calls', async () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame');
    const renders = Array.from({ length: 8 }, (_, i) => render(<Surface key={i} preset="warming" />));
    for (const { container } of renders) {
      stubClientRect(container.querySelector('div')!, 200, 200);
    }
    await act(async () => {});

    expect(rafSpy).not.toHaveBeenCalled();
    renders.forEach((r) => r.unmount());
  });
});

describe('<Surface> pointer-events: none (7.8)', () => {
  it('sets pointer-events: none on both the wrapper and the canvas', async () => {
    const { container } = render(<Surface />);
    stubClientRect(container.querySelector('div')!, 300, 300);
    await act(async () => {});

    const wrapper = container.querySelector('div')!;
    const canvas = container.querySelector('canvas')!;
    expect(wrapper.style.pointerEvents).toBe('none');
    expect(canvas.style.pointerEvents).toBe('none');
  });

  it('sets pointer-events: none on the pre-hydration fallback too', () => {
    const html = renderToStaticMarkup(<Surface />);
    expect(html).toContain('pointer-events:none');
  });
});

describe('<Surface> unknown name fallback (7.6)', () => {
  it('warns naming the unknown preset and valid options, and still renders', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(<Surface preset="listening" />);
    stubClientRect(container.querySelector('div')!, 300, 300);
    await act(async () => {});

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = warnSpy.mock.calls[0]![0] as string;
    expect(message).toContain('<Surface>');
    expect(message).toContain('preset');
    expect(message).toContain('listening');
    for (const name of PRESET_NAMES) expect(message).toContain(name);
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('warns naming the unknown field and valid options, and still renders', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(<Surface field="does-not-exist" />);
    stubClientRect(container.querySelector('div')!, 300, 300);
    await act(async () => {});

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = warnSpy.mock.calls[0]![0] as string;
    expect(message).toContain('<Surface>');
    expect(message).toContain('field');
    for (const name of FIELD_NAMES) expect(message).toContain(name);
  });

  it('does not warn for a valid preset and field', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(<Surface preset="active" field={FIELD_NAMES[0]} />);
    stubClientRect(container.querySelector('div')!, 300, 300);
    await act(async () => {});
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
