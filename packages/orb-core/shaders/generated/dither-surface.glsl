#version 300 es
// Orbic shader preamble — GLSL ES 3.00 (WebGL2).
//
// Declares the frozen four-channel uniform ABI as globals (GLSL reads
// uniforms as globals) and the portable-subset shims. A field or compositor
// body never declares a `uniform` itself — see docs/shader-abi.md.
//
// `#version` is the literal first line, with no leading comment or
// whitespace before it — some real ES-profile front-ends (observed: the
// glslang WASM build used to validate this file) reject a shader where the
// version directive isn't the first thing in the source, even though a
// leading comment is legal per some readings of the GLSL spec. Not worth
// the risk on the one directive every target requires.

precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_energy;
uniform float u_coherence;
uniform float u_warmth;
uniform float u_pulse;

out vec4 oFragColor;

// True modulo (result takes the sign of `y`), defined explicitly rather than
// delegated to GLSL's native `mod()` so all three targets are guaranteed to
// agree bit-for-bit on the same formula rather than on assumed equivalence.
float oMod(float x, float y) {
    return x - y * floor(x / y);
}

vec2 oMod(vec2 x, vec2 y) {
    return x - y * floor(x / y);
}

// Two-argument arctangent. GLSL spells this as the two-argument form of
// `atan`; the shim exists so a field can call one name across all three
// targets, which disagree only on what that name is (see oAtan2 in
// preamble.metal), not on the underlying semantics.
float oAtan2(float y, float x) {
    return atan(y, x);
}

// Dither — a smooth signal quantised through an ordered Bayer threshold.
//
// The other fields are continuous materials. This one is deliberately not:
// its whole character is hard on/off cells, so the transition between tone
// levels is a visible field of dots rather than a gradient.
//
// THE BAYER MATRIX, WITHOUT AN ARRAY
//
// The classic implementation is a 4x4 lookup table. That is unavailable here:
// the portable subset bans dynamic array indexing (docs/shader-abi.md), so
// `bayer[y * 4 + x]` cannot be written at all. The bit-interleaving trick is
// also avoided — bitwise operators are not part of the documented subset, and
// nothing in this repo asserts they behave identically across GLSL ES 3.00,
// SkSL and MSL, so relying on them would be relying on luck.
//
// Instead the matrix is computed from its own recurrence,
//
//     M4(x, y) = 4 * M2(x mod 2, y mod 2) + M2(floor(x/2), floor(y/2))
//
// with M2(x, y) = (2x + 3y) mod 4. That reproduces the canonical Bayer 4x4
// (0 8 2 10 / 12 4 14 6 / 3 11 1 9 / 15 7 13 5) exactly — verified against the
// published matrix before it was written here — in pure float arithmetic.
//
// WORLD SPACE, NOT PIXELS
//
// The dither cell is sized in WORLD units, not fragment coordinates. Keying it
// to pixels is the obvious thing and it is wrong twice over: the orb and the
// surface use different `scale`, so the cell would change size between the two
// shapes and break the "same material" claim, and the aspect-distortion check
// renders the same world region at several resolutions and would see the cell
// resize under it.
//
// COST: ~4 hashes for the underlying signal plus the Bayer arithmetic — the
// cheapest field here, comparable to chladni (~3).

// Bayer 2x2, the seed of the recurrence: [[0, 2], [3, 1]].
float ditherBayer2(float x, float y) {
    return oMod(2.0 * x + 3.0 * y, 4.0);
}

/// Canonical Bayer 4x4 threshold at integer cell (x, y), normalised to 0..1.
float ditherBayer4(float x, float y) {
    float lo = ditherBayer2(oMod(x, 2.0), oMod(y, 2.0));
    float hi = ditherBayer2(oMod(floor(x * 0.5), 2.0), oMod(floor(y * 0.5), 2.0));
    return (4.0 * lo + hi) / 16.0;
}

float ditherHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float ditherNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = ditherHash(i);
    float b = ditherHash(i + vec2(1.0, 0.0));
    float c = ditherHash(i + vec2(0.0, 1.0));
    float d = ditherHash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

vec3 field(vec2 p, float t, float energy, float coherence, float warmth, float pulse) {
    // `t` already carries `pulse` and the component's `speed`
    // (docs/shader-abi.md); multiplying again would apply it twice.
    float clock = t;

    // THE SINGLE STRUCTURAL AXIS.
    //
    // Cell size and the number of tone levels are two separate ideas riding
    // one `coherence` curve, because that is the only structural channel the
    // frozen ABI provides (gate-3.5/findings.md). High coherence is a fine
    // cell with many levels — nearly continuous; low coherence is a coarse
    // cell with few levels — chunky and graphic. "Coarse cell, many levels"
    // is unreachable, and that is a property of the contract.
    float cellSize = mix(0.055, 0.022, coherence);
    float levels = mix(3.0, 7.0, coherence);

    // The signal being quantised: slow drifting noise, plus a gentle radial
    // fall so the orb reads as lit from its centre rather than as flat tone.
    float signal = ditherNoise(p * 3.1 + vec2(clock * 0.09, clock * -0.06)) * 0.75
                 + ditherNoise(p * 6.7 - vec2(clock * 0.05, clock * 0.08)) * 0.25;
    signal = mix(signal, 1.0 - length(p) * 0.9, 0.35);

    // Integer cell coordinates in WORLD space — see the header.
    vec2 cell = floor(p / cellSize);
    float threshold = ditherBayer4(cell.x, cell.y);

    // Ordered dithering proper: add the threshold before quantising, so the
    // rounding error becomes a spatial pattern instead of a hard contour.
    float quantised = floor(signal * levels + threshold) / levels;
    quantised = clamp(quantised, 0.0, 1.0);

    float amplitude = mix(0.30, 1.0, energy);

    // Warmth is authored, not remapped: no field in this lineage has a native
    // warmth concept (docs/shader-abi.md), so the palette is original work.
    vec3 cool = vec3(0.30, 0.46, 0.76);
    vec3 warm = vec3(0.86, 0.52, 0.26);
    vec3 tint = mix(cool, warm, warmth);

    // Capped deliberately low. The contrast check measures the SINGLE
    // BRIGHTEST pixel against white body text, and a dither's brightest cell
    // is fully on by construction — the one thing this family does that the
    // continuous fields do not.
    vec3 col = tint * quantised * 0.62 * amplitude;

    // Grain, matching the house convention in the other fields.
    float grain = ditherHash(p * 700.0 + clock * 11.0);
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
// Returns PREMULTIPLIED colour and alpha (`vec4(rgb * a, a)`), per the
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

vec4 composite(vec2 p, float t, float energy, float coherence, float warmth, float pulse) {
    vec3 c0 = field(p, t, energy, coherence, warmth, pulse);
    vec3 c1 = field(p + vec2(SURFACE_BLUR_RADIUS, SURFACE_BLUR_RADIUS), t, energy, coherence, warmth, pulse);
    vec3 c2 = field(p + vec2(-SURFACE_BLUR_RADIUS, SURFACE_BLUR_RADIUS), t, energy, coherence, warmth, pulse);
    vec3 c3 = field(p + vec2(SURFACE_BLUR_RADIUS, -SURFACE_BLUR_RADIUS), t, energy, coherence, warmth, pulse);
    vec3 c4 = field(p + vec2(-SURFACE_BLUR_RADIUS, -SURFACE_BLUR_RADIUS), t, energy, coherence, warmth, pulse);

    vec3 blurred = (c0 + c1 + c2 + c3 + c4) / 5.0;

    // Contrast damping: a Reinhard-style compressive knee (see header) —
    // lifts dim fields toward visibility while compressing bright fields'
    // peaks so they don't blow past the legibility ceiling.
    vec3 gained = blurred * SURFACE_GAIN;
    vec3 damped = gained / (1.0 + gained * SURFACE_KNEE);

    float alpha = 1.0;
    return vec4(damped * alpha, alpha);
}


// Orbic epilogue — surface shape, GLSL ES 3.00.
//
// Maps the fragment coordinate into aspect-preserving world space at
// surface scale (zoomed further out than the orb, so the same noise
// frequency reads as fine grain rather than a few large blobs — see
// docs/shader-abi.md). `u_time` is assumed already wrapped (at 3600 s) by
// the caller.
//
// u_scale is surface-specific — not part of the frozen four-channel ABI
// (energy/coherence/warmth/pulse), which field()/composite() alone see.
// It's plumbing local to this epilogue, the same way any other uniform is
// per design.md decision #2, exposed as the Surface component's public
// `scale` prop (surface-component spec). The renderer defaults it to 3.0,
// matching this file's previous hardcoded SURFACE_SCALE, so omitting the
// prop is behaviourally identical to before this uniform existed.

uniform float u_scale;

void main() {
    vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y) * u_scale;
    oFragColor = composite(p, u_time, u_energy, u_coherence, u_warmth, u_pulse);
}
