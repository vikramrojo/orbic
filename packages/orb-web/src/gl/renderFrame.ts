import { FIELD_SHADERS } from '../generated/shaders.js';
import type { FieldName } from '../generated/shaders.js';
import { drawingBufferSize } from '../runtime/dpr.js';
import { fallbackColorFromChannels } from '../runtime/fallbackColor.js';
import type { OrbUniforms } from '../runtime/OrbRuntime.js';
import { sharedGLContext } from './sharedContext.js';

/** Matches the surface epilogues' previous hardcoded SURFACE_SCALE, so omitting `scale` is behaviourally unchanged. */
export const DEFAULT_SURFACE_SCALE = 3.0;

export interface RenderFrameOptions {
  canvas: HTMLCanvasElement | null;
  fieldName: FieldName;
  shape: 'orb' | 'surface';
  /** CSS pixels. Independent width/height (not a single square `size`) — a Surface is a full-bleed background at an arbitrary aspect ratio. */
  width: number;
  height: number;
  uniforms: OrbUniforms;
  /** World-space zoom, surface-only (surface-component spec's `scale` prop). Ignored by the orb shape. */
  scale?: number;
}

/**
 * Renders one frame for a single component instance: resizes that
 * instance's own visible 2D canvas to `width`x`height` at a capped DPR,
 * renders the requested field+shape into the shared WebGL2 canvas at that
 * resolution (compiling its program once and reusing it thereafter), then
 * blits the result onto the instance's canvas — this is what lets many
 * instances share exactly one WebGL2 context (platform-renderers spec)
 * despite each needing its own on-screen position and size.
 *
 * Falls back to a flat solid colour, painted with the 2D context directly
 * (never via WebGL), if the context is lost, unavailable, or the shader
 * fails to compile.
 */
export function renderFrame({
  canvas,
  fieldName,
  shape,
  width,
  height,
  uniforms,
  scale = DEFAULT_SURFACE_SCALE,
}: RenderFrameOptions): void {
  if (!canvas) return;

  const dpr = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;
  const bufferWidth = drawingBufferSize(width, dpr);
  const bufferHeight = drawingBufferSize(height, dpr);

  const gl = sharedGLContext.context;
  if (!gl || sharedGLContext.isLost) {
    paintFallback(canvas, shape, bufferWidth, bufferHeight, uniforms);
    return;
  }

  const fragmentSource = FIELD_SHADERS[fieldName][shape];
  const compiled = sharedGLContext.getOrCompileProgram(`${fieldName}-${shape}`, fragmentSource);
  if (!compiled) {
    paintFallback(canvas, shape, bufferWidth, bufferHeight, uniforms);
    return;
  }
  const { program, locations } = compiled;
  const glCanvas = gl.canvas as HTMLCanvasElement;

  // Assigning canvas.width/height ALWAYS resets the drawing buffer (clears
  // it, reallocates the backing store) per the HTML spec — even when
  // assigning the value it already has. At 60fps, an unguarded assignment
  // here reallocates two canvas buffers per instance per frame for no
  // reason. Only touch it when the size actually changed.
  resizeCanvasIfNeeded(glCanvas, bufferWidth, bufferHeight);
  gl.viewport(0, 0, bufferWidth, bufferHeight);

  gl.useProgram(program);
  gl.uniform2f(locations.u_resolution, bufferWidth, bufferHeight);
  gl.uniform1f(locations.u_time, uniforms.t);
  gl.uniform1f(locations.u_energy, uniforms.energy);
  gl.uniform1f(locations.u_coherence, uniforms.coherence);
  gl.uniform1f(locations.u_warmth, uniforms.warmth);
  gl.uniform1f(locations.u_pulse, uniforms.pulse);
  gl.uniform1f(locations.u_scale, scale); // null location on an orb program: documented no-op

  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND);
  // The compositor returns premultiplied colour and alpha (docs/shader-abi.md).
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  resizeCanvasIfNeeded(canvas, bufferWidth, bufferHeight);
  const ctx2d = canvas.getContext('2d');
  if (ctx2d) {
    // The resize above only clears when the size changed; when it's
    // unchanged this clearRect is what actually erases the previous frame
    // before the new one blits in.
    ctx2d.clearRect(0, 0, bufferWidth, bufferHeight);
    ctx2d.drawImage(glCanvas, 0, 0, bufferWidth, bufferHeight);
  }
}

/** Resizes a canvas's drawing buffer only if it actually changed — see the note in `renderFrame`. */
export function resizeCanvasIfNeeded(canvas: HTMLCanvasElement, width: number, height: number): void {
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function paintFallback(
  canvas: HTMLCanvasElement,
  shape: 'orb' | 'surface',
  bufferWidth: number,
  bufferHeight: number,
  uniforms: OrbUniforms
): void {
  resizeCanvasIfNeeded(canvas, bufferWidth, bufferHeight);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, bufferWidth, bufferHeight);
  ctx.fillStyle = fallbackColorFromChannels(uniforms);
  if (shape === 'orb') {
    // The orb is a masked circle; the fallback should read as the same
    // silhouette, not a filled square, over an arbitrary background.
    const radius = Math.min(bufferWidth, bufferHeight) / 2;
    ctx.beginPath();
    ctx.arc(bufferWidth / 2, bufferHeight / 2, radius, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // The surface is a full-bleed rectangle.
    ctx.fillRect(0, 0, bufferWidth, bufferHeight);
  }
}
