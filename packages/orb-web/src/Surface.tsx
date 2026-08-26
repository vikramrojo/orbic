import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { DEFAULT_SURFACE_SCALE, renderFrame } from './gl/renderFrame.js';
import { FIELD_NAMES, resolveFieldName, resolveStateName } from '@orbic/core';
import { resolveSurfaceChannels } from './runtime/resolveSurfaceChannels.js';
import { cssGradientForWarmth } from './ssrGradient.js';

const DEFAULT_FIELD = FIELD_NAMES[0];
const DEFAULT_PRESET = 'subtle';

const SURFACE_FIELD_CONTEXT = { component: '<Surface>', prop: 'field' };
const SURFACE_PRESET_CONTEXT = { component: '<Surface>', prop: 'preset' };

export interface SurfaceProps {
  /** Loosely typed on purpose — an unrecognised value falls back with a warning rather than failing to type-check. */
  field?: string;
  preset?: string;
  /** World-space zoom. Larger shows more of the field (a wider view), matching the orb-scale-vs-surface-scale convention in docs/shader-abi.md. */
  scale?: number;
  /** Overrides the preset's value for this one channel only; the other three still come from the preset. */
  energy?: number;
  coherence?: number;
  warmth?: number;
  pulse?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * A static, full-bleed decorative background. No `state`, no spring, no
 * animation option at all — not a defaulted-off one (surface-component
 * spec). Renders once on mount and again only when a prop or its own
 * measured size actually changes; never schedules a `requestAnimationFrame`
 * loop, so eight mounted Surfaces cost zero per-frame work between them.
 */
export function Surface({
  field = DEFAULT_FIELD,
  preset = DEFAULT_PRESET,
  scale = DEFAULT_SURFACE_SCALE,
  energy,
  coherence,
  warmth,
  pulse,
  className,
  style,
}: SurfaceProps) {
  const resolvedField = useMemo(() => resolveFieldName(field, console.warn, SURFACE_FIELD_CONTEXT), [field]);
  const resolvedPreset = useMemo(() => resolveStateName(preset, console.warn, SURFACE_PRESET_CONTEXT), [preset]);
  const channels = useMemo(
    () => resolveSurfaceChannels(resolvedPreset, { energy, coherence, warmth, pulse }),
    [resolvedPreset, energy, coherence, warmth, pulse]
  );

  // SSR-safe hydration, same pattern as <Orb>: server and first client
  // render both produce the CSS-gradient fallback; only after mounting do
  // we swap to the canvas.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [measuredSize, setMeasuredSize] = useState<{ width: number; height: number } | null>(null);

  // A Surface has no fixed `size` prop (unlike Orb) — it fills its
  // container, at whatever aspect ratio that container has. Measuring via
  // ResizeObserver is event-driven, not per-frame work: it fires only on
  // an actual size change, never on a schedule.
  useEffect(() => {
    const node = wrapperRef.current;
    if (!mounted || !node) return;
    const measure = () => setMeasuredSize({ width: node.clientWidth, height: node.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [mounted]);

  // The one and only render path — no ticker, no rAF, ever. Re-runs when a
  // prop changes or the measured container size changes, each time
  // producing exactly one frame.
  useEffect(() => {
    if (!mounted || !measuredSize || measuredSize.width === 0 || measuredSize.height === 0) return;
    renderFrame({
      canvas: canvasRef.current,
      fieldName: resolvedField,
      shape: 'surface',
      width: measuredSize.width,
      height: measuredSize.height,
      uniforms: { ...channels, t: 0 },
      scale,
    });
  }, [mounted, measuredSize, resolvedField, channels, scale]);

  if (!mounted) {
    return (
      <div
        className={className}
        style={{ width: '100%', height: '100%', pointerEvents: 'none', background: cssGradientForWarmth(channels.warmth), ...style }}
      />
    );
  }

  return (
    <div
      ref={wrapperRef}
      className={className}
      style={{ width: '100%', height: '100%', pointerEvents: 'none', ...style }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }}
        aria-hidden="true"
      />
    </div>
  );
}
