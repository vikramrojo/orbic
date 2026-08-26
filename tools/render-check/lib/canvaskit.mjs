// Headless CanvasKit rendering: compiles an SkSL `RuntimeEffect`, draws it
// as a full-quad shader onto an offscreen raster surface, and reads back
// real pixels. This is the same `canvaskit-wasm` package and the same
// `RuntimeEffect.Make` compiler that `scripts/check-shaders.mjs` uses to
// validate SkSL — the difference here is that we also *run* the shader and
// look at what it produced, rather than only asking whether it compiled.
//
// The uniform layout below (`u_resolution` as 2 floats, then `u_time`,
// `u_energy`, `u_coherence`, `u_warmth`, `u_pulse`) matches
// `packages/orb-core/shaders/targets/preamble.sksl` exactly, in
// declaration order — SkSL's uniform buffer is positional, not named, so
// `makeShader()` expects a flat Float32Array in that exact order.
// `renderSksl` defensively checks the compiled effect's own
// `getUniformFloatCount()` against what we're about to pass, specifically
// so a future change to the preamble's uniform list fails loudly here
// instead of silently reading the wrong bytes into the wrong uniforms.

import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);

// Base ABI uniform list, per preamble.sksl: u_resolution(2) + u_time +
// u_energy + u_coherence + u_warmth + u_pulse. The SURFACE epilogue adds
// one more (`u_scale`, its public `scale` prop) -- discovered empirically via
// renderSksl's own defensive check below (getUniformFloatCount() came back 8
// where 7 was expected) rather than by assumption, which is exactly what that
// check is for.
//
// The ORB epilogue carries two trailing uniforms of its own, `u_edge` and
// `u_backlight` (the Orb component's public `edge` and `backlight` props), so
// the shapes now differ in BOTH length and meaning: 8 floats ending in
// `scale` for a surface, 9 ending in `edge, backlight` for an orb. Callers
// must pass the right ones for the shape; makeUniforms() appends whichever it
// is given and rejects a mix.
export const BASE_UNIFORM_FLOAT_COUNT = 7;
export const SURFACE_UNIFORM_FLOAT_COUNT = 8;
export const ORB_UNIFORM_FLOAT_COUNT = 9;
/** Matches epilogue-orb.sksl's default: 0 is an exact pass-through of the compositor's soft falloff. */
export const ORB_DEFAULT_EDGE = 0.0;
/** Matches epilogue-orb.sksl's default: 0 is no rear lighting at all. */
export const ORB_DEFAULT_BACKLIGHT = 0.0;
export const SURFACE_DEFAULT_SCALE = 3.0; // matches epilogue-surface.sksl's own stated default

let canvasKitPromise = null;

export function getCanvasKit() {
  if (!canvasKitPromise) {
    canvasKitPromise = (async () => {
      const CanvasKitInit = (await import('canvaskit-wasm')).default;
      const canvaskitEntry = require.resolve('canvaskit-wasm/bin/canvaskit.js');
      const binDir = dirname(canvaskitEntry);
      return CanvasKitInit({ locateFile: (file) => resolve(binDir, file) });
    })();
  }
  return canvasKitPromise;
}

/**
 * Builds the uniform Float32Array in the exact order the shaders declare it:
 * u_resolution.xy, u_time, u_energy, u_coherence, u_warmth, u_pulse --
 * followed by the SHAPE-SPECIFIC trailing floats. A surface adds `scale`
 * (epilogue-surface.sksl's u_scale); an orb adds `edge` then `backlight`, in
 * that declaration order (epilogue-orb.sksl).
 *
 * Mixing a surface float with orb floats throws. The two shapes now differ in
 * length as well as meaning, so `renderSksl`'s length check would catch most
 * mistakes -- but it could not catch a swap between two orb floats, and it is
 * cheaper to reject the mistake here than to debug a render that is merely
 * wrong rather than broken.
 */
export function makeUniforms({
  width,
  height,
  time = 0,
  energy = 0.5,
  coherence = 0.5,
  warmth = 0.5,
  pulse = 0,
  scale,
  edge,
  backlight,
}) {
  const orbGiven = edge !== undefined || backlight !== undefined;
  if (scale !== undefined && orbGiven) {
    throw new Error(
      'makeUniforms: pass `scale` (surface) or `edge`/`backlight` (orb), not a mix — they are different shapes'
    );
  }

  const values = [width, height, time, energy, coherence, warmth, pulse];
  if (scale !== undefined) values.push(scale);
  if (orbGiven) {
    // Declaration order, not argument order: u_edge precedes u_backlight.
    values.push(edge ?? ORB_DEFAULT_EDGE, backlight ?? ORB_DEFAULT_BACKLIGHT);
  }
  return new Float32Array(values);
}

/**
 * Compiles `sksl` and draws it as a full-quad shader onto a `width` x
 * `height` offscreen raster surface, returning `{ width, height, pixels }`
 * where `pixels` is an unpremultiplied RGBA_8888 Uint8Array (row-major, top
 * to bottom, 4 bytes per pixel).
 */
export async function renderSksl(sksl, { width, height, uniforms }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`renderSksl: invalid dimensions ${width}x${height}`);
  }

  const CanvasKit = await getCanvasKit();
  const effect = CanvasKit.RuntimeEffect.Make(sksl);
  if (!effect) {
    throw new Error('renderSksl: RuntimeEffect.Make failed to compile the given SkSL');
  }

  try {
    const expectedFloats = effect.getUniformFloatCount();
    if (uniforms.length !== expectedFloats) {
      throw new Error(
        `renderSksl: uniform array has ${uniforms.length} floats but the compiled effect expects ` +
          `${expectedFloats} (getUniformFloatCount()) -- preamble.sksl's uniform list no longer ` +
          `matches UNIFORM_FLOAT_COUNT/makeUniforms() in tools/render-check/lib/canvaskit.mjs. ` +
          `Passing a mismatched-length array would silently misalign every uniform after the ` +
          `first difference, which is exactly the "wrong resolution uniform" failure mode this ` +
          `check exists to catch -- fail loudly instead.`
      );
    }

    const shader = effect.makeShader(uniforms);
    try {
      const surface = CanvasKit.MakeSurface(width, height);
      if (!surface) {
        throw new Error(`renderSksl: CanvasKit.MakeSurface(${width}, ${height}) returned null`);
      }
      try {
        const canvas = surface.getCanvas();
        const paint = new CanvasKit.Paint();
        try {
          paint.setShader(shader);
          canvas.drawPaint(paint);
          surface.flush();

          const img = surface.makeImageSnapshot();
          if (!img) {
            throw new Error('renderSksl: makeImageSnapshot() returned null');
          }
          try {
            const info = {
              width,
              height,
              colorType: CanvasKit.ColorType.RGBA_8888,
              alphaType: CanvasKit.AlphaType.Unpremul,
              colorSpace: CanvasKit.ColorSpace.SRGB,
            };
            const pixels = img.readPixels(0, 0, info);
            if (!pixels) {
              throw new Error('renderSksl: readPixels() returned null');
            }
            return { width, height, pixels: Uint8Array.from(pixels) };
          } finally {
            img.delete();
          }
        } finally {
          paint.delete();
        }
      } finally {
        surface.dispose();
      }
    } finally {
      shader.delete();
    }
  } finally {
    effect.delete();
  }
}

/** Reads one pixel as `[r, g, b, a]` (each 0-255). */
export function pixelAt(frame, x, y) {
  if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) {
    throw new Error(`pixelAt: (${x}, ${y}) out of bounds for ${frame.width}x${frame.height} frame`);
  }
  const i = (y * frame.width + x) * 4;
  return [frame.pixels[i], frame.pixels[i + 1], frame.pixels[i + 2], frame.pixels[i + 3]];
}

/** Crops an axis-aligned `w`x`h` region starting at `(x0, y0)` out of `frame`, returning a new frame of that size. */
export function cropRegion(frame, x0, y0, w, h) {
  if (x0 < 0 || y0 < 0 || x0 + w > frame.width || y0 + h > frame.height) {
    throw new Error(
      `cropRegion: region (${x0},${y0},${w}x${h}) does not fit inside ${frame.width}x${frame.height} frame`
    );
  }
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const srcRowStart = ((y0 + y) * frame.width + x0) * 4;
    const dstRowStart = y * w * 4;
    out.set(frame.pixels.subarray(srcRowStart, srcRowStart + w * 4), dstRowStart);
  }
  return { width: w, height: h, pixels: out };
}

/**
 * Nearest-neighbour resize of `frame` to `outW`x`outH`. Used only to bring
 * two frames that represent the *same world-space extent* at different
 * pixel densities onto a common pixel grid before comparing them --- see
 * aspect-check.mjs for why this is needed rather than a raw pixel crop.
 * For a non-integer scale factor (e.g. 300 -> 180 is 5:3) this aliases on
 * high-frequency content -- see `resizeAreaAverage` for the lower-error
 * alternative aspect-check.mjs actually uses.
 */
export function resizeNearest(frame, outW, outH) {
  const out = new Uint8Array(outW * outH * 4);
  for (let y = 0; y < outH; y++) {
    const srcY = Math.min(frame.height - 1, Math.floor(((y + 0.5) * frame.height) / outH));
    for (let x = 0; x < outW; x++) {
      const srcX = Math.min(frame.width - 1, Math.floor(((x + 0.5) * frame.width) / outW));
      const srcI = (srcY * frame.width + srcX) * 4;
      const dstI = (y * outW + x) * 4;
      out[dstI] = frame.pixels[srcI];
      out[dstI + 1] = frame.pixels[srcI + 1];
      out[dstI + 2] = frame.pixels[srcI + 2];
      out[dstI + 3] = frame.pixels[srcI + 3];
    }
  }
  return { width: outW, height: outH, pixels: out };
}

/**
 * Box-filter (area-average) downsample of `frame` to `outW`x`outH`: each
 * output pixel is the mean of every source pixel whose centre falls in its
 * footprint. Lower-error than nearest-neighbour for non-integer scale
 * factors and high-frequency content (aspect-check.mjs's 300x300 -> 180x180
 * step is exactly this: a 5:3 ratio being compared against a field
 * containing fine interference/noise detail).
 */
export function resizeAreaAverage(frame, outW, outH) {
  const out = new Uint8Array(outW * outH * 4);
  const scaleX = frame.width / outW;
  const scaleY = frame.height / outH;
  for (let y = 0; y < outH; y++) {
    const srcY0 = Math.floor(y * scaleY);
    const srcY1 = Math.max(srcY0 + 1, Math.min(frame.height, Math.round((y + 1) * scaleY)));
    for (let x = 0; x < outW; x++) {
      const srcX0 = Math.floor(x * scaleX);
      const srcX1 = Math.max(srcX0 + 1, Math.min(frame.width, Math.round((x + 1) * scaleX)));
      let r = 0, g = 0, b = 0, a = 0, count = 0;
      for (let sy = srcY0; sy < srcY1; sy++) {
        for (let sx = srcX0; sx < srcX1; sx++) {
          const i = (sy * frame.width + sx) * 4;
          r += frame.pixels[i];
          g += frame.pixels[i + 1];
          b += frame.pixels[i + 2];
          a += frame.pixels[i + 3];
          count++;
        }
      }
      const o = (y * outW + x) * 4;
      out[o] = Math.round(r / count);
      out[o + 1] = Math.round(g / count);
      out[o + 2] = Math.round(b / count);
      out[o + 3] = Math.round(a / count);
    }
  }
  return { width: outW, height: outH, pixels: out };
}

/** Per-channel mean absolute difference between two same-sized frames. */
export function meanAbsDiff(frameA, frameB) {
  if (frameA.width !== frameB.width || frameA.height !== frameB.height) {
    throw new Error(
      `meanAbsDiff: size mismatch ${frameA.width}x${frameA.height} vs ${frameB.width}x${frameB.height}`
    );
  }
  const n = frameA.width * frameA.height;
  let r = 0, g = 0, b = 0, a = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    r += Math.abs(frameA.pixels[o] - frameB.pixels[o]);
    g += Math.abs(frameA.pixels[o + 1] - frameB.pixels[o + 1]);
    b += Math.abs(frameA.pixels[o + 2] - frameB.pixels[o + 2]);
    a += Math.abs(frameA.pixels[o + 3] - frameB.pixels[o + 3]);
  }
  return { r: r / n, g: g / n, b: b / n, a: a / n };
}

/** Per-channel maximum absolute difference between two same-sized frames. */
export function maxAbsDiff(frameA, frameB) {
  if (frameA.width !== frameB.width || frameA.height !== frameB.height) {
    throw new Error(
      `maxAbsDiff: size mismatch ${frameA.width}x${frameA.height} vs ${frameB.width}x${frameB.height}`
    );
  }
  const n = frameA.width * frameA.height;
  let r = 0, g = 0, b = 0, a = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    r = Math.max(r, Math.abs(frameA.pixels[o] - frameB.pixels[o]));
    g = Math.max(g, Math.abs(frameA.pixels[o + 1] - frameB.pixels[o + 1]));
    b = Math.max(b, Math.abs(frameA.pixels[o + 2] - frameB.pixels[o + 2]));
    a = Math.max(a, Math.abs(frameA.pixels[o + 3] - frameB.pixels[o + 3]));
  }
  return { r, g, b, a };
}
