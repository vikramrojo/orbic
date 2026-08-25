import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SharedGLContext } from '../../src/gl/sharedContext';
import { BAD_MARKER, GOOD_SOURCE, createMockGL } from './mockGL';

describe('SharedGLContext — program caching (one shared context, compile once)', () => {
  it('compiles a program once per key and reuses it on subsequent calls', () => {
    const { canvas, gl } = createMockGL();
    const linkProgramSpy = vi.spyOn(gl, 'linkProgram');
    const ctx = new SharedGLContext(() => canvas);

    const first = ctx.getOrCompileProgram('flat-color-orb', GOOD_SOURCE);
    const second = ctx.getOrCompileProgram('flat-color-orb', GOOD_SOURCE);

    expect(first).not.toBeNull();
    expect(second).toBe(first); // same cached program instance
    expect(linkProgramSpy).toHaveBeenCalledTimes(1);
  });

  it('compiles distinct keys independently', () => {
    const { canvas, gl } = createMockGL();
    const linkProgramSpy = vi.spyOn(gl, 'linkProgram');
    const ctx = new SharedGLContext(() => canvas);

    ctx.getOrCompileProgram('field-a', GOOD_SOURCE);
    ctx.getOrCompileProgram('field-b', GOOD_SOURCE);

    expect(linkProgramSpy).toHaveBeenCalledTimes(2);
  });

  it('resolves uniform locations once at compile time, not on every retrieval — callers must never call gl.getUniformLocation per frame', () => {
    const { canvas, gl } = createMockGL();
    const getUniformLocationSpy = vi.spyOn(gl, 'getUniformLocation');
    const ctx = new SharedGLContext(() => canvas);

    const compiled = ctx.getOrCompileProgram('flat-color-orb', GOOD_SOURCE);
    expect(compiled).not.toBeNull();
    const callsAfterCompile = getUniformLocationSpy.mock.calls.length;
    expect(callsAfterCompile).toBeGreaterThan(0); // resolved eagerly at compile time

    // Simulate several "frames" worth of retrieval — a real caller reads
    // .locations off the cached object rather than re-querying the GL.
    ctx.getOrCompileProgram('flat-color-orb', GOOD_SOURCE);
    ctx.getOrCompileProgram('flat-color-orb', GOOD_SOURCE);
    ctx.getOrCompileProgram('flat-color-orb', GOOD_SOURCE);

    expect(getUniformLocationSpy.mock.calls.length).toBe(callsAfterCompile);
  });

  it('returns the ABI uniform locations, all resolved', () => {
    const { canvas } = createMockGL();
    const ctx = new SharedGLContext(() => canvas);
    const compiled = ctx.getOrCompileProgram('flat-color-orb', GOOD_SOURCE)!;

    for (const name of ['u_resolution', 'u_time', 'u_energy', 'u_coherence', 'u_warmth', 'u_pulse', 'u_scale'] as const) {
      expect(compiled.locations[name]).toBeDefined();
    }
  });
});

describe('SharedGLContext — compile failure fallback', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('returns null (not a throw) when the shader fails to compile', () => {
    const { canvas } = createMockGL();
    const ctx = new SharedGLContext(() => canvas);
    const program = ctx.getOrCompileProgram('broken', BAD_MARKER);
    expect(program).toBeNull();
  });

  it('reports the failure once, not on every call for the same key', () => {
    const { canvas } = createMockGL();
    const ctx = new SharedGLContext(() => canvas);

    ctx.getOrCompileProgram('broken', BAD_MARKER);
    ctx.getOrCompileProgram('broken', BAD_MARKER);
    ctx.getOrCompileProgram('broken', BAD_MARKER);

    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('does not retry compilation on every call for an already-failed key', () => {
    const { canvas, gl } = createMockGL();
    // BAD_MARKER fails at the shader-compile stage (fragment shader),
    // which never reaches gl.linkProgram at all — compileShader is the
    // call that's always attempted, for both stages, on every real attempt.
    const compileShaderSpy = vi.spyOn(gl, 'compileShader');
    const ctx = new SharedGLContext(() => canvas);

    ctx.getOrCompileProgram('broken', BAD_MARKER);
    const callsAfterFirst = compileShaderSpy.mock.calls.length;
    ctx.getOrCompileProgram('broken', BAD_MARKER);

    expect(callsAfterFirst).toBeGreaterThan(0); // the first call really did attempt compilation
    expect(compileShaderSpy.mock.calls.length).toBe(callsAfterFirst); // the second call did not retry
  });
});

describe('SharedGLContext — WebGL context loss and restore', () => {
  it('calls preventDefault() on webglcontextlost — without it the browser never fires webglcontextrestored', () => {
    const { canvas, gl } = createMockGL();
    const ctx = new SharedGLContext(() => canvas);
    ctx.getOrCompileProgram('flat-color-orb', GOOD_SOURCE); // forces context creation

    const loseContextExt = gl.getExtension('WEBGL_lose_context')!;
    const dispatchSpy = vi.spyOn(canvas, 'dispatchEvent');
    loseContextExt.loseContext();

    const dispatchedEvent = dispatchSpy.mock.results[0]?.value;
    // dispatchEvent returns false when defaultPrevented (standard DOM contract)
    expect(dispatchedEvent).toBe(false);
  });

  it('marks the context lost and clears the program cache on loss', () => {
    const { canvas, gl } = createMockGL();
    const ctx = new SharedGLContext(() => canvas);
    ctx.getOrCompileProgram('flat-color-orb', GOOD_SOURCE);
    expect(ctx.isLost).toBe(false);

    gl.getExtension('WEBGL_lose_context')!.loseContext();

    expect(ctx.isLost).toBe(true);
    // A request during loss must not silently reuse a stale cached program.
    expect(ctx.getOrCompileProgram('flat-color-orb', GOOD_SOURCE)).toBeNull();
  });

  it('notifies onContextLost listeners', () => {
    const { canvas, gl } = createMockGL();
    const ctx = new SharedGLContext(() => canvas);
    ctx.getOrCompileProgram('flat-color-orb', GOOD_SOURCE);

    const listener = vi.fn();
    ctx.onContextLost(listener);
    gl.getExtension('WEBGL_lose_context')!.loseContext();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('recompiles every previously-known shader from its remembered source on restore, and resumes rendering', () => {
    const { canvas, gl } = createMockGL();
    const linkProgramSpy = vi.spyOn(gl, 'linkProgram');
    const ctx = new SharedGLContext(() => canvas);

    ctx.getOrCompileProgram('flat-color-orb', GOOD_SOURCE);
    ctx.getOrCompileProgram('flat-color-surface', GOOD_SOURCE);
    expect(linkProgramSpy).toHaveBeenCalledTimes(2);

    gl.getExtension('WEBGL_lose_context')!.loseContext();
    expect(ctx.isLost).toBe(true);

    const restoreListener = vi.fn();
    ctx.onContextRestored(restoreListener);
    gl.getExtension('WEBGL_lose_context')!.restoreContext();

    expect(ctx.isLost).toBe(false);
    expect(restoreListener).toHaveBeenCalledTimes(1);
    // Recompiled both remembered sources without the caller re-requesting them.
    expect(linkProgramSpy).toHaveBeenCalledTimes(4);
    expect(ctx.getOrCompileProgram('flat-color-orb', GOOD_SOURCE)).not.toBeNull();
  });

  it('all instances sharing the one context recover together on restore (not just the one that happened to trigger recompilation)', () => {
    // Models "one Orb and eight Surfaces" from the spec: many distinct
    // shader keys, one shared context, one loss/restore cycle.
    const { canvas, gl } = createMockGL();
    const ctx = new SharedGLContext(() => canvas);
    const keys = ['orb', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'];
    for (const key of keys) {
      ctx.getOrCompileProgram(key, GOOD_SOURCE);
    }

    gl.getExtension('WEBGL_lose_context')!.loseContext();
    for (const key of keys) {
      expect(ctx.getOrCompileProgram(key, GOOD_SOURCE)).toBeNull();
    }

    gl.getExtension('WEBGL_lose_context')!.restoreContext();
    for (const key of keys) {
      expect(ctx.getOrCompileProgram(key, GOOD_SOURCE)).not.toBeNull();
    }
  });
});
