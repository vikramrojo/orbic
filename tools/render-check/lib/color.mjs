// WCAG 2.x relative luminance and contrast ratio, applied to the raw
// unpremultiplied sRGB bytes `renderSksl` reads back (our shaders write
// display-ready colour directly, the same way the original radiant demos
// wrote straight to `gl_FragColor` with no separate linear-workflow colour
// management -- see the field files' provenance headers).

/** sRGB channel (0..1) -> linear-light channel (0..1), per the WCAG formula. */
export function srgbChannelToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance of an sRGB colour given as [r, g, b] in 0..1. */
export function relativeLuminance([r, g, b]) {
  const rl = srgbChannelToLinear(r);
  const gl = srgbChannelToLinear(g);
  const bl = srgbChannelToLinear(b);
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

/** WCAG contrast ratio between two relative luminances (order-independent). */
export function contrastRatio(l1, l2) {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Relative luminance of an 8-bit-per-channel colour, e.g. from a rendered frame's pixel bytes. */
export function relativeLuminance8(r, g, b) {
  return relativeLuminance([r / 255, g / 255, b / 255]);
}
