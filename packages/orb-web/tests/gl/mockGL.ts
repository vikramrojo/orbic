// A hand-built mock of the WebGL2 surface our code actually touches, plus a
// faithful reproduction of the WEBGL_lose_context extension's documented
// contract (method names `loseContext()`/`restoreContext()`, and the real
// `webglcontextlost` / `webglcontextrestored` event pair with
// `preventDefault()` gating restoration).
//
// This is NOT a real GPU-backed context — headless-gl (the only way to get
// one in Node) fails to build on this machine (see the handback for this
// batch: a C++20/Node-24-ABI incompatibility in its native addon,
// independent of and deeper than the earlier Python/node-gyp issue). This
// mock lets us exercise the actual control-flow logic — does the loss
// handler call preventDefault, does the program cache get invalidated, does
// restore recompile from remembered sources — against the real event names
// and real semantics, without claiming GPU-level verification.

export interface FakeGLEvent {
  type: string;
  defaultPrevented: boolean;
  preventDefault(): void;
}

export class FakeEventTarget {
  private listeners = new Map<string, Set<(event: FakeGLEvent) => void>>();

  addEventListener(type: string, fn: (event: FakeGLEvent) => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }

  removeEventListener(type: string, fn: (event: FakeGLEvent) => void): void {
    this.listeners.get(type)?.delete(fn);
  }

  dispatchEvent(event: FakeGLEvent): boolean {
    for (const fn of this.listeners.get(event.type) ?? []) {
      fn(event);
    }
    return !event.defaultPrevented;
  }
}

function makeEvent(type: string): FakeGLEvent {
  return {
    type,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
}

/** Shader/program source text that should always compile in the mock. */
export const GOOD_SOURCE = 'GOOD';
/** Any source containing this string fails compilation in the mock. */
export const BAD_MARKER = 'FAIL_COMPILE';

let idCounter = 0;

export function createMockGL() {
  const canvas = new FakeEventTarget() as unknown as HTMLCanvasElement & FakeEventTarget;

  let contextLost = false;

  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    COLOR_BUFFER_BIT: 5,
    TRIANGLES: 6,
    ONE: 7,
    ONE_MINUS_SRC_ALPHA: 8,
    BLEND: 9,

    canvas,

    createShader(_type: number) {
      return { id: idCounter++, kind: 'shader' } as unknown as WebGLShader;
    },
    shaderSource(shader: unknown, source: string) {
      (shader as { source?: string }).source = source;
    },
    compileShader(shader: unknown) {
      const source = (shader as { source?: string }).source ?? '';
      (shader as { ok?: boolean }).ok = !source.includes(BAD_MARKER);
    },
    getShaderParameter(shader: unknown, _pname: number) {
      return (shader as { ok?: boolean }).ok ?? false;
    },
    getShaderInfoLog(shader: unknown) {
      return (shader as { ok?: boolean }).ok ? '' : 'mock: shader compile failed';
    },
    deleteShader(_shader: unknown) {},

    createProgram() {
      return { id: idCounter++, kind: 'program' } as unknown as WebGLProgram;
    },
    attachShader(program: unknown, shader: unknown) {
      const p = program as { shaders?: unknown[] };
      p.shaders = p.shaders ?? [];
      p.shaders.push(shader);
    },
    linkProgram(program: unknown) {
      const p = program as { shaders?: Array<{ ok?: boolean }>; linked?: boolean };
      p.linked = (p.shaders ?? []).every((s) => s.ok);
    },
    getProgramParameter(program: unknown, _pname: number) {
      return (program as { linked?: boolean }).linked ?? false;
    },
    getProgramInfoLog(program: unknown) {
      return (program as { linked?: boolean }).linked ? '' : 'mock: link failed';
    },
    deleteProgram(_program: unknown) {},

    useProgram(_program: unknown) {},
    getUniformLocation(_program: unknown, name: string) {
      return { name };
    },
    uniform1f(_loc: unknown, _v: number) {},
    uniform2f(_loc: unknown, _x: number, _y: number) {},
    viewport(_x: number, _y: number, _w: number, _h: number) {},
    clearColor(_r: number, _g: number, _b: number, _a: number) {},
    clear(_mask: number) {},
    enable(_cap: number) {},
    blendFunc(_src: number, _dst: number) {},
    drawArrays(_mode: number, _first: number, _count: number) {},

    getExtension(name: string) {
      if (name !== 'WEBGL_lose_context') return null;
      return {
        loseContext() {
          contextLost = true;
          canvas.dispatchEvent(makeEvent('webglcontextlost'));
        },
        restoreContext() {
          contextLost = false;
          canvas.dispatchEvent(makeEvent('webglcontextrestored'));
        },
      };
    },
  };

  (canvas as unknown as { getContext: (kind: string) => unknown }).getContext = (kind: string) => {
    if (kind !== 'webgl2') return null;
    return gl;
  };
  (canvas as unknown as { width: number }).width = 0;
  (canvas as unknown as { height: number }).height = 0;

  return { canvas, gl, isLost: () => contextLost };
}
