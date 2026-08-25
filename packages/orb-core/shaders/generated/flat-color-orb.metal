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


// Real orb compositor (task 5.1): a sphere SDF mask with rim falloff over
// the field's colour. Glow is faked entirely in-shader as a brightened band
// near the edge — there is no bloom and no second pass (see design.md
// decision #10).
//
// Returns PREMULTIPLIED colour and alpha (`float4(rgb * a, a)`), per the
// two-function contract in docs/shader-abi.md: `composite()` alone decides
// visibility, so the orb can be composited over an arbitrary background
// without dark fringing at the rim. `alpha` reaches exactly 0 outside the
// sphere mask.
//
// Written once in the portable subset — no texture sampling, no `discard`,
// no `while`, no dynamic indexing, no preprocessor, no bare `mod`/two-arg
// `atan`, no `uniform` declarations. `smoothstep` and `length` are portable
// built-ins available identically on all three targets, so they need no
// shim.

const float ORB_SPHERE_RADIUS = 0.5;
const float ORB_EDGE_SOFTNESS = 0.02;
const float ORB_RIM_WIDTH = 0.18;
const float ORB_RIM_INTENSITY = 0.6;

float4 composite(float2 p, float t, float energy, float coherence, float warmth, float pulse) {
    float3 color = field(p, t, energy, coherence, warmth, pulse);

    float dist = length(p);

    // 1 inside the sphere, smoothly falls to 0 across a soft edge band —
    // this alone is what lets alpha reach exactly 0 outside the mask.
    float mask = 1.0 - smoothstep(ORB_SPHERE_RADIUS - ORB_EDGE_SOFTNESS, ORB_SPHERE_RADIUS + ORB_EDGE_SOFTNESS, dist);

    // Brightens a band just inside the edge, clamped to the same mask so
    // the rim never bleeds past it — a cheap in-shader stand-in for glow.
    float rim = smoothstep(ORB_SPHERE_RADIUS - ORB_RIM_WIDTH, ORB_SPHERE_RADIUS, dist) * mask;
    float3 litColor = color + rim * ORB_RIM_INTENSITY;

    float alpha = mask;
    return float4(litColor * alpha, alpha);
}


// Orbic epilogue — orb shape, Metal Shading Language ([[stitchable]]).
//
// Maps the fragment position into aspect-preserving world space at orb
// scale (p spans roughly a unit disc — see docs/shader-abi.md) and calls
// the compositor. Unlike the GLSL/SkSL epilogues, this one also carries the
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

constant float ORB_SCALE = 1.0;

[[ stitchable ]] half4 orbicOrb(
    float2 position,
    half4 color,
    float2 resolution,
    float time,
    float energy,
    float coherence,
    float warmth,
    float pulse
) {
    float2 p = (position - 0.5 * resolution) / min(resolution.x, resolution.y) * ORB_SCALE;
    return half4(composite(p, time, energy, coherence, warmth, pulse));
}
