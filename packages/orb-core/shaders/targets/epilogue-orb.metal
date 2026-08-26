// Orbic epilogue — orb shape, Metal Shading Language ([[stitchable]]).
//
// Maps the fragment position into aspect-preserving world space at orb
// scale (p spans roughly a unit disc — see docs/shader-abi.md) and calls the
// compositor. Unlike the GLSL/SkSL epilogues, this one also carries the
// entire uniform ABI as explicit function arguments, because a
// [[stitchable]] function has no global uniform storage to read from (see
// preamble.metal). `time` is assumed already wrapped (at 3600 s) by the
// caller.
//
// The compositor returns `float4` (GLSL `vec4`, aliased to Metal's `float4`
// by the build's type-alias table) — the narrowing cast to `half4` here,
// not inside the shared core, is deliberate: it keeps the shared field and
// compositor math in float precision and only narrows at the platform
// boundary that actually demands `half`.
//
// `edge` is orb-specific — not part of the frozen four-channel ABI, which
// field()/composite() alone see. It is the Orb component's public `edge`
// prop, applied here rather than in the compositor because composite()'s
// signature is frozen; see epilogue-orb.glsl for the full reasoning. Being a
// trailing argument, it is the 9th and last parameter, mirroring how `scale`
// trails on orbicSurface.

constant float ORB_SCALE = 1.0;

constant float ORB_EDGE_LO = 0.35;
constant float ORB_EDGE_HI = 0.62;

[[ stitchable ]] half4 orbicOrb(
    float2 position,
    half4 color,
    float2 resolution,
    float time,
    float energy,
    float coherence,
    float warmth,
    float pulse,
    float edge
) {
    float2 p = (position - 0.5 * resolution) / min(resolution.x, resolution.y) * ORB_SCALE;
    float4 composited = composite(p, time, energy, coherence, warmth, pulse);

    // composite() returns PREMULTIPLIED colour, so recover the straight colour
    // before changing alpha — otherwise firming the edge would darken it too.
    float3 straight = composited.rgb / max(composited.a, 1e-5);

    float firmed = smoothstep(ORB_EDGE_LO, ORB_EDGE_HI, composited.a);
    float alpha = mix(composited.a, firmed, edge);

    return half4(float4(straight * alpha, alpha));
}
