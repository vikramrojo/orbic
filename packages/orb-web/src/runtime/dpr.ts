/** Renderers cap the effective device pixel ratio at 2 (platform-renderers spec). */
export const MAX_DEVICE_PIXEL_RATIO = 2;

export function cappedDevicePixelRatio(rawDpr: number): number {
  const safe = Number.isFinite(rawDpr) && rawDpr > 0 ? rawDpr : 1;
  return Math.min(safe, MAX_DEVICE_PIXEL_RATIO);
}

/** The drawing-buffer size, in physical pixels, for a `cssSize`-square canvas at `rawDpr`. */
export function drawingBufferSize(cssSize: number, rawDpr: number): number {
  return Math.max(1, Math.round(cssSize * cappedDevicePixelRatio(rawDpr)));
}
