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

// Silk Cascade — adapted from pbakaus/radiant
// (https://github.com/pbakaus/radiant), MIT licensed. Original author:
// Paul Bakaus. Source: static/silk-cascade.html.
//
// Adaptations for the Orbic shader ABI (see docs/shader-abi.md):
//   - Coordinate setup deleted entirely and replaced with the incoming
//     world-space `p`. The original computed
//     `p = (uv - 0.5) * float2(aspect, 1.0)` — a *per-axis* aspect
//     correction, which stretches circular/isotropic features on any
//     non-square target (see docs/shader-abi.md's world-space section).
//   - `u_mouse`-driven primary-light retarget removed; meaningless on a
//     static Surface. The non-mouse default light direction is kept.
//   - `#define PI` removed — unused anywhere in the original body.
//   - `u_flowSpeed` -> `pulse` (native).
//   - `u_sheenIntensity` -> `energy` (native — passed as specular strength
//     into the three `shadeLayer` calls at weights 0.7 / 0.9 / 1.0, exactly
//     as in the original).
//   - `coherence` has no native source in this field; grafted onto the
//     domain-warp strength shared by every layer's fold — lower coherence
//     warps the fabric folds more strongly, reading as more turbulent;
//     higher coherence keeps folds closer to their unwarped, more orderly
//     shape. The original's fixed warp weight (0.55) sits near the middle
//     of the new range so existing tuning intuition roughly still applies.
//   - `warmth` grafted as a cool (steel-blue/violet) <-> warm (the
//     original's gold/rose/lavender) palette pair per layer, continuous
//     across each layer's dark/mid/bright/spec tones. No radiant field has
//     a native warmth concept (see docs/shader-abi.md); this is original
//     palette authoring. One minor fixed accent — the translucent backlight
//     tint inside `shadeLayer` — is left as a small warm ember regardless of
//     `warmth`, matching the original's own scale of hard-coded accents
//     (e.g. the sparkle highlight); everything that reads as the fabric's
//     actual colour responds to `warmth`.
//   - Grain: `hash12(gl_FragCoord...)` -> `hash12(p * K)`. `field()` has no
//     device-pixel input, so a large spatial frequency on `p` is the
//     closest portable equivalent to per-pixel grain, kept a little more
//     modest than the original's amplitude. The sparkle effect inside
//     `shadeLayer` already hashed its own (already-`p`-based) local
//     coordinate, so it needed no change.
//   - Soft, continuous vignettes and the background's radial gradient are
//     kept: unlike a hard edge or object silhouette, a gentle brightness
//     falloff never creates the "stranded focal point" problem the
//     world-space note warns about, and it's part of this material's
//     character (fabric caught in soft light) on both shapes.

float hash12(float2 p) {
    float3 p3 = fract(float3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float vnoise(float2 p) {
    float2 i = floor(p);
    float2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash12(i);
    float b = hash12(i + float2(1.0, 0.0));
    float c = hash12(i + float2(0.0, 1.0));
    float d = hash12(i + float2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm3(float2 p) {
    float v = 0.0;
    float a = 0.5;
    float2x2 rot = float2x2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 3; i++) {
        v += a * vnoise(p);
        p = rot * p * 2.0;
        a *= 0.5;
    }
    return v;
}

// 2-octave fbm for back layers (cheaper).
float fbm2(float2 p) {
    float v = 0.5 * vnoise(p);
    p = float2x2(0.8, -0.6, 0.6, 0.8) * p * 2.0;
    v += 0.25 * vnoise(p);
    return v;
}

float2 domainWarp(float2 p, float t, float scale, float seed) {
    return float2(
        fbm3(p * scale + float2(1.7 + seed, 9.2) + t * 0.15),
        fbm3(p * scale + float2(8.3, 2.8 + seed) - t * 0.12)
    );
}

// Cheaper warp for back layers.
float2 domainWarpLite(float2 p, float t, float scale, float seed) {
    return float2(
        fbm2(p * scale + float2(1.7 + seed, 9.2) + t * 0.15),
        fbm2(p * scale + float2(8.3, 2.8 + seed) - t * 0.12)
    );
}

// Per-layer fold: returns float3(height, gradient.xy). `warpStrength` carries
// the coherence graft (see header) — the original hard-coded this as 0.55.
float3 fabricFold(float2 p, float t, float seed, float freq, float flow, float warpStrength) {
    float ts = t * flow;
    float2 warp = domainWarp(p + seed * 3.7, ts, 1.2, seed);
    float2 wp = p + warp * warpStrength;
    float h = 0.0;
    float2 g = float2(0.0);

    float f1x = freq * 0.7, f1y = freq * 0.4;
    float ph1 = wp.x * f1x + wp.y * f1y + ts * 0.3 + seed * 2.1;
    h += sin(ph1) * 0.35; g += cos(ph1) * 0.35 * float2(f1x, f1y);

    float f2x = -freq * 0.3, f2y = freq * 0.9;
    float ph2 = wp.x * f2x + wp.y * f2y + ts * 0.25 + seed * 1.3;
    h += sin(ph2) * 0.25; g += cos(ph2) * 0.25 * float2(f2x, f2y);

    float f3 = freq * 0.6;
    float ph3 = (wp.x + wp.y) * f3 + ts * 0.2 + seed * 4.5;
    h += sin(ph3) * 0.18; g += cos(ph3) * 0.18 * float2(f3, f3);

    float f4x = freq * 1.8, f4y = freq * 1.2;
    float ph4 = wp.x * f4x + wp.y * f4y - ts * 0.35 + seed * 0.7;
    h += sin(ph4) * 0.08; g += cos(ph4) * 0.08 * float2(f4x, f4y);

    h += vnoise(wp * freq * 0.9 + seed * 10.0 + ts * 0.04) * 0.12 - 0.06;
    return float3(h, g);
}

// Lighter fold for back layers (no 5th wave, no vnoise detail, cheaper warp).
float3 fabricFoldLite(float2 p, float t, float seed, float freq, float flow, float warpStrength) {
    float ts = t * flow;
    float2 warp = domainWarpLite(p + seed * 3.7, ts, 1.2, seed);
    float2 wp = p + warp * warpStrength;
    float h = 0.0;
    float2 g = float2(0.0);
    float f1x = freq * 0.7, f1y = freq * 0.4;
    float ph1 = wp.x * f1x + wp.y * f1y + ts * 0.3 + seed * 2.1;
    h += sin(ph1) * 0.35; g += cos(ph1) * 0.35 * float2(f1x, f1y);
    float f2x = -freq * 0.3, f2y = freq * 0.9;
    float ph2 = wp.x * f2x + wp.y * f2y + ts * 0.25 + seed * 1.3;
    h += sin(ph2) * 0.25; g += cos(ph2) * 0.25 * float2(f2x, f2y);
    float f3 = freq * 0.6;
    float ph3 = (wp.x + wp.y) * f3 + ts * 0.2 + seed * 4.5;
    h += sin(ph3) * 0.18; g += cos(ph3) * 0.18 * float2(f3, f3);
    float f4x = freq * 1.8, f4y = freq * 1.2;
    float ph4 = wp.x * f4x + wp.y * f4y - ts * 0.35 + seed * 0.7;
    h += sin(ph4) * 0.08; g += cos(ph4) * 0.08 * float2(f4x, f4y);
    return float3(h, g);
}

// Kajiya-Kay anisotropic specular.
float kajiyaSpec(float2 grad, float3 L, float3 V, float shine) {
    float gl2 = dot(grad, grad);
    if (gl2 < 0.0001) return 0.0;
    float2 tg = float2(-grad.y, grad.x) / sqrt(gl2);
    float3 T = normalize(float3(tg, 0.0));
    float3 H = normalize(L + V);
    float TdH = dot(T, H);
    return pow(sqrt(max(1.0 - TdH * TdH, 0.0)), shine);
}

// Shade one fabric layer.
float4 shadeLayer(
    float2 p, float t,
    float seed, float freq, float flow, float warpStrength,
    float3 darkCol, float3 midCol, float3 brightCol, float3 specCol,
    float opacity, float shine,
    float3 L1, float3 L2, float3 V,
    float sheenMul
) {
    float3 fold = opacity < 0.35
        ? fabricFoldLite(p, t, seed, freq, flow, warpStrength)
        : fabricFold(p, t, seed, freq, flow, warpStrength);
    float h = fold.x;
    float2 grad = fold.yz;
    float3 N = normalize(float3(-grad * 1.8, 1.0));

    // Lighting — strong directional contrast.
    float NdL1 = max(dot(N, L1), 0.0);
    float NdL2 = max(dot(N, L2), 0.0);
    float lit = NdL1 * 0.75 + NdL2 * 0.12;

    // Fold depth.
    float depth = smoothstep(-0.8, 0.4, h);

    // Three-tone fabric shading: dark valleys -> mid -> bright lit peaks.
    float shade = lit * depth;
    float midBlend = smoothstep(0.0, 0.35, shade);
    float brightBlend = smoothstep(0.25, 0.7, shade);
    float3 fabric = mix(darkCol, midCol, midBlend);
    fabric = mix(fabric, brightCol, brightBlend * 0.5);

    // Anisotropic specular streaks — sharp silk sheen.
    float sp = kajiyaSpec(grad, L1, V, shine) * 0.9;
    sp += kajiyaSpec(grad, L2, V, shine * 0.6) * 0.15;
    sp *= sheenMul;
    float specPow = sp * sp * sp;
    fabric += specCol * specPow * 0.9;

    // Translucent backlight at peaks — left as a fixed small warm accent
    // regardless of `warmth` (see header).
    float trans = smoothstep(0.3, 0.9, depth) * lit * 0.08;
    fabric += float3(0.45, 0.28, 0.15) * trans;

    // Sparkle — extremely rare, only where specular is strong. Already
    // hashes its own local (already-`p`-based) coordinate, not gl_FragCoord.
    float sparkle = hash12(floor(p * 500.0 + t * 0.7));
    sparkle = step(0.9992, sparkle) * specPow * 20.0 * sheenMul;
    fabric += specCol * min(sparkle, 2.0);

    // Alpha: opaque in valleys, can thin at bright peaks.
    float alpha = opacity * (0.65 + depth * 0.35);
    return float4(fabric, alpha);
}

float3 field(float2 p, float t, float energy, float coherence, float warmth, float pulse) {
    float clock = t * pulse;

    // Lower coherence warps the fabric folds more (more turbulent); higher
    // coherence keeps folds closer to their unwarped shape.
    float warpStrength = mix(0.85, 0.4, coherence);

    // Primary/secondary lights — mouse retargeting removed, default kept.
    float3 L1 = normalize(float3(
        0.4 + sin(clock * 0.07) * 0.3,
        0.9 + cos(clock * 0.09) * 0.15,
        0.8
    ));
    float3 L2 = normalize(float3(
        -0.7 + cos(clock * 0.06) * 0.2,
        -0.3 + sin(clock * 0.08) * 0.15,
        0.6
    ));
    float3 V = float3(0.0, 0.0, 1.0);

    // Background — deep dark with purple tint; a soft continuous gradient,
    // kept (see header).
    float bgD = length(p);
    float3 bg = mix(
        float3(0.055, 0.03, 0.075),
        float3(0.012, 0.006, 0.02),
        smoothstep(0.0, 1.0, bgD)
    );
    bg += float3(0.025, 0.012, 0.035) * exp(-bgD * bgD * 2.0);

    // Layer colours: cool (steel/violet) <-> warm (the original's
    // gold/rose/lavender), continuous. Dark/mid/bright/spec per layer.
    float3 ly1Dark = mix(float3(0.03, 0.05, 0.09), float3(0.10, 0.06, 0.02), warmth);
    float3 ly1Mid = mix(float3(0.16, 0.24, 0.38), float3(0.50, 0.38, 0.15), warmth);
    float3 ly1Bright = mix(float3(0.35, 0.48, 0.62), float3(0.80, 0.65, 0.32), warmth);
    float3 ly1Spec = mix(float3(0.75, 0.85, 1.0), float3(1.0, 0.92, 0.65), warmth);

    float3 ly2Dark = mix(float3(0.03, 0.04, 0.08), float3(0.08, 0.03, 0.04), warmth);
    float3 ly2Mid = mix(float3(0.20, 0.22, 0.42), float3(0.42, 0.18, 0.22), warmth);
    float3 ly2Bright = mix(float3(0.40, 0.44, 0.68), float3(0.72, 0.38, 0.42), warmth);
    float3 ly2Spec = mix(float3(0.82, 0.88, 1.0), float3(1.0, 0.82, 0.86), warmth);

    float3 ly3Dark = mix(float3(0.03, 0.06, 0.11), float3(0.06, 0.04, 0.10), warmth);
    float3 ly3Mid = mix(float3(0.18, 0.24, 0.46), float3(0.30, 0.22, 0.45), warmth);
    float3 ly3Bright = mix(float3(0.36, 0.46, 0.72), float3(0.58, 0.48, 0.72), warmth);
    float3 ly3Spec = mix(float3(0.86, 0.90, 1.0), float3(1.0, 0.90, 0.97), warmth);

    // Layer 1: Deep — slowest, most transparent.
    float4 ly1 = shadeLayer(
        p * 0.8 + float2(0.15, clock * 0.015), clock,
        0.0, 2.0, 0.5, warpStrength,
        ly1Dark, ly1Mid, ly1Bright, ly1Spec,
        0.30, 26.0,
        L1, L2, V,
        energy * 0.7
    );

    // Layer 2: Middle.
    float4 ly2 = shadeLayer(
        p * 1.0 + float2(clock * 0.012, -0.1), clock,
        1.0, 3.2, 0.75, warpStrength,
        ly2Dark, ly2Mid, ly2Bright, ly2Spec,
        0.38, 40.0,
        L1, L2, V,
        energy * 0.9
    );

    // Layer 3: Front — fastest, most opaque.
    float4 ly3 = shadeLayer(
        p * 1.2 + float2(-clock * 0.008, clock * 0.02), clock,
        2.0, 4.5, 1.0, warpStrength,
        ly3Dark, ly3Mid, ly3Bright, ly3Spec,
        0.50, 55.0,
        L1, L2, V,
        energy
    );

    // Composite back-to-front.
    float3 col = bg;
    col = mix(col, ly1.rgb, ly1.a);
    col += float3(0.35, 0.18, 0.08) * ly1.a * ly2.a * 0.08;
    col = mix(col, ly2.rgb, ly2.a);
    col += float3(0.30, 0.15, 0.25) * ly2.a * ly3.a * 0.06;
    col += float3(0.40, 0.25, 0.12) * ly1.a * ly2.a * ly3.a * 0.04;
    col = mix(col, ly3.rgb, ly3.a);

    // Subtle backlight glow.
    float cov = (ly1.a + ly2.a + ly3.a) * 0.333;
    col += float3(0.35, 0.20, 0.12) * cov * 0.04;

    // Vignette — soft and continuous, kept (see header).
    float vig = 1.0 - smoothstep(0.25, 1.15, length(p * float2(0.85, 1.0)));
    col *= 0.6 + 0.4 * vig;

    // Saturation boost.
    float lum = dot(col, float3(0.299, 0.587, 0.114));
    col = mix(float3(lum), col, 1.35);

    // Tone mapping (ACES).
    col = col * (2.51 * col + 0.03) / (col * (2.43 * col + 0.59) + 0.14);

    // Gamma.
    col = pow(max(col, 0.0), float3(0.4545));

    // Film grain (see header: p-based, not gl_FragCoord-based; kept modest).
    float grain = hash12(p * 600.0 + fract(clock * 7.13) * 100.0);
    col += (grain - 0.5) * 0.012;

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

const float SURFACE_GAIN = 2.3;
const float SURFACE_KNEE = 2.4;

// World-space offset for the 5-tap blur, chosen relative to the shipped
// fields' own grain frequency (their grain hashes multiply `p` by roughly
// 600-900) so this radius spans several grain cells rather than sitting
// inside a single one. Provisional: the surface epilogue's own `scale`
// (task 7.x) is not fixed yet, and this constant should be re-checked
// once it is and once a renderer exists to look at the result.
const float SURFACE_BLUR_RADIUS = 0.006;

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
