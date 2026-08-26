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


// Real surface compositor (task 6.4): a full-bleed, always-static
// background that must recede behind body text rather than draw attention
// to itself (see docs/shader-abi.md and design.md's "two visual jobs at
// once" framing). Two mechanisms, each doing one job:
//
//   1. A small multi-tap spatial average of `field()` — NOT a second
//      render pass (there is still exactly one fragment shader invocation
//      per pixel; this just calls the same portable `field()` a few more
//      times at nearby world-space offsets and averages the results), so
//      it doesn't fork the shader core the way a real bloom/blur pass
//      would (see design.md decision #10 on why multi-pass is rejected).
//      This is the *only* way this file can achieve "octave/detail
//      reduction" at all: composite() has no access to field()'s internal
//      noise octaves, so the only lever available from this side of the
//      contract is spatial averaging, which low-pass-filters whatever
//      detail field() produced. The same averaging also attenuates
//      per-pixel hash grain, since nearby grain samples are decorrelated
//      and their average trends toward the grain's mean — one mechanism
//      serving both the "octave/detail reduction" and "grain attenuation"
//      requirements in specs/surface-component/spec.md.
//   2. Contrast damping — the blurred colour is pulled toward a fixed dark
//      anchor tone, compressing the field's dynamic range.
//
// A Surface is static (rendered once, never re-evaluated per frame — see
// design.md decision #9), so the extra `field()` evaluations here are a
// one-time cost, not a per-frame one; this trade would not be acceptable
// in the animated orb compositor and is not made there.
//
// Returns PREMULTIPLIED colour and alpha (`float4(rgb * a, a)`), per the
// two-function contract in docs/shader-abi.md. Alpha is always 1.0 here —
// a Surface is a full-bleed background, not a masked shape — but it is
// still returned premultiplied so both compositors obey one convention.
//
// --- Luminance band (tuned against real renders — see handback) ---------
// specs/surface-component/spec.md requires TWO things about brightness,
// not one, and they bound this from opposite sides:
//   - a CEILING: WCAG AA 4.5:1 between this compositor's *brightest*
//     rendered luminance and the body-text colour, checked against the max
//     rather than the mean, so one hotspot can't pass on a good average.
//   - a FLOOR ("the field must remain perceptible"): rendered luminance
//     range must span at least a defined minimum, because a contrast
//     floor alone is satisfied vacuously by a near-black surface — that
//     passes legibility while destroying the entire premise that a
//     Surface is the Orb's material seen from further away.
//
// A single LINEAR mix toward a fixed anchor tone (an earlier version of
// this file used `mix(base, blurred, contrast)`) cannot satisfy both at
// once, because the shipped fields' own post-blur brightest points are far
// apart: measured directly (bypassing this file's damping), Veils peaks
// around 0.18-0.28, while Chladni and Silk's brightest presets reach
// 0.82-0.92 -- almost the full [0,1] range field() is allowed to use. Any
// single linear (base, contrast) pair that lifts Veils to something
// visible pushes Chladni/Silk's already-bright peaks straight past the
// WCAG ceiling (measured: contrast 0.62 lifted Veils to a visible ~13:1,
// but put Chladni's brightest preset at 3.09:1, failing the 4.5:1 floor
// outright). And a pair chosen to keep Chladni safe leaves Veils at
// visually-black RGB(30,31,35) -- the over-damping this section originally
// shipped with.
//
// So this compresses instead of linearly mixing: a Reinhard-style knee,
// `gained / (1 + gained * SURFACE_KNEE)`, which behaves close to linear
// for small inputs (so dim background areas between veils/folds keep their
// own relative detail — the "range" the perceptibility floor cares about)
// but compresses hard as input grows, pulling bright fields' peaks down
// disproportionately more than dim fields' peaks. `SURFACE_GAIN` and
// `SURFACE_KNEE` were solved from two real measured points -- Veils'
// dimmest realistic peak (~0.20) and Chladni/Silk's brightest (~0.90) --
// so that both land inside a visible-but-safe band (~0.22 and ~0.35 in
// output-channel terms respectively, roughly 7-12:1 against white body
// text) rather than one of them sitting at either extreme. See
// tools/render-check/contrast-check.mjs's `checkPerceptibility` for the
// floor, `checkContrast` for the ceiling, and its printed table for the
// current measured range of every field x preset combination.

constant float SURFACE_GAIN = 2.3;
constant float SURFACE_KNEE = 2.4;

// World-space offset for the 5-tap blur, chosen relative to the shipped
// fields' own grain frequency (their grain hashes multiply `p` by roughly
// 600-900) so this radius spans several grain cells rather than sitting
// inside a single one. Provisional: the surface epilogue's own `scale`
// (task 7.x) is not fixed yet, and this constant should be re-checked
// once it is and once a renderer exists to look at the result.
constant float SURFACE_BLUR_RADIUS = 0.006;

// Known shape limitation, recorded with the provisional radius above: the
// 5 taps below are the centre plus the four DIAGONAL neighbours, so the
// kernel is diamond-shaped and carries no weight at the axis-aligned
// offsets (+r,0), (-r,0), (0,+r), (0,-r). Detail that runs exactly
// horizontally or vertically is therefore attenuated less than diagonal
// detail of the same frequency. This is accepted for now -- it costs 4
// field() evaluations rather than 8, and the shipped fields' grain is
// isotropic enough that the bias is not visible -- but a 9-tap symmetric
// kernel is the fix if a field ever ships with strong axis-aligned
// structure. Note that widening the kernel changes the post-blur
// brightness, so SURFACE_GAIN and SURFACE_KNEE above would have to be
// re-measured alongside it.

float4 composite(float2 p, float t, float energy, float coherence, float warmth, float pulse) {
    float3 c0 = field(p, t, energy, coherence, warmth, pulse);
    float3 c1 = field(p + float2(SURFACE_BLUR_RADIUS, SURFACE_BLUR_RADIUS), t, energy, coherence, warmth, pulse);
    float3 c2 = field(p + float2(-SURFACE_BLUR_RADIUS, SURFACE_BLUR_RADIUS), t, energy, coherence, warmth, pulse);
    float3 c3 = field(p + float2(SURFACE_BLUR_RADIUS, -SURFACE_BLUR_RADIUS), t, energy, coherence, warmth, pulse);
    float3 c4 = field(p + float2(-SURFACE_BLUR_RADIUS, -SURFACE_BLUR_RADIUS), t, energy, coherence, warmth, pulse);

    float3 blurred = (c0 + c1 + c2 + c3 + c4) / 5.0;

    // Contrast damping: a Reinhard-style compressive knee (see header) —
    // lifts dim fields toward visibility while compressing bright fields'
    // peaks so they don't blow past the legibility ceiling.
    float3 gained = blurred * SURFACE_GAIN;
    float3 damped = gained / (1.0 + gained * SURFACE_KNEE);

    float alpha = 1.0;
    return float4(damped * alpha, alpha);
}


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
