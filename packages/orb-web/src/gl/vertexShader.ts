/**
 * A single fullscreen triangle, generated purely from `gl_VertexID` — no
 * vertex buffer needed. Covers clip space from (-1,-1) out past (1,1),
 * clipped by the viewport to exactly the visible area.
 *
 * Hand-authored here rather than generated: Skia `RuntimeEffect` and
 * SwiftUI `.colorEffect` are per-pixel colour filters with no vertex stage
 * of their own, so a vertex shader is a WebGL-only concern and has no place
 * in the cross-platform `.orb` pipeline (docs/shader-abi.md).
 */
export const VERTEX_SHADER_SOURCE = `#version 300 es
void main() {
    vec2 pos = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
    gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}
`;
