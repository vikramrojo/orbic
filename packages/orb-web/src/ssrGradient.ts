function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/**
 * A static CSS radial-gradient approximating the orb's look, used before
 * the WebGL canvas exists: during SSR, and on the client until the
 * hydration effect confirms the DOM is interactive (platform-renderers
 * spec: SSR-safe with a CSS-gradient fallback). Distinct from
 * `fallbackColorFromChannels`, which is a flat solid colour for a runtime
 * shader compile failure — this one is explicitly a gradient.
 */
export function cssGradientForWarmth(warmth: number): string {
  const hue = 220 - 220 * clamp01(warmth);
  return `radial-gradient(circle at 35% 30%, hsl(${hue.toFixed(1)}, 60%, 60%), hsl(${hue.toFixed(1)}, 55%, 30%))`;
}

/**
 * The orb's SSR/pre-hydration placeholder.
 *
 * Separate from `cssGradientForWarmth` because the two shapes want opposite
 * things: a Surface is a full-bleed rectangle and must stay opaque to its
 * edges, while the orb compositor now fades to nothing well inside its box.
 * This one therefore ends at `transparent`, and its stops mirror
 * ORB_CORE_RADIUS/ORB_FADE_RADIUS in compositors/orb.orb.
 *
 * The caller must NOT also clip this to a circle — a hard `borderRadius: 50%`
 * would reintroduce exactly the silhouette the compositor stopped drawing.
 */
export function cssOrbGradientForWarmth(warmth: number): string {
  const hue = 220 - 220 * clamp01(warmth);
  const core = `hsl(${hue.toFixed(1)}, 60%, 52%)`;
  return `radial-gradient(circle at 50% 50%, ${core} 0%, ${core} 36%, transparent 100%)`;
}
