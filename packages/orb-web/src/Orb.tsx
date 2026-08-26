import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { presetChannels } from '@orbic/core';
import { FIELD_SHADERS } from './generated/shaders.js';
import { renderFrame } from './gl/renderFrame.js';
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion.js';
import { useIsDocumentVisible } from './hooks/useIsDocumentVisible.js';
import { useIsIntersecting } from './hooks/useIsIntersecting.js';
import { OrbRuntime } from '@orbic/core';
import { resolveFieldName, resolveStateName } from '@orbic/core';
import { registerTicker } from './runtime/sharedTicker.js';
import { cssOrbGradientForWarmth } from './ssrGradient.js';

const DEFAULT_FIELD = Object.keys(FIELD_SHADERS)[0]!;
const DEFAULT_STATE = 'subtle';
const DEFAULT_SIZE = 96;

export interface OrbProps {
  /** Loosely typed on purpose: an unrecognised value falls back with a warning rather than failing to type-check. */
  field?: string;
  state?: string;
  /** Square size in CSS pixels. Changing this re-renders at the new resolution — it never rescales a previous raster. */
  size?: number;
  /** Scales the animation clock only; channel values and spring behaviour are unaffected. */
  speed?: number;
  paused?: boolean;
  /**
   * Silhouette firmness, 0..1. The orb compositor renders a soft radial
   * falloff with no hard edge; raising this firms that falloff into a more
   * defined border. It never restores the old masked sphere with its rim
   * highlight — that look is retired.
   */
  edge?: number;
  className?: string;
  style?: CSSProperties;
}

export function Orb({
  field = DEFAULT_FIELD,
  state = DEFAULT_STATE,
  size = DEFAULT_SIZE,
  speed = 1,
  paused = false,
  edge = 0,
  className,
  style,
}: OrbProps) {
  const resolvedField = useMemo(() => resolveFieldName(field), [field]);
  const resolvedState = useMemo(() => resolveStateName(state), [state]);

  // SSR-safe hydration: the server (and the client's first render) always
  // produce the CSS-gradient fallback; only after mounting do we swap to
  // the canvas, so hydration never mismatches and there is no layout shift
  // (the fallback and the canvas wrapper are both exactly `size` square).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const reducedMotion = usePrefersReducedMotion();
  const documentVisible = useIsDocumentVisible();

  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intersecting = useIsIntersecting(wrapperRef);

  const [runtime] = useState(() => new OrbRuntime(resolvedState, speed));

  useEffect(() => {
    runtime.setState(resolvedState);
  }, [runtime, resolvedState]);

  useEffect(() => {
    runtime.setSpeed(speed);
  }, [runtime, speed]);

  useEffect(() => {
    if (reducedMotion) runtime.snapTo(resolvedState);
  }, [reducedMotion, resolvedState, runtime]);

  // Read via refs inside the ticker closure so a `size`/field change never
  // requires tearing down and re-registering the ticker itself.
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const fieldRef = useRef(resolvedField);
  fieldRef.current = resolvedField;
  const edgeRef = useRef(edge);
  edgeRef.current = edge;

  const active = mounted && !reducedMotion && !paused && intersecting && documentVisible;

  // The animation lifecycle: registers exactly one ticker while active,
  // and calls activate()/deactivate() on the transitions (never mid-flight)
  // — this is what defers the t-wrap discontinuity to a moment nobody is
  // watching (orb-component spec).
  useEffect(() => {
    if (!active) return;
    runtime.activate();
    const unregister = registerTicker((now) => {
      const uniforms = runtime.tick(now);
      renderFrame({
        canvas: canvasRef.current,
        fieldName: fieldRef.current,
        shape: 'orb',
        width: sizeRef.current,
        height: sizeRef.current,
        uniforms,
        edge: edgeRef.current,
      });
    });
    return () => {
      unregister();
      runtime.deactivate();
    };
  }, [active, runtime]);

  // While inactive (paused, reduced motion, offscreen, hidden, or not yet
  // mounted), no ticker runs — but a `size` or `field` change must still
  // re-render at the new resolution rather than leaving stale pixels or
  // relying on a CSS rescale (orb-component spec: "size changes re-render
  // rather than rescale").
  //
  // `mounted` MUST be in this dependency array even though `active` already
  // accounts for it: an instance that is *also* paused/reduced-motion/etc
  // has `active === false` both before and after the mount effect flips
  // `mounted` (paused alone already forces active to false), so `active`
  // itself never changes value across that transition and this effect
  // would otherwise only ever run once — on the pre-mount render, before
  // `canvasRef.current` exists (it's still showing the SSR-gradient
  // branch) — and never again once the real canvas is attached, leaving it
  // at the browser's default 300x150 forever.
  useEffect(() => {
    if (active) return;
    renderFrame({
      canvas: canvasRef.current,
      fieldName: resolvedField,
      shape: 'orb',
      width: size,
      height: size,
      uniforms: runtime.uniforms(),
      edge,
    });
  }, [active, mounted, runtime, resolvedField, size, edge]);

  if (!mounted) {
    const warmth = presetChannels(resolvedState).warmth;
    return (
      <div
        className={className}
        // No borderRadius: the orb has no silhouette to clip to any more.
        style={{ width: size, height: size, background: cssOrbGradientForWarmth(warmth), ...style }}
      />
    );
  }

  return (
    <div ref={wrapperRef} className={className} style={{ width: size, height: size, ...style }}>
      <canvas ref={canvasRef} style={{ width: size, height: size, display: 'block' }} aria-hidden="true" />
    </div>
  );
}
