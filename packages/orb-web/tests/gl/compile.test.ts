import { describe, expect, it } from 'vitest';
import { ShaderCompileError, compileShader, linkProgram } from '../../src/gl/compile';
import { BAD_MARKER, GOOD_SOURCE, createMockGL } from './mockGL';

describe('compileShader', () => {
  it('returns a shader for valid source', () => {
    const { gl } = createMockGL();
    const shader = compileShader(gl as unknown as WebGL2RenderingContext, gl.FRAGMENT_SHADER, GOOD_SOURCE);
    expect(shader).toBeDefined();
  });

  it('throws ShaderCompileError with the compiler log for invalid source', () => {
    const { gl } = createMockGL();
    try {
      compileShader(gl as unknown as WebGL2RenderingContext, gl.FRAGMENT_SHADER, BAD_MARKER);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ShaderCompileError);
      expect((err as ShaderCompileError).stage).toBe('fragment');
      expect((err as ShaderCompileError).log).toContain('mock: shader compile failed');
    }
  });
});

describe('linkProgram', () => {
  it('links a program when both stages compile', () => {
    const { gl } = createMockGL();
    const program = linkProgram(gl as unknown as WebGL2RenderingContext, GOOD_SOURCE, GOOD_SOURCE);
    expect(program).toBeDefined();
  });

  it('throws when the fragment stage fails to compile', () => {
    const { gl } = createMockGL();
    expect(() => linkProgram(gl as unknown as WebGL2RenderingContext, GOOD_SOURCE, BAD_MARKER)).toThrow(
      ShaderCompileError
    );
  });

  it('throws when the vertex stage fails to compile', () => {
    const { gl } = createMockGL();
    expect(() => linkProgram(gl as unknown as WebGL2RenderingContext, BAD_MARKER, GOOD_SOURCE)).toThrow(
      ShaderCompileError
    );
  });
});
