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

// Chladni Resonance — adapted from pbakaus/radiant
// (https://github.com/pbakaus/radiant), MIT licensed. Original author:
// Paul Bakaus. Source: static/chladni-resonance.html.
//
// Adaptations for the Orbic shader ABI (see docs/shader-abi.md):
//   - Coordinate setup deleted entirely; `p` arrives already in
//     aspect-preserving world space. The original's own
//     `(gl_FragCoord.xy - u_res*0.5)/min(u_res.x,u_res.y)` already used
//     this exact convention, so of the three ported fields this is the one
//     that needed no coordinate correction, only deletion of the local
//     recomputation.
//   - `u_mouse`-driven node shift removed; meaningless on a static Surface.
//   - The circular "plate" concept — the plateMask and its background
//     swap, the edge-glow ring, the plate-proximity reflection glint, and
//     the plateDist-based vignette — is dropped rather than ported. All of
//     it draws a bounded circular object into the field's own colour,
//     which is exactly the shape/material split this ABI exists to
//     enforce: the orb compositor already masks to a `p`-radius-0.5 disc
//     (see compositors/orb.orb), so a second hard-edged circular boundary
//     drawn *inside* field() would duplicate that — and at Surface scale,
//     where the same plate radius is a small island in a much larger
//     visible window, it would read as exactly the "stranded focal point"
//     failure the world-space note in docs/shader-abi.md warns against.
//     What remains — the interference pattern itself — is unbounded by
//     construction and reads the same at any scale. This also removes the
//     original's one `atan(uv.y, uv.x)` call, which lived entirely inside
//     the dropped reflection effect.
//   - `u_modeSpeed` -> `pulse` (native).
//   - `u_complexity` -> `coherence`, inverted: complexity scales the mode
//     numbers driving the interference pattern, so higher complexity is
//     busier/higher-order nodal lines, i.e. *lower* coherence.
//   - `energy` has no native source in this field; grafted onto the sand
//     pattern's contrast exponent, so higher energy reads as a punchier,
//     more graphic pattern rather than a soft, washed-out one.
//   - `warmth` grafted as a cool (slate/silver) <-> warm (the original's
//     amber/gold) palette pair, continuous across the sand gradient, the
//     plate base colour, and the bloom tint. No radiant field has a native
//     warmth concept (see docs/shader-abi.md); this is original palette
//     authoring, not a remap.
//   - `mod(...)` (x2, mode cycling) -> `oMod`.
//   - Grain: `hash(gl_FragCoord...)` -> `hash(p * K)`. `field()` has no
//     device-pixel input — only continuous world-space `p` — so true
//     per-device-pixel grain isn't expressible here; a large spatial
//     frequency on `p` is the closest portable equivalent, and is kept a
//     little more modest than the original's amplitude (the surface
//     compositor attenuates further — see docs/shader-abi.md).

float hash(float2 p) {
    float3 p3 = fract(float3(p.xyx) * float3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float chladniPattern(float2 p, float n, float m) {
    float pi = 3.14159265;
    return cos(n * pi * p.x) * cos(m * pi * p.y) - cos(m * pi * p.x) * cos(n * pi * p.y);
}

// 6 mode pairs cycled through over time — no arrays needed.
float2 chladniMode(float idx) {
    if (idx < 1.0) return float2(1.0, 2.0);
    if (idx < 2.0) return float2(2.0, 3.0);
    if (idx < 3.0) return float2(3.0, 5.0);
    if (idx < 4.0) return float2(1.0, 4.0);
    if (idx < 5.0) return float2(2.0, 5.0);
    return float2(3.0, 4.0);
}

float3 field(float2 p, float t, float energy, float coherence, float warmth, float pulse) {
    // `t` arrives ALREADY scaled by `pulse` (and by the component's `speed`):
    // the runtime accumulates the field clock as the integral of
    // pulse * dt, which is the only phase-continuous way to do it, since
    // `pulse` is spring-animated and changes throughout every transition.
    // Multiplying by `pulse` again here would apply it twice — the effective
    // rate would be pulse^2 — and computing phase as t * pulse(now) instead
    // would jerk the animation by t * delta-pulse on every state change.
    // See docs/shader-abi.md.
    float clock = t;
    float2 pp = p * 2.0;

    // Cycle through mode pairs.
    float modeTime = clock * 0.15;
    float modeIdx = oMod(modeTime, 6.0);
    float idx0 = floor(modeIdx);
    float idx1 = oMod(idx0 + 1.0, 6.0);
    float blend = fract(modeIdx);
    blend = blend * blend * (3.0 - 2.0 * blend);

    float2 mode0 = chladniMode(idx0);
    float2 mode1 = chladniMode(idx1);

    // High complexity is busier/higher-order, i.e. lower coherence.
    float cScale = mix(1.8, 0.5, coherence);

    float c0 = chladniPattern(pp, mode0.x * cScale, mode0.y * cScale);
    float c1 = chladniPattern(pp, mode1.x * cScale, mode1.y * cScale);
    float c = mix(c0, c1, blend);

    // Secondary pattern for richness.
    float cb0 = chladniPattern(pp + 0.03, mode0.x * cScale + 0.5, mode0.y * cScale + 0.5);
    float cb1 = chladniPattern(pp + 0.03, mode1.x * cScale + 0.5, mode1.y * cScale + 0.5);
    float cb = mix(cb0, cb1, blend);

    // Sand on nodal lines — smoothstep for wide, visible lines.
    float w = 0.3 + 0.1 * sin(clock * 0.5);
    float sand = 1.0 - smoothstep(0.0, w, abs(c));
    float sand2 = (1.0 - smoothstep(0.0, w * 1.3, abs(cb))) * 0.35;
    sand = max(sand, sand2);

    // Energy has no native source here; grafted onto contrast.
    sand = pow(sand, mix(1.3, 0.55, energy));

    // Grain (see header: p-based, not gl_FragCoord-based; kept modest).
    float grain = hash(p * 900.0 + fract(clock * 0.1) * 100.0);
    float grainMask = smoothstep(0.1, 0.4, sand);
    sand *= 0.85 + 0.15 * grain * grainMask;

    // Warmth: cool slate/silver <-> warm amber/gold, continuous.
    float3 sandCool = mix(float3(0.35, 0.42, 0.55), float3(0.78, 0.84, 0.93), sand);
    float3 sandWarm = mix(float3(0.65, 0.45, 0.22), float3(0.95, 0.78, 0.40), sand);
    float3 sandCol = mix(sandCool, sandWarm, warmth);

    float3 plateCool = float3(0.02, 0.025, 0.035);
    float3 plateWarm = float3(0.03, 0.025, 0.02);
    float3 plate = mix(plateCool, plateWarm, warmth);

    // Bloom.
    float bloom = 1.0 - smoothstep(0.0, w * 2.5, abs(c));
    float3 bloomCool = float3(0.10, 0.15, 0.22);
    float3 bloomWarm = float3(0.25, 0.17, 0.07);

    float3 col = mix(plate, sandCol, sand);
    col += mix(bloomCool, bloomWarm, warmth) * bloom * 0.4;

    // Fine grain, kept modest.
    col += (hash(p * 700.0 + clock * 73.0) - 0.5) * 0.01;
    col = pow(max(col, 0.0), float3(0.95));

    return clamp(col, 0.0, 1.0);
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
