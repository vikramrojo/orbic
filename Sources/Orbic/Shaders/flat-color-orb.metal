// Orbic shader preamble — Metal Shading Language ([[stitchable]]).
//
// Declares no uniform globals: unlike GLSL and SkSL, MSL `[[stitchable]]`
// functions have no global uniform storage to read — the ABI arrives as
// explicit function arguments on the epilogue's entry point instead (see
// epilogue-orb.metal / epilogue-surface.metal). This file only defines the
// portable-subset shims. See docs/shader-abi.md.

#include <metal_stdlib>
using namespace metal;

// True modulo (result takes the sign of `y`). Metal's native `fmod` takes
// the sign of `x` instead — e.g. fmod(-1.5, 6.0) == -1.5, not the 4.5 that
// GLSL's mod(-1.5, 6.0) produces — and every field is centred on the
// origin, so roughly half its domain hits exactly this disagreement. oMod
// is defined identically in all three preambles so there is nothing to get
// quietly wrong.
inline float oMod(float x, float y) {
    return x - y * floor(x / y);
}

inline float2 oMod(float2 x, float2 y) {
    return x - y * floor(x / y);
}

// Two-argument arctangent. Metal spells this `atan2(y, x)`, not `atan(y, x)`
// — a naming difference from GLSL/SkSL, not a semantic one. The shim lets a
// field call one name (`oAtan2`) regardless of which the target uses.
inline float oAtan2(float y, float x) {
    return atan2(y, x);
}

// Placeholder field — flat colour driven by `energy`. Not a real material:
// it exists to prove the build pipeline (preamble + field + compositor +
// epilogue, concatenated per target) end-to-end before any real field is
// ported (task group 6).
//
// Written once in the portable subset (see docs/shader-abi.md): plain GLSL-
// style syntax, no texture sampling, no `discard`, no `while`, no dynamic
// indexing, no preprocessor, no bare `mod`/two-arg `atan`, no `uniform`
// declarations of its own.

float3 field(float2 p, float t, float energy, float coherence, float warmth, float pulse) {
    return float3(energy);
}


// Orb compositor: a soft radial falloff over the field's colour, with no
// silhouette edge and no rim shading.
//
// This deliberately replaced an earlier sphere-mask-plus-rim compositor. That
// version cut alpha across a 0.04-wide band at radius 0.5 and brightened a
// band just inside it, which read as a lit 3D ball with a crisp cut-out edge.
// The look Orbic wants is flatter and quieter — the orb should sit in its
// background rather than be stamped onto it — so the mask became a long
// falloff and the rim term was removed outright rather than turned down.
// Per-instance firmness is not this file's job: the `edge` prop is applied in
// the epilogue, which post-processes the alpha returned here (see
// targets/epilogue-orb.glsl). composite()'s signature is frozen, so a
// per-instance value could not reach this function anyway.
//
// Returns PREMULTIPLIED colour and alpha (`float4(rgb * a, a)`), per the
// two-function contract in docs/shader-abi.md: `composite()` alone decides
// visibility, so the orb composites over an arbitrary background without dark
// fringing.
//
// Written once in the portable subset — no texture sampling, no `discard`,
// no `while`, no dynamic indexing, no preprocessor, no bare `mod`/two-arg
// `atan`, no `uniform` declarations. `smoothstep`, `length` and `pow` are
// portable built-ins available identically on all three targets.

// Radius at which the falloff begins. Inside this the orb is fully opaque.
constant float ORB_CORE_RADIUS = 0.18;

// Radius at which alpha reaches exactly 0.
//
// This MUST NOT exceed 0.5. World space is normalised by
// min(resolution.x, resolution.y) and the orb is drawn into a square, so 0.5
// is exactly the viewport half-extent along each axis while the corners reach
// ~0.707. A falloff still carrying alpha at 0.5 would therefore be cut flat
// against the left/right/top/bottom edges while continuing into the corners —
// reading as a faint square halo rather than a round one.
constant float ORB_FADE_RADIUS = 0.5;

// Shapes the shoulder of the falloff. Above 1 the orb holds its body and then
// releases quickly; at 1 it is the bare smoothstep, which reads flat-topped.
constant float ORB_FALLOFF_SHAPE = 1.35;

float4 composite(float2 p, float t, float energy, float coherence, float warmth, float pulse) {
    float3 color = field(p, t, energy, coherence, warmth, pulse);

    float dist = length(p);

    // 1 in the core, easing to exactly 0 at ORB_FADE_RADIUS. `smoothstep`
    // reaching a true 0 (rather than an exponential tail that only
    // approaches it) is what keeps the "transparent outside the orb"
    // guarantee real.
    float falloff = 1.0 - smoothstep(ORB_CORE_RADIUS, ORB_FADE_RADIUS, dist);

    float alpha = pow(max(falloff, 0.0), ORB_FALLOFF_SHAPE);

    return float4(color * alpha, alpha);
}


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
