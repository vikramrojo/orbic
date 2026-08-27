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

// Ribbons — dotted bands that undulate across the plane.
//
// The reference for this family of look is the "thinking orb" indicator: an
// orb built out of DOTS arranged on structure — rings, meridians, a
// multi-band sash — rather than dots scattered at random. An earlier attempt
// here (`motes`) placed one dot per lattice cell, which covers the plane
// evenly and is therefore, visually, just noise. The structure is the point:
// dots read as an object when they lie on paths.
//
// WHY BANDS RATHER THAN RINGS
//
// The closest single reference is a ring that slowly morphs, and rings are
// what a dotted orb usually is. But a ring is a CENTRED composition, and a
// field here has to work as a `<Surface>` too — which reveals much more world
// space along its long axis, stranding any centred motif in emptiness (the
// failure docs/shader-abi.md warns about, and the reason chladni.orb dropped
// its bounded "plate").
//
// Bands solve it: they repeat across the plane, so a Surface shows a wavy
// dotted texture that keeps going, while the orb compositor's mask crops the
// same field to a disc where a handful of bands read as wrapping a sphere.
// One field, honest on both shapes.
//
// WHAT THIS DELIBERATELY DOES NOT DO
//
// In the reference, dots bunch up toward the orb's edge because they are
// projected onto a sphere. That cannot happen here, and not for want of
// trying: `field()` receives only `p` and has no idea whether it is being
// composited into a sphere or a full-bleed rectangle. Perspective is a
// property of the SHAPE, and the two-function split (docs/shader-abi.md)
// puts shape in `composite()`. The orb compositor's own Fresnel densification
// supplies the sphere read instead.
//
// COST: 3 bands x 3 dot slots = 9 dot evaluations, plus 2 hashes each —
// comparable to a 3x3 lattice, between chladni (~3 hashes) and silk (~72).
// Portable subset throughout: constant-bound `for` loops, no arrays, no
// `mod`/two-arg `atan`, no textures.

// How far apart, in phase, consecutive bands sit on the visibility wave.
// Small enough that neighbouring bands differ visibly, large enough that the
// wave takes several bands to travel — so it reads as rolling through them
// rather than as every band blinking together.
constant float BAND_WAVE_SPACING = 0.85;
// Speed of that roll.
constant float BAND_WAVE_RATE = 0.9;

float ribbonHash(float2 p) {
    float3 p3 = fract(float3(p.xyx) * float3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

// Vertical offset of band `band` at horizontal position `x`.
//
// Two sine terms at different frequencies rather than one: a single sine
// reads as a regular corrugation, while two beating against each other give
// the looser, hand-drawn wander the reference has.
float ribbonWave(float x, float band, float clock, float amp) {
    float phase = band * 1.7;
    return amp * (sin(x * 1.7 + phase + clock * 0.55) * 0.65
                + sin(x * 0.9 - phase * 0.6 + clock * 0.31) * 0.35);
}

float3 field(float2 p, float t, float energy, float coherence, float warmth, float pulse) {
    // `t` already carries `pulse` and the component's `speed`
    // (docs/shader-abi.md); multiplying again would apply it twice.
    float clock = t;

    // THE SINGLE STRUCTURAL AXIS.
    //
    // Band spacing, dot spacing, dot size and undulation amplitude are four
    // separate ideas riding one `coherence` curve, because that is the only
    // structural channel the frozen ABI provides (gate-3.5/findings.md). High
    // coherence is calm, tightly-spaced, crisp bands; low coherence is loose,
    // wide, restless ones. "Tight but restless" is unreachable, and that is a
    // property of the contract rather than an oversight here.
    // These are WORLD-SPACE units, and the orb is only ~0.92 across
    // (ORB_RADIUS 0.46). A first pass used 0.34-0.62 band spacing, which put
    // barely two bands and about eight dots inside the orb — the dots read as
    // scattered specks with no band structure at all, because there was not
    // enough of a band on screen to see. At ~0.10 spacing roughly nine bands
    // of eleven dots land in the orb, which is the density the reference has.
    float bandSpacing = mix(0.130, 0.075, coherence);
    float dotSpacing = mix(0.110, 0.062, coherence);
    float dotRadius = mix(0.022, 0.014, coherence);
    float waveAmp = mix(0.050, 0.018, coherence);

    // Bands run along x and stack along y — HORIZONTAL, deliberately, and not
    // rotated. An earlier version tilted the whole field ~20 degrees to keep
    // the dots off the pixel grid, which does suppress aliasing but destroys
    // the thing the bands are for: horizontal is what makes them read as a
    // waveform rather than as a diagonal hatch. The undulation below already
    // breaks exact axis alignment, so the dots do not settle into hard rows.
    float2 q = p;

    float bandIndex = floor(q.y / bandSpacing);
    float glow = 0.0;
    float cores = 0.0;

    // Constant bounds: the portable subset forbids unbounded and `while`
    // loops. A band further than one spacing away cannot reach this pixel,
    // because waveAmp stays below half a band.
    for (int b = -1; b <= 1; b++) {
        float band = bandIndex + float(b);
        float slotIndex = floor(q.x / dotSpacing);

        // Whole-band visibility, rolling vertically through the stack over
        // time, so bands fade IN and OUT rather than all sitting there
        // permanently. The smoothstep is what makes them actually leave:
        // a bare sine only dims to zero instantaneously at the trough, which
        // reads as a pulse, while this holds each band off for a stretch
        // before bringing it back.
        float bandPhase = band * BAND_WAVE_SPACING - clock * BAND_WAVE_RATE;
        float bandEnvelope = smoothstep(0.18, 0.92, 0.5 + 0.5 * sin(bandPhase));

        for (int i = -1; i <= 1; i++) {
            float slot = slotIndex + float(i);

            // The dot's own x decides where its band sits, so dots ride the
            // wave rather than being sampled off it.
            float dotX = (slot + 0.5) * dotSpacing;
            float dotY = (band + 0.5) * bandSpacing + ribbonWave(dotX, band, clock, waveAmp);

            float d = length(q - float2(dotX, dotY));

            // Per-dot size and brightness variation, so a band reads as
            // hand-placed rather than as a printed dotted line.
            float character = ribbonHash(float2(slot, band));

            // A brightness wave travelling ALONG the band is what makes the
            // sash look like it is being drawn rather than merely wobbling.
            float travel = 0.55 + 0.45 * sin(dotX * 2.1 - clock * 1.3 + band * 0.9);

            float radius = dotRadius * (0.65 + 0.7 * character);
            float weight = travel * bandEnvelope * (0.55 + 0.45 * character);

            // Soft halo for the field's overall glow, plus a tighter core so
            // each dot stays legible as a point instead of dissolving.
            // Halo radius and weight both raised: measured, this field had a
            // peak/mean ratio of 46 — bright dots on almost pure black, so it
            // read as very dark overall however bright the dots themselves
            // were. Gain cannot fix that (the cores are already near 1.0 and
            // would just clip); only coverage can, which is what the halo is.
            glow += (1.0 - smoothstep(0.0, radius * 3.4, d)) * 0.58 * weight;
            cores += (1.0 - smoothstep(0.0, radius, d)) * weight;
        }
    }

    // Slow collective breathing, so a still frame and a moving one differ.
    float breathe = 0.90 + 0.10 * sin(clock * 0.4);
    glow *= breathe;
    cores *= breathe;

    float amplitude = mix(0.45, 1.0, energy);

    // Warmth is authored, not remapped: no field in this lineage has a native
    // warmth concept (docs/shader-abi.md), so the palette is original work.
    float3 cool = float3(0.34, 0.52, 0.82);
    float3 warm = float3(0.90, 0.55, 0.28);
    float3 tint = mix(cool, warm, warmth);

    // Cores lift toward white so the brightest dots read as light rather than
    // as saturated colour — but only partway. Lifting them 60% of the way, as
    // a first pass did, bleached the palette badly enough that a full warmth
    // sweep moved the image by only 1.6/255: technically observable, visually
    // nothing. At 0.3 the dots still read as light and warmth actually tells.
    float3 col = tint * glow * 1.15 + mix(tint, float3(1.0), 0.32) * cores * 1.05;
    col *= amplitude;

    // Grain, matching the house convention in the other fields.
    float grain = ribbonHash(p * 700.0 + clock * 11.0);
    col += (grain - 0.5) * 0.01;

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
