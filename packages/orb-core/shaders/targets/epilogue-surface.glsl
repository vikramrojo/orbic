// Orbic epilogue — surface shape, GLSL ES 3.00.
//
// Maps the fragment coordinate into aspect-preserving world space at
// surface scale (zoomed further out than the orb, so the same noise
// frequency reads as fine grain rather than a few large blobs — see
// docs/shader-abi.md). `u_time` is assumed already wrapped (at 3600 s) by
// the caller.
//
// u_scale is surface-specific — not part of the frozen four-channel ABI
// (energy/coherence/warmth/pulse), which field()/composite() alone see.
// It's plumbing local to this epilogue, the same way any other uniform is
// per design.md decision #2, exposed as the Surface component's public
// `scale` prop (surface-component spec). The renderer defaults it to 3.0,
// matching this file's previous hardcoded SURFACE_SCALE, so omitting the
// prop is behaviourally identical to before this uniform existed.

uniform float u_scale;

void main() {
    vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y) * u_scale;
    oFragColor = composite(p, u_time, u_energy, u_coherence, u_warmth, u_pulse);
}
