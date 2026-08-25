// Orbic epilogue — orb shape, GLSL ES 3.00.
//
// Maps the fragment coordinate into aspect-preserving world space at orb
// scale (p spans roughly a unit disc — see docs/shader-abi.md) and calls
// the compositor. `u_time` is assumed already wrapped (at 3600 s) by the
// caller before being written to this uniform; the epilogue does no
// per-pixel wrapping of its own.

const float ORB_SCALE = 1.0;

void main() {
    vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y) * ORB_SCALE;
    oFragColor = composite(p, u_time, u_energy, u_coherence, u_warmth, u_pulse);
}
