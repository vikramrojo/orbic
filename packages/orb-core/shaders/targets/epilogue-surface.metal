// Orbic epilogue — surface shape, Metal Shading Language ([[stitchable]]).
//
// Maps the fragment position into aspect-preserving world space at surface
// scale (zoomed further out than the orb — see docs/shader-abi.md) and
// calls the compositor. Carries the full uniform ABI as explicit function
// arguments — see the equivalent note in epilogue-orb.metal. `time` is
// assumed already wrapped (at 3600 s) by the caller.
//
// `scale` is surface-specific, exposed as the Surface component's public
// `scale` prop (surface-component spec) — see the equivalent note in
// epilogue-surface.glsl. Metal has no global uniforms, so it arrives as a
// plain function argument like the rest of the ABI; the renderer defaults
// it to 3.0, matching the previous hardcoded SURFACE_SCALE.

[[ stitchable ]] half4 orbicSurface(
    float2 position,
    half4 color,
    float2 resolution,
    float time,
    float energy,
    float coherence,
    float warmth,
    float pulse,
    float scale
) {
    float2 p = (position - 0.5 * resolution) / min(resolution.x, resolution.y) * scale;
    return half4(composite(p, time, energy, coherence, warmth, pulse));
}
