import { ShaderCompileError, linkProgram } from './compile.js';
import { VERTEX_SHADER_SOURCE } from './vertexShader.js';

type Listener = () => void;

/**
 * Every uniform any generated fragment shader may declare — the frozen
 * four-channel ABI (docs/shader-abi.md) plus u_resolution/u_time, and
 * u_scale (surface-only, surface-component spec's `scale` prop). Resolved
 * once per program, not looked up every frame. `gl.getUniformLocation`
 * returns null for a name a given program doesn't declare (e.g. u_scale on
 * an orb program) — safe to resolve unconditionally for every program;
 * `gl.uniform1f(null, ...)` on an unused location is a documented no-op.
 */
export const UNIFORM_NAMES = [
  'u_resolution',
  'u_time',
  'u_energy',
  'u_coherence',
  'u_warmth',
  'u_pulse',
  'u_scale',
] as const;
export type UniformName = (typeof UNIFORM_NAMES)[number];

export interface CompiledProgram {
  program: WebGLProgram;
  locations: Record<UniformName, WebGLUniformLocation | null>;
}

/**
 * One WebGL2 context, process-wide, shared by every `<Orb>`/`<Surface>`
 * instance (platform-renderers spec: "one shared WebGL2 context"). Each
 * distinct fragment shader is compiled exactly once and cached by key.
 *
 * The canvas is created lazily via an injectable factory (defaulting to a
 * real detached `<canvas>`) so tests can supply a mock implementing the
 * same `webglcontextlost`/`webglcontextrestored` event contract without a
 * real GPU.
 */
export class SharedGLContext {
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private programs = new Map<string, CompiledProgram>();
  private failedKeys = new Set<string>();
  private sources = new Map<string, string>();
  private lossListeners = new Set<Listener>();
  private restoreListeners = new Set<Listener>();
  private lost = false;

  constructor(private readonly createCanvas: () => HTMLCanvasElement = () => document.createElement('canvas')) {}

  private ensure(): WebGL2RenderingContext | null {
    if (this.gl) return this.gl;

    // The SSR guard belongs to the *default* factory (real `document`
    // access), not to an injected one — a caller supplying its own
    // `createCanvas` (e.g. a test's mock) must work in an environment with
    // no `document` at all, so this only catches the default path failing.
    let canvas: HTMLCanvasElement;
    try {
      canvas = this.createCanvas();
    } catch {
      return null;
    }
    if (!canvas) return null;

    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true }) as WebGL2RenderingContext | null;
    if (!gl) return null;

    this.canvas = canvas;
    this.gl = gl;

    // Per platform-renderers spec: without calling preventDefault() here,
    // the browser never fires webglcontextrestored at all.
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.lost = true;
      this.programs.clear();
      for (const listener of this.lossListeners) listener();
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      for (const [key, source] of this.sources) {
        this.tryCompile(key, source);
      }
      for (const listener of this.restoreListeners) listener();
    });

    return gl;
  }

  /** The shared context, creating it on first access. Null during SSR or if WebGL2 is unavailable. */
  get context(): WebGL2RenderingContext | null {
    return this.ensure();
  }

  get isLost(): boolean {
    return this.lost;
  }

  onContextLost(fn: Listener): () => void {
    this.lossListeners.add(fn);
    return () => this.lossListeners.delete(fn);
  }

  onContextRestored(fn: Listener): () => void {
    this.restoreListeners.add(fn);
    return () => this.restoreListeners.delete(fn);
  }

  /**
   * Returns the cached compiled program (plus its resolved uniform
   * locations, so callers never call `gl.getUniformLocation` per frame) for
   * `key`, compiling it once on first request. A failed compilation is
   * logged once (not retried every frame) and returns null on this and
   * every subsequent call for the same key, until a context restore clears
   * the failure and retries.
   */
  getOrCompileProgram(key: string, fragmentSource: string): CompiledProgram | null {
    const gl = this.ensure();
    if (!gl || this.lost) return null;

    const cached = this.programs.get(key);
    if (cached) return cached;
    if (this.failedKeys.has(key)) return null;

    this.sources.set(key, fragmentSource);
    return this.tryCompile(key, fragmentSource);
  }

  private tryCompile(key: string, fragmentSource: string): CompiledProgram | null {
    if (!this.gl) return null;
    try {
      const program = linkProgram(this.gl, VERTEX_SHADER_SOURCE, fragmentSource);
      const locations = {} as Record<UniformName, WebGLUniformLocation | null>;
      for (const name of UNIFORM_NAMES) {
        locations[name] = this.gl.getUniformLocation(program, name);
      }
      const compiled: CompiledProgram = { program, locations };
      this.programs.set(key, compiled);
      this.failedKeys.delete(key);
      return compiled;
    } catch (err) {
      if (!this.failedKeys.has(key)) {
        this.failedKeys.add(key);
        const message = err instanceof ShaderCompileError ? err.message : String(err);
        console.error(`Orbic: shader "${key}" failed to compile at runtime — ${message}`);
      }
      return null;
    }
  }
}

/** The process-wide singleton every component instance shares. */
export const sharedGLContext = new SharedGLContext();
