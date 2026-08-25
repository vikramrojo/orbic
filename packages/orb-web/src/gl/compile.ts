export class ShaderCompileError extends Error {
  constructor(
    public readonly stage: 'vertex' | 'fragment' | 'link',
    public readonly log: string
  ) {
    super(`Orbic: ${stage} shader failed — ${log}`);
    this.name = 'ShaderCompileError';
  }
}

export function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const stage = type === gl.VERTEX_SHADER ? 'vertex' : 'fragment';
  const shader = gl.createShader(type);
  if (!shader) {
    throw new ShaderCompileError(stage, 'gl.createShader returned null');
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? '(no info log)';
    gl.deleteShader(shader);
    throw new ShaderCompileError(stage, log);
  }
  return shader;
}

/** Compiles and links a program from a vertex + fragment source pair, throwing `ShaderCompileError` on any failure. */
export function linkProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new ShaderCompileError('link', 'gl.createProgram returned null');
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? '(no info log)';
    gl.deleteProgram(program);
    throw new ShaderCompileError('link', log);
  }

  return program;
}
