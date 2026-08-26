function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/**
 * A plain solid CSS colour derived from `warmth` (hue: cool blue -> warm
 * orange) and `energy` (lightness), used when a shader fails to compile at
 * runtime (platform-renderers spec: "solid colour derived from the
 * preset's warmth and energy channels"). Deliberately not animated — this
 * is a degraded fallback, not a second rendering path to keep in sync.
 */
export function fallbackColorFromChannels(channels: { warmth: number; energy: number }): string {
  const hue = 220 - 220 * clamp01(channels.warmth);
  const lightness = 35 + 25 * clamp01(channels.energy);
  return `hsl(${hue.toFixed(1)}, 55%, ${lightness.toFixed(1)}%)`;
}
