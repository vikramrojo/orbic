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

// Shifting Veils — adapted from pbakaus/radiant
// (https://github.com/pbakaus/radiant), MIT licensed. Original author:
// Paul Bakaus. Source: static/shifting-veils.html.
//
// Adaptations for the Orbic shader ABI (see docs/shader-abi.md):
//   - Coordinate setup deleted entirely and replaced with the incoming
//     world-space `p`. The original computed `p = uv * aspect` with no
//     centring at all (origin at the corner) — the most broken of the
//     three sources' coordinate conventions. Every place the original
//     re-derived a centred coordinate from this (via `p - 0.5*aspect`, or
//     `center = (uv-0.5)*aspect` and then dividing by `aspect` again to
//     partially undo its own stretch, just for the vignette) collapses to
//     using `p` directly, since `p` already *is* that centred,
//     non-stretched coordinate.
//   - `u_mouse`-driven veil shift removed; meaningless on a static Surface.
//   - `#define PI` / `#define TAU` removed — unused anywhere in the
//     original body. `hash3` removed for the same reason (declared, never
//     called, in the original source itself).
//   - `u_layerSpeed` -> `pulse` (native).
//   - `u_layerCount` -> `coherence`, inverted: more layers is a busier,
//     denser composite, i.e. *lower* coherence. The loop itself keeps a
//     compile-time constant bound (`VEIL_LAYER_COUNT`); the
//     `coherence`-derived count only changes the `break` threshold inside
//     it, per the ABI's portable-subset rule (docs/shader-abi.md) — bounded
//     loop, dynamic early-out.
//   - `energy` has no native source in this field; grafted onto overall
//     veil opacity, so higher energy reads as richer, more opaque curtains
//     rather than sheer, faint ones.
//   - `warmth` grafted as a cool (slate/steel/violet) <-> warm (the
//     original's sepia-to-cream amber progression) pair per layer,
//     continuous. No radiant field has a native warmth concept (see
//     docs/shader-abi.md); this is original palette authoring.
//   - Grain: the original has none (unusually, among the three sources) —
//     a modest one is added here for consistency with the other two
//     shipped fields and with the legibility-risk assumption in
//     design.md that every field carries some grain for the surface
//     compositor to attenuate. Necessarily `p`-based rather than
//     `gl_FragCoord`-based, since `field()` has no device-pixel input.
//   - The original's radial vignette (`vig = 1.0 - dot(p,p)*0.6`, an
//     unbounded quadratic mask with no floor) and its "atmospheric glow"
//     (a Gaussian centred at the origin) were both dropped, not ported.
//     Both are origin-centred effects the original calibrated for its own
//     small (roughly +/-0.5) coordinate range; at this field's actual
//     world-space magnitudes -- particularly `SURFACE_SCALE`, several
//     times larger -- `dot(p,p)*0.6` saturates to a hard-zero mask well
//     inside the visible frame, e.g. `dot(p,p) = 9` at `p = (+/-3, 0)`,
//     giving `vig = -4.4`, clamped to 0 -- so the vignette alone blacked
//     out the horizontal edges of any wide Surface, producing a stranded
//     bright blob at the centre (measured 4.6x centre-vs-edge luminance,
//     against ~1x for Chladni and ~1.5x for Silk, both of which lack this
//     unbounded-mask structure). Same category of fix as Chladni's dropped
//     plate mask: shape/brightness masking that only reads correctly at
//     the original's small intended scale doesn't survive being rendered
//     as an extended material at Surface scale, and the layered veils
//     already carry the field's character without it.

// Deliberately a different hash from chladni.orb/silk.orb, which use the
// fract(p3 + dot(p3, p3.yzx + 33.33)) construction. This sin-based one is
// what gives Veils its particular noise character, and it is kept for that
// reason. The tradeoff is that `sin()` precision is implementation-defined,
// so the fine grain can differ slightly between GPU vendors where the other
// two fields are bit-stable; the veil layering itself is low-frequency
// enough that this is not visible at the field level. If cross-vendor
// determinism ever becomes a hard requirement, this is the line to change --
// expect the noise pattern to shift when it does.
float hash(float2 p) {
    return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453123);
}

float vnoise(float2 p) {
    float2 i = floor(p);
    float2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + float2(1.0, 0.0));
    float c = hash(i + float2(0.0, 1.0));
    float d = hash(i + float2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

constant int VEIL_FBM_OCTAVES = 5;

float fbm(float2 p) {
    float val = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for (int i = 0; i < VEIL_FBM_OCTAVES; i++) {
        val += amp * vnoise(p * freq);
        freq *= 2.0;
        amp *= 0.5;
    }
    return val;
}

// Domain-warped noise for organic flowing shapes.
float warpedNoise(float2 p, float t, float seed) {
    float2 q = float2(
        fbm(p + float2(seed * 1.7, seed * 2.3) + t * 0.15),
        fbm(p + float2(seed * 3.1 + 5.2, seed * 1.3 + 1.3) + t * 0.12)
    );
    float2 r = float2(
        fbm(p + 4.0 * q + float2(1.7, 9.2) + t * 0.08),
        fbm(p + 4.0 * q + float2(8.3, 2.8) + t * 0.1)
    );
    return fbm(p + 3.5 * r);
}

float2x2 rot2(float a) {
    float c = cos(a), s = sin(a);
    return float2x2(c, -s, s, c);
}

constant int VEIL_LAYER_COUNT = 7;

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

    // More layers is busier/denser, i.e. lower coherence.
    float layerCount = mix(7.0, 2.0, coherence);

    // Dark background base — cool slate <-> the original's warm sepia.
    float3 col = mix(float3(0.02, 0.03, 0.045), float3(0.012, 0.01, 0.008), warmth);

    // Accumulate colour from back to front. Loop bound is the compile-time
    // constant VEIL_LAYER_COUNT; layerCount only drives the early-out below.
    for (int i = 0; i < VEIL_LAYER_COUNT; i++) {
        if (float(i) >= layerCount) break;

        float fi = float(i);
        float layerFrac = fi / max(layerCount - 1.0, 1.0);

        // Each layer has unique movement: different speed, direction, scale.
        float speed = 0.3 + fi * 0.12;
        float scale = 1.8 + fi * 0.7;
        float angle = fi * 0.7 + 0.3;

        // Parallax offset — deeper layers move slower.
        float parallax = 0.3 + layerFrac * 0.7;

        float2 drift = float2(
            cos(angle) * speed * clock * parallax,
            sin(angle) * speed * clock * parallax * 0.7
        );

        // Rotate coordinates slightly per layer for variety.
        float2 lp = p * rot2(fi * 0.4 + clock * 0.02 * (fi - 2.5));
        lp = lp * scale + drift;

        // Domain-warped noise for flowing veil shape.
        float n = warpedNoise(lp, clock * (0.8 + fi * 0.15), fi * 3.7 + 1.0);

        // Shape the veil: soft edges, flowing contours.
        float veil = smoothstep(0.25, 0.55, n);
        veil *= smoothstep(0.85, 0.6, n);
        float broad = smoothstep(0.2, 0.7, n) * 0.5;
        veil = max(veil, broad);

        // Occasional transparency fade — reveals deeper layers.
        float fadePhase = clock * 0.15 + fi * 1.3;
        float fadeCycle = sin(fadePhase) * 0.5 + 0.5;
        float reveal = smoothstep(0.0, 0.3, fadeCycle);
        float opacity = mix(0.08, 0.55, reveal);

        // Deeper layers slightly more opaque to build depth.
        opacity *= (0.6 + 0.4 * (1.0 - layerFrac));

        // Energy has no native source here; grafted onto overall opacity.
        opacity *= mix(0.5, 1.3, energy);

        // Layer colour from the amber family (warm) or slate family (cool).
        float3 layerColorCool;
        float3 layerColorWarm;
        if (i == 0) {
            layerColorCool = float3(0.05, 0.07, 0.11);
            layerColorWarm = float3(0.12, 0.07, 0.04);
        } else if (i == 1) {
            layerColorCool = float3(0.08, 0.11, 0.18);
            layerColorWarm = float3(0.22, 0.12, 0.06);
        } else if (i == 2) {
            layerColorCool = float3(0.14, 0.19, 0.30);
            layerColorWarm = float3(0.45, 0.25, 0.12);
        } else if (i == 3) {
            layerColorCool = float3(0.22, 0.28, 0.42);
            layerColorWarm = float3(0.65, 0.42, 0.15);
        } else if (i == 4) {
            layerColorCool = float3(0.32, 0.40, 0.55);
            layerColorWarm = float3(0.78, 0.55, 0.22);
        } else if (i == 5) {
            layerColorCool = float3(0.45, 0.53, 0.68);
            layerColorWarm = float3(0.85, 0.65, 0.35);
        } else {
            layerColorCool = float3(0.60, 0.68, 0.80);
            layerColorWarm = float3(0.9, 0.75, 0.5);
        }
        float3 layerColor = mix(layerColorCool, layerColorWarm, warmth);

        // Subtle colour variation within each layer.
        float colorShift = sin(n * 6.0 + clock * 0.3 + fi * 2.0) * 0.05;
        layerColor += colorShift;

        // Subtle inner glow at veil edges.
        float edgeGlow = smoothstep(0.0, 0.15, veil) * smoothstep(0.5, 0.25, veil);
        float3 glowColor = layerColor * 1.4 + float3(0.1, 0.06, 0.02);
        layerColor = mix(layerColor, glowColor, edgeGlow * 0.5);

        // Composite this layer over the accumulated colour.
        float alpha = veil * opacity;
        col = mix(col, layerColor, alpha);
    }

    // Subtle breathing pulse on the whole image — runs at a fixed rate,
    // independent of `pulse`, matching the original's use of raw time here.
    float breathe = sin(t * 0.2) * 0.02 + 1.0;
    col *= breathe;

    // Tone mapping (subtle, keep the dark mood).
    col = col / (col + 0.5) * 1.1;

    // Slight warmth push. `max(col, 0.0)` first: the per-layer colour
    // shift above can drive a channel below zero, and pow(negative,
    // non-integer) is undefined (NaN on most GPUs), which the final clamp
    // cannot undo. Same guard as chladni.orb and silk.orb.
    col = pow(max(col, 0.0), float3(0.95, 0.98, 1.05));

    // Grain — see header note: added here (the original has none) for
    // consistency with the other two fields, and kept modest.
    float grain = hash(p * 700.0 + clock * 11.0);
    col += (grain - 0.5) * 0.01;

    return clamp(col, 0.0, 1.0);
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

constant float ORB_SPHERE_RADIUS = 0.5;
constant float ORB_EDGE_SOFTNESS = 0.02;
constant float ORB_RIM_WIDTH = 0.18;
constant float ORB_RIM_INTENSITY = 0.6;

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
