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
