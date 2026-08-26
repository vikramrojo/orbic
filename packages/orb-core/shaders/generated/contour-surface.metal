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

// Contour — iso-bands of a slow height field, like a topographic map.
//
// True bands, but organic ones: the lines are level sets of a drifting fbm
// surface, so they flow, pinch and merge the way contour lines on a map do,
// rather than marching in parallel. That is what distinguishes this from
// `moire` (rigid geometric interference) and from `ribbons` (dots arranged on
// paths) — the three are deliberately different answers to "bands", because
// brand-unity-check compares each field against its neighbours in sorted order
// and near-duplicates would fail it.
//
// WHY LEVEL SETS RATHER THAN STRIPES
//
// `fract(height * N)` alone gives a sawtooth that reads as hard terracing. The
// band EDGE is the interesting part, so the sawtooth is folded to a distance-
// to-nearest-edge and drawn as a line. Folding also makes the line width
// controllable independently of the band spacing, which is what lets a single
// `coherence` curve move from wide soft terraces to fine crisp lines.
//
// Bands cover the plane by construction — a height field is defined
// everywhere — so this satisfies the "extended material, not centred artwork"
// requirement in docs/shader-abi.md without any special handling.
//
// COST: 4 fbm octaves x 4 hashes = ~16 hashes plus a warp lookup, so roughly
// 20 hashes per field() call. Between chladni (~3) and silk (~72), far under
// veils (~700, which ships).

float contourHash(float2 p) {
    float3 p3 = fract(float3(p.xyx) * float3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float contourNoise(float2 p) {
    float2 i = floor(p);
    float2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = contourHash(i);
    float b = contourHash(i + float2(1.0, 0.0));
    float c = contourHash(i + float2(0.0, 1.0));
    float d = contourHash(i + float2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

constant int CONTOUR_OCTAVES = 4;

float contourHeight(float2 p, float clock) {
    float total = 0.0;
    float amp = 0.5;
    float freq = 1.0;

    // Constant bound: the portable subset forbids unbounded and `while` loops.
    for (int i = 0; i < CONTOUR_OCTAVES; i++) {
        // Each octave drifts at its own rate, so the surface evolves rather
        // than sliding as a rigid whole.
        total += contourNoise(p * freq + float2(clock * 0.05 * freq, clock * -0.04 * freq)) * amp;
        freq *= 2.02;
        amp *= 0.5;
    }
    return total;
}

float3 field(float2 p, float t, float energy, float coherence, float warmth, float pulse) {
    // `t` already carries `pulse` and the component's `speed`
    // (docs/shader-abi.md); multiplying again would apply it twice.
    float clock = t;

    // THE SINGLE STRUCTURAL AXIS.
    //
    // Band count, line width and the domain warp are three ideas riding one
    // `coherence` curve, because that is the only structural channel the
    // frozen ABI provides (gate-3.5/findings.md). High coherence is many fine
    // crisp lines over a calm surface; low coherence is few wide soft terraces
    // over a churned one. "Few but crisp" is unreachable.
    float bandCount = mix(5.0, 14.0, coherence);
    float lineWidth = mix(0.42, 0.16, coherence);
    float warpAmount = mix(0.55, 0.12, coherence);

    // Warping the domain before measuring height is what makes the contours
    // wander instead of forming concentric rings around noise maxima.
    float2 warp = float2(
        contourHeight(p * 0.7 + float2(1.7, 9.2), clock * 0.5),
        contourHeight(p * 0.7 + float2(8.3, 2.8), clock * 0.5)
    );
    float height = contourHeight(p * 1.6 + warp * warpAmount, clock);

    // Fold the sawtooth to a signed distance from the nearest band edge, so
    // line width is independent of band spacing.
    float banded = fract(height * bandCount);
    float edge = abs(banded - 0.5) * 2.0;

    // The line itself, plus a wider soft bloom so bands read as glowing rather
    // than as ink.
    float line = 1.0 - smoothstep(0.0, lineWidth, edge);
    float bloom = 1.0 - smoothstep(0.0, min(lineWidth * 3.2, 1.0), edge);

    // Which band this pixel is in, used to vary tone across the surface so a
    // wide Surface does not read as one flat repeating texture.
    float bandIndex = floor(height * bandCount);
    float terrace = 0.5 + 0.5 * sin(bandIndex * 1.3 + clock * 0.25);

    float amplitude = mix(0.28, 1.0, energy);

    // Warmth is authored, not remapped: no field in this lineage has a native
    // warmth concept (docs/shader-abi.md), so the palette is original work.
    float3 cool = float3(0.28, 0.50, 0.80);
    float3 warm = float3(0.88, 0.54, 0.24);
    float3 tint = mix(cool, warm, warmth);

    float3 col = tint * bloom * 0.22
             + mix(tint, float3(1.0), 0.3) * line * (0.45 + 0.35 * terrace);
    col *= amplitude;

    // Grain, matching the house convention in the other fields.
    float grain = contourHash(p * 700.0 + clock * 11.0);
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
